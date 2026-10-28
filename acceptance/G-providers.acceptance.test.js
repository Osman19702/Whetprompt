/**
 * Group G — Providers and privacy.
 * Scenarios: acceptance/features/G-providers.feature. Run: npm run test:acceptance
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'

import { startApp } from './support/app.js'
import { BLOG_PROMPT, FIX_RESPONSE } from './support/fixtures.js'
import { startStub } from './support/stub-provider.js'

let stub
let app
before(async () => {
  stub = await startStub()
  app = await startApp({ stub })
})
after(async () => {
  await app.stop()
  await stub.close()
})
beforeEach(() => stub.reset())

/** What /api/config says about one provider. */
const providerInfo = async (server, id) => (await server.get('/api/config')).body.providers.find((p) => p.id === id)

/**
 * A request whose Host header names `host`, which fetch will not send. A page
 * that points a name of its own at 127.0.0.1 is that page's own origin to the
 * browser, so CORS never comes into it; the Host it sends still names the page.
 */
const addressedTo = (host, method, route, body) =>
  new Promise((resolve, reject) => {
    const { hostname, port } = new URL(app.base)
    const data = body === undefined ? '' : JSON.stringify(body)
    const req = http.request(
      { hostname, port, method, path: route, headers: { host, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } },
      (res) => {
        let text = ''
        res.on('data', (d) => (text += d))
        res.on('end', () => resolve({ status: res.statusCode, text }))
      }
    )
    req.on('error', reject)
    req.end(data)
  })

test('G1 — The app offers only providers that can actually work', async () => {
  const config = (await app.get('/api/config')).body
  const byId = Object.fromEntries(config.providers.map((p) => [p.id, p]))
  assert.equal(byId.compatible.configured, true)
  for (const id of ['anthropic', 'openai', 'openrouter', 'google', 'local']) {
    assert.equal(byId[id].configured, false, `${id} has no key or model`)
  }
  assert.equal(config.defaultProvider, 'compatible')

  const bare = await startApp()
  try {
    assert.equal((await bare.get('/api/config')).body.defaultProvider, 'local')
  } finally {
    await bare.stop()
  }
})

test('G2 — Keys never reach the browser', async () => {
  // app.raw() fails any response that contains the canary key; walk every route.
  await app.get('/api/health')
  await app.get('/api/config')
  await app.get('/api/examples')
  await app.get('/api/models?provider=compatible')
  await app.get('/api/models?provider=anthropic')
  await app.analyze(BLOG_PROMPT)
  await app.fix(BLOG_PROMPT)
  const echoing = { status: 500, message: 'invalid key ' + 'canary-compatible-key-7f3a' }
  stub.queue(echoing)
  const failed = await app.fix(BLOG_PROMPT) // an upstream error that echoes the key…
  assert.match(failed.body.error, /\[redacted\]/, '…is shown with the key blanked out')
  // …and the same echo inside a failed corrective retry, which rides in a 200 reply.
  stub.queue({ json: { ...FIX_RESPONSE, fixedPrompt: 'Write a concise markdown table with three rows.' } }, echoing)
  const warned = await app.fix('I changed the strgnth but it still changes a lot', { strength: 'light' })
  assert.equal(warned.status, 200)
  assert.match(warned.body.meta.warning, /retry also failed/)
  await app.get('/api/library')
  await app.post('/api/library', { original: 'a', fixed: 'b' })
  await app.get('/api/library/export')
  await app.post('/api/library/import', { nope: true })
  await app.del('/api/library/all')
  await app.get('/api/local/status')
  await app.post('/api/local/select', { tier: 'nope' })
  await app.post('/api/local/cancel')
  await app.put('/api/keys/compatible', { key: 'sk-not-a-key-settings-keeps' })
  await app.post('/api/keys/compatible/test')
  await app.post('/api/keys/anthropic/test')
  await app.del('/api/keys/no-such-provider')
  await app.get('/api/does-not-exist')
})

