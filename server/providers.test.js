/**
 * Provider adapter contract: base-URL policy, deadlines, cancellation,
 * truncation and the live-vs-fallback model list. Everything talks to local
 * http stubs on OS-assigned ports; no network, no native module.
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

// An empty model dir so the local provider reports "not downloaded" whatever
// this machine has under ~/.whetprompt.
const modelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whetprompt-providers-models-'))
process.env.WHETPROMPT_MODEL_DIR = modelDir
process.env.WHETPROMPT_MODEL = 'default'
process.env.OPENAI_API_KEY = 'sk-test-must-not-leak'
process.env.COMPATIBLE_API_KEY = ''
// A real key from the developer's shell would send a test to the real service.
for (const name of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY']) delete process.env[name]

/** A stub whose behaviour is chosen per request by the `mode` the test sets. */
function startStub() {
  const stub = {
    server: null,
    port: 0,
    url: '',
    mode: 'ok',
    requests: [],
    sockets: new Set(),
  }
  stub.server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      stub.requests.push({ url: req.url, headers: req.headers, body })
      if (stub.mode === 'stall') {
        // Headers plus half a body, then silence: the case the deadline missed.
        res.writeHead(200, { 'content-type': 'application/json' })
        res.write('{"choices":[{"message":{"content":"')
        return
      }
      if (stub.mode === 'unauthorized') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }))
        return
      }
      if (stub.mode === 'outage') {
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'overloaded' } }))
        return
      }
      if (stub.mode === 'invalid') {
        // How Google answers a key it does not know: 400, not 401.
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }))
        return
      }
      if (stub.mode === 'echo') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: `invalid key ${req.headers.authorization}` } }))
        return
      }
      if (stub.mode === 'anthropic' || stub.mode === 'anthropic-refusal') {
        const sent = JSON.parse(body || '{}')
        // As Claude Opus 5.5 answers a temperature; a model named for it here does the same.
        if (sent.model === 'claude-takes-no-temperature' && 'temperature' in sent) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: '`temperature` is deprecated for this model.' } }))
          return
        }
        const refused = stub.mode === 'anthropic-refusal'
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            model: sent.model,
            // Thinking first, with its text left out as the API leaves it by default, then the answer.
            content: refused ? [] : [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"fixedPrompt":"ok"}' }],
            stop_reason: refused ? 'refusal' : 'end_turn',
            stop_details: refused ? { type: 'refusal', category: 'cyber', explanation: 'declined' } : null,
            usage: { input_tokens: 10, output_tokens: 5 },
          })
        )
        return
      }
      if (req.url === '/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'stub-a' }, { id: 'stub-b' }] }))
        return
      }
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: [{ name: 'llama-stub' }] }))
        return
      }
      const truncated = stub.mode === 'truncate'
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          model: 'stub-model',
          choices: [
            {
              finish_reason: truncated ? 'length' : 'stop',
              message: { content: truncated ? '{"fixedPrompt":"Write a long bl' : '{"fixedPrompt":"ok"}' },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        })
      )
    })
  })
  stub.server.on('connection', (socket) => {
    stub.sockets.add(socket)
    socket.on('close', () => stub.sockets.delete(socket))
  })
  return new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => {
      stub.port = stub.server.address().port
      stub.url = `http://127.0.0.1:${stub.port}`
      resolve(stub)
    })
  })
}

const stopStub = (stub) =>
  new Promise((resolve) => {
    for (const s of stub.sockets) s.destroy()
    stub.server.close(() => resolve())
  })

let primary // the env-configured endpoint
let rogue // an attacker-chosen endpoint; must never see a keyed request
let providers
let llm

before(async () => {
  primary = await startStub()
  rogue = await startStub()
  process.env.COMPATIBLE_BASE_URL = primary.url
  providers = await import('./providers.js')
  llm = await import('./local-llm.js')
})

after(async () => {
  await stopStub(primary)
  await stopStub(rogue)
  fs.rmSync(modelDir, { recursive: true, force: true })
})

const args = { system: 'sys', user: 'user', temperature: 0.3, maxTokens: 4000, jsonMode: true }

// --- base URL policy (finding 16) --------------------------------------------

test('a request-supplied baseUrl is ignored for a provider that carries an API key', async () => {
  const { resolveConfig, PROVIDERS } = providers
  const cfg = resolveConfig('openai', { baseUrl: `${rogue.url}/exfil` })
  assert.equal(cfg.baseUrl, PROVIDERS.openai.baseUrl)
  assert.equal(cfg.apiKey, 'sk-test-must-not-leak')

  // Same for the compatible endpoint once a key is set for it: the override is
  // only for key-less local servers, so the key can never travel elsewhere.
  process.env.COMPATIBLE_API_KEY = 'compat-secret'
  try {
    await providers.listModels('compatible', { baseUrl: rogue.url })
  } finally {
    process.env.COMPATIBLE_API_KEY = ''
  }
  assert.equal(rogue.requests.length, 0, 'the rogue host must not receive any request')
  assert.ok(primary.requests.some((r) => r.headers.authorization === 'Bearer compat-secret'))
})

