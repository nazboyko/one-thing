package mission

import (
	"slices"
	"strings"
	"testing"
)

func valid() Mission {
	m := Sample()
	m.Steps = slices.Clone(m.Steps)
	return m
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name   string
		change func(m *Mission)
		want   []string
	}{
		{"sample is valid", func(m *Mission) {}, nil},
		{"empty title", func(m *Mission) { m.Title = "  " }, []string{"title: required"}},
		{"long title", func(m *Mission) { m.Title = strings.Repeat("a", 61) }, []string{"title: too long (at most 60 characters)"}},
		{"title at the limit", func(m *Mission) { m.Title = strings.Repeat("é", 60) }, nil},
		{"long intro", func(m *Mission) { m.Intro = strings.Repeat("a", 141) }, []string{"intro: too long (at most 140 characters)"}},
		{"empty finale", func(m *Mission) { m.Finale = "" }, []string{"finale: required"}},
		{"too few steps", func(m *Mission) { m.Steps = m.Steps[:2] }, []string{"steps: too few (at least 3)"}},
		{"too many steps", func(m *Mission) {
			m.Steps = append(m.Steps, m.Steps[0], m.Steps[0], m.Steps[0])
		}, []string{"steps: too many (at most 8)"}},
		{"seven-word step title", func(m *Mission) { m.Steps[1].Title = "one two three four five six seven" }, []string{"steps[1].title: too many words (at most 6)"}},
		{"long step title", func(m *Mission) { m.Steps[0].Title = strings.Repeat("x", 41) }, []string{"steps[0].title: too long (at most 40 characters)"}},
		{"empty say", func(m *Mission) { m.Steps[2].Say = "" }, []string{"steps[2].say: required"}},
		{"bad mode", func(m *Mission) { m.Steps[0].Mode = "later" }, []string{"steps[0].mode: must be until_done or for_duration"}},
		{"until_done too short", func(m *Mission) { m.Steps[0].Seconds = 29 }, []string{"steps[0].seconds: must be 30 to 1200 for a hold-when-done step"}},
		{"until_done too long", func(m *Mission) { m.Steps[0].Seconds = 1201 }, []string{"steps[0].seconds: must be 30 to 1200 for a hold-when-done step"}},
		{"for_duration too long", func(m *Mission) { m.Steps[1].Seconds = 301 }, []string{"steps[1].seconds: must be 10 to 300 for a timed step"}},
		{"for_duration too short", func(m *Mission) { m.Steps[1].Seconds = 9 }, []string{"steps[1].seconds: must be 10 to 300 for a timed step"}},
		{"for_duration accepts 10", func(m *Mission) { m.Steps[1].Seconds = 10 }, nil},
		{"empty emoji", func(m *Mission) { m.Steps[3].Emoji = "" }, []string{"steps[3].emoji: required"}},
		{"letters as emoji", func(m *Mission) { m.Steps[3].Emoji = "ok" }, []string{"steps[3].emoji: must be an emoji, not letters or signs"}},
		{"colon as emoji", func(m *Mission) { m.Steps[3].Emoji = ":" }, []string{"steps[3].emoji: must be an emoji, not letters or signs"}},
		{"emoji with a space", func(m *Mission) { m.Steps[3].Emoji = "🚀 🚀" }, []string{"steps[3].emoji: must be an emoji, not letters or signs"}},
		{"emoji with variation selector", func(m *Mission) { m.Steps[3].Emoji = "🛏️" }, nil},
		{"too long emoji", func(m *Mission) { m.Steps[3].Emoji = strings.Repeat("🚀", 9) }, []string{"steps[3].emoji: too long (one emoji)"}},
		{"joined emoji is fine", func(m *Mission) { m.Steps[3].Emoji = "🧑‍🚀" }, nil},
		{"good leave_at", func(m *Mission) { m.LeaveAt = "08:10" }, nil},
		{"bad leave_at", func(m *Mission) { m.LeaveAt = "8:10" }, []string{"leave_at: must be HH:MM, 24-hour"}},
		{"leave_at out of range", func(m *Mission) { m.LeaveAt = "24:00" }, []string{"leave_at: must be HH:MM, 24-hour"}},
		{"several errors at once", func(m *Mission) {
			m.Title = ""
			m.Steps[4].Mode = ""
		}, []string{"title: required", "steps[4].mode: must be until_done or for_duration"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := valid()
			tt.change(&m)
			got := Validate(m)
			if !slices.Equal(got, tt.want) {
				t.Errorf("Validate() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSanitize(t *testing.T) {
	tests := []struct {
		name  string
		in    Step
		want  Step
		title string
	}{
		{
			name: "trims and collapses whitespace",
			in:   Step{Emoji: " 🚀 ", Title: "  Suit\n  up ", Say: "Put   on\tyour suit.", Mode: UntilDone, Seconds: 60},
			want: Step{Emoji: "🚀", Title: "Suit up", Say: "Put on your suit.", Mode: UntilDone, Seconds: 60},
		},
		{
			name: "clamps a long timed step",
			in:   Step{Emoji: "🪥", Title: "Brush", Say: "Brush.", Mode: ForDuration, Seconds: 600},
			want: Step{Emoji: "🪥", Title: "Brush", Say: "Brush.", Mode: ForDuration, Seconds: 300},
		},
		{
			name: "clamps a short hold step",
			in:   Step{Emoji: "🎒", Title: "Bag", Say: "Bag.", Mode: UntilDone, Seconds: 5},
			want: Step{Emoji: "🎒", Title: "Bag", Say: "Bag.", Mode: UntilDone, Seconds: 30},
		},
		{
			name: "replaces a word emoji",
			in:   Step{Emoji: "rocket", Title: "Go", Say: "Go.", Mode: UntilDone, Seconds: 60},
			want: Step{Emoji: FallbackEmoji, Title: "Go", Say: "Go.", Mode: UntilDone, Seconds: 60},
		},
		{
			name: "replaces a colon emoji",
			in:   Step{Emoji: ":", Title: "Go", Say: "Go.", Mode: ForDuration, Seconds: 45},
			want: Step{Emoji: FallbackEmoji, Title: "Go", Say: "Go.", Mode: ForDuration, Seconds: 45},
		},
		{
			name: "replaces an empty emoji",
			in:   Step{Emoji: "", Title: "Go", Say: "Go.", Mode: UntilDone, Seconds: 60},
			want: Step{Emoji: FallbackEmoji, Title: "Go", Say: "Go.", Mode: UntilDone, Seconds: 60},
		},
		{
			name: "leaves an unknown mode for Validate",
			in:   Step{Emoji: "🎒", Title: "Bag", Say: "Bag.", Mode: "soon", Seconds: 5},
			want: Step{Emoji: "🎒", Title: "Bag", Say: "Bag.", Mode: "soon", Seconds: 5},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := Mission{Title: "  Night   flight ", Steps: []Step{tt.in}}
			got := Sanitize(m)
			if got.Steps[0] != tt.want {
				t.Errorf("step = %+v, want %+v", got.Steps[0], tt.want)
			}
			if got.Title != "Night flight" {
				t.Errorf("title = %q", got.Title)
			}
		})
	}
}

func TestSentenceCase(t *testing.T) {
	tests := []struct{ in, want string }{
		{"Polish The Top Deck", "Polish the top deck"},
		{"fuel up", "Fuel up"},
		{"Suit Up, Captain", "Suit up, Captain"},
		{"Load The NASA Cargo", "Load the NASA cargo"},
		{"Pre-Flight Clean Up", "Pre-flight clean up"},
		{"Écoute Bien", "Écoute bien"},
		{"Go", "Go"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := sentenceCase(tt.in); got != tt.want {
			t.Errorf("sentenceCase(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestSanitizeKeepsMissionTitleCase(t *testing.T) {
	m := Sanitize(Mission{Title: "Rocket Launch: School Morning", Steps: []Step{{Title: "Fuel Up"}}})
	if m.Title != "Rocket Launch: School Morning" || m.Steps[0].Title != "Fuel up" {
		t.Fatalf("got %q / %q", m.Title, m.Steps[0].Title)
	}
}

func TestSanitizeDoesNotTouchInput(t *testing.T) {
	m := valid()
	m.Steps[0].Seconds = 5000
	_ = Sanitize(m)
	if m.Steps[0].Seconds != 5000 {
		t.Fatal("Sanitize changed the caller's steps")
	}
}

func TestSample(t *testing.T) {
	m := Sample()
	if m.ID != SampleID || m.CreatedAt.IsZero() {
		t.Fatalf("sample id or time missing: %q %v", m.ID, m.CreatedAt)
	}
	if len(m.Steps) != 6 {
		t.Fatalf("sample has %d steps, want 6", len(m.Steps))
	}
	if errs := Validate(m); len(errs) > 0 {
		t.Fatalf("sample is invalid: %q", errs)
	}
}
