// Package mission holds the mission type and the rules every mission must
// follow before a child sees it.
package mission

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Step modes.
const (
	// UntilDone steps end when the child holds the button. The timer is soft.
	UntilDone = "until_done"
	// ForDuration steps last until the timer ends (brushing teeth).
	ForDuration = "for_duration"
)

// Limits from the data contract.
const (
	MinSteps        = 3
	MaxSteps        = 8
	MaxTitle        = 60
	MaxLine         = 140
	MaxStepTitle    = 40
	MaxStepWords    = 6
	MaxEmojiBytes   = 32
	MinUntilDone    = 30
	MaxUntilDone    = 1200
	MinForDuration  = 10
	MaxForDuration  = 300
	FallbackEmoji   = "⭐"
	SampleID        = "sample"
	sampleCreatedAt = "2026-10-04T00:00:00Z"
)

// Step is one action on the kid screen.
type Step struct {
	Emoji   string `json:"emoji"`
	Title   string `json:"title"`
	Say     string `json:"say"`
	Mode    string `json:"mode"`
	Seconds int    `json:"seconds"`
}

// Mission is an approved routine, played one step at a time.
type Mission struct {
	ID        string    `json:"id,omitempty"`
	CreatedAt time.Time `json:"created_at,omitzero"`
	Title     string    `json:"title"`
	Intro     string    `json:"intro"`
	Steps     []Step    `json:"steps"`
	Finale    string    `json:"finale"`
	LeaveAt   string    `json:"leave_at,omitempty"`
}

var (
	leaveAtPattern = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)
	asciiRegex     = regexp.MustCompile(`[\x00-\x7F]`)
)

// Validate returns one message per broken rule, such as
// "steps[2].title: too long". An empty result means the mission is valid.
func Validate(m Mission) []string {
	var errs []string
	add := func(field, msg string, args ...any) {
		errs = append(errs, field+": "+fmt.Sprintf(msg, args...))
	}
	text := func(field, v string, max int) {
		n := utf8.RuneCountInString(strings.TrimSpace(v))
		switch {
		case n == 0:
			add(field, "required")
		case utf8.RuneCountInString(v) > max:
			add(field, "too long (at most %d characters)", max)
		}
	}

	text("title", m.Title, MaxTitle)
	text("intro", m.Intro, MaxLine)
	text("finale", m.Finale, MaxLine)

	switch {
	case len(m.Steps) < MinSteps:
		add("steps", "too few (at least %d)", MinSteps)
	case len(m.Steps) > MaxSteps:
		add("steps", "too many (at most %d)", MaxSteps)
	}

	for i, s := range m.Steps {
		p := fmt.Sprintf("steps[%d].", i)
		text(p+"title", s.Title, MaxStepTitle)
		if w := len(strings.Fields(s.Title)); w > MaxStepWords {
			add(p+"title", "too many words (at most %d)", MaxStepWords)
		}
		text(p+"say", s.Say, MaxLine)
		if msg := emojiProblem(s.Emoji); msg != "" {
			errs = append(errs, p+"emoji: "+msg)
		}
		switch s.Mode {
		case UntilDone:
			if s.Seconds < MinUntilDone || s.Seconds > MaxUntilDone {
				add(p+"seconds", "must be %d to %d for a hold-when-done step", MinUntilDone, MaxUntilDone)
			}
		case ForDuration:
			if s.Seconds < MinForDuration || s.Seconds > MaxForDuration {
				add(p+"seconds", "must be %d to %d for a timed step", MinForDuration, MaxForDuration)
			}
		default:
			add(p+"mode", "must be %s or %s", UntilDone, ForDuration)
		}
	}

	if m.LeaveAt != "" && !leaveAtPattern.MatchString(m.LeaveAt) {
		add("leave_at", "must be HH:MM, 24-hour")
	}
	return errs
}

func emojiProblem(e string) string {
	switch {
	case strings.TrimSpace(e) == "":
		return "required"
	case len(e) > MaxEmojiBytes:
		return "too long (one emoji)"
	case asciiRegex.MatchString(e):
		// letters, digits, and also punctuation such as ":" (seen from the model)
		return "must be an emoji, not letters or signs"
	}
	return ""
}

// Sanitize tidies model output before it is validated: it trims and
// collapses whitespace, writes step titles in sentence case, clamps seconds
// into the range of the step's mode and replaces an unusable emoji with a
// star. Parent edits are never sanitized.
func Sanitize(m Mission) Mission {
	out := m
	out.Title = tidy(m.Title)
	out.Intro = tidy(m.Intro)
	out.Finale = tidy(m.Finale)
	out.LeaveAt = strings.TrimSpace(m.LeaveAt)
	out.Steps = make([]Step, len(m.Steps))
	for i, s := range m.Steps {
		s.Title = sentenceCase(tidy(s.Title))
		s.Say = tidy(s.Say)
		s.Mode = strings.TrimSpace(s.Mode)
		s.Emoji = strings.TrimSpace(s.Emoji)
		if emojiProblem(s.Emoji) != "" {
			s.Emoji = FallbackEmoji
		}
		switch s.Mode {
		case UntilDone:
			s.Seconds = clamp(s.Seconds, MinUntilDone, MaxUntilDone)
		case ForDuration:
			s.Seconds = clamp(s.Seconds, MinForDuration, MaxForDuration)
		}
		out.Steps[i] = s
	}
	return out
}

func tidy(s string) string { return strings.Join(strings.Fields(s), " ") }

// sentenceCase turns "Polish The Top Deck" into "Polish the top deck". Only
// words written as Title Case are lowered, so "Captain", "I" and all-caps
// words stay as they are.
func sentenceCase(s string) string {
	words := strings.Split(s, " ")
	for i, w := range words {
		if keepCapital[strings.Trim(w, ",.!?")] {
			continue
		}
		parts := strings.Split(w, "-")
		for j, p := range parts {
			parts[j] = recase(p, i == 0 && j == 0)
		}
		words[i] = strings.Join(parts, "-")
	}
	return strings.Join(words, " ")
}

func recase(word string, first bool) string {
	r, size := utf8.DecodeRuneInString(word)
	if size == 0 {
		return word
	}
	rest := word[size:]
	switch {
	case first:
		return string(unicode.ToUpper(r)) + rest
	case unicode.IsUpper(r) && rest != "" && rest == strings.ToLower(rest):
		return string(unicode.ToLower(r)) + rest
	}
	return word
}

var keepCapital = map[string]bool{"Captain": true, "I": true, "I'm": true, "I'll": true}

func clamp(v, lo, hi int) int { return min(max(v, lo), hi) }

//go:embed sample.json
var sampleJSON []byte

// Sample returns the built-in mission, playable without the model.
func Sample() Mission {
	var m Mission
	if err := json.Unmarshal(sampleJSON, &m); err != nil {
		panic("mission: bad embedded sample: " + err.Error())
	}
	m.ID = SampleID
	m.CreatedAt, _ = time.Parse(time.RFC3339, sampleCreatedAt)
	return m
}
