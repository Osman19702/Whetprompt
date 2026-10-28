/**
 * Configuration for the entry points that read it: `.env` from the working
 * directory, then PromptFixer's variable names copied to Whetprompt's
 * (legacy-env.js). Imported before anything else, because models.js,
 * store.js and local-llm.js read their settings as they load.
 */

import 'dotenv/config'
import dotenv from 'dotenv'

import { applyLegacyEnv } from './legacy-env.js'

// The file Settings saves keys to, when something has named one (the desktop
// app, a test harness): read it here too, or a key saved there would be gone
// after a restart. After the working folder's .env, which wins, as the
// project's does in the desktop app; dotenv never overrides.
if (process.env.WHETPROMPT_ENV_FILE) dotenv.config({ path: process.env.WHETPROMPT_ENV_FILE })

applyLegacyEnv()
