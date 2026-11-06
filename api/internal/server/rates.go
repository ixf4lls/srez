package server

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/text/encoding/charmap"
)

const cbrRatesURL = "https://www.cbr.ru/scripts/XML_daily.asp"

type currencyRatesCache struct {
	sync.Mutex
	values    map[string]float64
	fetchedAt time.Time
	date      string
}

func parseCBRRates(reader io.Reader) (map[string]float64, string, error) {
	var payload struct {
		XMLName xml.Name `xml:"ValCurs"`
		Date    string   `xml:"Date,attr"`
		Values  []struct {
			Code    string  `xml:"CharCode"`
			Nominal float64 `xml:"Nominal"`
			Value   string  `xml:"Value"`
		} `xml:"Valute"`
	}
	decoder := xml.NewDecoder(io.LimitReader(reader, 1<<20))
	decoder.CharsetReader = func(charset string, input io.Reader) (io.Reader, error) {
		if strings.EqualFold(charset, "windows-1251") {
			return charmap.Windows1251.NewDecoder().Reader(input), nil
		}
		return nil, fmt.Errorf("unsupported exchange-rate encoding: %s", charset)
	}
	if err := decoder.Decode(&payload); err != nil {
		return nil, "", err
	}
	date, err := time.Parse("02.01.2006", payload.Date)
	if err != nil {
		return nil, "", err
	}
	values := map[string]float64{"RUB": 1}
	for _, item := range payload.Values {
		value, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(item.Value), ",", "."), 64)
		if err == nil && value > 0 && item.Nominal > 0 && !math.IsInf(value, 0) && !math.IsNaN(value) && !math.IsInf(item.Nominal, 0) && !math.IsNaN(item.Nominal) && len(item.Code) == 3 && item.Code != "RUB" {
			values[item.Code] = value / item.Nominal
		}
	}
	if len(values) < 2 {
		return nil, "", fmt.Errorf("empty exchange-rate table")
	}
	return values, date.Format("2006-01-02"), nil
}

func (s *Server) rates(w http.ResponseWriter, r *http.Request) {
	c := &s.ratesState
	c.Lock()
	defer c.Unlock()
	respond := func(stale bool) {
		write(w, http.StatusOK, map[string]any{"rates": c.values, "date": c.date, "fetchedAt": c.fetchedAt, "source": "Банк России", "sourceUrl": cbrRatesURL, "stale": stale})
	}
	if len(c.values) > 1 && time.Since(c.fetchedAt) < 6*time.Hour {
		respond(false)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	endpoint := s.ratesEndpoint
	if endpoint == "" {
		endpoint = cbrRatesURL
	}
	client := s.ratesClient
	if client == nil {
		client = &http.Client{Timeout: 6 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err == nil {
		req.Header.Set("User-Agent", "srez/1.0")
		req.Header.Set("Accept", "application/xml")
		var res *http.Response
		res, err = client.Do(req)
		if err == nil {
			defer res.Body.Close()
			if res.StatusCode == http.StatusOK {
				var values map[string]float64
				var date string
				values, date, err = parseCBRRates(res.Body)
				if err == nil {
					c.values = values
					c.date = date
					c.fetchedAt = time.Now().UTC()
					respond(false)
					return
				}
			} else {
				err = fmt.Errorf("exchange-rate HTTP status: %d", res.StatusCode)
			}
		}
	}
	if err != nil {
		log.Printf("currency rates: %v", err)
	}
	if len(c.values) > 1 {
		respond(true)
		return
	}
	fail(w, http.StatusBadGateway, "Не удалось получить курсы Банка России")
}
