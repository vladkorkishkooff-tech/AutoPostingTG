ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_meta JSONB;

CREATE INDEX IF NOT EXISTS idx_posts_source_meta ON posts USING GIN (source_meta);
