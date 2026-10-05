package store

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/nazboyko/one-thing/internal/mission"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	clock := time.Date(2026, 10, 4, 18, 0, 0, 0, time.UTC)
	s.now = func() time.Time {
		clock = clock.Add(time.Minute)
		return clock
	}
	return s
}

func draft(title string) mission.Mission {
	m := mission.Sample()
	m.ID, m.CreatedAt, m.Title = "", time.Time{}, title
	return m
}

func TestCreateAndGet(t *testing.T) {
	s := newStore(t)
	saved, err := s.Create(draft("Morning"))
	if err != nil {
		t.Fatal(err)
	}
	if !idPattern.MatchString(saved.ID) || saved.CreatedAt.IsZero() {
		t.Fatalf("bad id or time: %q %v", saved.ID, saved.CreatedAt)
	}
	got, err := s.Get(saved.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Morning" || len(got.Steps) != 6 || !got.CreatedAt.Equal(saved.CreatedAt) {
		t.Fatalf("round trip changed the mission: %+v", got)
	}
}

func TestListNewestFirst(t *testing.T) {
	s := newStore(t)
	for _, title := range []string{"first", "second", "third"} {
		if _, err := s.Create(draft(title)); err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	var titles []string
	for _, m := range list {
		titles = append(titles, m.Title)
	}
	if len(titles) != 3 || titles[0] != "third" || titles[2] != "first" {
		t.Fatalf("order = %q", titles)
	}
}

func TestListEmptyIsNotNil(t *testing.T) {
	list, err := newStore(t).List()
	if err != nil || list == nil || len(list) != 0 {
		t.Fatalf("List() = %v, %v; want empty slice", list, err)
	}
}

func TestReplaceKeepsIDAndTime(t *testing.T) {
	s := newStore(t)
	saved, _ := s.Create(draft("before"))
	changed := draft("after")
	changed.ID = "ffffffff"
	got, err := s.Replace(saved.ID, changed)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != saved.ID || !got.CreatedAt.Equal(saved.CreatedAt) || got.Title != "after" {
		t.Fatalf("Replace() = %+v", got)
	}
	again, _ := s.Get(saved.ID)
	if again.Title != "after" {
		t.Fatalf("stored title = %q", again.Title)
	}
}

func TestDelete(t *testing.T) {
	s := newStore(t)
	saved, _ := s.Create(draft("gone"))
	if err := s.Delete(saved.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(saved.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get after delete: %v", err)
	}
	if err := s.Delete(saved.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete: %v", err)
	}
}

func TestMissingAndMalformedIDs(t *testing.T) {
	s := newStore(t)
	for _, id := range []string{"0000aaaa", "../../etc", "sample", "", "ABCDEF12"} {
		if _, err := s.Get(id); !errors.Is(err, ErrNotFound) {
			t.Errorf("Get(%q) = %v, want ErrNotFound", id, err)
		}
		if _, err := s.Replace(id, draft("x")); !errors.Is(err, ErrNotFound) {
			t.Errorf("Replace(%q) = %v, want ErrNotFound", id, err)
		}
	}
}

func TestCorruptFileIsSkipped(t *testing.T) {
	s := newStore(t)
	good, _ := s.Create(draft("good"))
	if err := os.WriteFile(filepath.Join(s.dir, "deadbeef.json"), []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.dir, "notes.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	list, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != good.ID {
		t.Fatalf("List() = %+v, want only the good mission", list)
	}
	if _, err := s.Get("deadbeef"); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("Get(corrupt) = %v, want a read error", err)
	}
}

func TestNoTempFilesLeft(t *testing.T) {
	s := newStore(t)
	saved, _ := s.Create(draft("one"))
	_, _ = s.Replace(saved.ID, draft("two"))
	entries, _ := os.ReadDir(s.dir)
	if len(entries) != 1 {
		t.Fatalf("files in store: %d, want 1", len(entries))
	}
}
