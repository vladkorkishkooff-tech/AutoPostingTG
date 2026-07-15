-- Persistent, per-channel writing style used by the Mini App and generation pipeline.
ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS style_profile JSONB;

CREATE INDEX IF NOT EXISTS idx_channels_user_style_profile
    ON channels(user_id)
    WHERE style_profile IS NOT NULL;
