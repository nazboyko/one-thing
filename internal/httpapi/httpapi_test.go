package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/nazboyko/one-thing/internal/llm"
	"github.com/nazboyko/one-thing/internal/mission"
	"github.com/nazboyko/one-thing/internal/store"
)

type fakeModel struct {
	pingErr error
	genErr  error
	gotArgs []string
}

func (f *fakeModel) Name() string                   { return "gemma4:test" }
func (f *fakeModel) Ping(ctx context.Context) error { return f.pingErr }
func (f *fakeModel) Generate(ctx context.Context, routine, theme string) (mission.Mission, llm.Meta, error) {
	f.gotArgs = []string{routine, theme}
	meta := llm.Meta{Model: "gemma4:test", MS: 3100, Attempts: 1}
	if f.genErr != nil {
		return mission.Mission{}, meta, f.genErr
	}
	m := mission.Sample()
	m.ID, m.CreatedAt = "", time.Time{}
	return m, meta, nil
}

func newServer(t *testing.T, model *fakeModel) http.Handler {
	t.Helper()
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		Store:   st,
		Model:   model,
		LANURLs: []string{"http://192.168.1.20:8787/"},
		Web:     fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>One Thing</title>")}},
	}
	return s.Handler()
}

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decodeInto[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("bad JSON %q: %v", rec.Body.String(), err)
	}
	return v
}

func sampleBody(t *testing.T, change func(m *mission.Mission)) string {
	t.Helper()
	m := mission.Sample()
	m.ID = ""
	if change != nil {
		change(&m)
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func TestHealth(t *testing.T) {
	tests := []struct {
		name string
		ping error
		want string
	}{
		{"ollama up", nil, "up"},
		{"ollama down", errors.New("connection refused"), "down"},
		{"model not pulled", llm.ErrModelMissing, "missing"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, newServer(t, &fakeModel{pingErr: tt.ping}), "GET", "/api/health", "")
			if rec.Code != http.StatusOK {
				t.Fatalf("status %d", rec.Code)
			}
			got := decodeInto[struct {
				OK      bool     `json:"ok"`
				Model   string   `json:"model"`
				Ollama  string   `json:"ollama"`
				LANURLs []string `json:"lan_urls"`
			}](t, rec)
			if !got.OK || got.Model != "gemma4:test" || got.Ollama != tt.want || len(got.LANURLs) != 1 {
				t.Fatalf("health = %+v", got)
			}
		})
	}
}

func TestSample(t *testing.T) {
	rec := do(t, newServer(t, &fakeModel{}), "GET", "/api/sample", "")
	m := decodeInto[mission.Mission](t, rec)
	if rec.Code != http.StatusOK || m.ID != "sample" || len(m.Steps) != 6 {
		t.Fatalf("status %d, mission %+v", rec.Code, m)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("content type %q", ct)
	}
}

func TestMissionLifecycle(t *testing.T) {
	h := newServer(t, &fakeModel{})

	if list := decodeInto[[]mission.Mission](t, do(t, h, "GET", "/api/missions", "")); len(list) != 0 {
		t.Fatalf("new store lists %d missions", len(list))
	}

	rec := do(t, h, "POST", "/api/missions", sampleBody(t, nil))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	created := decodeInto[mission.Mission](t, rec)
	if len(created.ID) != 8 || created.CreatedAt.IsZero() {
		t.Fatalf("created = %+v", created)
	}

	rec = do(t, h, "GET", "/api/missions/"+created.ID, "")
	if rec.Code != http.StatusOK || decodeInto[mission.Mission](t, rec).Title != created.Title {
		t.Fatalf("get: %d %s", rec.Code, rec.Body)
	}

	rec = do(t, h, "PUT", "/api/missions/"+created.ID, sampleBody(t, func(m *mission.Mission) { m.Title = "Night flight" }))
	if rec.Code != http.StatusOK || decodeInto[mission.Mission](t, rec).Title != "Night flight" {
		t.Fatalf("replace: %d %s", rec.Code, rec.Body)
	}

	list := decodeInto[[]mission.Mission](t, do(t, h, "GET", "/api/missions", ""))
	if len(list) != 1 || list[0].Title != "Night flight" {
		t.Fatalf("list = %+v", list)
	}

	if rec = do(t, h, "DELETE", "/api/missions/"+created.ID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}
	if rec = do(t, h, "GET", "/api/missions/"+created.ID, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: %d", rec.Code)
	}
}

func TestValidationErrorShape(t *testing.T) {
	h := newServer(t, &fakeModel{})
	body := sampleBody(t, func(m *mission.Mission) {
		m.Steps[1].Title = "one two three four five six seven"
	})
	for _, c := range []struct{ method, path string }{
		{"POST", "/api/missions"},
		{"PUT", "/api/missions/0000abcd"},
	} {
		rec := do(t, h, c.method, c.path, body)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s: status %d", c.method, rec.Code)
		}
		e := decodeInto[apiError](t, rec)
		if e.Error == "" || len(e.Fields) != 1 || e.Fields[0] != "steps[1].title: too many words (at most 6)" {
			t.Fatalf("%s: error = %+v", c.method, e)
		}
	}
}

