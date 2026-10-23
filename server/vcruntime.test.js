/**
 * The Visual C++ runtime check behind the "cannot start" message on Windows.
 * Pure: the platform, the Windows folder and the file check are passed in, so
 * this runs the same on any machine, with or without the runtime installed.
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { missingVcRuntime, noBinaryMessage, VC_REDIST_URL, VC_RUNTIME_DLLS } from './vcruntime.js'

const WINDOWS = { platform: 'win32', systemRoot: 'C:\\Windows' }
const installed = (names) => (file) => names.some((n) => file === `C:\\Windows\\System32\\${n}`)

test('missingVcRuntime() lists the runtime DLLs that are not in System32', () => {
  assert.deepEqual(missingVcRuntime({ ...WINDOWS, exists: () => false }), VC_RUNTIME_DLLS)
  assert.deepEqual(
    missingVcRuntime({ ...WINDOWS, exists: installed(['msvcp140.dll', 'vcruntime140.dll']) }),
    ['vcruntime140_1.dll'],
    'an old Redistributable without vcruntime140_1.dll is still a missing runtime'
  )
  assert.deepEqual(missingVcRuntime({ ...WINDOWS, exists: installed(VC_RUNTIME_DLLS) }), [])
})

test('missingVcRuntime() looks in the System32 of the Windows folder it is given', () => {
  const asked = []
  missingVcRuntime({ platform: 'win32', systemRoot: 'D:\\WIN', exists: (file) => asked.push(file) })
  assert.deepEqual(asked, [
    'D:\\WIN\\System32\\msvcp140.dll',
    'D:\\WIN\\System32\\vcruntime140.dll',
    'D:\\WIN\\System32\\vcruntime140_1.dll',
  ])
})

test('missingVcRuntime() has nothing to report off Windows', () => {
  for (const platform of ['darwin', 'linux']) {
    assert.deepEqual(missingVcRuntime({ platform, exists: () => false }), [], platform)
  }
})

test('noBinaryMessage() names the missing runtime and where to get it', () => {
  const text = noBinaryMessage(['vcruntime140.dll', 'vcruntime140_1.dll'])
  assert.match(text, /Microsoft Visual C\+\+ runtime/)
  assert.match(text, /\(vcruntime140\.dll, vcruntime140_1\.dll\)/, 'the files, for whoever searches for them')
  assert.ok(text.includes(VC_REDIST_URL), text)
  assert.match(text, /press Retry/)
  assert.equal(VC_REDIST_URL, 'https://aka.ms/vc14/vc_redist.x64.exe', "Microsoft's permalink, over https")
})

test('noBinaryMessage() does not blame a runtime that is there', () => {
  const text = noBinaryMessage([])
  assert.doesNotMatch(text, /Visual C\+\+/)
  assert.match(text, /NoBinaryFoundError/, 'the error is still named, for whoever is asked to help')
})
