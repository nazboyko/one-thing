// Package httpapi serves the JSON API and the built web app.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/nazboyko/one-thing/internal/llm"
	"github.com/nazboyko/one-thing/internal/mission"
	"github.com/nazboyko/one-thing/internal/store"
)

const (
	maxBody      = 64 << 10
	minRoutine   = 3
	maxRoutine   = 500
	maxTheme     = 60
	defaultTheme = "rocket launch"
)

// Model is the local model as the HTTP layer sees it.
type Model interface {
	Name() string
	Ping(ctx context.Context) error
	Generate(ctx context.Context, routine, theme string) (mission.Mission, llm.Meta, error)
}

// Server wires the store, the model and the web build to HTTP.
type Server struct {
	Store   *store.Store
	Model   Model
	LANURLs []string
	Web     fs.FS
}

type apiError struct {
	Error  string   `json:"error"`
	Fields []string `json:"fields"`
}

// Handler returns the routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/sample", s.sample)
	mux.HandleFunc("POST /api/generate", s.generate)
	mux.HandleFunc("GET /api/missions", s.listMissions)
	mux.HandleFunc("POST /api/missions", s.createMission)
	mux.HandleFunc("GET /api/missions/{id}", s.getMission)
	mux.HandleFunc("PUT /api/missions/{id}", s.replaceMission)
	mux.HandleFunc("DELETE /api/missions/{id}", s.deleteMission)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "no such endpoint", nil)
	})
	mux.Handle("/", s.static())
	return secure(mux)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status := "up"
	if err := s.Model.Ping(ctx); errors.Is(err, llm.ErrModelMissing) {
		status = "missing"
	} else if err != nil {
		status = "down"
	}
	urls := s.LANURLs
	if urls == nil {
		urls = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"model":    s.Model.Name(),
		"ollama":   status,
		"lan_urls": urls,
	})
}

func (s *Server) sample(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, mission.Sample())
}

type generateRequest struct {
	Routine string `json:"routine"`
	Theme   string `json:"theme"`
}

// generate asks the model for a mission. The result is a draft: it reaches
// the child only after the parent approves and saves it.
func (s *Server) generate(w http.ResponseWriter, r *http.Request) {
	var req generateRequest
	if !decode(w, r, &req) {
		return
	}
	routine := strings.TrimSpace(req.Routine)
	theme := strings.Join(strings.Fields(req.Theme), " ")
	if theme == "" {
		theme = defaultTheme
	}
	var fields []string
	switch n := utf8.RuneCountInString(routine); {
	case n < minRoutine:
		fields = append(fields, fmt.Sprintf("routine: too short (at least %d characters)", minRoutine))
	case n > maxRoutine:
		fields = append(fields, fmt.Sprintf("routine: too long (at most %d characters)", maxRoutine))
	}
	if utf8.RuneCountInString(theme) > maxTheme {
		fields = append(fields, fmt.Sprintf("theme: too long (at most %d characters)", maxTheme))
	}
	if len(fields) > 0 {
		writeError(w, http.StatusUnprocessableEntity, "Check the routine and the theme.", fields)
		return
	}

	m, meta, err := s.Model.Generate(r.Context(), routine, theme)
	var invalid *llm.InvalidError
	switch {
	case err == nil:
		log.Printf("generate: %d ms, %d attempt(s)", meta.MS, meta.Attempts)
		writeJSON(w, http.StatusOK, map[string]any{"mission": m, "meta": meta})
	case errors.As(err, &invalid):
		log.Printf("generate: invalid after %d attempts, %d ms", meta.Attempts, meta.MS)
		writeError(w, http.StatusUnprocessableEntity,
			"The model's mission did not pass the checks, even after a second try. Write the mission again, or change the routine a little.",
			invalid.Fields)
	case errors.Is(err, llm.ErrModelMissing):
		writeError(w, http.StatusBadGateway,
			fmt.Sprintf("The model %s is not downloaded. Run: ollama pull %s", s.Model.Name(), s.Model.Name()), nil)
	case errors.Is(err, llm.ErrUnreachable):
		writeError(w, http.StatusBadGateway, "The model is not running. Start it with: ollama serve", nil)
	case errors.Is(err, context.DeadlineExceeded):
		writeError(w, http.StatusGatewayTimeout, "The model took too long to answer. Try again.", nil)
	case errors.Is(err, context.Canceled):
		// the parent left the page; nobody is waiting for an answer
	default:
		log.Printf("generate: %v", err)
		writeError(w, http.StatusBadGateway, "The model answered with an error. Try again.", nil)
	}
}

func (s *Server) listMissions(w http.ResponseWriter, r *http.Request) {
	list, err := s.Store.List()
	if err != nil {
		internalError(w, "list missions", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) getMission(w http.ResponseWriter, r *http.Request) {
	m, err := s.Store.Get(r.PathValue("id"))
	if err != nil {
		storeError(w, "get mission", err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) createMission(w http.ResponseWriter, r *http.Request) {
	m, ok := decodeMission(w, r)
	if !ok {
		return
	}
	saved, err := s.Store.Create(m)
	if err != nil {
		internalError(w, "create mission", err)
		return
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) replaceMission(w http.ResponseWriter, r *http.Request) {
	m, ok := decodeMission(w, r)
	if !ok {
		return
	}
	saved, err := s.Store.Replace(r.PathValue("id"), m)
	if err != nil {
		storeError(w, "replace mission", err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) deleteMission(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.Delete(r.PathValue("id")); err != nil {
		storeError(w, "delete mission", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeMission reads and validates a mission written by the parent. Parent
// edits are validated, never silently changed.
func decodeMission(w http.ResponseWriter, r *http.Request) (mission.Mission, bool) {
	var m mission.Mission
	if !decode(w, r, &m) {
		return m, false
	}
	if errs := mission.Validate(m); len(errs) > 0 {
		writeError(w, http.StatusUnprocessableEntity, "Some fields need a fix before saving.", errs)
		return m, false
	}
	return m, true
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body is too large (64 KB at most)", nil)
		} else {
			writeError(w, http.StatusBadRequest, "request body is not valid JSON", nil)
		}
		return false
	}
	return true
}

func (s *Server) static() http.Handler {
	files := http.FileServerFS(s.Web)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			if _, err := fs.Stat(s.Web, "index.html"); err != nil {
				http.Error(w, "The web app is not built yet. Run: make build", http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func storeError(w http.ResponseWriter, action string, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "mission not found", nil)
		return
	}
	internalError(w, action, err)
}

func internalError(w http.ResponseWriter, action string, err error) {
	log.Printf("%s: %v", action, err)
	writeError(w, http.StatusInternalServerError, "something went wrong on the server", nil)
}

func writeError(w http.ResponseWriter, status int, msg string, fields []string) {
	if fields == nil {
		fields = []string{}
	}
	writeJSON(w, status, apiError{Error: msg, Fields: fields})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}