test('G3 — A client cannot redirect a keyed provider', async () => {
  const { status } = await app.fix(BLOG_PROMPT, {}, { baseUrl: 'http://127.0.0.1:1/nothing-here' })
  assert.equal(status, 200, 'the request still reached the configured endpoint')
  assert.equal(stub.requests.length, 1)

  const bad = await app.get(`/api/models?provider=ollama&baseUrl=${encodeURIComponent('ftp://evil.example')}`)
  assert.equal(bad.status, 400, 'a key-less endpoint override must still be http(s)')
})

test('G4 — Model lists are live where possible and honest where not', async () => {
  stub.models({ models: ['stub-large', 'stub-small'] })
  const live = await app.get('/api/models?provider=compatible')
  assert.deepEqual(live.body, { models: ['stub-large', 'stub-small'], source: 'live' })

  stub.models({ status: 401, message: 'invalid api key' })
  const rejected = await app.get('/api/models?provider=compatible')
  assert.ok(rejected.status === 401 || rejected.status === 403, `rejected key surfaces as ${rejected.status}`)
  assert.ok(rejected.body.error, 'with a message')
  assert.equal(rejected.body.models, undefined, 'and no fallback list hiding it')

  const missing = await app.get('/api/models?provider=anthropic')
  assert.ok(missing.status >= 400)
  assert.match(missing.body.error, /key/i, 'a missing key is named, not guessed around')
})

test('G5 — The journey is the same on every provider', { todo: 'nightly: needs the local model' }, () => {})

test('G6 — The API is reachable only from this machine', async () => {
  const foreign = await app.raw('GET', '/api/health', { headers: { origin: 'http://evil.example' } })
  assert.equal(foreign.headers.get('access-control-allow-origin'), null, 'a foreign origin is not granted access')

  const local = await app.raw('GET', '/api/health', { headers: { origin: 'http://localhost:5173' } })
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5173')

  const lookalike = await app.raw('GET', '/api/health', { headers: { origin: 'http://localhost.evil.example' } })
  assert.equal(lookalike.headers.get('access-control-allow-origin'), null, 'a lookalike origin does not pass')

  const { port } = new URL(app.base)
  for (const host of [`evil.example:${port}`, `localhost.evil.example:${port}`]) {
    const set = await addressedTo(host, 'PUT', '/api/keys/anthropic', { key: 'sk-g6-from-a-page-elsewhere' })
    assert.equal(set.status, 403, `a key cannot be set from ${host}`)
    assert.equal((await addressedTo(host, 'POST', '/api/keys/anthropic/test')).status, 403, `nor tested from ${host}`)
    assert.equal((await addressedTo(host, 'DELETE', '/api/keys/anthropic')).status, 403, `nor removed from ${host}`)
  }
  assert.equal((await providerInfo(app, 'anthropic')).configured, false, 'and the key is left as it was')
  assert.equal(fs.existsSync(app.envFile), false, 'with nothing written')
})

test('G7 — A key added in Settings works at once and stays on this computer', async () => {
  const KEY = 'sk-ant-g7-added-in-settings-0123'
  assert.equal((await providerInfo(app, 'anthropic')).configured, false, 'a cloud provider with no key')

  const saved = await app.put('/api/keys/anthropic', { key: KEY })
  assert.equal(saved.status, 200)
  const config = await app.get('/api/config')
  for (const reply of [saved, config]) assert.ok(!reply.text.includes(KEY), 'no reply carries the key back')
  const ready = config.body.providers.find((p) => p.id === 'anthropic')
  assert.equal(ready.configured, true, 'ready at once, with no restart')
  assert.equal(ready.keySource, 'settings', "and the key is Settings' own")

  assert.match(fs.readFileSync(app.envFile, 'utf8'), new RegExp(`^ANTHROPIC_API_KEY=${KEY}$`, 'm'), "written to the app's own settings file")
  const again = await startApp({
    env: {
      WHETPROMPT_ENV_FILE: app.envFile,
      // Not blanked, as the harness otherwise does, so the file can supply it…
      ANTHROPIC_API_KEY: undefined,
      // …and no project .env read first, so the file is the only place it can come from.
      DOTENV_CONFIG_PATH: path.join(app.dataDir, 'no-project.env'),
    },
  })
  try {
    const found = await providerInfo(again, 'anthropic')
    assert.equal(found.configured, true, 'an app started again finds the key')
    assert.equal(found.keySource, 'settings')
  } finally {
    await again.stop()
  }

  const removed = await app.del('/api/keys/anthropic')
  assert.equal(removed.status, 200)
  const gone = await providerInfo(app, 'anthropic')
  assert.equal(gone.configured, false, 'the provider needs a key again')
  assert.equal(gone.keySource, null)
  assert.ok(!fs.readFileSync(app.envFile, 'utf8').includes(KEY), 'and the file holds it no longer')
})

