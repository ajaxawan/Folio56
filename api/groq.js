// Optional relay for Folio's voice memos. Folio calls Groq straight from the browser; only if
// that's blocked does it send the same request here, and this just passes it on.
// It never stores anything: the key arrives in the request header and goes straight to Groq.
export const config = { runtime: 'edge' }

const ALLOWED = /^\/(audio\/transcriptions|chat\/completions|models)$/

export default async function handler(req) {
  const path = new URL(req.url).searchParams.get('path') || ''
  if (!ALLOWED.test(path)) return new Response('Not allowed', { status: 400 })
  const auth = req.headers.get('authorization')
  if (!auth || !/^Bearer gsk_/.test(auth)) return new Response(JSON.stringify({ error: { message: 'Missing Groq key' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  const headers = { authorization: auth }
  const type = req.headers.get('content-type')
  if (type) headers['content-type'] = type
  const res = await fetch('https://api.groq.com/openai/v1' + path, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    duplex: 'half',
  })
  const out = new Headers({ 'content-type': res.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' })
  const wait = res.headers.get('retry-after'); if (wait) out.set('retry-after', wait)
  return new Response(res.body, { status: res.status, headers: out })
}
