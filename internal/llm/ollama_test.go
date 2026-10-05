package llm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/nazboyko/one-thing/internal/mission"
)

// fakeOllama answers /api/chat with the given contents, one per call.
type fakeOllama struct {
	mu       sync.Mutex
	answers  []string
	requests []chatRequest
	delay    time.Duration
	status   int
}

func (f *fakeOllama) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if f.delay > 0 {
		select {
		case <-time.After(f.delay):
		case <-r.Context().Done():
			return
		}
	}
	if f.status != 0 {
		w.WriteHeader(f.status)
		_, _ = w.Write([]byte(`{"error":"model 'gemma4:e4b' not found"}`))
		return
	}
	if r.URL.Path == "/api/show" {
		_, _ = w.Write([]byte(`{}`))
		return
	}
	var req chatRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.requests = append(f.requests, req)
	answer := f.answers[min(len(f.requests), len(f.answers))-1]
	_ = json.NewEncoder(w).Encode(chatResponse{Message: message{Role: "assistant", Content: answer}})
}

func start(t *testing.T, f *fakeOllama) *Ollama {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return NewOllama(srv.URL, "gemma4:test")
}

func modelJSON(t *testing.T, change func(m *mission.Mission)) string {
	t.Helper()
	m := mission.Sample()
	m.ID, m.CreatedAt = "", time.Time{}
	if change != nil {
		change(&m)
	}
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestValidFirstTry(t *testing.T) {
	f := &fakeOllama{answers: []string{modelJSON(t, func(m *mission.Mission) {
		m.Steps[1].Title = "  Polish The   Top Deck "
		m.Steps[1].Seconds = 900
	})}}
	m, meta, err := start(t, f).Generate(context.Background(), "brush teeth", "rocket launch")
	if err != nil {
		t.Fatal(err)
	}
	if meta.Attempts != 1 || meta.Model != "gemma4:test" || len(f.requests) != 1 {
		t.Fatalf("meta = %+v, requests = %d", meta, len(f.requests))
	}
	if m.Steps[1].Title != "Polish the top deck" || m.Steps[1].Seconds != mission.MaxForDuration {
		t.Fatalf("output was not sanitized: %+v", m.Steps[1])
	}
	if m.ID != "" || !m.CreatedAt.IsZero() {
		t.Fatalf("model must not set id or time: %+v", m)
	}

	req := f.requests[0]
	if req.Stream || req.Think || req.KeepAlive != "30m" || len(req.Format) == 0 || req.Model != "gemma4:test" {
		t.Fatalf("request = %+v", req)
	}
	if req.Messages[0].Role != "system" || !strings.Contains(req.Messages[0].Content, "Captain") {
		t.Fatalf("system prompt missing: %+v", req.Messages[0])
	}
	if got := req.Messages[1].Content; got != "Routine: brush teeth\nTheme: rocket launch" {
		t.Fatalf("user message = %q", got)
	}
}

func TestRetryOnceWithFieldErrors(t *testing.T) {
	bad := modelJSON(t, func(m *mission.Mission) { m.Steps = m.Steps[:2] })
	f := &fakeOllama{answers: []string{bad, modelJSON(t, nil)}}
	_, meta, err := start(t, f).Generate(context.Background(), "morning", "rocket launch")
	if err != nil {
		t.Fatal(err)
	}
	if meta.Attempts != 2 || len(f.requests) != 2 {
		t.Fatalf("attempts = %d, requests = %d", meta.Attempts, len(f.requests))
	}
	retry := f.requests[1].Messages
	if len(retry) != 4 || retry[2].Role != "assistant" || retry[2].Content != bad {
		t.Fatalf("retry does not carry the first answer: %+v", retry)
	}
	if retry[3].Role != "user" || !strings.Contains(retry[3].Content, "steps: too few (at least 3)") {
		t.Fatalf("retry does not name the problem: %q", retry[3].Content)
	}
}

func TestInvalidTwice(t *testing.T) {
	f := &fakeOllama{answers: []string{`{"title": ""}`, `not json at all`}}
	_, meta, err := start(t, f).Generate(context.Background(), "morning", "rocket launch")
	var invalid *InvalidError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want InvalidError", err)
	}
	if meta.Attempts != MaxAttempts || len(f.requests) != MaxAttempts {
		t.Fatalf("attempts = %d, requests = %d", meta.Attempts, len(f.requests))
	}
	if len(invalid.Fields) != 1 || invalid.Fields[0] != "output: not valid JSON" {
		t.Fatalf("fields = %q", invalid.Fields)
	}
}

func TestUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	o := NewOllama(url, "gemma4:test")
	begin := time.Now()
	_, _, err := o.Generate(context.Background(), "morning", "rocket launch")
	if !errors.Is(err, ErrUnreachable) {
		t.Fatalf("err = %v, want ErrUnreachable", err)
	}
	if time.Since(begin) > 2*time.Second {
		t.Fatalf("took %v to notice a closed port", time.Since(begin))
	}
	if err := o.Ping(context.Background()); !errors.Is(err, ErrUnreachable) {
		t.Fatalf("ping err = %v", err)
	}
}

func TestModelMissing(t *testing.T) {
	o := start(t, &fakeOllama{status: http.StatusNotFound})
	if _, _, err := o.Generate(context.Background(), "morning", "x"); !errors.Is(err, ErrModelMissing) {
		t.Fatalf("generate err = %v", err)
	}
	if err := o.Ping(context.Background()); !errors.Is(err, ErrModelMissing) {
		t.Fatalf("ping err = %v", err)
	}
}

func TestOtherOllamaError(t *testing.T) {
	o := start(t, &fakeOllama{status: http.StatusInternalServerError})
	_, _, err := o.Generate(context.Background(), "morning", "x")
	if err == nil || !strings.Contains(err.Error(), "500") || errors.Is(err, ErrUnreachable) {
		t.Fatalf("err = %v", err)
	}
}

func TestSlowResponseRespectsContext(t *testing.T) {
	o := start(t, &fakeOllama{delay: 1500 * time.Millisecond, answers: []string{modelJSON(t, nil)}})
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	begin := time.Now()
	_, _, err := o.Generate(ctx, "morning", "rocket launch")
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want deadline exceeded", err)
	}
	if time.Since(begin) > time.Second {
		t.Fatalf("waited %v past the deadline", time.Since(begin))
	}
}

func TestClientTimeout(t *testing.T) {
	o := start(t, &fakeOllama{delay: 1500 * time.Millisecond, answers: []string{modelJSON(t, nil)}})
	o.HTTP.Timeout = 100 * time.Millisecond
	_, _, err := o.Generate(context.Background(), "morning", "rocket launch")
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want deadline exceeded", err)
	}
}

func TestPromptAndSchemaAreEmbedded(t *testing.T) {
	if !strings.Contains(systemPrompt, "six years old") {
		t.Fatal("prompt.txt not embedded")
	}
	var s map[string]any
	if err := json.Unmarshal(schema, &s); err != nil || s["type"] != "object" {
		t.Fatalf("schema.json not valid: %v", err)
	}
}
