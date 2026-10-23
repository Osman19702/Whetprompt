import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { migrateLegacyUserData } from './migrate.js'

/** An appData folder holding the given files, as { 'PromptFixer/.env': '...' }. */
function appData(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-migrate-'))
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), body)
  }
  return dir
}
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8')

test("the first start copies PromptFixer's library and .env, and leaves PromptFixer its own", () => {
  const dir = appData({
    'PromptFixer/data/library.json': '{"entries":[1]}',
    'PromptFixer/.env': 'ANTHROPIC_API_KEY=sk-test\n',
  })
  const userData = path.join(dir, 'Whetprompt')
  assert.deepEqual(migrateLegacyUserData({ appDataDir: dir, userDataDir: userData }), {
    from: path.join(dir, 'PromptFixer'),
    library: true,
    env: true,
  })
  assert.equal(read(userData, 'data', 'library.json'), '{"entries":[1]}')
  assert.equal(read(userData, '.env'), 'ANTHROPIC_API_KEY=sk-test\n')
  assert.equal(read(dir, 'PromptFixer', 'data', 'library.json'), '{"entries":[1]}', 'copied, not moved')
})

test('what Whetprompt already has is never written over, and a second start does nothing', () => {
  const dir = appData({
    'PromptFixer/data/library.json': 'old',
    'PromptFixer/.env': 'OLD=1\n',
    'Whetprompt/data/library.json': 'new',
  })
  const userData = path.join(dir, 'Whetprompt')
  assert.deepEqual(migrateLegacyUserData({ appDataDir: dir, userDataDir: userData }), {
    from: path.join(dir, 'PromptFixer'),
    library: false,
    env: true,
  })
  assert.equal(read(userData, 'data', 'library.json'), 'new')
  assert.equal(migrateLegacyUserData({ appDataDir: dir, userDataDir: userData }), null)
})

test('the development folder name counts too, and no PromptFixer at all is nothing to do', () => {
  const dev = appData({ 'promptfixer/data/library.json': 'dev' })
  const userData = path.join(dev, 'whetprompt')
  assert.equal(migrateLegacyUserData({ appDataDir: dev, userDataDir: userData })?.library, true)
  assert.equal(read(userData, 'data', 'library.json'), 'dev')

  const none = appData({ 'SomethingElse/.env': 'X=1\n' })
  assert.equal(migrateLegacyUserData({ appDataDir: none, userDataDir: path.join(none, 'Whetprompt') }), null)
  assert.equal(fs.existsSync(path.join(none, 'Whetprompt')), false, 'no folder is created for nothing')
})
