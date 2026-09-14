CREATE TABLE IF NOT EXISTS pcif_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sphere text NOT NULL CHECK(sphere IN ('ORDONNATEUR','COMPTABLE','SYNTHESE')),
  action_text text NOT NULL,
  priority text NOT NULL DEFAULT 'P3' CHECK(priority IN ('P1','P2','P3','P4')),
  period text,
  actor text,
  status text NOT NULL DEFAULT 'A_LANCER'
    CHECK(status IN ('A_LANCER','PREPARATION','EN_COURS','REALISEE')),
  target_date date,
  note text NOT NULL DEFAULT '',
  selected boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcif_actions_campaign ON pcif_actions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pcif_actions_question ON pcif_actions(question_id);

CREATE TABLE IF NOT EXISTS pcif_workshops (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workshop_no integer NOT NULL CHECK(workshop_no BETWEEN 1 AND 4),
  completed boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id, workshop_no)
);
