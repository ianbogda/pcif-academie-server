CREATE TABLE IF NOT EXISTS personal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'NOTE' CHECK (kind IN ('NOTE','PENSE_BETE','A_VERIFIER','IDEE')),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false,
  source_type text,
  source_label text,
  source_campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  source_workshop_no integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_notes_user_updated_idx ON personal_notes(user_id, pinned DESC, updated_at DESC);
