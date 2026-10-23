/**
 * Configuration for the entry points that read it: `.env` from the working
 * directory, then PromptFixer's variable names copied to Whetprompt's
 * (legacy-env.js). Imported before anything else, because models.js,
 * store.js and local-llm.js read their settings as they load.
 */

import 'dotenv/config'

import { applyLegacyEnv } from './legacy-env.js'

applyLegacyEnv()
