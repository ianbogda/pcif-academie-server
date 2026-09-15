INSERT INTO roles(code,label) VALUES
 ('AGENCY_ACCOUNTANT','Agent comptable'),
 ('AGENCY_DEPUTY','Fondé de pouvoir'),
 ('HEAD','Chef d''établissement'),
 ('SECRETARY_GENERAL','Secrétaire général'),
 ('CONTRIBUTOR','Contributeur'),
 ('READER','Lecteur'),
 ('AUDITOR','Auditeur')
ON CONFLICT(code) DO UPDATE SET label=excluded.label;

CREATE TABLE IF NOT EXISTS password_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK(purpose IN ('ACTIVATION','RESET')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_tokens_user_idx ON password_tokens(user_id,created_at DESC);
