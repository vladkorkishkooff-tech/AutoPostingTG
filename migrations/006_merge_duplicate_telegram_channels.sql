-- One Telegram channel can be addressed both by @username and by its stable
-- -100... chat ID. Merge legacy duplicates before enforcing stable identity.

CREATE TEMP TABLE channel_merge_map ON COMMIT DROP AS
WITH ranked AS (
    SELECT id AS duplicate_id,
           first_value(id) OVER (
               PARTITION BY user_id, telegram_chat_id
               ORDER BY (chat_id ~ '^@') DESC, is_verified DESC, bot_can_post DESC, id
           ) AS canonical_id
    FROM channels
    WHERE telegram_chat_id IS NOT NULL
)
SELECT duplicate_id, canonical_id
FROM ranked
WHERE duplicate_id <> canonical_id;

WITH merged AS (
    SELECT m.canonical_id,
           bool_or(d.is_active) AS any_active,
           bool_or(d.is_verified) AS any_verified,
           bool_or(d.bot_can_post) AS any_can_post,
           (array_agg(d.title ORDER BY d.id) FILTER (WHERE d.title IS NOT NULL))[1] AS title,
           max(d.telegram_title) AS telegram_title,
           max(d.telegram_username) AS telegram_username,
           max(d.verified_at) AS verified_at,
           max(d.footer_title) AS footer_title,
           max(d.footer_url) AS footer_url,
           (array_agg(d.style_profile ORDER BY d.id)
               FILTER (WHERE d.style_profile IS NOT NULL))[1] AS style_profile
    FROM channel_merge_map m
    JOIN channels d ON d.id = m.duplicate_id
    GROUP BY m.canonical_id
)
UPDATE channels c
SET is_active = c.is_active OR merged.any_active,
    is_verified = c.is_verified OR merged.any_verified,
    bot_can_post = c.bot_can_post OR merged.any_can_post,
    title = COALESCE(c.title, merged.title),
    telegram_title = COALESCE(c.telegram_title, merged.telegram_title),
    telegram_username = COALESCE(c.telegram_username, merged.telegram_username),
    verified_at = GREATEST(c.verified_at, merged.verified_at),
    footer_title = COALESCE(c.footer_title, merged.footer_title),
    footer_url = COALESCE(c.footer_url, merged.footer_url),
    style_profile = COALESCE(c.style_profile, merged.style_profile),
    verification_error = CASE
        WHEN c.is_verified OR merged.any_verified THEN NULL
        ELSE c.verification_error
    END,
    updated_at = now()
FROM merged
WHERE c.id = merged.canonical_id;

INSERT INTO topic_pool (channel_id, topic, is_active, last_used_at, created_at)
SELECT m.canonical_id, t.topic, t.is_active, t.last_used_at, t.created_at
FROM topic_pool t
JOIN channel_merge_map m ON m.duplicate_id = t.channel_id
ON CONFLICT (channel_id, topic) DO UPDATE
SET is_active = topic_pool.is_active OR EXCLUDED.is_active,
    last_used_at = GREATEST(topic_pool.last_used_at, EXCLUDED.last_used_at);

DELETE FROM topic_pool t
USING channel_merge_map m
WHERE t.channel_id = m.duplicate_id;

-- If both aliases contained the same active minute, retain the duplicate row
-- for audit but disable it before reassignment so the merged channel cannot
-- publish twice at that minute.
UPDATE schedules duplicate
SET is_active = false, updated_at = now()
FROM channel_merge_map m
WHERE duplicate.channel_id = m.duplicate_id
  AND duplicate.is_active
  AND EXISTS (
      SELECT 1 FROM schedules canonical
      WHERE canonical.channel_id = m.canonical_id
        AND canonical.is_active
        AND canonical.post_time = duplicate.post_time
        AND canonical.timezone = duplicate.timezone
  );

UPDATE schedules s SET channel_id = m.canonical_id
FROM channel_merge_map m WHERE s.channel_id = m.duplicate_id;

UPDATE posts p SET channel_id = m.canonical_id
FROM channel_merge_map m WHERE p.channel_id = m.duplicate_id;

UPDATE usage_events u SET channel_id = m.canonical_id
FROM channel_merge_map m WHERE u.channel_id = m.duplicate_id;

UPDATE channel_metrics cm SET channel_id = m.canonical_id
FROM channel_merge_map m WHERE cm.channel_id = m.duplicate_id;

DELETE FROM channels c
USING channel_merge_map m
WHERE c.id = m.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_user_telegram_identity
    ON channels(user_id, telegram_chat_id)
    WHERE telegram_chat_id IS NOT NULL;
