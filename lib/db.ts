import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

type NeonSql = NeonQueryFunction<false, false>

let client: NeonSql | null = null

function getSql(): NeonSql {
  if (client) return client
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  client = neon(databaseUrl)
  return client
}

// A callable proxy preserves Neon's generic tagged-template types while
// creating the real client only on the first runtime use.
export const sql = new Proxy((() => undefined) as unknown as NeonSql, {
  apply(_target, thisArg, args) {
    return Reflect.apply(getSql(), thisArg, args)
  },
  get(_target, property, receiver) {
    return Reflect.get(getSql(), property, receiver)
  },
})
