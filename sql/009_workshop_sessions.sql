CREATE TABLE IF NOT EXISTS pcif_workshop_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workshop_no integer NOT NULL CHECK(workshop_no BETWEEN 1 AND 4),
  session_kind text NOT NULL DEFAULT 'INITIALISATION'
    CHECK(session_kind IN ('INITIALISATION','REEXAMEN')),
  status text NOT NULL DEFAULT 'A_PREPARER'
    CHECK(status IN ('A_PREPARER','EN_COURS','TERMINEE','A_REINTERROGER')),
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  next_review_date date,
  reason text NOT NULL DEFAULT '',
  participants text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  decisions text NOT NULL DEFAULT '',
  deliverable text NOT NULL DEFAULT '',
  exit_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcif_workshop_sessions_campaign
  ON pcif_workshop_sessions(campaign_id, workshop_no, session_date DESC, created_at DESC);
