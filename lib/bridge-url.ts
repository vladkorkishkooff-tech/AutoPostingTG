/**
 * Normalizes BOT_BRIDGE_URL to ensure it's a clean base URL without trailing
 * slashes, accidental quotes, or endpoints like /generate or /health.
 */
export function getBridgeUrl(): string {
  const raw = process.env.BOT_BRIDGE_URL || ''
  if (!raw) return ''
  let cleaned = raw.trim().replace(/^["']|["']$/g, '')
  // Strip trailing endpoints if accidentally copied
  cleaned = cleaned.replace(/\/(generate|health|\/?)\/?$/, '')
  return cleaned
}
