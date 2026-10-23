/**
 * The Microsoft Visual C++ runtime, and what a missing one looks like.
 *
 * node-llama-cpp's prebuilt Windows binaries link the MSVC runtime dynamically:
 * every llama-addon.node, llama and ggml DLL imports MSVCP140.dll and
 * VCRUNTIME140.dll, and llama-common.dll VCRUNTIME140_1.dll. Electron links it
 * statically, so on a Windows install that has never had the Visual C++
 * Redistributable the app opens as usual and only the model fails: each bundled
 * binary fails its load test with "The specified module could not be found",
 * and node-llama-cpp gives up with a bare NoBinaryFoundError.
 *
 * The installer ships the DLLs next to the binaries (scripts/bundle-vcruntime.js),
 * so this only has to explain the failure where they are absent: running from
 * source, or an installer built before that hook existed.
 */

import fs from 'node:fs'
import path from 'node:path'

/** The runtime DLLs the bundled binaries import. */
export const VC_RUNTIME_DLLS = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']

/** Microsoft's permanent link to the latest x64 Visual C++ v14 Redistributable. */
export const VC_REDIST_URL = 'https://aka.ms/vc14/vc_redist.x64.exe'

/**
 * The runtime DLLs missing from System32, which is where the Redistributable
 * installs them. Empty off Windows, and empty when all of them are there.
 */
export function missingVcRuntime({
  platform = process.platform,
  systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows',
  exists = fs.existsSync,
} = {}) {
  if (platform !== 'win32') return []
  return VC_RUNTIME_DLLS.filter((dll) => !exists(path.win32.join(systemRoot, 'System32', dll)))
}

/**
 * What to tell someone whose llama.cpp binaries all failed to start
 * (node-llama-cpp's NoBinaryFoundError), given the DLLs missingVcRuntime()
 * found absent. The error's own message is the class name and nothing else.
 */
export function noBinaryMessage(missing) {
  if (missing.length) {
    return (
      `The model's engine (llama.cpp) cannot start: this computer is missing the Microsoft ` +
      `Visual C++ runtime it is built with (${missing.join(', ')}). Install Microsoft's Visual C++ ` +
      `Redistributable from ${VC_REDIST_URL}, then press Retry.`
    )
  }
  return (
    `The model's engine (llama.cpp) cannot start on this computer: none of the builds that came ` +
    `with Whetprompt passed its start-up check (NoBinaryFoundError). Reinstalling Whetprompt ` +
    `may help; linting and scoring work without it.`
  )
}
