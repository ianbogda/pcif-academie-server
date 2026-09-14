ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS is_key boolean NOT NULL DEFAULT false;
