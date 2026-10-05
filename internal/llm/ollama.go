// Package llm turns a parent's routine into a mission with a local model,
// through the Ollama HTTP API.
package llm

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/nazboyko/one-thing/internal/mission"
)

var (
	//go:embed prompt.txt
	systemPrompt string
	//go:embed schema.json
	schema json.RawMessage
)

// MaxAttempts is the first call plus one retry with the field errors.
const MaxAttempts = 2

var (
	// ErrUnreachable means nothing answers at the Ollama URL.
	ErrUnreachable = errors.New("ollama is not reachable")
	// ErrModelMissing means Ollama answers but the model is not downloaded.
	ErrModelMissing = errors.New("model is not downloaded")
)

// InvalidError is returned when the model's mission still breaks the rules
// after the retry.
type InvalidError struct {
	Fields []string
}

func (e *InvalidError) Error() string {
	return "model output failed validation: " + strings.Join(e.Fields, "; ")
}

// Meta describes how a mission was written, for the parent screen.
type Meta struct {
	Model    string `json:"model"`
	MS       int64  `json:"ms"`
	Attempts int    `json:"attempts"`
}

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
	resp, err := o.post(ctx, "/api/show", map[string]string{"model": o.Model})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return statusError(resp)
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model     string          `json:"model"`
	Messages  []message       `json:"messages"`
	Stream    bool            `json:"stream"`
	Format    json.RawMessage `json:"format"`
	Think     bool            `json:"think"`
	KeepAlive string          `json:"keep_alive"`
}

type chatResponse struct {
	Message message `json:"message"`
}

// Generate writes a mission for the routine and theme. The output is parsed,
// sanitized and validated; if it breaks a rule the model gets one more try
// with the list of problems.
func (o *Ollama) Generate(ctx context.Context, routine, theme string) (mission.Mission, Meta, error) {
	start := time.Now()
	meta := Meta{Model: o.Model}
	msgs := []message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: "Routine: " + routine + "\nTheme: " + theme},
	}
	var problems []string
	for attempt := 1; attempt <= MaxAttempts; attempt++ {
		meta.Attempts = attempt
		content, err := o.chat(ctx, msgs)
		meta.MS = time.Since(start).Milliseconds()
		if err != nil {
			return mission.Mission{}, meta, err
		}
		m, errs := check(content)
		if len(errs) == 0 {
			return m, meta, nil
		}
		problems = errs
		msgs = append(msgs,
			message{Role: "assistant", Content: content},
			message{Role: "user", Content: retryMessage(errs)},
		)
	}
	return mission.Mission{}, meta, &InvalidError{Fields: problems}
}

// check parses the model's JSON, tidies it and returns the rule problems.
func check(content string) (mission.Mission, []string) {
	var m mission.Mission
	if err := json.Unmarshal([]byte(content), &m); err != nil {
		return m, []string{"output: not valid JSON"}
	}
	m.ID, m.CreatedAt, m.LeaveAt = "", time.Time{}, ""
	m = mission.Sanitize(m)
	return m, mission.Validate(m)
}

func retryMessage(errs []string) string {
	var b strings.Builder
	b.WriteString("That mission breaks these rules:\n")
	for _, e := range errs {
		b.WriteString("- " + e + "\n")
	}
	b.WriteString("Write the whole mission again as JSON. Keep what was fine and fix only these problems.")
	return b.String()
}

func (o *Ollama) chat(ctx context.Context, msgs []message) (string, error) {
	resp, err := o.post(ctx, "/api/chat", chatRequest{
		Model:     o.Model,
		Messages:  msgs,
		Stream:    false,
		Format:    schema,
		Think:     false,
		KeepAlive: "30m",
	})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if err := statusError(resp); err != nil {
		return "", err
	}
	var out chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("read ollama answer: %w", err)
	}
	return out.Message.Content, nil
}

func (o *Ollama) post(ctx context.Context, path string, body any) (*http.Response, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := o.HTTP.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		var timeout interface{ Timeout() bool }
		if errors.As(err, &timeout) && timeout.Timeout() {
			return nil, context.DeadlineExceeded
		}
		return nil, fmt.Errorf("%w: %v", ErrUnreachable, err)
	}
	return resp, nil
}

func statusError(resp *http.Response) error {
	switch {
	case resp.StatusCode == http.StatusOK:
		return nil
	case resp.StatusCode == http.StatusNotFound:
		return ErrModelMissing
	}
	var body struct {
		Error string `json:"error"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&body)
	if body.Error != "" {
		return fmt.Errorf("ollama answered %s: %s", resp.Status, body.Error)
	}
	return fmt.Errorf("ollama answered %s", resp.Status)
}
