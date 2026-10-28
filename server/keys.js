/**
 * API keys from Settings.
 *
 * A key added in the app is written to the same .env file the app reads at
 * startup — the desktop app's, in its user-data folder; the project's, run
 * from source — so a key added in Settings and one typed into the file by hand
 * are the same thing, and both survive a restart. It is set in this process at
 * once as well, so nothing has to restart.
 *
 * The file may be somebody's own work. Settings changes only the lines of the
 * one key it was asked to change, keeps every other byte, and writes nothing
 * until the rest of the file is proven to read back exactly as before.
 *
 * No key goes back out. What the interface learns is where the key in use
 * came from — this file, somewhere else, or nowhere — never the key itself.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'

import { PROVIDERS, providerStatus } from './providers.js'
import { renameOver } from './store.js'

/** The providers whose key Settings keeps: cloud services that cannot work without one. */
export const KEYED = Object.values(PROVIDERS)
  .filter((p) => p.keyEnv && !p.keyOptional)
  .map((p) => p.id)

/**
 * The desktop app names its user-data .env. Run from source, the server read
 * the .env in its working folder at startup, so that is the one to write.
 */
export const keysFile = () => process.env.WHETPROMPT_ENV_FILE || path.resolve(process.cwd(), '.env')

const HEADER = "# Whetprompt settings: the API keys added in the app's Settings, and anything you add by hand."

// One unbroken run of printable ASCII, less what would end or bend a line of a
// .env file: a space, a quote of any kind, a backslash, a #. Eight characters
// at least, which is also the shortest key redact() blanks out of a message.
const KEY_SHAPE = /^[\x21\x24-\x26\x28-\x5b\x5d-\x5f\x61-\x7e]{8,512}$/

const fail = (status, message) => Object.assign(new Error(message), { status })

function readSync(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return ''
    throw err
  }
}

async function read(file) {
  try {
    return await fsp.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return ''
    throw err
  }
}

/**
 * Where the key `keyEnv` in use came from: 'settings' when it is the one in
 * the file, 'environment' when something that wins over the file set it — the
 * system environment, or the project's .env in development — and null when
 * there is none. Blank counts as none, as it does everywhere else.
 */
function sourceOf(keyEnv, saved) {
  const live = process.env[keyEnv]
  if (!live) return null
  return saved[keyEnv] === live ? 'settings' : 'environment'
}

/**
 * providerStatus(), with where each kept key came from. A file that cannot be
 * read makes every key one set elsewhere: shown, never edited.
 */
export function providersWithKeys() {
  let saved = {}
  try {
    saved = dotenv.parse(readSync(keysFile()))
  } catch (err) {
    console.error(`Could not read ${keysFile()}: ${err.message}`)
  }
  return providerStatus().map((p) => ({ ...p, keySource: KEYED.includes(p.id) ? sourceOf(p.keyEnv, saved) : null }))
}

/** The provider Settings is asked about, or a 400 that says why it cannot be. */
export function keyedProvider(id) {
  if (!Object.hasOwn(PROVIDERS, id)) throw fail(400, `Unknown provider "${id}".`)
  if (!KEYED.includes(id)) throw fail(400, `${PROVIDERS[id].label} has no key to keep in Settings.`)
  return PROVIDERS[id]
}

function cleanKey(provider, raw) {
  let key = typeof raw === 'string' ? raw.trim() : ''
  // Copied out of a .env file, name and all: the key is what follows the name.
  if (key.startsWith(`${provider.keyEnv}=`)) key = key.slice(provider.keyEnv.length + 1).trim()
  if (!key) throw fail(400, `Paste your ${provider.label} API key first.`)
  // Never the value in the message: it may be most of a real key with one stray character in it.
  if (!KEY_SHAPE.test(key)) {
    throw fail(400, 'That is not an API key: a key is one unbroken string of at least 8 characters, with no spaces, line breaks, quotes, backslashes or #.')
  }
  return key
}

/**
 * `text` with every line that sets `name` setting it to `value` instead — ''
 * blanks it — or, when no line does, a line for it added at the end. Every
 * other byte is kept, line endings and a byte order mark included.
 */
export function withKey(text, name, value) {
  // The forms dotenv reads: `NAME=`, `NAME =`, `export NAME=`, and `NAME: `.
  const sets = new RegExp(`^(\\s*(?:export\\s+)?${name})(?:\\s*=|:(?=\\s))`)
  // Lines at the even indexes, the line breaks between them at the odd ones.
  const parts = text.split(/(\r?\n)/)
  let found = false
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i].match(sets)
    if (!line) continue
    parts[i] = `${line[1]}=${value}`
    found = true
  }
  if (found) return parts.join('')
  if (!value) return text
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lead = text === '' ? `${HEADER}${eol}` : text.endsWith('\n') ? '' : eol
  return `${text}${lead}${name}=${value}${eol}`
}

/** Refuse a change that would read back as anything but the one key changing. */
function proveOnlyKeyChanged(before, after, name, value, file) {
  const was = dotenv.parse(before)
  const now = dotenv.parse(after)
  const others = new Set([...Object.keys(was), ...Object.keys(now)])
  others.delete(name)
  if ((now[name] ?? '') === value && [...others].every((n) => was[n] === now[n])) return
  throw fail(500, `Could not change ${file} without disturbing the rest of it, so it was left as it was. Edit the key there by hand.`)
}

async function write(file, text) {
  // Through a link to wherever the file really is, rather than replacing the link.
  const target = await fsp.realpath(file).catch(() => file)
  await fsp.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}`
  // Readable by its owner only, where the system has such a thing: it holds keys.
  await fsp.writeFile(tmp, text, { encoding: 'utf8', mode: 0o600 })
  try {
    await renameOver(tmp, target)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

let queue = Promise.resolve()

/** One change at a time, so two saves cannot each write over the other's file. */
function change(provider, value) {
  const next = queue.then(async () => {
    const file = keysFile()
    const text = await read(file)
    if (sourceOf(provider.keyEnv, dotenv.parse(text)) === 'environment') {
      throw fail(
        409,
        `${provider.label}'s key is set outside Whetprompt, in the system environment or in a .env file read before this one, and that one wins. Change it where it is set.`
      )
    }
    const updated = withKey(text, provider.keyEnv, value)
    if (updated !== text) {
      proveOnlyKeyChanged(text, updated, provider.keyEnv, value, file)
      await write(file, updated)
    }
    if (value) process.env[provider.keyEnv] = value
    else delete process.env[provider.keyEnv]
    return providersWithKeys().find((p) => p.id === provider.id)
  })
  queue = next.catch(() => {})
  return next
}

/** Keep `raw` as the provider's key: in the file, and in this process at once. */
export async function saveKey(id, raw) {
  const provider = keyedProvider(id)
  return change(provider, cleanKey(provider, raw))
}

/** Blank the provider's key in the file, and stop using it at once. */
export async function removeKey(id) {
  return change(keyedProvider(id), '')
}
