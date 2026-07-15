-- Disable legacy work that points at a personal ID, an unverified channel, or
-- a channel where the bot cannot currently publish. Historical rows remain
-- available for audit, but no Queue/Scheduler action may execute them.

UPDATE schedules s
SET is_active = false,
    updated_at = now()
FROM channels c
WHERE s.channel_id = c.id
  AND (
    NOT c.is_active
    OR NOT c.is_verified
    OR NOT c.bot_can_post
    OR NOT (
      c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$'
      OR c.chat_id ~ '^-100[0-9]{6,}$'
    )
  );

UPDATE posts p
SET status = 'failed',
    error = COALESCE(p.error, 'Publication target is not a verified channel'),
    error_code = COALESCE(p.error_code, 'channel_not_verified'),
    publishing_started_at = NULL
FROM channels c
WHERE p.channel_id = c.id
  AND p.status IN ('queued', 'approved', 'publishing')
  AND (
    NOT c.is_active
    OR NOT c.is_verified
    OR NOT c.bot_can_post
    OR NOT (
      c.chat_id ~ '^@[A-Za-z0-9_]{5,32}$'
      OR c.chat_id ~ '^-100[0-9]{6,}$'
    )
  );
