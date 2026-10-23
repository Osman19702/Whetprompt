/**
 * Draw the Microsoft Store package's images from the app icon.
 *
 *   node scripts/appx-assets.mjs
 *
 * Writes build/appx/, which electron-builder's appx target packs as the
 * package's assets (npm run dist:store). Without it the package would carry
 * electron-builder's sample images, and the Store's certification fails a
 * package that shows default images. The PNGs are committed, like the icon
 * they are drawn from; run this again after changing build/icon.svg.
 *
 * Every image comes at the five scales Windows asks for (100, 125, 150, 200
 * and 400 %: this machine's 1080p screen at 125 % uses the .scale-125 one),
 * and the app-list and taskbar icon also at the fixed target sizes, plain and
 * "unplated" (drawn without a tile behind it, which is how Windows 11 shows
 * it). The icon carries its own dark square, so it reads on a light or dark
 * taskbar alike. Tiles show the icon at the fraction of their height that the
 * Start menu's other tiles use.
 *
 * It also writes build/store/AppTileIcon-300.png, the 300 x 300 icon the Store
 * listing shows in place of the package's own (docs/STORE.md). That one is
 * uploaded in Partner Center, not packed.
 *
 * Chromium renders the SVG (Playwright, a dev dependency already), so there
 * is no image library to install and the edges are anti-aliased the way the
 * icon is meant to look.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICON = path.join(root, 'build', 'icon.svg')
const OUT = path.join(root, 'build', 'appx')
const LISTING = path.join(root, 'build', 'store')

export const SCALES = [100, 125, 150, 200, 400]
export const TARGET_SIZES = [16, 24, 32, 48, 256]

/** The images the manifest names, at 100 %, and how much of each the icon fills. */
export const TILES = [
  { name: 'StoreLogo', width: 50, height: 50, fill: 1 },
  { name: 'Square44x44Logo', width: 44, height: 44, fill: 1 },
  { name: 'SmallTile', width: 71, height: 71, fill: 0.66 },
  { name: 'Square150x150Logo', width: 150, height: 150, fill: 0.6 },
  { name: 'Wide310x150Logo', width: 310, height: 150, fill: 0.6 },
  { name: 'LargeTile', width: 310, height: 310, fill: 0.5 },
]

/** Every file to write, with its pixel size. Windows rounds a scaled size half up (150 at 125 % is 188). */
export function assetList() {
  const files = []
  for (const tile of TILES) {
    for (const scale of SCALES) {
      const width = Math.round((tile.width * scale) / 100)
      const height = Math.round((tile.height * scale) / 100)
      files.push({ file: `${tile.name}.scale-${scale}.png`, width, height, icon: Math.round(Math.min(width, height) * tile.fill) })
    }
  }
  for (const size of TARGET_SIZES) {
    for (const form of ['', '_altform-unplated']) {
      files.push({ file: `Square44x44Logo.targetsize-${size}${form}.png`, width: size, height: size, icon: size })
    }
  }
  return files
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { chromium } = await import('playwright')
  const svg = fs.readFileSync(ICON, 'utf8')
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(LISTING, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 })
    const listing = { file: path.join(LISTING, 'AppTileIcon-300.png'), width: 300, height: 300, icon: 300 }
    for (const { file, width, height, icon } of [...assetList().map((a) => ({ ...a, file: path.join(OUT, a.file) })), listing]) {
      await page.setViewportSize({ width, height })
      await page.setContent(
        `<!doctype html><style>html,body{margin:0;background:transparent}` +
          `body{width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center}` +
          `svg{width:${icon}px;height:${icon}px;display:block}</style>${svg}`
      )
      await page.screenshot({ path: file, omitBackground: true })
    }
  } finally {
    await browser.close()
  }
  console.log(`wrote ${assetList().length} images to ${path.relative(root, OUT)} and the listing icon to ${path.relative(root, LISTING)}`)
}
