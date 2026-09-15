CREATE TABLE IF NOT EXISTS education_directory (
  uai varchar(8) PRIMARY KEY,
  name text NOT NULL,
  establishment_type text,
  nature_label text,
  public_private text,
  address text,
  postal_code text,
  city text,
  email text,
  department_code text,
  department_name text,
  academy_code text,
  academy_name text,
  siret text,
  source_updated_at date,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS department_code text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS department_name text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS academy_code text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS academy_name text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS directory_synced_at timestamptz;
