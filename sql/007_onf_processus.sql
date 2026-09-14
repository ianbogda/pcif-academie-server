CREATE TABLE IF NOT EXISTS pcif_ofn_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  function_code text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcif_ofn_actors_campaign ON pcif_ofn_actors(campaign_id);

CREATE TABLE IF NOT EXISTS pcif_ofn_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  actor_id uuid NOT NULL REFERENCES pcif_ofn_actors(id) ON DELETE CASCADE,
  direct_action boolean NOT NULL DEFAULT false,
  delegation boolean NOT NULL DEFAULT false,
  substitution boolean NOT NULL DEFAULT false,
  ring text CHECK(ring IN ('majorFormal','majorNoFormal','absenceFix','absenceJustified','supervision')),
  note text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,operation_id,actor_id)
);

CREATE INDEX IF NOT EXISTS idx_pcif_ofn_assign_campaign ON pcif_ofn_assignments(campaign_id);

CREATE TABLE IF NOT EXISTS pcif_process_reviews (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  process_id text NOT NULL,
  priority boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'A_EXAMINER'
    CHECK(status IN ('A_EXAMINER','EN_COURS','SECURISE')),
  note text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id,process_id)
);
