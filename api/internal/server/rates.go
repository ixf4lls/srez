package server

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type cbrRate struct {
	Value   float64 `json:"Value"`
	Nominal float64 `json:"Nominal"`
}

type cbrDaily struct {
	Valute map[string]cbrRate `json:"Valute"`
}

var ratesCache struct {
	sync.Mutex
	values    map[string]float64
	fetchedAt time.Time
}

func (s *Server) rates(w http.ResponseWriter, r *http.Request) {
	ratesCache.Lock()
	if len(ratesCache.values) > 0 && time.Since(ratesCache.fetchedAt) < 6*time.Hour {
		value := map[string]any{"rates": ratesCache.values, "fetchedAt": ratesCache.fetchedAt, "source": "ЦБ РФ"}
		ratesCache.Unlock()
		write(w, http.StatusOK, value)
		return
	}
	ratesCache.Unlock()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.cbr-xml-daily.ru/daily_json.js", nil)
	if err != nil {
		fail(w, http.StatusBadGateway, "Не удалось подготовить запрос текущих курсов")
		return
	}
	res, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		writeCachedRates(w)
		return
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		writeCachedRates(w)
		return
	}
	var payload cbrDaily
	if err = json.NewDecoder(res.Body).Decode(&payload); err != nil {
		writeCachedRates(w)
		return
	}
	values := map[string]float64{"RUB": 1}
	for code, item := range payload.Valute {
		if item.Value > 0 && item.Nominal > 0 {
			values[code] = item.Value / item.Nominal
		}
	}
	if len(values) <= 1 {
		writeCachedRates(w)
		return
	}
	now := time.Now().UTC()
	ratesCache.Lock()
	ratesCache.values = values
	ratesCache.fetchedAt = now
	ratesCache.Unlock()
	write(w, http.StatusOK, map[string]any{"rates": values, "fetchedAt": now, "source": "ЦБ РФ"})
}

func writeCachedRates(w http.ResponseWriter) {
	ratesCache.Lock()
	defer ratesCache.Unlock()
	if len(ratesCache.values) == 0 {
		fail(w, http.StatusBadGateway, "Текущий курс валют недоступен")
		return
	}
	write(w, http.StatusOK, map[string]any{"rates": ratesCache.values, "fetchedAt": ratesCache.fetchedAt, "source": "ЦБ РФ", "stale": true})
}
