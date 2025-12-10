-- Schema bootstrap for OPSLAB соціометрія
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
