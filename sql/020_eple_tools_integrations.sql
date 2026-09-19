CREATE TABLE IF NOT EXISTS integration_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, label text NOT NULL,
  key_hash text NOT NULL, scopes text[] NOT NULL DEFAULT '{}',
  allowed_uais text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  last_used_at timestamptz
);
CREATE TABLE IF NOT EXISTS external_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  provider text NOT NULL, external_id text NOT NULL, domain text NOT NULL,
  process_code text, signal_type text NOT NULL CHECK(signal_type IN ('INFO','WARNING','ALERT')),
  severity smallint NOT NULL CHECK(severity BETWEEN 1 AND 3),
  title text NOT NULL, description text, observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','ACKNOWLEDGED','LINKED','CLOSED')),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(establishment_id,provider,external_id)
);
CREATE INDEX IF NOT EXISTS idx_external_signals_establishment ON external_signals(establishment_id,status,observed_at DESC);
CREATE TABLE IF NOT EXISTS signal_question_links (
  signal_id uuid NOT NULL REFERENCES external_signals(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY(signal_id,question_id)
);
CREATE TABLE IF NOT EXISTS signal_action_links (
  signal_id uuid NOT NULL REFERENCES external_signals(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES pcif_actions(id) ON DELETE CASCADE,
  PRIMARY KEY(signal_id,action_id)
);
CREATE TABLE IF NOT EXISTS integration_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL,
  direction text NOT NULL CHECK(direction IN ('IN','OUT')),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING',
  imported integer NOT NULL DEFAULT 0, updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0, errors integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
