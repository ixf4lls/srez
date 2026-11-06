package server

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const ratesFixture = `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="07.11.2026"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>97,2500</Value></Valute><Valute><CharCode>KZT</CharCode><Nominal>100</Nominal><Value>20,0000</Value></Valute><Valute><CharCode>BAD</CharCode><Nominal>0</Nominal><Value>99,0000</Value></Valute></ValCurs>`

func TestParseCBRRatesRespectsNominalAndDate(t *testing.T) {
	rates, date, err := parseCBRRates(strings.NewReader(ratesFixture))
	if err != nil || date != "2026-11-07" || rates["RUB"] != 1 || rates["USD"] != 97.25 || math.Abs(rates["KZT"]-.2) > .000001 {
		t.Fatalf("invalid rates: %v %s %v", rates, date, err)
	}
	if _, ok := rates["BAD"]; ok {
		t.Fatal("zero-nominal rate was accepted")
	}
	for _, body := range []string{`<html>blocked</html>`, `<ValCurs Date="07.11.2026"/>`, `<ValCurs Date="bad"><Valute/></ValCurs>`} {
		if _, _, err := parseCBRRates(strings.NewReader(body)); err == nil {
			t.Fatalf("invalid rates accepted: %s", body)
		}
	}
}

func TestRatesCacheAndStaleFallback(t *testing.T) {
	var calls atomic.Int32
	var failing atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("User-Agent") != "srez/1.0" || r.Header.Get("Accept") != "application/xml" {
			t.Error("exchange-rate request is missing its client identification or XML accept header")
		}
		if failing.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		_, _ = w.Write([]byte(ratesFixture))
	}))
	defer upstream.Close()
	s := &Server{ratesEndpoint: upstream.URL, ratesClient: upstream.Client()}
	request := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/rates", nil))
		return w
	}
	for i := 0; i < 2; i++ {
		if response := request(); response.Code != 200 {
			t.Fatalf("rates failed: %s", response.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatal("fresh rates were not cached")
	}
	failing.Store(true)
	s.ratesState.fetchedAt = time.Now().Add(-7 * time.Hour)
	response := request()
	var data struct {
		Rates map[string]float64 `json:"rates"`
		Stale bool               `json:"stale"`
		Date  string             `json:"date"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil || response.Code != 200 || !data.Stale || data.Rates["USD"] != 97.25 || data.Date != "2026-11-07" {
		t.Fatalf("cached fallback lost provenance: %s", response.Body.String())
	}
	s.ratesState.values = nil
	if response = request(); response.Code != 502 {
		t.Fatal("missing rates were replaced with fabricated values")
	}
}
