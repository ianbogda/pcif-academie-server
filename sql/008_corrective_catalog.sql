ALTER TABLE questions ADD COLUMN IF NOT EXISTS gravity integer;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS occurrence integer;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS corrective_label text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS corrective_actions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS corrective_actors jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS corrective_deadlines jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS corrective_evaluations jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE questions
SET gravity = COALESCE(gravity, pcif_i),
    occurrence = COALESCE(occurrence, pcif_p)
WHERE gravity IS NULL OR occurrence IS NULL;

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_gravity_check;
ALTER TABLE questions ADD CONSTRAINT questions_gravity_check CHECK(gravity IS NULL OR gravity BETWEEN 1 AND 3);
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_occurrence_check;
ALTER TABLE questions ADD CONSTRAINT questions_occurrence_check CHECK(occurrence IS NULL OR occurrence BETWEEN 1 AND 3);
