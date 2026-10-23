/**
 * electron-builder afterPack hook: put the Microsoft Visual C++ runtime next to
 * every llama.cpp binary of a Windows build.
 *
 * node-llama-cpp's prebuilt Windows binaries import MSVCP140.dll,
 * VCRUNTIME140.dll and VCRUNTIME140_1.dll, which Electron itself does not need.
 * On a Windows install that never had the Visual C++ Redistributable, 0.4.0
 * therefore opened as usual and failed at the model with NoBinaryFoundError
 * (server/vcruntime.js has the details), on exactly the machine "there is
 * nothing to install first" in docs/INSTALL.md is written for.
 *
 * Node loads an addon with LOAD_WITH_ALTERED_SEARCH_PATH, so Windows resolves
 * its DLLs from the addon's own folder before System32: a copy there is found
 * on every machine, and the ggml backends loaded afterwards reuse it because it
 * is already in the process. That also makes it the copy used on a machine that
 * has a newer runtime of its own, so it has to be new enough for the binaries.
 * A msvcp140.dll older than the STL a binary was compiled against can crash it
 * (14.40 made std::mutex's constructor constexpr, and binaries built since then
 * crash on an older one), so anything older than MIN_RUNTIME, or than the newest
 * MSVC linker that built a bundled binary, is refused.
 *
 * Where the DLLs are taken from, first match wins:
 *   WHETPROMPT_VCRUNTIME_DIR   a folder that holds them, on any build machine
 *   VCToolsRedistDir            set inside a Visual Studio developer prompt
 *   Visual Studio (vswhere)     VC\Redist\MSVC\<newest>\x64\Microsoft.VC<n>.CRT,
 *                               which the Release workflow's runner has
 * A Windows build that finds none fails, rather than writing an installer that
 * only works where the runtime happens to be installed already.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const AMD64 = 0x8664

/** The oldest runtime the bundled binaries may be given; the header says why. */
export const MIN_RUNTIME = [14, 40]

/** The redistributable runtime DLLs, as opposed to the system's own (UCRT, KERNEL32). */
const VC_RUNTIME_DLL = /^(msvcp140(_\w+)?|vcruntime140(_\w+)?|concrt140|vccorlib140|vcomp140)\.dll$/i

/** VS_FIXEDFILEINFO's signature, which starts the fixed part of a version resource. */
const FIXED_FILE_INFO = Buffer.from([0xbd, 0x04, 0xef, 0xfe])

export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return Math.sign(d)
  }
  return 0
}

/** A reader for readPe() over bytes already in memory. */
export const bufferReader = (buf) => (at, length) => buf.subarray(at, at + length)

/**
 * The machine, the linker version and the imported DLLs of a PE file, read
 * through `read(offset, length)` so that only the headers and the import table
 * are fetched. For a file linked by MSVC the linker version is the toolset
 * that built it; lld writes 14.0 whatever built it.
 */
export function readPe(read) {
  const dos = read(0, 64)
  if (dos.length < 64 || dos.readUInt16LE(0) !== 0x5a4d) throw new Error('not a PE file')
  const pe = dos.readUInt32LE(0x3c)
  const coff = read(pe, 24)
  if (coff.length < 24 || coff.readUInt32LE(0) !== 0x4550) throw new Error('not a PE file')
  const machine = coff.readUInt16LE(4)
  const sectionCount = coff.readUInt16LE(6)
  const optionalSize = coff.readUInt16LE(20)
  const optional = read(pe + 24, optionalSize)
  const linker = [optional[2], optional[3]]
  // The data directories follow 96 bytes of PE32 fields or 112 of PE32+; the
  // second of them is the import table.
  const directories = optional.readUInt16LE(0) === 0x20b ? 112 : 96
  const importRva = optional.readUInt32LE(directories + 8)

  const table = read(pe + 24 + optionalSize, sectionCount * 40)
  const sections = []
  for (let s = 0; s + 40 <= table.length; s += 40) {
    sections.push({
      va: table.readUInt32LE(s + 12),
      size: Math.max(table.readUInt32LE(s + 8), table.readUInt32LE(s + 16)),
      raw: table.readUInt32LE(s + 20),
    })
  }
  const offset = (rva) => {
    const section = sections.find((s) => rva >= s.va && rva < s.va + s.size)
    if (!section) throw new Error(`not a PE file: RVA 0x${rva.toString(16)} is in no section`)
    return rva - section.va + section.raw
  }

  const imports = []
  if (importRva) {
    // Twenty-byte descriptors, the name's RVA at +12, ended by an empty one.
    for (let at = offset(importRva); ; at += 20) {
      const nameRva = read(at + 12, 4).readUInt32LE(0)
      if (nameRva === 0) break
      const name = read(offset(nameRva), 256)
      const end = name.indexOf(0)
      imports.push(name.toString('latin1', 0, end < 0 ? name.length : end))
    }
  }
  return { machine, linker, imports }
}

