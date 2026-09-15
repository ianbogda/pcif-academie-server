INSERT INTO roles(code,label) VALUES
 ('DEPARTMENT_ADMIN','Administrateur départemental'),
 ('ACADEMY_ADMIN','Administrateur académique')
ON CONFLICT(code) DO UPDATE SET label=excluded.label;

CREATE TABLE IF NOT EXISTS audit_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES users(id),
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  observations_allowed boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED','OPEN','CLOSED','REVOKED')),
  purpose text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(valid_until>=valid_from),
  UNIQUE(auditor_user_id,campaign_id,valid_from,valid_until)
);
CREATE INDEX IF NOT EXISTS idx_audit_missions_access ON audit_missions(auditor_user_id,campaign_id,status,valid_from,valid_until);
