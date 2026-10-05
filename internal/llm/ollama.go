// Package llm talks to the local model through the Ollama HTTP API.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ErrModelMissing means Ollama answers but the model is not downloaded.
var ErrModelMissing = errors.New("model is not downloaded")

// Ollama is a client for one model on one Ollama server.
type Ollama struct {
	BaseURL string
	Model   string
	HTTP    *http.Client
}

// NewOllama returns a client with the timeouts this app needs.
func NewOllama(baseURL, model string) *Ollama {
	return &Ollama{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Model:   model,
		HTTP:    &http.Client{Timeout: 120 * time.Second},
	}
}

// Name returns the model tag.
func (o *Ollama) Name() string { return o.Model }

// Ping checks that Ollama answers and that the model is downloaded.
func (o *Ollama) Ping(ctx context.Context) error {
	body, _ := json.Marshal(map[string]string{"model": o.Model})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+"/api/show", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := o.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return ErrModelMissing
	case resp.StatusCode != http.StatusOK:
		return fmt.Errorf("ollama answered %s", resp.Status)
	}
	return nil
}
