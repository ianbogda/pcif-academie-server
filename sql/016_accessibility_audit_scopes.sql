ALTER TABLE accessibility_audits ADD COLUMN IF NOT EXISTS audit_scope text NOT NULL DEFAULT 'FULL_106';
DO $$ BEGIN ALTER TABLE accessibility_audits ADD CONSTRAINT accessibility_audits_scope_check CHECK(audit_scope IN('ESSENTIAL_25','INTERMEDIATE_50','FULL_106')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS accessibility_audits_draft_scope_idx ON accessibility_audits(application_version,audit_scope,status);