func TestBadRequests(t *testing.T) {
	h := newServer(t, &fakeModel{})
	tests := []struct {
		name, method, path, body string
		want                     int
	}{
		{"broken JSON", "POST", "/api/missions", "{", http.StatusBadRequest},
		{"too large", "POST", "/api/missions", `{"title":"` + strings.Repeat("a", 70<<10) + `"}`, http.StatusRequestEntityTooLarge},
		{"unknown id", "GET", "/api/missions/0000abcd", "", http.StatusNotFound},
		{"replace unknown id", "PUT", "/api/missions/0000abcd", sampleBody(t, nil), http.StatusNotFound},
		{"delete unknown id", "DELETE", "/api/missions/0000abcd", "", http.StatusNotFound},
		{"path tricks", "GET", "/api/missions/..%2f..%2fetc", "", http.StatusNotFound},
		{"unknown endpoint", "GET", "/api/nope", "", http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, h, tt.method, tt.path, tt.body)
			if rec.Code != tt.want {
				t.Fatalf("status %d, want %d (%s)", rec.Code, tt.want, rec.Body)
			}
			if e := decodeInto[apiError](t, rec); e.Error == "" || e.Fields == nil {
				t.Fatalf("error shape = %s", rec.Body)
			}
		})
	}
}

func TestServesWebApp(t *testing.T) {
	rec := do(t, newServer(t, &fakeModel{}), "GET", "/", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "One Thing") {
		t.Fatalf("GET / = %d %q", rec.Code, rec.Body)
	}
}

func TestMissingWebBuild(t *testing.T) {
	st, _ := store.New(t.TempDir())
	s := &Server{Store: st, Model: &fakeModel{}, Web: fstest.MapFS{".gitkeep": {}}}
	rec := do(t, s.Handler(), "GET", "/", "")
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "make build") {
		t.Fatalf("GET / without build = %d %q", rec.Code, rec.Body)
	}
}

func TestGenerate(t *testing.T) {
	model := &fakeModel{}
	h := newServer(t, model)
	rec := do(t, h, "POST", "/api/generate", `{"routine":"  School morning: breakfast, teeth  ","theme":"  rocket   launch "}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	got := decodeInto[struct {
		Mission mission.Mission `json:"mission"`
		Meta    llm.Meta        `json:"meta"`
	}](t, rec)
	if len(got.Mission.Steps) != 6 || got.Meta.Attempts != 1 || got.Meta.MS != 3100 || got.Meta.Model != "gemma4:test" {
		t.Fatalf("body = %+v", got)
	}
	if model.gotArgs[0] != "School morning: breakfast, teeth" || model.gotArgs[1] != "rocket launch" {
		t.Fatalf("model got %q", model.gotArgs)
	}
	if list := decodeInto[[]mission.Mission](t, do(t, h, "GET", "/api/missions", "")); len(list) != 0 {
		t.Fatal("a generated mission must not be saved before the parent approves it")
	}
}

func TestGenerateDefaultTheme(t *testing.T) {
	model := &fakeModel{}
	if rec := do(t, newServer(t, model), "POST", "/api/generate", `{"routine":"bedtime"}`); rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if model.gotArgs[1] != "rocket launch" {
		t.Fatalf("theme = %q", model.gotArgs[1])
	}
}

func TestGenerateRejectsBadInput(t *testing.T) {
	tests := []struct {
		name, body, field string
	}{
		{"empty routine", `{"routine":""}`, "routine: too short (at least 3 characters)"},
		{"blank routine", `{"routine":"    "}`, "routine: too short (at least 3 characters)"},
		{"oversized routine", `{"routine":"` + strings.Repeat("a", 501) + `"}`, "routine: too long (at most 500 characters)"},
		{"long theme", `{"routine":"bedtime","theme":"` + strings.Repeat("t", 61) + `"}`, "theme: too long (at most 60 characters)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			model := &fakeModel{}
			rec := do(t, newServer(t, model), "POST", "/api/generate", tt.body)
			e := decodeInto[apiError](t, rec)
			if rec.Code != http.StatusUnprocessableEntity || len(e.Fields) != 1 || e.Fields[0] != tt.field {
				t.Fatalf("status %d, error %+v", rec.Code, e)
			}
			if model.gotArgs != nil {
				t.Fatal("the model was called for bad input")
			}
		})
	}
}

func TestGenerateErrors(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		text   string
		fields int
	}{
		{"invalid twice", &llm.InvalidError{Fields: []string{"steps: too few (at least 3)"}}, http.StatusUnprocessableEntity, "second try", 1},
		{"ollama down", fmt.Errorf("%w: connection refused", llm.ErrUnreachable), http.StatusBadGateway, "ollama serve", 0},
		{"model not pulled", llm.ErrModelMissing, http.StatusBadGateway, "ollama pull gemma4:test", 0},
		{"too slow", context.DeadlineExceeded, http.StatusGatewayTimeout, "too long", 0},
		{"other", errors.New("boom"), http.StatusBadGateway, "Try again", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, newServer(t, &fakeModel{genErr: tt.err}), "POST", "/api/generate", `{"routine":"bedtime"}`)
			e := decodeInto[apiError](t, rec)
			if rec.Code != tt.status || !strings.Contains(e.Error, tt.text) || len(e.Fields) != tt.fields {
				t.Fatalf("status %d, error %+v", rec.Code, e)
			}
		})
	}
}