function readPeFile(file) {
  const fd = fs.openSync(file, 'r')
  try {
    return readPe((at, length) => {
      const buf = Buffer.alloc(length)
      return buf.subarray(0, fs.readSync(fd, buf, 0, length, at))
    })
  } catch (err) {
    throw new Error(`${file}: ${err.message}`)
  } finally {
    fs.closeSync(fd)
  }
}

/** The FileVersion of a PE file's version resource as four numbers, or null. */
export function fileVersion(buf) {
  for (let at = buf.indexOf(FIXED_FILE_INFO); at >= 0; at = buf.indexOf(FIXED_FILE_INFO, at + 1)) {
    // The structure version (1.0) right after the signature rules out the same
    // four bytes turning up by chance somewhere else in the file.
    if (at + 16 <= buf.length && buf.readUInt32LE(at + 4) === 0x00010000) {
      const ms = buf.readUInt32LE(at + 8)
      const ls = buf.readUInt32LE(at + 12)
      return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff]
    }
  }
  return null
}

/**
 * Where to copy the runtime from (the header gives the order), as
 * `{ dir, from }`, or null. The arguments are seams for the tests.
 */
export function findRuntimeDir({
  env = process.env,
  exists = fs.existsSync,
  list = (dir) => fs.readdirSync(dir),
  installs = () => visualStudioInstalls(env),
} = {}) {
  if (env.WHETPROMPT_VCRUNTIME_DIR) {
    return { dir: env.WHETPROMPT_VCRUNTIME_DIR, from: 'WHETPROMPT_VCRUNTIME_DIR' }
  }
  // VC\Redist\MSVC\<version>\x64\Microsoft.VC143.CRT; the CRT folder is named
  // after the toolset (VC143 for Visual Studio 2022), so take the newest.
  const crtIn = (versionDir) => {
    const archDir = path.join(versionDir, 'x64')
    if (!exists(archDir)) return null
    const crt = list(archDir)
      .filter((name) => /^Microsoft\.VC\d+\.CRT$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
      .at(-1)
    return crt ? path.join(archDir, crt) : null
  }
  if (env.VCToolsRedistDir) {
    const dir = crtIn(env.VCToolsRedistDir)
    if (dir) return { dir, from: 'VCToolsRedistDir' }
  }
  const versions = []
  for (const install of installs()) {
    const redist = path.join(install, 'VC', 'Redist', 'MSVC')
    if (!exists(redist)) continue
    for (const name of list(redist)) {
      if (/^\d+\.\d+\.\d+$/.test(name)) versions.push({ version: name.split('.').map(Number), dir: path.join(redist, name) })
    }
  }
  versions.sort((a, b) => compareVersions(b.version, a.version))
  for (const { dir: versionDir } of versions) {
    const dir = crtIn(versionDir)
    if (dir) return { dir, from: 'Visual Studio' }
  }
  return null
}

/** Installation folders of every Visual Studio (Build Tools included) vswhere knows about. */
function visualStudioInstalls(env) {
  const vswhere = path.join(
    env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  )
  if (!fs.existsSync(vswhere)) return []
  const out = execFileSync(vswhere, ['-products', '*', '-property', 'installationPath', '-utf8'], {
    encoding: 'utf8',
  })
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

/**
 * What the binaries under `root` (the unpacked @node-llama-cpp folder) need:
 * the folders that hold a llama-addon.node, which is where the copies go; the
 * runtime DLLs any of the binaries imports; and the oldest runtime that will do.
 */
export function scanLlamaBinaries(root) {
  if (!fs.existsSync(root)) {
    throw new Error(`No llama.cpp binaries at ${root}. Did asarUnpack in package.json change?`)
  }
  const binaries = fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(dll|node)$/i.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .map((file) => ({ file, ...readPeFile(file) }))

  const addons = binaries.filter((b) => path.basename(b.file) === 'llama-addon.node')
  if (addons.length === 0) throw new Error(`No llama-addon.node under ${root}.`)
  for (const addon of addons) {
    if (addon.machine !== AMD64) {
      throw new Error(`${addon.file} is not an x64 binary; only x64 Windows builds bundle the Visual C++ runtime.`)
    }
  }
  return {
    dirs: addons.map((addon) => path.dirname(addon.file)).sort(),
    needed: [...new Set(binaries.flatMap((b) => b.imports.map((name) => name.toLowerCase())))]
      .filter((name) => VC_RUNTIME_DLL.test(name))
      .sort(),
    required: binaries.reduce((v, b) => (compareVersions(b.linker, v) > 0 ? b.linker : v), MIN_RUNTIME),
  }
}

/**
 * Copy the `needed` DLLs from `sourceDir` into each of `dirs`, after checking
 * that each is an x64 DLL at least as new as `required`. Throws, failing the
 * build, on anything it cannot vouch for.
 */
export function copyVcRuntime({ dirs, needed, required }, sourceDir) {
  if (!fs.existsSync(sourceDir)) throw new Error(`The Visual C++ runtime folder ${sourceDir} does not exist.`)
  // Windows matches file names without regard to case; the folder may not.
  const available = new Map(fs.readdirSync(sourceDir).map((name) => [name.toLowerCase(), name]))
  const sources = needed.map((name) => {
    if (!available.has(name)) {
      throw new Error(`${name} is not in ${sourceDir}, and the llama.cpp binaries import it.`)
    }
    const file = path.join(sourceDir, available.get(name))
    const buf = fs.readFileSync(file)
    if (readPe(bufferReader(buf)).machine !== AMD64) throw new Error(`${file} is not an x64 DLL.`)
    const version = fileVersion(buf)
    if (!version) throw new Error(`${file} has no version resource, so its age cannot be checked.`)
    if (compareVersions(version, required) < 0) {
      throw new Error(
        `${file} is version ${version.join('.')}, and the llama.cpp binaries need ${required.join('.')} ` +
          `or newer (never older than ${MIN_RUNTIME.join('.')}, or than the newest MSVC that built one of ` +
          'them). Use a newer Visual Studio, or point WHETPROMPT_VCRUNTIME_DIR at a newer runtime.'
      )
    }
    return { file, name: available.get(name), version }
  })

  for (const dir of dirs) {
    for (const source of sources) fs.copyFileSync(source.file, path.join(dir, source.name))
  }
  const oldest = sources.reduce((v, s) => (compareVersions(s.version, v) < 0 ? s.version : v), sources[0].version)
  return { dlls: sources.map((s) => s.name), version: oldest.join('.') }
}

/** The hook itself. `findRuntime` is a seam for the tests; electron-builder passes only the context. */
export async function afterPack(context, { findRuntime = findRuntimeDir } = {}) {
  if (context.electronPlatformName !== 'win32') return
  const root = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '@node-llama-cpp')
  const scan = scanLlamaBinaries(root)
  // A node-llama-cpp that links the runtime statically would need none.
  if (scan.needed.length === 0) {
    console.log('  • the llama.cpp binaries import no Visual C++ runtime; nothing to bundle')
    return
  }
  const source = findRuntime()
  if (!source) {
    throw new Error(
      `No Visual C++ runtime to bundle with the llama.cpp binaries, which import ${scan.needed.join(', ')}. ` +
        'Install Visual Studio or its Build Tools with the C++ workload, or set WHETPROMPT_VCRUNTIME_DIR ' +
        'to a folder that holds them (docs/RELEASING.md).'
    )
  }
  const done = copyVcRuntime(scan, source.dir)
  console.log(
    `  • bundled the Visual C++ runtime ${done.version} (${done.dlls.join(', ')}) next to ` +
      `${scan.dirs.length} llama.cpp binaries  needs=${scan.required.join('.')}+ from=${source.from} dir=${source.dir}`
  )
}