test('key-less local endpoints still accept an http(s) baseUrl override, validated', async () => {
  const { resolveConfig, ProviderError } = providers
  assert.equal(resolveConfig('ollama', { baseUrl: rogue.url }).baseUrl, rogue.url)
  assert.equal(resolveConfig('compatible', { baseUrl: rogue.url }).baseUrl, rogue.url)
  // Env base URLs keep working when no override is given.
  assert.equal(resolveConfig('compatible').baseUrl, primary.url)
  process.env.OLLAMA_BASE_URL = 'http://ollama.internal:11434'
  try {
    assert.equal(resolveConfig('ollama').baseUrl, 'http://ollama.internal:11434')
  } finally {
    delete process.env.OLLAMA_BASE_URL
  }
  // Non-strings (qs arrays/objects) are ignored, malformed strings are a 400.
  assert.equal(resolveConfig('compatible', { baseUrl: ['a', 'b'] }).baseUrl, primary.url)
  assert.throws(() => resolveConfig('ollama', { baseUrl: 'not a url' }), (err) => {
    assert.ok(err instanceof ProviderError)
    assert.equal(err.status, 400)
    return true
  })
  assert.throws(() => resolveConfig('ollama', { baseUrl: 'ftp://host/x' }), /http\(s\)/)
})

// --- deadline and cancellation (finding 18) ----------------------------------

test('the timeout covers a stalled response body, not just the headers', async () => {
  primary.mode = 'stall'
  process.env.PROVIDER_TIMEOUT_MS = '300'
  const started = Date.now()
  try {
    await assert.rejects(providers.complete('compatible', { model: 'stub-model' }, args), (err) => {
      assert.equal(err.name, 'ProviderError')
      assert.match(err.message, /timed out after 0\.3s/)
      assert.equal(err.retryable, true)
      return true
    })
  } finally {
    primary.mode = 'ok'
    delete process.env.PROVIDER_TIMEOUT_MS
  }
  assert.ok(Date.now() - started < 5_000, 'must fail at the deadline, not hang')
})

test('complete() honours an AbortSignal from the caller', async () => {
  primary.mode = 'stall'
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 50)
  try {
    await assert.rejects(providers.complete('compatible', { model: 'stub-model' }, { ...args, signal: controller.signal }), (err) => {
      assert.equal(err.name, 'ProviderError')
      assert.match(err.message, /cancelled/)
      assert.equal(err.retryable, false)
      return true
    })
  } finally {
    primary.mode = 'ok'
  }
})

// --- truncation (finding 46) -------------------------------------------------

test('a reply cut off at the output limit is a retryable ProviderError, not a JSON failure', async () => {
  primary.mode = 'truncate'
  try {
    await assert.rejects(providers.complete('compatible', { model: 'stub-model' }, args), (err) => {
      assert.equal(err.name, 'ProviderError')
      assert.match(err.message, /cut off at the 4000-token output limit/)
      assert.equal(err.retryable, true)
      assert.equal(err.status, 502)
      return true
    })
  } finally {
    primary.mode = 'ok'
  }
  const fine = await providers.complete('compatible', { model: 'stub-model' }, args)
  assert.equal(fine.finishReason, 'stop')
  assert.equal(fine.text, '{"fixedPrompt":"ok"}')
})

// --- model list (finding 22) -------------------------------------------------

test('listModels surfaces a rejected key instead of hiding it behind the fallback list', async () => {
  const { PROVIDERS } = providers
  // Point the keyed provider at the stub for this test only: its real host is
  // fixed on purpose (see the base URL policy above).
  const realBase = PROVIDERS.openai.baseUrl
  PROVIDERS.openai.baseUrl = primary.url
  try {
    primary.mode = 'unauthorized'
    await assert.rejects(providers.listModels('openai'), (err) => {
      assert.equal(err.status, 401)
      assert.match(err.message, /Incorrect API key/)
      return true
    })
    // A transient outage still degrades to the fallback list.
    primary.mode = 'outage'
    const degraded = await providers.listModels('openai')
    assert.equal(degraded.source, 'fallback')
    assert.deepEqual(degraded.models, PROVIDERS.openai.models)
  } finally {
    primary.mode = 'ok'
    PROVIDERS.openai.baseUrl = realBase
  }
})

// --- Settings' Test button ---------------------------------------------------

/** Point the four keyed providers at the stub, with a key each, for the length of `run`. */
async function keyedAtStub(run) {
  const { PROVIDERS } = providers
  const ids = ['anthropic', 'openai', 'openrouter', 'google']
  const bases = Object.fromEntries(ids.map((id) => [id, PROVIDERS[id].baseUrl]))
  const keys = { ANTHROPIC_API_KEY: 'sk-ant-check-0123', OPENROUTER_API_KEY: 'sk-or-check-0123', GOOGLE_API_KEY: 'AIza-check-0123' }
  for (const id of ids) PROVIDERS[id].baseUrl = primary.url
  Object.assign(process.env, keys)
  try {
    await run()
  } finally {
    for (const id of ids) PROVIDERS[id].baseUrl = bases[id]
    for (const name of Object.keys(keys)) delete process.env[name]
    primary.mode = 'ok'
  }
}

