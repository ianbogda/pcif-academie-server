CREATE TABLE IF NOT EXISTS auditor_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK(scope_type IN ('ESTABLISHMENT','AGENCY','DEPARTMENT','ACADEMY')),
  establishment_id uuid REFERENCES establishments(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES accounting_agencies(id) ON DELETE CASCADE,
  department_code text,
  academy_code text,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  observations_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(valid_until IS NULL OR valid_until>=valid_from),
  CHECK(
    (scope_type='ESTABLISHMENT' AND establishment_id IS NOT NULL AND agency_id IS NULL AND department_code IS NULL AND academy_code IS NULL) OR
    (scope_type='AGENCY' AND agency_id IS NOT NULL AND establishment_id IS NULL AND department_code IS NULL AND academy_code IS NULL) OR
    (scope_type='DEPARTMENT' AND department_code IS NOT NULL AND establishment_id IS NULL AND agency_id IS NULL AND academy_code IS NULL) OR
    (scope_type='ACADEMY' AND academy_code IS NOT NULL AND establishment_id IS NULL AND agency_id IS NULL AND department_code IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_auditor_scopes_user_dates ON auditor_scopes(user_id,valid_from,valid_until);

CREATE TABLE IF NOT EXISTS audit_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_user_id uuid NOT NULL REFERENCES users(id),
  establishment_id uuid NOT NULL REFERENCES establishments(id),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),
  subject_type text NOT NULL DEFAULT 'CAMPAIGN' CHECK(subject_type IN ('CAMPAIGN','QUESTION','RISK','ACTION','PROCESS','OFN')),
  subject_id text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','CLOSED')),
  response text,
  responded_by uuid REFERENCES users(id),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_observations_campaign ON audit_observations(campaign_id,created_at DESC);
