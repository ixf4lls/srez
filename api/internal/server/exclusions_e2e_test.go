package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hh-analytics/internal/core"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"sort"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// This fixture replaces only storage and external providers. The production
// HTTP handlers, query optimizer, Store serialization and Jobs run unchanged.
type exclusionsFixture struct {
	mu          sync.Mutex
	documents   map[string][]byte
	searches    []map[string]string
	unexpected  []string
	failSave    bool
	filterError bool
	app         *Server
}

type exclusionsDB struct{ fixture *exclusionsFixture }

func (db *exclusionsDB) Ping(context.Context) error { return nil }
func (db *exclusionsDB) Close()                     {}
func (db *exclusionsDB) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	f := db.fixture
	f.mu.Lock()
	defer f.mu.Unlock()
	if query == `INSERT INTO analyses(id,created_at,document) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET document=excluded.document WHERE analyses.deleted_at IS NULL` {
		if f.failSave {
			return pgconn.CommandTag{}, fmt.Errorf("synthetic storage failure")
		}
		f.documents[args[0].(string)] = bytes.Clone(args[2].([]byte))
		return pgconn.NewCommandTag("INSERT 0 1"), nil
	}
	f.unexpected = append(f.unexpected, "SQL Exec: "+query)
	return pgconn.CommandTag{}, fmt.Errorf("unmocked SQL Exec: %s", query)
}
func (db *exclusionsDB) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	f := db.fixture
	f.mu.Lock()
	defer f.mu.Unlock()
	if query == `SELECT document FROM analyses WHERE id=$1 AND deleted_at IS NULL` {
		if document, ok := f.documents[args[0].(string)]; ok {
			return &exclusionsRow{document: bytes.Clone(document)}
		}
		return &exclusionsRow{err: pgx.ErrNoRows}
	}
	f.unexpected = append(f.unexpected, "SQL QueryRow: "+query)
	return &exclusionsRow{err: fmt.Errorf("unmocked SQL QueryRow: %s", query)}
}
func (db *exclusionsDB) Query(_ context.Context, query string, _ ...any) (pgx.Rows, error) {
	f := db.fixture
	f.mu.Lock()
	defer f.mu.Unlock()
	switch query {
	case `SELECT document FROM vacancies WHERE analysis_id=$1 ORDER BY id`:
		return &exclusionsRows{}, nil
	case `SELECT document - 'report' FROM analyses WHERE deleted_at IS NULL ORDER BY created_at DESC`:
		analyses := f.analysesLocked()
		documents := make([][]byte, 0, len(analyses))
		for _, a := range analyses {
			a.Report = nil
			data, _ := json.Marshal(a)
			documents = append(documents, data)
		}
		return &exclusionsRows{documents: documents}, nil
	default:
		f.unexpected = append(f.unexpected, "SQL Query: "+query)
		return nil, fmt.Errorf("unmocked SQL Query: %s", query)
	}
}

type exclusionsRow struct {
	document []byte
	err      error
}

func (r *exclusionsRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != 1 {
		return fmt.Errorf("unmocked row destination count")
	}
	value, ok := dest[0].(*[]byte)
	if !ok {
		return fmt.Errorf("unmocked row destination type")
	}
	*value = bytes.Clone(r.document)
	return nil
}

type exclusionsRows struct {
	documents [][]byte
	index     int
	closed    bool
}

func (r *exclusionsRows) Close()                                       { r.closed = true }
func (r *exclusionsRows) Err() error                                   { return nil }
func (r *exclusionsRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *exclusionsRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *exclusionsRows) Conn() *pgx.Conn                              { return nil }
func (r *exclusionsRows) Next() bool {
	if r.closed || r.index >= len(r.documents) {
		r.closed = true
		return false
	}
	r.index++
	return true
}
func (r *exclusionsRows) Scan(dest ...any) error {
	if r.index == 0 || r.index > len(r.documents) {
		return fmt.Errorf("Scan called without Next")
	}
	return (&exclusionsRow{document: r.documents[r.index-1]}).Scan(dest...)
}
func (r *exclusionsRows) Values() ([]any, error) {
	if r.index == 0 || r.index > len(r.documents) {
		return nil, fmt.Errorf("Values called without Next")
	}
	return []any{bytes.Clone(r.documents[r.index-1])}, nil
}
func (r *exclusionsRows) RawValues() [][]byte {
	if r.index == 0 || r.index > len(r.documents) {
		return nil
	}
	return [][]byte{bytes.Clone(r.documents[r.index-1])}
}

type exclusionsTransport struct {
	allowed string
	base    http.RoundTripper
	fixture *exclusionsFixture
}

type exclusionsFilterOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type exclusionsFilterGroup struct {
	Key     string                   `json:"key"`
	Label   string                   `json:"label"`
	Options []exclusionsFilterOption `json:"options"`
}

// Keep the preview's synthetic filter contract aligned with frontend/mocks/fixtures.ts.
// Production filters continue to come exclusively from the runner.
func exclusionsFilterGroups() []exclusionsFilterGroup {
	return []exclusionsFilterGroup{
		{Key: "area", Label: "Регион", Options: []exclusionsFilterOption{
			{Value: "1", Label: "Москва", Count: 48}, {Value: "2", Label: "Санкт-Петербург", Count: 44},
		}},
		{Key: "experience", Label: "Опыт работы", Options: []exclusionsFilterOption{
			{Value: "noExperience", Label: "Нет опыта", Count: 12}, {Value: "between1And3", Label: "От 1 года до 3 лет", Count: 12},
			{Value: "between3And6", Label: "От 3 до 6 лет", Count: 12}, {Value: "moreThan6", Label: "Более 6 лет", Count: 12},
		}},
		{Key: "work_format", Label: "Формат работы", Options: []exclusionsFilterOption{
			{Value: "REMOTE", Label: "Удалённо", Count: 20}, {Value: "ON_SITE", Label: "Офис", Count: 20}, {Value: "HYBRID", Label: "Гибрид", Count: 20},
		}},
		{Key: "employment_form", Label: "Тип оформления", Options: []exclusionsFilterOption{
			{Value: "LABOUR", Label: "ТК РФ", Count: 12}, {Value: "CIVIL", Label: "ГПХ", Count: 12},
			{Value: "SELF_EMPLOYED", Label: "Самозанятость", Count: 12}, {Value: "IP", Label: "ИП", Count: 12},
		}},
		{Key: "education", Label: "Образование", Options: []exclusionsFilterOption{
			{Value: "higher", Label: "Высшее", Count: 32}, {Value: "not_required_or_not_specified", Label: "Не требуется или не указано", Count: 16},
		}},
		{Key: "professional_role", Label: "Специализация", Options: []exclusionsFilterOption{
			{Value: "96", Label: "Программист, разработчик", Count: 36}, {Value: "10", Label: "Аналитик", Count: 12},
		}},
		{Key: "work_schedule_by_days", Label: "График работы", Options: []exclusionsFilterOption{
			{Value: "FIVE_ON_TWO_OFF", Label: "5/2", Count: 36}, {Value: "TWO_ON_TWO_OFF", Label: "2/2", Count: 12},
		}},
		{Key: "working_hours", Label: "Рабочие часы", Options: []exclusionsFilterOption{
			{Value: "HOURS_8", Label: "8 часов", Count: 36}, {Value: "HOURS_4", Label: "4 часа", Count: 12},
		}},
	}
}

func (tr exclusionsTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Scheme+"://"+req.URL.Host != tr.allowed {
		tr.fixture.mu.Lock()
		tr.fixture.unexpected = append(tr.fixture.unexpected, "HTTP: "+req.URL.String())
		tr.fixture.mu.Unlock()
		return nil, fmt.Errorf("unmocked external request: %s", req.URL)
	}
	return tr.base.RoundTrip(req)
}

func newExclusionsFixture(t *testing.T) *exclusionsFixture {
	t.Helper()
	f := &exclusionsFixture{documents: map[string][]byte{}, searches: []map[string]string{}, unexpected: []string{}}
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		switch r.URL.Path {
		case "/health":
			write(w, 200, map[string]bool{"session": true})
		case "/filters":
			if f.filterError {
				write(w, 200, map[string]any{"ok": false, "class": "input", "reason": "Synthetic filter failure"})
				return
			}
			write(w, 200, map[string]any{"ok": true, "data": exclusionsFilterGroups()})
		case "/search":
			var args map[string]string
			if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
				f.unexpected = append(f.unexpected, "invalid runner body")
				fail(w, 400, "invalid runner body")
				return
			}
			f.searches = append(f.searches, args)
			write(w, 200, map[string]any{"ok": true, "data": map[string]any{"items": []any{}, "total": 0, "totalKnown": true, "recognized": true, "hasMore": false}})
		case "/rates":
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, `<ValCurs Date="15.11.2026"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>90,00</Value></Valute><Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>100,00</Value></Valute></ValCurs>`)
		default:
			f.unexpected = append(f.unexpected, "runner path: "+r.URL.Path)
			fail(w, 500, "unmocked provider operation")
		}
	}))
	t.Cleanup(source.Close)
	transport := &http.Transport{Proxy: nil}
	t.Cleanup(transport.CloseIdleConnections)
	client := &http.Client{Timeout: time.Second, Transport: exclusionsTransport{allowed: source.URL, base: transport, fixture: f}, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	runner := NewRunner(source.URL)
	runner.Client = client
	runner.retryDelay = time.Millisecond
	f.app = New(&Store{DB: &exclusionsDB{fixture: f}}, runner)
	f.app.ratesEndpoint = source.URL + "/rates"
	f.app.ratesClient = client
	t.Cleanup(f.app.Jobs.Shutdown)
	t.Cleanup(func() {
		f.mu.Lock()
		defer f.mu.Unlock()
		if len(f.unexpected) > 0 {
			t.Errorf("unmocked dependency calls: %v", f.unexpected)
		}
	})
	return f
}