test('checkKey asks each keyed provider the cheapest question that needs the key', async () => {
  await keyedAtStub(async () => {
    const { PROVIDERS, checkKey } = providers
    primary.requests.length = 0
    for (const id of ['anthropic', 'openai', 'openrouter', 'google']) {
      assert.deepEqual(await checkKey(id), { ok: true, message: `${PROVIDERS[id].label} accepted the key.` })
    }
    // OpenRouter's model list answers anyone, so it is asked about the key itself.
    assert.deepEqual(
      primary.requests.map((r) => r.url),
      ['/models?limit=1', '/models', '/key', '/models?key=AIza-check-0123&pageSize=1']
    )
    const [anthropic, openai, openrouter] = primary.requests
    assert.equal(anthropic.headers['x-api-key'], 'sk-ant-check-0123')
    assert.equal(openai.headers.authorization, 'Bearer sk-test-must-not-leak')
    assert.equal(openrouter.headers.authorization, 'Bearer sk-or-check-0123')
  })
})

test("checkKey reports a rejected key in the provider's own words, redacted, and an outage as no answer", async () => {
  await keyedAtStub(async () => {
    const { checkKey } = providers
    primary.mode = 'echo'
    assert.deepEqual(await checkKey('openai'), {
      ok: false,
      message: 'OpenAI did not accept the key (invalid key Bearer [redacted]).',
    })
    primary.mode = 'invalid'
    assert.deepEqual(await checkKey('google'), {
      ok: false,
      message: 'Google Gemini did not accept the key (API key not valid. Please pass a valid API key).',
    })
    primary.mode = 'outage'
    const outage = await checkKey('anthropic')
    assert.equal(outage.ok, false)
    assert.match(outage.message, /^Could not check the key: Anthropic: 503 overloaded/)
  })
})

// --- Anthropic's Messages API, as current models answer it ------------------------

test('Anthropic: a model that refuses temperature is asked again without it, and never sent it again', async () => {
  await keyedAtStub(async () => {
    primary.mode = 'anthropic'
    primary.requests.length = 0
    const first = await providers.complete('anthropic', { model: 'claude-takes-no-temperature' }, args)
    assert.equal(first.text, '{"fixedPrompt":"ok"}', 'the answer is the text block, not the thinking')
    assert.equal(first.finishReason, 'end_turn')
    await providers.complete('anthropic', { model: 'claude-takes-no-temperature' }, args)
    const sent = primary.requests.map((r) => JSON.parse(r.body))
    assert.deepEqual(sent.map((s) => 'temperature' in s), [true, false, false], 'with it once, then without it from then on')

    // An older model that still takes a temperature keeps the one it was given.
    await providers.complete('anthropic', { model: 'claude-takes-temperature' }, args)
    assert.equal(JSON.parse(primary.requests.at(-1).body).temperature, 0.3)
  })
})

test('Anthropic: a request the model declined says so, rather than failing to read an answer that is not there', async () => {
  await keyedAtStub(async () => {
    primary.mode = 'anthropic-refusal'
    await assert.rejects(providers.complete('anthropic', { model: 'claude-opus-5-5' }, args), (err) => {
      assert.equal(err.name, 'ProviderError')
      assert.match(err.message, /^Anthropic declined this request \(cyber\)\. Reword the prompt/)
      assert.equal(err.retryable, false)
      return true
    })
  })
})

test('checkKey refuses a provider with no key to test, and says where a missing one goes', async () => {
  const { checkKey } = providers
  await assert.rejects(checkKey('anthropic'), (err) => {
    assert.equal(err.status, 400)
    assert.match(err.message, /Anthropic needs an API key\. Add it in Settings/)
    return true
  })
  await assert.rejects(checkKey('local'), /has no key to test/)
})

// --- local provider follows the live tier (finding 21) -----------------------

test('the local provider lists and resolves the tier selected at runtime', async () => {
  const { PROVIDERS, resolveConfig, providerStatus } = providers
  assert.equal(PROVIDERS.local.models[0], 'default')
  llm.selectTier('lite')
  try {
    assert.equal(PROVIDERS.local.models[0], 'lite')
    assert.deepEqual([...PROVIDERS.local.models].sort(), ['default', 'lite', 'quality'])
    assert.equal(resolveConfig('local').model, 'lite')
    // A fix without a model must run on the selected tier, not flip it back.
    await assert.rejects(providers.complete('local', {}, { ...args, maxTokens: 2048 }), /Qwen2\.5 1\.5B Instruct/)
    assert.equal(llm.getStatus().tier, 'lite')
    assert.equal(providerStatus().find((p) => p.id === 'local').configured, false)
  } finally {
    llm.selectTier('default')
  }
  assert.equal(PROVIDERS.local.models[0], 'default')
})
