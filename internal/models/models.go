package models

import (
	"time"
)

// Participant represents a person allowed to log in.
type Participant struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	IsAdmin bool   `json:"isAdmin"`
}

// Question describes a survey prompt.
type Question struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Type        string `json:"type"` // text, scale, choice
	Scope       string `json:"scope"`// common or peer
	ScaleMax    int    `json:"scaleMax,omitempty"`
	Choice      []string `json:"choice,omitempty"`
	PeerCode    string `json:"peerCode,omitempty"` // populated when question targets a specific colleague
}

// AnswerPayload carries responses coming from the UI.
type AnswerPayload struct {
	QuestionID string      `json:"questionId"`
	Value      interface{} `json:"value"`
}

// RankingPayload collects drag-and-drop rankings per criterion.
type RankingPayload struct {
	Criteria     string         `json:"criteria"`
	Order        []string       `json:"order"`        // My ranking of colleagues (drag & drop result)
	SelfRank     int            `json:"selfRank"`     // DEPRECATED: Where I would place myself
	PeerRankings map[string]int `json:"peerRankings"` // Where each colleague would place me: {"1122": 3, "1425": 1, ...}
	Comment      string         `json:"comment,omitempty"`
}

// ResponseRecord represents a stored submission.
type ResponseRecord struct {
	ID              int64                  `json:"id"`
	ParticipantCode string                 `json:"participantCode"`
	Answers         []AnswerPayload        `json:"answers"`
	Rankings        []RankingPayload       `json:"rankings"`
	SubmittedAt     time.Time              `json:"submittedAt"`
	UpdatedAt       time.Time              `json:"updatedAt"`
	IsTestData      bool                   `json:"isTestData"`
}
