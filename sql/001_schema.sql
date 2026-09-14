CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uai varchar(8) UNIQUE,
  name text NOT NULL,
  kind text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  support_establishment_id uuid REFERENCES establishments(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agency_establishments (
  agency_id uuid NOT NULL REFERENCES accounting_agencies(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  PRIMARY KEY (agency_id, establishment_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS user_establishment_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  valid_from date,
  valid_until date,
  PRIMARY KEY(user_id, establishment_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_agency_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES accounting_agencies(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  PRIMARY KEY(user_id, agency_id, role_id)
);

CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS repository_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  version text NOT NULL,
  published_at date,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(repository_id, version)
);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_version_id uuid NOT NULL REFERENCES repository_versions(id) ON DELETE CASCADE,
  code text NOT NULL,
  domain text NOT NULL,
  label text NOT NULL,
  responsibility text NOT NULL CHECK (responsibility IN ('ORDONNATEUR','COMPTABLE','MIXTE')),
  weight integer NOT NULL DEFAULT 1,
  stars integer NOT NULL DEFAULT 0 CHECK(stars BETWEEN 0 AND 3),
  badge integer NOT NULL DEFAULT 0 CHECK(badge BETWEEN 0 AND 5),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(repository_version_id, code)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id),
  repository_version_id uuid NOT NULL REFERENCES repository_versions(id),
  label text NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','OPEN','REVIEW','VALIDATED','ARCHIVED')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  sphere text NOT NULL CHECK(sphere IN ('ORDONNATEUR','COMPTABLE','SYNTHESE')),
  value integer CHECK(value BETWEEN 0 AND 3),
  comment text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, question_id, sphere)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id),
  establishment_id uuid REFERENCES establishments(id),
  module text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  operation text NOT NULL,
  before_data jsonb,
  after_data jsonb
);

CREATE INDEX IF NOT EXISTS idx_campaigns_establishment ON campaigns(establishment_id);
CREATE INDEX IF NOT EXISTS idx_answers_campaign ON answers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_audit_establishment_date ON audit_events(establishment_id, occurred_at DESC);

-- Préparation RLS : le contexte utilisateur pourra être injecté par transaction via
-- SET LOCAL app.user_id = 'uuid'. Les routes v0.1 contrôlent déjà les accès côté API.
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_visible ON campaigns;
CREATE POLICY campaigns_visible ON campaigns
USING (
  EXISTS (
    SELECT 1 FROM user_establishment_roles uer
    WHERE uer.user_id = NULLIF(current_setting('app.user_id', true),'')::uuid
      AND uer.establishment_id = campaigns.establishment_id
  )
  OR EXISTS (
    SELECT 1
      FROM agency_establishments ae
      JOIN user_agency_roles uar ON uar.agency_id=ae.agency_id
     WHERE uar.user_id = NULLIF(current_setting('app.user_id', true),'')::uuid
       AND ae.establishment_id = campaigns.establishment_id
       AND ae.active=true
  )
);

DROP POLICY IF EXISTS answers_visible ON answers;
CREATE POLICY answers_visible ON answers
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id=answers.campaign_id
  )
);

-- IMPORTANT :
-- le propriétaire des tables contourne normalement RLS. Pour la production, utiliser
-- un rôle propriétaire/migration distinct du rôle runtime, puis FORCE ROW LEVEL SECURITY
-- après validation des politiques.
