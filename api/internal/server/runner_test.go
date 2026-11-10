package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func testRunner(t *testing.T, handler http.HandlerFunc) *Runner {
	t.Helper()
	source := httptest.NewServer(handler)
	t.Cleanup(source.Close)
	runner := NewRunner(source.URL)
	runner.retryDelay = time.Millisecond
	return runner
}

func TestRunnerRetriesTransientHTTPAndMalformedReplies(t *testing.T) {
	var calls atomic.Int32
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		switch calls.Add(1) {
		case 1:
			http.Error(w, "unavailable", http.StatusBadGateway)
		case 2:
			_, _ = w.Write([]byte(`{"ok":`))
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": Detail{Title: "Developer", Description: "Go"}})
		}
	})
	_, detail, err := callRunner(context.Background(), runner, "vacancy", nil, validateDetail)
	if err != nil || calls.Load() != 3 || detail.Title != "Developer" {
		t.Fatalf("calls=%d detail=%+v err=%v", calls.Load(), detail, err)
	}
}

func TestRunnerRetriesIncompleteDetailsWithoutCombiningResponses(t *testing.T) {
	var calls atomic.Int32
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		detail := Detail{Title: "Developer", Description: "Complete"}
		switch calls.Add(1) {
		case 1:
			detail.Description = ""
		case 2:
			detail.Title = ""
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": detail})
	})
	_, detail, err := callRunner(context.Background(), runner, "vacancy", nil, validateDetail)
	if err != nil || calls.Load() != 3 || detail.Description != "Complete" {
		t.Fatalf("calls=%d detail=%+v err=%v", calls.Load(), detail, err)
	}
}

func TestRunnerRetryLimitAndTerminalErrors(t *testing.T) {
	for _, class := range []string{"auth", "blocked", "input", "refused", "error", "drift"} {
		t.Run(class, func(t *testing.T) {
			var calls atomic.Int32
			runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "class": class, "reason": "test"})
			})
			_, err := runner.Call(context.Background(), "search", nil, nil)
			var provider *ProviderError
			want := int32(1)
			if class == "error" || class == "drift" {
				want = 3
			}
			if !errors.As(err, &provider) || provider.Class != class || calls.Load() != want {
				t.Fatalf("calls=%d want=%d err=%v", calls.Load(), want, err)
			}
		})
	}
}

func TestRunnerHonorsProviderRetryAfter(t *testing.T) {
	var calls atomic.Int32
	var first time.Time
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			first = time.Now()
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "class": "rate", "retryAfterMs": 30})
			return
		}
		if time.Since(first) < 30*time.Millisecond {
			t.Error("retried before cooldown expired")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": []string{}})
	})
	if _, err := runner.Call(context.Background(), "filters", nil, nil); err != nil || calls.Load() != 2 {
		t.Fatalf("calls=%d err=%v", calls.Load(), err)
	}
}

func TestRunnerDoesNotRetryLongRateLimit(t *testing.T) {
	var calls atomic.Int32
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Retry-After", "120")
		http.Error(w, "limited", http.StatusTooManyRequests)
	})
	_, err := runner.Call(context.Background(), "search", nil, nil)
	var provider *ProviderError
	if !errors.As(err, &provider) || provider.Class != "rate" || calls.Load() != 1 {
		t.Fatalf("calls=%d err=%v", calls.Load(), err)
	}
}

func TestRunnerCancellationInterruptsRetryWait(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var calls atomic.Int32
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "class": "rate", "retryAfterMs": 50000})
		cancel()
	})
	_, err := runner.Call(ctx, "search", nil, nil)
	if !errors.Is(err, context.Canceled) || calls.Load() != 1 {
		t.Fatalf("calls=%d err=%v", calls.Load(), err)
	}
}
