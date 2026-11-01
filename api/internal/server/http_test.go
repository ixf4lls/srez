package server

import (
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

func TestBulkDeleteValidatesIDsBeforeAccessingStorage(t *testing.T) {
	for _, body := range []string{`{"ids":[]}`, `{"ids":["../all"]}`, `{"ids":["32f2b0ac20050e260fc43977","bad"]}`} {
		req := httptest.NewRequest("POST", "/api/analyses/delete", strings.NewReader(body))
		w := httptest.NewRecorder()
		(&Server{}).Handler().ServeHTTP(w, req)
		if w.Code != 400 {
			t.Fatalf("invalid bulk request accepted: %d", w.Code)
		}
	}
}