func (f *exclusionsFixture) analysesLocked() []core.Analysis {
	analyses := make([]core.Analysis, 0, len(f.documents))
	for _, document := range f.documents {
		var a core.Analysis
		_ = json.Unmarshal(document, &a)
		analyses = append(analyses, a)
	}
	sort.Slice(analyses, func(i, j int) bool { return analyses[i].CreatedAt.After(analyses[j].CreatedAt) })
	return analyses
}

func (f *exclusionsFixture) handler() http.Handler {
	appHandler := f.app.Handler()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/__test/state":
			f.mu.Lock()
			defer f.mu.Unlock()
			write(w, 200, map[string]any{"analyses": f.analysesLocked(), "searches": f.searches, "unexpected": f.unexpected})
		case "/__test/reset":
			f.app.Jobs.Shutdown()
			// Wait for cancelled jobs to finish before resetting synthetic state.
			limit := time.Now().Add(2 * time.Second)
			for {
				f.app.Jobs.mu.Lock()
				active := len(f.app.Jobs.running)
				f.app.Jobs.mu.Unlock()
				if active == 0 {
					break
				}
				if time.Now().After(limit) {
					fail(w, 500, "synthetic jobs did not stop")
					return
				}
				time.Sleep(time.Millisecond)
			}
			f.mu.Lock()
			f.documents = map[string][]byte{}
			f.searches = []map[string]string{}
			f.failSave = false
			f.filterError = false
			f.mu.Unlock()
			f.app.filtersMu.Lock()
			f.app.filters = nil
			f.app.filtersMu.Unlock()
			write(w, 200, map[string]bool{"ok": true})
		case "/__test/scenario":
			var scenario struct {
				FailSave    *bool `json:"failSave"`
				FilterError *bool `json:"filterError"`
			}
			if !decode(w, r, &scenario) {
				return
			}
			f.mu.Lock()
			if scenario.FailSave != nil {
				f.failSave = *scenario.FailSave
			}
			if scenario.FilterError != nil {
				f.filterError = *scenario.FilterError
			}
			f.mu.Unlock()
			f.app.filtersMu.Lock()
			f.app.filters = nil
			f.app.filtersMu.Unlock()
			write(w, 200, map[string]bool{"ok": true})
		default:
			appHandler.ServeHTTP(w, r)
		}
	})
}

func exclusionsRequest(t *testing.T, handler http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(method, path, bytes.NewReader(data)))
	return w
}

func TestExclusionsEndToEnd(t *testing.T) {
	for _, edit := range []bool{false, true} {
		t.Run(fmt.Sprintf("edited=%v", edit), func(t *testing.T) {
			f := newExclusionsFixture(t)
			handler := f.handler()
			prepared := exclusionsRequest(t, handler, "POST", "/api/prepare", map[string]any{"query": "Python OR Java", "mode": "roles", "excludeWords": "junior, junior;руководитель проекта"})
			var proposal core.Proposal
			if err := json.Unmarshal(prepared.Body.Bytes(), &proposal); err != nil || prepared.Code != 200 {
				t.Fatalf("prepare: %d %s %v", prepared.Code, prepared.Body.String(), err)
			}
			if edit {
				proposal.Expression = "NAME:python OR NAME:java"
			}
			filters := map[string]string{
				"area": "1", "experience": "between1And3", "work_format": "REMOTE", "employment_form": "LABOUR",
				"education": "higher", "professional_role": "96", "work_schedule_by_days": "FIVE_ON_TWO_OFF", "working_hours": "HOURS_8",
			}
			created := exclusionsRequest(t, handler, "POST", "/api/analyses", map[string]any{"query": "Python OR Java", "mode": "roles", "excludeWords": "junior, junior;руководитель проекта", "expression": proposal.Expression, "filters": filters, "confirmed": true})
			var a core.Analysis
			if err := json.Unmarshal(created.Body.Bytes(), &a); err != nil || created.Code != 201 {
				t.Fatalf("create: %d %s %v", created.Code, created.Body.String(), err)
			}
			deadline := time.Now().Add(2 * time.Second)
			for f.app.Jobs.Active(a.ID) && time.Now().Before(deadline) {
				time.Sleep(time.Millisecond)
			}
			saved := exclusionsRequest(t, handler, "GET", "/api/analyses/"+a.ID, nil)
			var result core.Analysis
			if err := json.Unmarshal(saved.Body.Bytes(), &result); err != nil || saved.Code != 200 || result.Status != "completed" {
				t.Fatalf("saved result: %d %s %v", saved.Code, saved.Body.String(), err)
			}
			want := `(Python OR Java) AND NOT (NAME:"junior" OR DESCRIPTION:"junior" OR NAME:"руководитель проекта" OR DESCRIPTION:"руководитель проекта")`
			if edit {
				want = strings.Replace(want, "Python OR Java", "NAME:python OR NAME:java", 1)
			}
			if result.Expression != want || result.ExcludeWords != "junior, junior;руководитель проекта" {
				t.Fatalf("lost exclusions or edited expression: %+v", result)
			}
			f.mu.Lock()
			defer f.mu.Unlock()
			if len(f.searches) != 1 || f.searches[0]["text"] != want {
				t.Fatalf("runner did not receive confirmed expression and filters: %+v", f.searches)
			}
			for key, value := range filters {
				if result.Filters[key] != value || f.searches[0][key] != value {
					t.Fatalf("filter %s=%s was lost: stored=%v runner=%v", key, value, result.Filters, f.searches[0])
				}
			}
		})
	}
}

