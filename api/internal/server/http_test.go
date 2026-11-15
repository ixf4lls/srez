package server

import (
	"encoding/json"
	"hh-analytics/internal/core"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPrepareDoesNotAccessSource(t *testing.T) {
	// No store or runner: preparing a query must never collect data before confirmation.
	s := &Server{}
	req := httptest.NewRequest("POST", "/api/prepare", strings.NewReader(`{"query":"golang","mode":"roles"}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "go developer") {
		t.Fatalf("prepare: %d %s", w.Code, w.Body.String())
	}
}

func TestPrepareIncludesExclusionsInHHExpression(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("POST", "/api/prepare", strings.NewReader(`{"query":"Python","mode":"roles","excludeWords":"стажёр, гпх"}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `стажёр`) || !strings.Contains(w.Body.String(), `гпх`) {
		t.Fatalf("prepare exclusions: %d %s", w.Code, w.Body.String())
	}
}

func TestPrepareGroupsHHLogicBeforeExclusions(t *testing.T) {
	w := httptest.NewRecorder()
	(&Server{}).Handler().ServeHTTP(w, httptest.NewRequest("POST", "/api/prepare", strings.NewReader(`{"query":"Python OR Java","mode":"roles","excludeWords":"junior, JUNIOR;руководитель проекта"}`)))
	var proposal core.Proposal
	if err := json.Unmarshal(w.Body.Bytes(), &proposal); err != nil {
		t.Fatal(err)
	}
	want := `(Python OR Java) AND NOT (NAME:"junior" OR DESCRIPTION:"junior" OR NAME:"руководитель проекта" OR DESCRIPTION:"руководитель проекта")`
	if w.Code != 200 || proposal.Expression != want {
		t.Fatalf("prepare exclusions: %d %s", w.Code, w.Body.String())
	}
}

func TestExclusionValidationBeforeAccessingStorageOrProvider(t *testing.T) {
	for _, path := range []string{"/api/prepare", "/api/analyses"} {
		for _, exclusions := range []string{strings.Repeat("я", 1601), strings.Repeat("я", 800)} {
			input := map[string]any{"query": "Python", "mode": "roles", "excludeWords": exclusions}
			if path == "/api/analyses" {
				input["expression"] = "Python"
				input["confirmed"] = true
			}
			body, _ := json.Marshal(input)
			w := httptest.NewRecorder()
			(&Server{}).Handler().ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader(string(body))))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("%s accepted oversized exclusions: %d %s", path, w.Code, w.Body.String())
			}
		}
	}
}
func TestCreateRequiresExplicitConfirmation(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("POST", "/api/analyses", strings.NewReader(`{"query":"Go","expression":"NAME:golang","mode":"roles","confirmed":false}`))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatalf("unconfirmed analysis was accepted: %d", w.Code)
	}
}
func TestRejectCrossOriginMutation(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest("POST", "/api/prepare", strings.NewReader(`{"query":"Go","mode":"roles"}`))
	req.Header.Set("Origin", "https://example.com")
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("unexpected status: %d", w.Code)
	}
}

func TestSingleDeletionValidatesIDBeforeAccessingStorage(t *testing.T) {
	for _, path := range []string{"/api/analyses/bad/delete", "/api/analyses/bad/restore"} {
		req := httptest.NewRequest("POST", path, nil)
		w := httptest.NewRecorder()
		(&Server{}).Handler().ServeHTTP(w, req)
		if w.Code != 400 {
			t.Fatalf("invalid single-record request accepted: %d", w.Code)
		}
	}
}

func TestBulkDeletionRoutesAreUnavailable(t *testing.T) {
	for _, path := range []string{"/api/analyses/delete", "/api/analyses/restore"} {
		w := httptest.NewRecorder()
		(&Server{}).Handler().ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader(`{"ids":["aaaaaaaaaaaaaaaaaaaaaaaa","bbbbbbbbbbbbbbbbbbbbbbbb"]}`)))
		if w.Code != http.StatusMethodNotAllowed && w.Code != http.StatusNotFound {
			t.Fatalf("bulk route is still available: %d", w.Code)
		}
	}
}