test('G8 — Settings refuses what is not a key, and leaves a key set elsewhere alone', async () => {
  // Kept by hand: notes, a value with a # inside quotes, Windows line endings, no newline at the end.
  const MINE = ['# Notes I keep by hand', 'MY_OWN_SETTING="a value # with a hash"', 'OPENAI_API_KEY=', '# the end'].join('\r\n')
  fs.writeFileSync(app.envFile, MINE)

  const notKeys = {
    'a line break': 'sk-g8-first-line\nDEFAULT_PROVIDER=anthropic',
    'a space': 'sk-g8 with spaces in it',
    'a quote': 'sk-g8-"quoted"-0123',
    'too short to be a key': 'sk-g8',
  }
  for (const [what, key] of Object.entries(notKeys)) {
    const refused = await app.put('/api/keys/openai', { key })
    assert.equal(refused.status, 400, `a key with ${what} is refused`)
    assert.ok(refused.body.error, 'with a reason')
    assert.ok(!refused.text.includes('sk-g8'), `without being repeated back: ${refused.text}`)
    assert.equal(fs.readFileSync(app.envFile, 'utf8'), MINE, 'the file is unchanged to the byte')
  }
  assert.equal((await providerInfo(app, 'openai')).configured, false)

  const KEY = 'sk-g8-a-key-copied-with-its-name'
  assert.equal((await app.put('/api/keys/openai', { key: ` OPENAI_API_KEY=${KEY}\r\n` })).status, 200)
  assert.equal(
    fs.readFileSync(app.envFile, 'utf8'),
    MINE.replace('OPENAI_API_KEY=', `OPENAI_API_KEY=${KEY}`),
    'only the key is kept, and every other line is as it was'
  )
  assert.equal((await providerInfo(app, 'openai')).configured, true)
  assert.equal((await app.del('/api/keys/openai')).status, 200)
  assert.equal(fs.readFileSync(app.envFile, 'utf8'), MINE, 'removing it leaves the line as it stood before')

  const SYSTEM_KEY = 'sk-g8-set-in-the-system-environment'
  const managed = await startApp({ env: { GOOGLE_API_KEY: SYSTEM_KEY } })
  try {
    const google = await providerInfo(managed, 'google')
    assert.equal(google.configured, true)
    assert.equal(google.keySource, 'environment', 'Settings says it is set elsewhere')
    const replaced = await managed.put('/api/keys/google', { key: 'sk-g8-a-replacement-key' })
    const removed = await managed.del('/api/keys/google')
    assert.equal(replaced.status, 409, 'it will not replace it')
    assert.equal(removed.status, 409, 'nor remove it')
    for (const reply of [replaced, removed, await managed.get('/api/config')]) {
      assert.ok(!reply.text.includes(SYSTEM_KEY), 'and never repeats it')
    }
    assert.equal((await providerInfo(managed, 'google')).keySource, 'environment', 'the key in use is the same one')
    assert.equal(fs.existsSync(managed.envFile), false, 'and nothing was written')
  } finally {
    await managed.stop()
  }
})
