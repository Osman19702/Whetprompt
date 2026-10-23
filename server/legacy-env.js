/**
 * The names the configuration had before the app was Whetprompt.
 *
 * PromptFixer's environment variables were PROMPTFIXER_*; Whetprompt's are
 * WHETPROMPT_*. A `.env` or a shell set up for PromptFixer keeps working:
 * every PROMPTFIXER_ variable is copied to its WHETPROMPT_ name, unless that
 * name is set already, in which case the new name wins.
 */

export const LEGACY_PREFIX = 'PROMPTFIXER_'
export const PREFIX = 'WHETPROMPT_'

/** Copy the legacy variables in `env` to their new names; returns the names it set. */
export function applyLegacyEnv(env = process.env) {
  const set = []
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(LEGACY_PREFIX)) continue
    const name = PREFIX + key.slice(LEGACY_PREFIX.length)
    if (env[name] !== undefined) continue
    env[name] = value
    set.push(name)
  }
  return set
}
