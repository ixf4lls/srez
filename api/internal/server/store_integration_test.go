package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hh-analytics/internal/core"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func isolatedStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	b := make([]byte, 8)
	if _, err = rand.Read(b); err != nil {
		t.Fatal(err)
	}
	schema := "hh_test_" + hex.EncodeToString(b)
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(context.Background(), "DROP SCHEMA "+quoted+" CASCADE"); admin.Close() })
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	store, err := NewStore(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.DB.Close)
	return store
}

func TestBulkDeleteRestoreAndConcurrentSave(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	ids := []string{"aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"}
	for i, id := range ids {
		a := core.Analysis{ID: id, Title: "Test", CreatedAt: time.Now().UTC(), Status: []string{"completed", "running"}[i]}
		if err := store.Save(ctx, &a); err != nil {
			t.Fatal(err)
		}
		if err := store.PutVacancy(ctx, id, core.Vacancy{ID: "123", Title: "Saved source", Loaded: true}, false); err != nil {
			t.Fatal(err)
		}
	}
	app := New(store, NewRunner("http://unused.invalid"))
	request := func(path string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]any{"ids": []string{ids[0], ids[1], ids[0]}})
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader(string(body))))
		return w
	}
	deleted := request("/api/analyses/delete")
	if deleted.Code != 200 {
		t.Fatalf("delete: %d %s", deleted.Code, deleted.Body.String())
	}
	rows, err := store.List(ctx)
	if err != nil || len(rows) != 0 {
		t.Fatalf("deleted rows visible: %v %+v", err, rows)
	}
	for _, id := range ids {
		if _, err = store.Get(ctx, id); !IsMissing(err) {
			t.Fatalf("deleted record is still readable: %v", err)
		}
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/analyses/"+id+"/vacancies", nil))
		if w.Code != 404 {
			t.Fatal("deleted source snapshots are exposed")
		}
	}
	stale := core.Analysis{ID: ids[1], Title: "stale worker", CreatedAt: time.Now(), Status: "running"}
	if err = store.Save(ctx, &stale); !errors.Is(err, ErrDeleted) {
		t.Fatalf("stale worker resurrected deleted search: %v", err)
	}
	if restored := request("/api/analyses/restore"); restored.Code != 200 {
		t.Fatalf("restore: %s", restored.Body.String())
	}
	rows, err = store.List(ctx)
	if err != nil || len(rows) != 2 {
		t.Fatalf("restore lost records: %v %+v", err, rows)
	}
	a, err := store.Get(ctx, ids[1])
	if err != nil || a.Status != "cancelled" {
		t.Fatalf("restored active job must stay stopped: %v %+v", err, a)
	}
	for _, id := range ids {
		vs, err := store.Vacancies(ctx, id)
		if err != nil || len(vs) != 1 || vs[0].Title != "Saved source" {
			t.Fatalf("snapshot lost after undo: %v %+v", err, vs)
		}
	}
}
