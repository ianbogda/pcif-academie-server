ALTER TABLE accounting_agencies ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_agencies_active ON accounting_agencies(active);
