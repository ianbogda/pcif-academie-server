CREATE TABLE IF NOT EXISTS accessibility_audits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, application_version text NOT NULL,
 rgaa_version text NOT NULL DEFAULT '4.1.2', status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','CLOSED')),
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS accessibility_results (
 audit_id uuid NOT NULL REFERENCES accessibility_audits(id) ON DELETE CASCADE, criterion_code text NOT NULL,
 status text CHECK(status IN('C','NC','NA')), error_title text, error_description text, recommendation text,
 impact text CHECK(impact IN('BLOCKING','MAJOR','MINOR')), easy_fix boolean NOT NULL DEFAULT false,
 na_justification text, evidence text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(audit_id,criterion_code)
);
CREATE TABLE IF NOT EXISTS accessibility_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), audit_id uuid NOT NULL REFERENCES accessibility_audits(id), slug text UNIQUE NOT NULL,
 snapshot jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(), unpublished_at timestamptz, is_current boolean NOT NULL DEFAULT true,
 published_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS accessibility_reports_current_idx ON accessibility_reports(is_current) WHERE is_current=true AND unpublished_at IS NULL;
