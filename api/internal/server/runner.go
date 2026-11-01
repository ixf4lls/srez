package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type ProviderResult struct {
	OK     bool            `json:"ok"`
	Class  string          `json:"class"`
	Data   json.RawMessage `json:"data"`
	Reason string          `json:"reason"`
	Next   string          `json:"next"`
	Healed bool            `json:"healed"`
	Heal   struct {
		Changes []string `json:"changes"`
	} `json:"heal"`
}
type ProviderError struct{ Class, Reason, Next string }

func (e *ProviderError) Error() string { return fmt.Sprintf("%s: %s", e.Class, e.Reason) }

type Runner struct {
	URL    string
	Client *http.Client
}

func NewRunner(url string) *Runner { return &Runner{url, &http.Client{Timeout: 70 * time.Second}} }
func (r *Runner) Call(ctx context.Context, path string, args any, out any) (ProviderResult, error) {
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
	err = json.NewDecoder(io.LimitReader(res.Body, 20<<20)).Decode(&value)
	if err != nil {
		return value, err
	}
	if !value.OK {
		return value, &ProviderError{value.Class, value.Reason, value.Next}
	}
	if out != nil {
		err = json.Unmarshal(value.Data, out)
	}
	return value, err
}
