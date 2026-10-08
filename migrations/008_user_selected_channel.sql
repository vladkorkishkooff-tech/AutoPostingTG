-- Migration 008: Add selected_channel_id to users for Telegram bot active channel tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_channel_id BIGINT REFERENCES channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_selected_channel_id ON users(selected_channel_id);
