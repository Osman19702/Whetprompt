/**
 * The Microsoft Store package's images (scripts/appx-assets.mjs): the list of
 * files, their pixel sizes, and that build/appx/ holds exactly that list as
 * drawn. A missing image is not an error electron-builder reports; it packs
 * its own sample picture instead, which certification refuses. Run with:
 * npm test
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { assetList, SCALES, TARGET_SIZES, TILES } from './appx-assets.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const bySize = Object.fromEntries(assetList().map((a) => [a.file, a]))

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
  const head = fs.readFileSync(file).subarray(0, 24)
  assert.equal(head.toString('latin1', 1, 4), 'PNG', `${file} is a PNG`)
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
}

test('appx assets: every image electron-builder would otherwise fill with its sample, at every scale', () => {
  // The four its appx target replaces with sample pictures when they are missing.
  for (const name of ['StoreLogo', 'Square150x150Logo', 'Square44x44Logo', 'Wide310x150Logo']) {
    for (const scale of SCALES) assert.ok(bySize[`${name}.scale-${scale}.png`], `${name} at ${scale} %`)
  }
  // Windows rounds a scaled size half up: 150 at 125 % is 188, 310 x 150 at 125 % is 388 x 188.
  assert.deepEqual([bySize['Square150x150Logo.scale-125.png'].width, bySize['Square150x150Logo.scale-125.png'].height], [188, 188])
  assert.deepEqual([bySize['Wide310x150Logo.scale-125.png'].width, bySize['Wide310x150Logo.scale-125.png'].height], [388, 188])
  assert.deepEqual([bySize['StoreLogo.scale-400.png'].width, bySize['StoreLogo.scale-400.png'].height], [200, 200])
})

test('appx assets: the taskbar icon comes at each target size, plain and unplated, beside its scaled variants', () => {
  for (const size of TARGET_SIZES) {
    for (const form of ['', '_altform-unplated']) {
      const asset = bySize[`Square44x44Logo.targetsize-${size}${form}.png`]
      assert.ok(asset, `${size}${form}`)
      assert.deepEqual([asset.width, asset.height], [size, size])
    }
  }
  // A resource with target-size variants also needs one without, or the package's resource index is refused.
  assert.ok(assetList().some((a) => a.file.startsWith('Square44x44Logo.scale-')))
})

test('appx assets: the icon fits inside every image', () => {
  for (const a of assetList()) assert.ok(a.icon > 0 && a.icon <= Math.min(a.width, a.height), a.file)
  assert.equal(TILES.length * SCALES.length + TARGET_SIZES.length * 2, assetList().length, 'no image is listed twice')
})

test('appx assets: build/appx holds exactly the images the script draws, at their sizes', () => {
  const dir = path.join(root, 'build', 'appx')
  const files = fs.readdirSync(dir).sort()
  assert.deepEqual(files, Object.keys(bySize).sort(), 'run node scripts/appx-assets.mjs after changing the list')
  for (const file of files) {
    const { width, height } = pngSize(path.join(dir, file))
    assert.deepEqual([width, height], [bySize[file].width, bySize[file].height], file)
  }
  assert.deepEqual(pngSize(path.join(root, 'build', 'store', 'AppTileIcon-300.png')), { width: 300, height: 300 })
})
