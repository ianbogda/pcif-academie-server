ALTER TABLE questions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS risk_label text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS badge text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS pcif_p integer;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS pcif_i integer;
CREATE INDEX IF NOT EXISTS idx_questions_domain ON questions(domain);
CREATE INDEX IF NOT EXISTS idx_questions_responsibility ON questions(responsibility);
