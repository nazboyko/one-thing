// Package store keeps approved missions as JSON files, one file per mission.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/nazboyko/one-thing/internal/mission"
)

// ErrNotFound is returned for an unknown or malformed id.
var ErrNotFound = errors.New("mission not found")

var idPattern = regexp.MustCompile(`^[0-9a-f]{8}$`)

// Store reads and writes missions under <dir>/missions.
type Store struct {
	dir string
	mu  sync.Mutex
	now func() time.Time
}

// New creates the missions directory if needed.
func New(dataDir string) (*Store, error) {
	dir := filepath.Join(dataDir, "missions")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	return &Store{dir: dir, now: time.Now}, nil
}

// List returns all saved missions, newest first. A file that cannot be read
// is skipped and logged by name; it never breaks the list.
func (s *Store) List() ([]mission.Mission, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	out := []mission.Mission{}
	for _, e := range entries {
		id, ok := strings.CutSuffix(e.Name(), ".json")
		if !ok || !idPattern.MatchString(id) {
			continue
		}
		m, err := s.read(id)
		if err != nil {
			log.Printf("store: skipping %s: %v", e.Name(), err)
			continue
		}
		out = append(out, m)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out, nil
}

// Get returns one mission.
func (s *Store) Get(id string) (mission.Mission, error) {
	if !idPattern.MatchString(id) {
		return mission.Mission{}, ErrNotFound
	}
	return s.read(id)
}

// Create saves a new mission with a fresh id and creation time.
func (s *Store) Create(m mission.Mission) (mission.Mission, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for range 5 {
		id, err := newID()
		if err != nil {
			return mission.Mission{}, err
		}
		if _, err := os.Stat(s.path(id)); errors.Is(err, fs.ErrNotExist) {
			m.ID = id
			m.CreatedAt = s.now().UTC().Truncate(time.Second)
			return m, s.write(m)
		}
	}
	return mission.Mission{}, errors.New("could not find a free id")
}

// Replace overwrites an existing mission. The id and creation time stay.
func (s *Store) Replace(id string, m mission.Mission) (mission.Mission, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, err := s.Get(id)
	if err != nil {
		return mission.Mission{}, err
	}
	m.ID = old.ID
	m.CreatedAt = old.CreatedAt
	return m, s.write(m)
}

// Delete removes a mission.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !idPattern.MatchString(id) {
		return ErrNotFound
	}
	err := os.Remove(s.path(id))
	if errors.Is(err, fs.ErrNotExist) {
		return ErrNotFound
	}
	return err
}

func (s *Store) path(id string) string { return filepath.Join(s.dir, id+".json") }

func (s *Store) read(id string) (mission.Mission, error) {
	var m mission.Mission
	b, err := os.ReadFile(s.path(id))
	if errors.Is(err, fs.ErrNotExist) {
		return m, ErrNotFound
	}
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return m, fmt.Errorf("corrupt file: %w", err)
	}
	return m, nil
}

// write saves through a temp file and a rename, so a crash never leaves a
// half-written mission behind.
func (s *Store) write(m mission.Mission) error {
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(b, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path(m.ID))
}

func newID() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
