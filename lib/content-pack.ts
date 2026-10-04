export const CONTENT_PACK_SCHEMA = 'autopostingtg.post-pack.v1'

export const CONTENT_MODES = ['normal', 'short', 'long', 'funny', 'wow', 'strict'] as const
export type ContentMode = (typeof CONTENT_MODES)[number]

export type ContentSource = {
  title: string
  url: string
  publishedAt?: string
  accessedAt?: string
  summary?: string
}

export type ContentPackItem = {
  id?: string
  topic: string
  mode: ContentMode
  text: string
  image?: { url?: string; prompt?: string; source?: string }
  scheduledAt?: string
}

export type ContentPack = {
  schemaVersion: typeof CONTENT_PACK_SCHEMA
  generatedAt: string
  sourceMode: 'agent' | 'free-model' | 'api' | 'manual'
  research: {
    topic: string
    asOf: string
    sources: ContentSource[]
  }
  posts: ContentPackItem[]
}

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function isDate(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value))
}

export function validateContentPack(input: unknown):
  | { ok: true; pack: ContentPack }
  | { ok: false; error: string; field?: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Пакет должен быть JSON-объектом.' }
  const value = input as Record<string, unknown>
  if (value.schemaVersion !== CONTENT_PACK_SCHEMA) return { ok: false, error: `schemaVersion должен быть ${CONTENT_PACK_SCHEMA}.`, field: 'schemaVersion' }

  const generatedAt = asString(value.generatedAt, 80)
  if (!isDate(generatedAt)) return { ok: false, error: 'generatedAt должен быть ISO-временем.', field: 'generatedAt' }
  if (Date.parse(generatedAt) > Date.now() + 5 * 60_000) return { ok: false, error: 'generatedAt не может быть в будущем.', field: 'generatedAt' }

  const sourceMode = asString(value.sourceMode, 20)
  if (!['agent', 'free-model', 'api', 'manual'].includes(sourceMode)) return { ok: false, error: 'Неверный sourceMode.', field: 'sourceMode' }

  if (!value.research || typeof value.research !== 'object') return { ok: false, error: 'Добавьте research с датой и источниками.', field: 'research' }
  const researchValue = value.research as Record<string, unknown>
  const researchTopic = asString(researchValue.topic, 160)
  const asOf = asString(researchValue.asOf, 80)
  const rawSources = Array.isArray(researchValue.sources) ? researchValue.sources : []
  if (!researchTopic) return { ok: false, error: 'research.topic обязателен.', field: 'research.topic' }
  if (!isDate(asOf) || Date.parse(asOf) > Date.now() + 5 * 60_000) return { ok: false, error: 'research.asOf должен быть актуальным ISO-временем.', field: 'research.asOf' }
  if (rawSources.length < 1 || rawSources.length > 8) return { ok: false, error: 'Нужен минимум один и максимум восемь источников.', field: 'research.sources' }

  const sources: ContentSource[] = []
  for (let index = 0; index < rawSources.length; index += 1) {
    const source = rawSources[index]
    if (!source || typeof source !== 'object') return { ok: false, error: `Источник ${index + 1} заполнен неверно.`, field: `research.sources[${index}]` }
    const sourceValue = source as Record<string, unknown>
    const title = asString(sourceValue.title, 180)
    const url = asString(sourceValue.url, 2000)
    if (!title || !isHttpsUrl(url)) return { ok: false, error: `Источник ${index + 1} должен иметь название и HTTPS-ссылку.`, field: `research.sources[${index}]` }
    const publishedAt = asString(sourceValue.publishedAt, 80)
    const accessedAt = asString(sourceValue.accessedAt, 80)
    if (publishedAt && !isDate(publishedAt)) return { ok: false, error: `Неверная дата publishedAt у источника ${index + 1}.` }
    if (accessedAt && !isDate(accessedAt)) return { ok: false, error: `Неверная дата accessedAt у источника ${index + 1}.` }
    sources.push({ title, url, ...(publishedAt ? { publishedAt } : {}), ...(accessedAt ? { accessedAt } : {}), summary: asString(sourceValue.summary, 500) || undefined })
  }

  const rawPosts = Array.isArray(value.posts) ? value.posts : []
  if (rawPosts.length < 1 || rawPosts.length > 5) return { ok: false, error: 'В одном пакете должно быть от 1 до 5 постов.', field: 'posts' }
  const posts: ContentPackItem[] = []
  for (let index = 0; index < rawPosts.length; index += 1) {
    const post = rawPosts[index]
    if (!post || typeof post !== 'object') return { ok: false, error: `Пост ${index + 1} заполнен неверно.`, field: `posts[${index}]` }
    const postValue = post as Record<string, unknown>
    const topic = asString(postValue.topic, 160)
    const mode = asString(postValue.mode, 20) as ContentMode
    const text = asString(postValue.text, 4000)
    if (!topic || !CONTENT_MODES.includes(mode) || text.length < 40) return { ok: false, error: `Пост ${index + 1}: нужны topic, допустимый mode и текст от 40 символов.`, field: `posts[${index}]` }
    let image: ContentPackItem['image']
    if (postValue.image && typeof postValue.image === 'object') {
      const imageValue = postValue.image as Record<string, unknown>
      const url = asString(imageValue.url, 4000)
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return { ok: false, error: `Пост ${index + 1}: image.url должен быть http(s).` }
      const prompt = asString(imageValue.prompt, 600)
      const source = asString(imageValue.source, 120)
      if (url || prompt || source) image = { ...(url ? { url } : {}), ...(prompt ? { prompt } : {}), ...(source ? { source } : {}) }
    }
    const scheduledAt = asString(postValue.scheduledAt, 80)
    if (scheduledAt && !isDate(scheduledAt)) return { ok: false, error: `Пост ${index + 1}: неверный scheduledAt.` }
    posts.push({ id: asString(postValue.id, 80) || undefined, topic, mode, text, image, scheduledAt: scheduledAt || undefined })
  }

  return { ok: true, pack: { schemaVersion: CONTENT_PACK_SCHEMA, generatedAt, sourceMode: sourceMode as ContentPack['sourceMode'], research: { topic: researchTopic, asOf, sources }, posts } }
}
