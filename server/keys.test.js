/**
 * Settings' API keys: the .env file they are written to, line by line, and the
 * saving, removing and refusing around it. Everything happens in a temp
 * folder; no network.
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'
import dotenv from 'dotenv'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whetprompt-keys-'))
// Empty, so loading the providers never looks at a model this machine has.
process.env.WHETPROMPT_MODEL_DIR = path.join(dir, 'models')
// A folder that does not exist yet: the first save has to make it.
const file = path.join(dir, 'settings', '.env')
process.env.WHETPROMPT_ENV_FILE = file

const { KEYED, keysFile, providersWithKeys, removeKey, saveKey, withKey } = await import('./keys.js')
const { PROVIDERS } = await import('./providers.js')

const NAMES = KEYED.map((id) => PROVIDERS[id].keyEnv)
const source = (id) => providersWithKeys().find((p) => p.id === id).keySource
const onDisk = () => fs.readFileSync(file, 'utf8')
const writeFile = (text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

// The developer's shell may hold real keys; none of them belongs in these tests.
beforeEach(() => {
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
  for (const name of NAMES) delete process.env[name]
})
after(() => fs.rmSync(dir, { recursive: true, force: true }))

test('Settings keeps the keys of the four cloud providers that cannot work without one', () => {
  assert.deepEqual(KEYED, ['anthropic', 'openai', 'openrouter', 'google'])
})

test('withKey() adds a missing key at the end, and starts a new file with a line saying what it is', () => {
  assert.match(withKey('', 'OPENAI_API_KEY', 'sk-one'), /^# .*Settings.*\nOPENAI_API_KEY=sk-one\n$/)
  assert.equal(withKey('A=1', 'OPENAI_API_KEY', 'sk-one'), 'A=1\nOPENAI_API_KEY=sk-one\n', 'a last line with no break gets one first')
  assert.equal(withKey('A=1\r\n', 'OPENAI_API_KEY', 'sk-one'), 'A=1\r\nOPENAI_API_KEY=sk-one\r\n', "in the file's own line breaks")
  assert.equal(withKey('A=1\n', 'OPENAI_API_KEY', ''), 'A=1\n', 'removing a key that is not there changes nothing')
})

test('withKey() rewrites only the lines that set the key, and keeps every other byte', () => {
  const lines = (...l) => l.join('\r\n')
  const text = lines(
    '﻿# mine',
    'export OPENAI_API_KEY = old',
    'OPENAI_API_KEY_OLD=keep',
    '# OPENAI_API_KEY=commented out',
    'MY_OPENAI_API_KEY=not this one',
    'OPENAI_API_KEY: older',
    'TAIL=1'
  )
  const set = withKey(text, 'OPENAI_API_KEY', 'sk-new')
  assert.equal(
    set,
    lines('﻿# mine', 'export OPENAI_API_KEY=sk-new', 'OPENAI_API_KEY_OLD=keep', '# OPENAI_API_KEY=commented out', 'MY_OPENAI_API_KEY=not this one', 'OPENAI_API_KEY=sk-new', 'TAIL=1')
  )
  assert.equal(dotenv.parse(set).OPENAI_API_KEY, 'sk-new', 'every line that set it agrees, whichever dotenv reads last')
  assert.equal(
    withKey(set, 'OPENAI_API_KEY', ''),
    lines('﻿# mine', 'export OPENAI_API_KEY=', 'OPENAI_API_KEY_OLD=keep', '# OPENAI_API_KEY=commented out', 'MY_OPENAI_API_KEY=not this one', 'OPENAI_API_KEY=', 'TAIL=1'),
    'removing blanks them where they stand, for the next key to fill'
  )
})

test('every character a key may hold reads back through dotenv unchanged, beside what was there', () => {
  const everything = '!$%&()*+,-./0123456789:;<=>?@AZ[]^_az{|}~'
  for (const key of ['sk-ant-api03-AbC_dEf-123', 'AIzaSyD-x_y0123', 'sk-or-v1-0123abcd', everything]) {
    const parsed = dotenv.parse(withKey('# notes\nOTHER="x # y"\n', 'GOOGLE_API_KEY', key))
    assert.equal(parsed.GOOGLE_API_KEY, key)
    assert.equal(parsed.OTHER, 'x # y')
  }
})

test('saveKey() writes the key and uses it at once; removeKey() blanks it and stops using it', async () => {
  const saved = await saveKey('anthropic', '  sk-ant-unit-0123456789\n')
  assert.equal(saved.configured, true, 'in use at once, trimmed')
  assert.equal(saved.keySource, 'settings')
  assert.equal(process.env.ANTHROPIC_API_KEY, 'sk-ant-unit-0123456789')
  assert.equal(dotenv.parse(onDisk()).ANTHROPIC_API_KEY, 'sk-ant-unit-0123456789', 'and in the file, in a folder made for it')
  assert.ok(!JSON.stringify(saved).includes('unit'), 'the reply says where the key came from, never what it is')
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'readable by its owner only')
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['.env'], 'no temp file left behind')

  const removed = await removeKey('anthropic')
  assert.equal(removed.configured, false)
  assert.equal(removed.keySource, null)
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined)
  assert.match(onDisk(), /^ANTHROPIC_API_KEY=$/m)
})

test('what is not a key is refused with a 400 that never repeats it, and nothing is written', async () => {
  const notKeys = ['', '   ', 'sk-unit\nOTHER=1', 'sk unit key', "sk-'unit'-key", 'sk-"unit"-k', 'sk-unit-#-key', 'sk-unit\\key', 'sk-unit`key', 'unit', 'ÿk-unit-0123', 42, null, { key: 'sk-unit-0123456789' }]
  for (const raw of notKeys) {
    await assert.rejects(saveKey('openai', raw), (err) => {
      assert.equal(err.status, 400, JSON.stringify(raw))
      assert.ok(!/unit/.test(err.message), `not repeated back: ${err.message}`)
      return true
    })
  }
  assert.equal(fs.existsSync(file), false)
  assert.equal(process.env.OPENAI_API_KEY, undefined)
})

test('a key pasted with its name, as it stands in a .env file, is kept without the name', async () => {
  await saveKey('openrouter', 'OPENROUTER_API_KEY=sk-or-v1-unit-0123')
  assert.equal(process.env.OPENROUTER_API_KEY, 'sk-or-v1-unit-0123')
  assert.match(onDisk(), /^OPENROUTER_API_KEY=sk-or-v1-unit-0123$/m)
})

test('a key set somewhere that wins over the file is left alone, and one typed into the file is not', async () => {
  process.env.GOOGLE_API_KEY = 'AIza-from-the-environment'
  assert.equal(source('google'), 'environment')
  for (const attempt of [() => saveKey('google', 'AIza-a-replacement-key'), () => removeKey('google')]) {
    await assert.rejects(attempt(), (err) => {
      assert.equal(err.status, 409)
      assert.ok(!err.message.includes('AIza'), 'without repeating the key')
      return true
    })
  }
  assert.equal(process.env.GOOGLE_API_KEY, 'AIza-from-the-environment')
  assert.equal(fs.existsSync(file), false)

  // The old way: typed into the file by hand, read at startup. That is Settings' own.
  writeFile('GOOGLE_API_KEY=AIza-typed-by-hand\n')
  process.env.GOOGLE_API_KEY = 'AIza-typed-by-hand'
  assert.equal(source('google'), 'settings')
  assert.equal((await removeKey('google')).configured, false)
})

test('Settings answers only for the providers whose key it keeps', async () => {
  for (const id of ['local', 'ollama', 'compatible', 'no-such-provider', 'constructor', '__proto__']) {
    await assert.rejects(saveKey(id, 'sk-unit-0123456789'), (err) => err.status === 400)
    await assert.rejects(removeKey(id), (err) => err.status === 400)
  }
  assert.equal(fs.existsSync(file), false)
})

test('saves made at the same moment all land: one change at a time', async () => {
  await Promise.all([
    saveKey('anthropic', 'sk-ant-unit-at-once'),
    saveKey('openai', 'sk-openai-unit-at-once'),
    removeKey('openrouter'),
    saveKey('google', 'AIza-unit-at-once'),
  ])
  const parsed = dotenv.parse(onDisk())
  assert.equal(parsed.ANTHROPIC_API_KEY, 'sk-ant-unit-at-once')
  assert.equal(parsed.OPENAI_API_KEY, 'sk-openai-unit-at-once')
  assert.equal(parsed.GOOGLE_API_KEY, 'AIza-unit-at-once')
})

test('a change that would disturb anything else in the file is not written', async () => {
  // A quoted value may run over lines, and one of them can look like a key.
  const text = 'NOTES="a value that runs over\nANTHROPIC_API_KEY=lines, and only looks like a key\nhere"\n'
  writeFile(text)
  assert.ok(dotenv.parse(text).NOTES.includes('ANTHROPIC_API_KEY='), 'dotenv reads that line as part of NOTES')
  await assert.rejects(saveKey('anthropic', 'sk-ant-unit-0123456789'), (err) => {
    assert.equal(err.status, 500)
    assert.match(err.message, /left as it was/)
    return true
  })
  assert.equal(onDisk(), text)
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined, 'nor is the key used')
})

test("run from source with no file named, Settings writes the .env the server read: the working folder's", () => {
  delete process.env.WHETPROMPT_ENV_FILE
  try {
    assert.equal(keysFile(), path.resolve(process.cwd(), '.env'))
  } finally {
    process.env.WHETPROMPT_ENV_FILE = file
  }
})
