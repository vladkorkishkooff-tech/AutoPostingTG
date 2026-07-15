-- Publication integrity and verified Telegram channels.
-- Additive migration: preserves valid historical rows and quarantines invalid
-- positive/private chat identifiers before the target constraint is installed.

CREATE TABLE IF NOT EXISTS channel_target_quarantine (
    id BIGSERIAL PRIMARY KEY,
    original_channel_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    chat_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (original_channel_id)
);

INSERT INTO channel_target_quarantine (original_channel_id, user_id, chat_id, reason, snapshot)
SELECT id, user_id, chat_id, 'invalid_publication_target', to_jsonb(channels)
FROM channels
WHERE NOT (
    chat_id ~ '^@[A-Za-z0-9_]{5,32}$'
    OR chat_id ~ '^-100[0-9]{6,}$'
)
ON CONFLICT (original_channel_id) DO NOTHING;

ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
    ADD COLUMN IF NOT EXISTS telegram_title TEXT,
    ADD COLUMN IF NOT EXISTS telegram_username TEXT,
    ADD COLUMN IF NOT EXISTS bot_can_post BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verification_error TEXT,
    ADD COLUMN IF NOT EXISTS footer_title TEXT,
    ADD COLUMN IF NOT EXISTS footer_url TEXT;

-- Invalid legacy rows remain available for audit/history but can never publish.
UPDATE channels
SET is_active = false,
    is_verified = false,
    bot_can_post = false,
    verification_error = 'invalid_publication_target',
    updated_at = now()
WHERE NOT (
    chat_id ~ '^@[A-Za-z0-9_]{5,32}$'
    OR chat_id ~ '^-100[0-9]{6,}$'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'channels_valid_publication_target'
    ) THEN
        ALTER TABLE channels
            ADD CONSTRAINT channels_valid_publication_target
            CHECK (
                chat_id ~ '^@[A-Za-z0-9_]{5,32}$'
                OR chat_id ~ '^-100[0-9]{6,}$'
            ) NOT VALID;
    END IF;
END $$;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts
    ADD CONSTRAINT posts_status_check
    CHECK (status IN ('queued', 'approved', 'rejected', 'publishing', 'published', 'failed'));

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS publication_attempt_id UUID,
    ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
    ADD COLUMN IF NOT EXISTS target_channel_title TEXT,
    ADD COLUMN IF NOT EXISTS telegram_message_link TEXT,
    ADD COLUMN IF NOT EXISTS error_code TEXT,
    ADD COLUMN IF NOT EXISTS publishing_started_at TIMESTAMPTZ;

ALTER TABLE slot_runs DROP CONSTRAINT IF EXISTS slot_runs_status_check;
ALTER TABLE slot_runs
    ADD CONSTRAINT slot_runs_status_check
    CHECK (status IN ('claimed', 'done', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_channels_verified_active
    ON channels(is_verified, is_active, verified_at);
CREATE INDEX IF NOT EXISTS idx_posts_publication_attempt
    ON posts(publication_attempt_id) WHERE publication_attempt_id IS NOT NULL;