func TestExclusionsFiltersExposeAllSearchGroups(t *testing.T) {
	f := newExclusionsFixture(t)
	w := exclusionsRequest(t, f.handler(), "GET", "/api/filters", nil)
	var response struct {
		Groups []exclusionsFilterGroup `json:"groups"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || w.Code != 200 {
		t.Fatalf("filters: %d %s %v", w.Code, w.Body.String(), err)
	}
	want := map[string][]string{
		"area":                  {"1", "2"},
		"experience":            {"noExperience", "between1And3", "between3And6", "moreThan6"},
		"work_format":           {"REMOTE", "ON_SITE", "HYBRID"},
		"employment_form":       {"LABOUR", "CIVIL", "SELF_EMPLOYED", "IP"},
		"education":             {"higher", "not_required_or_not_specified"},
		"professional_role":     {"96", "10"},
		"work_schedule_by_days": {"FIVE_ON_TWO_OFF", "TWO_ON_TWO_OFF"},
		"working_hours":         {"HOURS_8", "HOURS_4"},
	}
	if len(response.Groups) != len(want) {
		t.Fatalf("preview dropped filter groups: got %d want %d", len(response.Groups), len(want))
	}
	seen := map[string]bool{}
	for _, group := range response.Groups {
		options, ok := want[group.Key]
		if !ok || seen[group.Key] || group.Label == "" || len(group.Options) != len(options) {
			t.Fatalf("unexpected, repeated or incomplete group: %+v", group)
		}
		seen[group.Key] = true
		for index, option := range group.Options {
			if option.Value != options[index] || option.Label == "" || option.Count <= 0 {
				t.Fatalf("invalid filter option in %s: %+v", group.Key, option)
			}
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.documents) != 0 || len(f.searches) != 0 {
		t.Fatal("loading filter choices started or saved an analysis")
	}
}

func TestExclusionsStorageFailureDoesNotStartSearch(t *testing.T) {
	f := newExclusionsFixture(t)
	f.failSave = true
	w := exclusionsRequest(t, f.handler(), "POST", "/api/analyses", map[string]any{"query": "Python", "mode": "roles", "expression": "Python", "excludeWords": "junior", "confirmed": true})
	if w.Code != 500 {
		t.Fatalf("storage failure was hidden: %d %s", w.Code, w.Body.String())
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.documents) != 0 || len(f.searches) != 0 {
		t.Fatal("failed save changed state or started provider search")
	}
}

// Browser tests opt into this synthetic-only API. It never reads .env,
// production databases, runner sessions or real external services.
func TestExclusionsBrowserServer(t *testing.T) {
	addr := os.Getenv("SREZ_E2E_ADDR")
	if addr == "" {
		t.Skip("SREZ_E2E_ADDR is not set")
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil || (host != "127.0.0.1" && host != "::1" && host != "localhost") {
		t.Fatal("SREZ_E2E_ADDR must be a loopback address")
	}
	f := newExclusionsFixture(t)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: f.handler(), ReadHeaderTimeout: 5 * time.Second}
	t.Cleanup(func() { _ = srv.Close() })
	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			t.Errorf("synthetic API: %v", err)
		}
	}()
	t.Logf("Synthetic exclusions API listening at http://%s", addr)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	<-ctx.Done()
}
