
ALTER TABLE pcif_ofn_actors ADD COLUMN IF NOT EXISTS sphere text NOT NULL DEFAULT 'MIXTE'
  CHECK(sphere IN ('ORDONNATEUR','COMPTABLE','MIXTE'));
ALTER TABLE pcif_ofn_actors ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT '';
ALTER TABLE pcif_ofn_actors ADD COLUMN IF NOT EXISTS source_user_id uuid REFERENCES users(id);
ALTER TABLE pcif_ofn_actors ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL'
  CHECK(source IN ('MANUAL','PCIF_USER'));

ALTER TABLE pcif_ofn_assignments ADD COLUMN IF NOT EXISTS validates boolean NOT NULL DEFAULT false;
ALTER TABLE pcif_ofn_assignments ADD COLUMN IF NOT EXISTS controls boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pcif_ofn_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 version_no integer NOT NULL,
 label text NOT NULL,
 snapshot jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,version_no)
);

CREATE TABLE IF NOT EXISTS pcif_ofn_findings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 code text NOT NULL,
 severity text NOT NULL CHECK(severity IN ('INFO','VIGILANCE','MAJEUR')),
 label text NOT NULL,
 operation_id text,
 actor_id uuid REFERENCES pcif_ofn_actors(id) ON DELETE SET NULL,
 question_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'OUVERT' CHECK(status IN ('OUVERT','ACCEPTE','TRAITE')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcif_ofn_versions_campaign ON pcif_ofn_versions(campaign_id,version_no DESC);
CREATE INDEX IF NOT EXISTS idx_pcif_ofn_findings_campaign ON pcif_ofn_findings(campaign_id,status);
