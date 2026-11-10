package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

type ProviderResult struct {
	OK           bool            `json:"ok"`
	Class        string          `json:"class"`
	Data         json.RawMessage `json:"data"`
	Reason       string          `json:"reason"`
	Next         string          `json:"next"`
	Healed       bool            `json:"healed"`
	RetryAfterMS int64           `json:"retryAfterMs"`
	Heal         struct {
		Changes []string `json:"changes"`
	} `json:"heal"`
}
type ProviderError struct{ Class, Reason, Next string }

func (e *ProviderError) Error() string { return fmt.Sprintf("%s: %s", e.Class, e.Reason) }

type Runner struct {
	URL        string
	Client     *http.Client
	retryDelay time.Duration
}

func NewRunner(url string) *Runner {
	return &Runner{URL: url, Client: &http.Client{Timeout: 70 * time.Second}, retryDelay: 1200 * time.Millisecond}
}
func (r *Runner) Call(ctx context.Context, path string, args any, out any) (ProviderResult, error) {
	value, data, err := callRunner[json.RawMessage](ctx, r, path, args, nil)
	if err == nil && out != nil {
		err = json.Unmarshal(data, out)
	}
	return value, err
}

func callRunner[T any](ctx context.Context, r *Runner, path string, args any, check func(T) error) (ProviderResult, T, error) {
	var value ProviderResult
	var data T
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		if err = ctx.Err(); err != nil {
			return value, data, err
		}
		value, err = r.callOnce(ctx, path, args)
		if err == nil {
			var candidate T
			if err = json.Unmarshal(value.Data, &candidate); err != nil {
				err = &ProviderError{Class: "drift", Reason: "Некорректные данные в ответе runner"}
			} else {
				data = candidate
				if check != nil {
					err = check(candidate)
				}
			}
			if err == nil {
				return value, candidate, nil
			}
		}
		if ctx.Err() != nil {
			return value, data, ctx.Err()
		}
		var provider *ProviderError
		if errors.As(err, &provider) && provider.Class != "error" && provider.Class != "drift" && provider.Class != "rate" {
			break
		}
		if value.RetryAfterMS > time.Minute.Milliseconds() {
			break
		}
		delay := r.retryDelay * time.Duration(1<<attempt)
		if wait := time.Duration(value.RetryAfterMS) * time.Millisecond; wait > delay {
			delay = wait
		}
		if attempt == 2 || delay > time.Minute {
			break
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return value, data, ctx.Err()
		case <-timer.C:
		}
	}
	return value, data, err
}

func (r *Runner) callOnce(ctx context.Context, path string, args any) (ProviderResult, error) {
	b, err := json.Marshal(args)
	if err != nil {
		return ProviderResult{}, err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", r.URL+"/"+path, bytes.NewReader(b))
	if err != nil {
		return ProviderResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := r.Client.Do(req)
	if err != nil {
		return ProviderResult{}, err
	}
	defer res.Body.Close()
	var value ProviderResult
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		class := "error"
		if res.StatusCode == http.StatusTooManyRequests {
			class = "rate"
		} else if res.StatusCode == http.StatusUnauthorized {
			class = "auth"
		} else if res.StatusCode == http.StatusForbidden {
			class = "blocked"
		} else if res.StatusCode >= 400 && res.StatusCode < 500 && res.StatusCode != http.StatusRequestTimeout && res.StatusCode != http.StatusTooEarly {
			class = "input"
		}
		if seconds, parseErr := strconv.Atoi(res.Header.Get("Retry-After")); parseErr == nil && seconds >= 0 {
			value.RetryAfterMS = int64(min(seconds, 61)) * 1000
		} else if until, parseErr := http.ParseTime(res.Header.Get("Retry-After")); parseErr == nil {
			value.RetryAfterMS = max(0, time.Until(until).Milliseconds())
		}
		return value, &ProviderError{Class: class, Reason: fmt.Sprintf("Runner вернул HTTP %d", res.StatusCode)}
	}
	err = json.NewDecoder(io.LimitReader(res.Body, 20<<20)).Decode(&value)
	if err != nil {
		return value, err
	}
	if !value.OK {
		return value, &ProviderError{value.Class, value.Reason, value.Next}
	}
	return value, err
}
