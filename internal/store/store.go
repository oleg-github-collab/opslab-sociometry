package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"opslab-survey/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps database access.
type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, url string) (*Store, error) {
	if url == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect db: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

// EnsureSchema sets up tables and seeds known participants.
func (s *Store) EnsureSchema(ctx context.Context, participants []models.Participant) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
CREATE TABLE IF NOT EXISTS participants (
	code text primary key,
	name text not null,
	email text not null unique,
	is_admin boolean default false
);

CREATE TABLE IF NOT EXISTS responses (
	id bigserial primary key,
	participant_code text not null references participants(code) on delete cascade,
	answers jsonb not null,
	rankings jsonb not null,
	is_test_data boolean default false,
	submitted_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS responses_participant_code_idx ON responses(participant_code);
`)
	if err != nil {
		return fmt.Errorf("create tables: %w", err)
	}

	for _, p := range participants {
		_, err = tx.Exec(ctx, `
INSERT INTO participants (code, name, email, is_admin)
VALUES ($1,$2,$3,$4)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, is_admin=EXCLUDED.is_admin;
`, p.Code, p.Name, p.Email, p.IsAdmin)
		if err != nil {
			return fmt.Errorf("seed participant %s: %w", p.Code, err)
		}
	}

	return tx.Commit(ctx)
}

// ParticipantByEmailAndCode finds a participant.
func (s *Store) ParticipantByEmailAndCode(ctx context.Context, email, code string) (*models.Participant, error) {
	var p models.Participant
	err := s.pool.QueryRow(ctx, `SELECT code, name, email, is_admin FROM participants WHERE email=$1 AND code=$2`, email, code).
		Scan(&p.Code, &p.Name, &p.Email, &p.IsAdmin)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) ListParticipants(ctx context.Context) ([]models.Participant, error) {
	rows, err := s.pool.Query(ctx, `SELECT code, name, email, is_admin FROM participants ORDER BY name asc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var res []models.Participant
	for rows.Next() {
		var p models.Participant
		if err := rows.Scan(&p.Code, &p.Name, &p.Email, &p.IsAdmin); err != nil {
			return nil, err
		}
		res = append(res, p)
	}
	return res, rows.Err()
}

// UpsertResponse stores submission; overwrites if same participant resubmits.
func (s *Store) UpsertResponse(ctx context.Context, participantCode string, answers []models.AnswerPayload, rankings []models.RankingPayload, isTest bool) error {
	answersJSON, err := json.Marshal(answers)
	if err != nil {
		return fmt.Errorf("marshal answers: %w", err)
	}
	rankingsJSON, err := json.Marshal(rankings)
	if err != nil {
		return fmt.Errorf("marshal rankings: %w", err)
	}
	_, err = s.pool.Exec(ctx, `
INSERT INTO responses (participant_code, answers, rankings, is_test_data, submitted_at, updated_at)
VALUES ($1,$2,$3,$4, now(), now())
ON CONFLICT (participant_code)
DO UPDATE SET answers=EXCLUDED.answers, rankings=EXCLUDED.rankings, is_test_data=EXCLUDED.is_test_data, updated_at=now();`,
		participantCode, answersJSON, rankingsJSON, isTest)
	return err
}

func (s *Store) AllResponses(ctx context.Context) ([]models.ResponseRecord, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, participant_code, answers, rankings, is_test_data, submitted_at, updated_at FROM responses ORDER BY submitted_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var res []models.ResponseRecord
	for rows.Next() {
		var r models.ResponseRecord
		var answersJSON, rankingsJSON []byte
		if err := rows.Scan(&r.ID, &r.ParticipantCode, &answersJSON, &rankingsJSON, &r.IsTestData, &r.SubmittedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(answersJSON, &r.Answers); err != nil {
			return nil, fmt.Errorf("unmarshal answers: %w", err)
		}
		if err := json.Unmarshal(rankingsJSON, &r.Rankings); err != nil {
			return nil, fmt.Errorf("unmarshal rankings: %w", err)
		}
		res = append(res, r)
	}
	return res, rows.Err()
}

func (s *Store) ResetResponses(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `TRUNCATE TABLE responses`)
	return err
}

// MarkNow updates updated_at timestamp (useful when we want to bump without changing payload).
func (s *Store) Touch(ctx context.Context, participantCode string) error {
	_, err := s.pool.Exec(ctx, `UPDATE responses SET updated_at=$1 WHERE participant_code=$2`, time.Now(), participantCode)
	return err
}
