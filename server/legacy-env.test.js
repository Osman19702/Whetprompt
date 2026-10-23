/**
 * PromptFixer's PROMPTFIXER_* variables, read under Whetprompt's names.
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyLegacyEnv } from './legacy-env.js'

test('a PROMPTFIXER_ variable is read as its WHETPROMPT_ name', () => {
  const env = { PROMPTFIXER_MODEL: 'lite', PROMPTFIXER_IDLE_UNLOAD_MS: '900000', PATH: '/bin' }
  assert.deepEqual(applyLegacyEnv(env).sort(), ['WHETPROMPT_IDLE_UNLOAD_MS', 'WHETPROMPT_MODEL'])
  assert.equal(env.WHETPROMPT_MODEL, 'lite')
  assert.equal(env.WHETPROMPT_IDLE_UNLOAD_MS, '900000')
  assert.equal(env.PATH, '/bin', 'nothing else is touched')
})

test('a WHETPROMPT_ variable that is set wins over the old name, even when it is empty', () => {
  const env = { PROMPTFIXER_MODEL: 'lite', WHETPROMPT_MODEL: 'quality', PROMPTFIXER_PRELOAD: '1', WHETPROMPT_PRELOAD: '' }
  assert.deepEqual(applyLegacyEnv(env), [])
  assert.equal(env.WHETPROMPT_MODEL, 'quality')
  assert.equal(env.WHETPROMPT_PRELOAD, '', 'an empty value is a deliberate one')
})

test('applying it twice changes nothing more', () => {
  const env = { PROMPTFIXER_DATA_DIR: 'D:\\library' }
  applyLegacyEnv(env)
  assert.deepEqual(applyLegacyEnv(env), [])
  assert.equal(env.WHETPROMPT_DATA_DIR, 'D:\\library')
})
