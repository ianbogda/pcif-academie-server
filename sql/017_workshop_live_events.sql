CREATE TABLE IF NOT EXISTS pcif_workshop_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_no integer NOT NULL CHECK(workshop_no BETWEEN 1 AND 4),
  scheduled_at timestamptz,
  facilitator_user_id uuid NOT NULL REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','RUNNING','PAUSED','FINISHED','CANCELLED')),
  elapsed_seconds integer NOT NULL DEFAULT 0 CHECK(elapsed_seconds BETWEEN 0 AND 3600),
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pcif_workshop_event_campaigns (
  event_id uuid NOT NULL REFERENCES pcif_workshop_events(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  PRIMARY KEY(event_id,campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_pcif_workshop_event_campaigns_campaign ON pcif_workshop_event_campaigns(campaign_id,event_id);
CREATE INDEX IF NOT EXISTS idx_pcif_workshop_events_status ON pcif_workshop_events(workshop_no,status,scheduled_at);
