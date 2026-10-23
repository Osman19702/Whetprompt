/**
 * Moving in. PromptFixer kept the library and `.env` in a user-data folder of
 * its own name (%APPDATA%\PromptFixer, ~/Library/Application Support/PromptFixer,
 * ~/.config/PromptFixer); the first start as Whetprompt copies them across.
 *
 * Copied, never moved, so a PromptFixer that is still installed keeps its own;
 * and nothing that Whetprompt already has is written over. Free of Electron
 * imports so it can be tested with plain folders.
 */

import fs from 'node:fs'
import path from 'node:path'

/** PromptFixer's user-data folder names: the installed app's, then `npm run desktop:dev`'s. */
export const LEGACY_NAMES = ['PromptFixer', 'promptfixer']

/**
 * Copy what PromptFixer left in `appDataDir` into `userDataDir`. Returns what
 * was copied, `{ from, library, env }`, or null when there was nothing to do.
 */
export function migrateLegacyUserData({ appDataDir, userDataDir, names = LEGACY_NAMES }) {
  const legacy = names
    .map((name) => path.join(appDataDir, name))
    .find((dir) => fs.existsSync(dir) && path.resolve(dir) !== path.resolve(userDataDir))
  if (!legacy) return null

  const library = !fs.existsSync(path.join(userDataDir, 'data', 'library.json')) && fs.existsSync(path.join(legacy, 'data', 'library.json'))
  const env = !fs.existsSync(path.join(userDataDir, '.env')) && fs.existsSync(path.join(legacy, '.env'))
  if (!library && !env) return null

  fs.mkdirSync(userDataDir, { recursive: true })
  // The whole data folder, so whatever store.js keeps beside the library comes too.
  if (library) fs.cpSync(path.join(legacy, 'data'), path.join(userDataDir, 'data'), { recursive: true, force: false })
  if (env) fs.copyFileSync(path.join(legacy, '.env'), path.join(userDataDir, '.env'))
  return { from: legacy, library, env }
}
