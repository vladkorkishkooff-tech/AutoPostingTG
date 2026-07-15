-- Per-owner API throttling and missing lookup indexes used by the Mini App.
CREATE TABLE IF NOT EXISTS api_rate_limits (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bucket TEXT NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count > 0),
    PRIMARY KEY (user_id, bucket, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_active_priority
    ON api_keys(user_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_generation_history_user_created
    ON generation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_templates_user_created
    ON post_templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window
    ON api_rate_limits(window_started_at);
