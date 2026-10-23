/**
 * The afterPack hook that ships the Visual C++ runtime with the llama.cpp
 * binaries. The binaries and the runtime are synthetic PE files built here, so
 * this needs neither Visual Studio nor a real build; the last test reads the
 * real addons when node-llama-cpp's Windows packages are installed.
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  afterPack,
  bufferReader,
  compareVersions,
  copyVcRuntime,
  fileVersion,
  findRuntimeDir,
  MIN_RUNTIME,
  readPe,
  scanLlamaBinaries,
} from './bundle-vcruntime.js'

const AMD64 = 0x8664
const I386 = 0x14c

/**
 * The smallest PE32+ file readPe() accepts: the headers, then one section
 * holding the import directory, the DLL names and, when given a `version`, a
 * VS_FIXEDFILEINFO.
 */
function pe({ machine = AMD64, linker = [14, 0], imports = [], version } = {}) {
  const SECTION_VA = 0x1000
  const SECTION_RAW = 0x200
  const descriptors = imports.length ? (imports.length + 1) * 20 : 0
  const names = imports.map((name) => Buffer.from(`${name}\0`, 'latin1'))
  const namesLength = names.reduce((n, b) => n + b.length, 0)
  const section = Buffer.alloc(descriptors + namesLength + (version ? 16 : 0))
  let at = descriptors
  names.forEach((name, i) => {
    section.writeUInt32LE(SECTION_VA + at, i * 20 + 12)
    name.copy(section, at)
    at += name.length
  })
  if (version) {
    section.writeUInt32LE(0xfeef04bd, at)
    section.writeUInt32LE(0x00010000, at + 4)
    section.writeUInt32LE(((version[0] << 16) | version[1]) >>> 0, at + 8)
    section.writeUInt32LE(((version[2] << 16) | version[3]) >>> 0, at + 12)
  }

  const file = Buffer.alloc(SECTION_RAW + section.length)
  file.write('MZ', 0, 'latin1')
  file.writeUInt32LE(0x40, 0x3c)
  file.write('PE\0\0', 0x40, 'latin1')
  file.writeUInt16LE(machine, 0x44)
  file.writeUInt16LE(1, 0x46) // one section
  file.writeUInt16LE(240, 0x54) // the size of a PE32+ optional header
  const optional = 0x58
  file.writeUInt16LE(0x20b, optional)
  file[optional + 2] = linker[0]
  file[optional + 3] = linker[1]
  if (imports.length) file.writeUInt32LE(SECTION_VA, optional + 112 + 8)
  const header = optional + 240
  file.writeUInt32LE(section.length, header + 8)
  file.writeUInt32LE(SECTION_VA, header + 12)
  file.writeUInt32LE(section.length, header + 16)
  file.writeUInt32LE(SECTION_RAW, header + 20)
  section.copy(file, SECTION_RAW)
  return file
}

const CRT = ['KERNEL32.dll', 'MSVCP140.dll', 'VCRUNTIME140.dll', 'api-ms-win-crt-runtime-l1-1-0.dll']
const RUNTIME = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']

/**
 * A packed Windows app shaped like 0.4.0's, with node-llama-cpp 3.20's three
 * addon folders and the CUDA fallback that has no addon, plus a runtime folder
 * holding more than the binaries import.
 */
function fixture({ runtime = [14, 44, 35112, 1], runtimeMachine = AMD64, cudaLinker = [14, 44], imports = CRT } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-vcrt-'))
  const appOutDir = path.join(tmp, 'win-unpacked')
  const root = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '@node-llama-cpp')
  const put = (rel, content) => {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  put('win-x64/package.json', '{}')
  put('win-x64/bins/win-x64/llama-addon.node', pe({ imports: ['llama-common.dll', ...imports, 'NODE.EXE'] }))
  put('win-x64/bins/win-x64/llama-common.dll', pe({ imports: imports === CRT ? [...CRT, 'VCRUNTIME140_1.dll'] : imports }))
  put('win-x64-cuda/bins/win-x64-cuda/llama-addon.node', pe({ linker: cudaLinker, imports }))
  put('win-x64-cuda-ext/bins/win-x64-cuda/fallback/ggml-cuda.dll', pe({ imports }))

  const src = path.join(tmp, 'crt')
  fs.mkdirSync(src)
  for (const name of [...RUNTIME, 'msvcp140_1.dll', 'concrt140.dll']) {
    fs.writeFileSync(path.join(src, name), pe({ machine: runtimeMachine, version: runtime }))
  }
  return {
    tmp,
    appOutDir,
    root,
    src,
    cpu: path.join(root, 'win-x64', 'bins', 'win-x64'),
    cuda: path.join(root, 'win-x64-cuda', 'bins', 'win-x64-cuda'),
    fallback: path.join(root, 'win-x64-cuda-ext', 'bins', 'win-x64-cuda', 'fallback'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  }
}

// --- reading PE files ------------------------------------------------------------

test('readPe() reads the machine, the linker version and the imported DLLs', () => {
  const info = readPe(bufferReader(pe({ linker: [14, 44], imports: ['KERNEL32.dll', 'MSVCP140.dll'] })))
  assert.deepEqual(info, { machine: AMD64, linker: [14, 44], imports: ['KERNEL32.dll', 'MSVCP140.dll'] })
  assert.deepEqual(readPe(bufferReader(pe({ machine: I386 }))).imports, [], 'no import table, no imports')
})

test('readPe() refuses what is not a PE file', () => {
  for (const bytes of [Buffer.alloc(10), Buffer.from('\x7fELF'.padEnd(128, '\0'), 'latin1'), Buffer.from('#!/bin/sh\n'.padEnd(128))]) {
    assert.throws(() => readPe(bufferReader(bytes)), /not a PE file/)
  }
})

test('fileVersion() reads VS_FIXEDFILEINFO, and not four bytes that merely look like it', () => {
  assert.deepEqual(fileVersion(pe({ version: [14, 44, 35112, 1] })), [14, 44, 35112, 1])
  assert.equal(fileVersion(pe()), null)
  const stray = Buffer.concat([pe(), Buffer.from([0xbd, 0x04, 0xef, 0xfe, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8])])
  assert.equal(fileVersion(stray), null, 'the signature without structure version 1.0 after it')
})

test('compareVersions() compares numbers, not strings, and pads with zeros', () => {
  assert.equal(compareVersions([14, 44, 35112, 1], [14, 44]), 1)
  assert.equal(compareVersions([14, 40], [14, 40, 0, 0]), 0)
  assert.equal(compareVersions([14, 9], [14, 40]), -1)
})

// --- what the binaries need --------------------------------------------------------

test('scanLlamaBinaries() finds the addon folders, every runtime DLL imported, and the oldest runtime allowed', () => {
  const f = fixture()
  try {
    const scan = scanLlamaBinaries(f.root)
    assert.deepEqual(scan.dirs, [f.cpu, f.cuda].sort())
    assert.deepEqual(scan.needed, RUNTIME, 'vcruntime140_1.dll is imported by llama-common.dll alone')
    assert.deepEqual(scan.required, [14, 44], 'the CUDA addon was linked by MSVC 14.44')
  } finally {
    f.cleanup()
  }
})

test('scanLlamaBinaries() never asks for a runtime older than MIN_RUNTIME', () => {
  const f = fixture({ cudaLinker: [14, 0] }) // what lld writes, whatever built the file
  try {
    assert.deepEqual(scanLlamaBinaries(f.root).required, MIN_RUNTIME)
  } finally {
    f.cleanup()
  }
})

// --- copying -----------------------------------------------------------------------

test('copyVcRuntime() puts exactly the imported DLLs next to every llama-addon.node', () => {
  const f = fixture()
  try {
    const done = copyVcRuntime(scanLlamaBinaries(f.root), f.src)
    assert.deepEqual(done, { dlls: RUNTIME, version: '14.44.35112.1' })
    for (const dir of [f.cpu, f.cuda]) {
      for (const dll of RUNTIME) {
        assert.deepEqual(fs.readFileSync(path.join(dir, dll)), fs.readFileSync(path.join(f.src, dll)), `${dll} in ${dir}`)
      }
      assert.equal(fs.existsSync(path.join(dir, 'msvcp140_1.dll')), false, 'nothing the binaries do not import')
    }
    assert.equal(
      fs.existsSync(path.join(f.fallback, 'msvcp140.dll')),
      false,
      'no addon there: that backend reuses what its addon already loaded'
    )
  } finally {
    f.cleanup()
  }
})

test('copyVcRuntime() refuses a runtime older than the binaries need, and copies nothing', () => {
  const f = fixture({ runtime: [14, 42, 34433, 0] })
  try {
    assert.throws(() => copyVcRuntime(scanLlamaBinaries(f.root), f.src), /14\.42\.34433\.0, and the llama\.cpp binaries need 14\.44 or newer/)
    assert.equal(fs.existsSync(path.join(f.cpu, 'msvcp140.dll')), false)
  } finally {
    f.cleanup()
  }
  const g = fixture({ runtime: [14, 38, 33135, 0], cudaLinker: [14, 0] })
  try {
    assert.throws(() => copyVcRuntime(scanLlamaBinaries(g.root), g.src), /need 14\.40 or newer/, 'even where lld linked everything')
  } finally {
    g.cleanup()
  }
})

test('copyVcRuntime() refuses an x86 runtime, a DLL that is not there and a folder that is not there', () => {
  const x86 = fixture({ runtimeMachine: I386 })
  try {
    assert.throws(() => copyVcRuntime(scanLlamaBinaries(x86.root), x86.src), /is not an x64 DLL/)
  } finally {
    x86.cleanup()
  }
  const f = fixture()
  try {
    const scan = scanLlamaBinaries(f.root)
    assert.throws(() => copyVcRuntime(scan, path.join(f.tmp, 'nowhere')), /does not exist/)
    fs.rmSync(path.join(f.src, 'vcruntime140_1.dll'))
    assert.throws(() => copyVcRuntime(scan, f.src), /vcruntime140_1\.dll is not in .*, and the llama\.cpp binaries import it/)
    assert.equal(fs.existsSync(path.join(f.cpu, 'msvcp140.dll')), false, 'a refusal copies nothing')
  } finally {
    f.cleanup()
  }
})

// --- where the runtime comes from ----------------------------------------------------

/** A file system of folders and what they list, for findRuntimeDir(). */
function folders(tree) {
  return { exists: (dir) => dir in tree, list: (dir) => tree[dir] ?? [] }
}

const VS2022 = path.join('C:', 'VS', '2022')
const VS2026 = path.join('C:', 'VS', '2026')
const msvc = (install, ...rest) => path.join(install, 'VC', 'Redist', 'MSVC', ...rest)

test('findRuntimeDir() takes WHETPROMPT_VCRUNTIME_DIR before anything else', () => {
  const found = findRuntimeDir({
    env: { WHETPROMPT_VCRUNTIME_DIR: 'D:\\crt', VCToolsRedistDir: msvc(VS2022, '14.44.35112') },
    ...folders({}),
    installs: () => assert.fail('Visual Studio is not asked'),
  })
  assert.deepEqual(found, { dir: 'D:\\crt', from: 'WHETPROMPT_VCRUNTIME_DIR' })
})

test("findRuntimeDir() takes a developer prompt's VCToolsRedistDir next, newest CRT folder first", () => {
  const found = findRuntimeDir({
    env: { VCToolsRedistDir: msvc(VS2022, '14.44.35112') },
    ...folders({
      [msvc(VS2022, '14.44.35112', 'x64')]: ['Microsoft.VC142.CRT', 'Microsoft.VC143.CRT', 'Microsoft.VC143.OpenMP'],
    }),
    installs: () => [],
  })
  assert.deepEqual(found, { dir: msvc(VS2022, '14.44.35112', 'x64', 'Microsoft.VC143.CRT'), from: 'VCToolsRedistDir' })
})

test('findRuntimeDir() otherwise takes the newest redist of any Visual Studio, and null when there is none', () => {
  const tree = {
    [msvc(VS2022)]: ['14.29.30133', '14.44.35112', 'v143'],
    [msvc(VS2022, '14.29.30133', 'x64')]: ['Microsoft.VC142.CRT'],
    [msvc(VS2022, '14.44.35112', 'x64')]: ['Microsoft.VC143.CRT'],
    [msvc(VS2026)]: ['14.50.35717'],
    [msvc(VS2026, '14.50.35717', 'x64')]: ['Microsoft.VC145.CRT'],
  }
  assert.deepEqual(findRuntimeDir({ env: {}, ...folders(tree), installs: () => [VS2022, VS2026] }), {
    dir: msvc(VS2026, '14.50.35717', 'x64', 'Microsoft.VC145.CRT'),
    from: 'Visual Studio',
  })
  assert.deepEqual(findRuntimeDir({ env: {}, ...folders(tree), installs: () => [VS2022] }).dir, msvc(VS2022, '14.44.35112', 'x64', 'Microsoft.VC143.CRT'))
  assert.equal(findRuntimeDir({ env: {}, ...folders({}), installs: () => [VS2022] }), null)
  assert.equal(findRuntimeDir({ env: {}, ...folders(tree), installs: () => [] }), null)
})

// --- the hook ----------------------------------------------------------------------

/** Run `fn` with console.log captured, so the hook's line can be read instead of printed. */
async function captureLog(fn) {
  const lines = []
  const log = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.log = log
  }
  return lines
}

test('afterPack() leaves a macOS or a Linux build alone', async () => {
  for (const electronPlatformName of ['darwin', 'linux']) {
    await afterPack({ electronPlatformName, appOutDir: path.join(os.tmpdir(), 'nowhere') }, { findRuntime: () => assert.fail(electronPlatformName) })
  }
})

test('afterPack() bundles the runtime into a Windows build and says which', async () => {
  const f = fixture()
  try {
    const lines = await captureLog(() =>
      afterPack({ electronPlatformName: 'win32', appOutDir: f.appOutDir }, { findRuntime: () => ({ dir: f.src, from: 'a test' }) })
    )
    for (const dir of [f.cpu, f.cuda]) assert.ok(fs.existsSync(path.join(dir, 'vcruntime140_1.dll')), dir)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /bundled the Visual C\+\+ runtime 14\.44\.35112\.1 \(msvcp140\.dll, vcruntime140\.dll, vcruntime140_1\.dll\) next to 2 llama\.cpp binaries/)
    assert.match(lines[0], /needs=14\.44\+ from=a test/)
  } finally {
    f.cleanup()
  }
})

test('afterPack() fails a Windows build it has no runtime for, and says how to give it one', async () => {
  const f = fixture()
  try {
    await assert.rejects(
      afterPack({ electronPlatformName: 'win32', appOutDir: f.appOutDir }, { findRuntime: () => null }),
      /No Visual C\+\+ runtime to bundle .*msvcp140\.dll, vcruntime140\.dll, vcruntime140_1\.dll.*WHETPROMPT_VCRUNTIME_DIR/
    )
  } finally {
    f.cleanup()
  }
})

test('afterPack() needs no runtime for binaries that import none', async () => {
  const f = fixture({ imports: ['KERNEL32.dll'] })
  try {
    const lines = await captureLog(() =>
      afterPack({ electronPlatformName: 'win32', appOutDir: f.appOutDir }, { findRuntime: () => assert.fail('not asked') })
    )
    assert.deepEqual(lines, ['  • the llama.cpp binaries import no Visual C++ runtime; nothing to bundle'])
  } finally {
    f.cleanup()
  }
})

// --- the real binaries ---------------------------------------------------------------

const INSTALLED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@node-llama-cpp')
const ADDONS = ['win-x64/bins/win-x64', 'win-x64-vulkan/bins/win-x64-vulkan', 'win-x64-cuda/bins/win-x64-cuda']
  .map((dir) => path.join(INSTALLED, dir, 'llama-addon.node'))
  .filter((file) => fs.existsSync(file))

test(
  "node-llama-cpp's own Windows addons need the runtime this hook ships",
  { skip: ADDONS.length === 0 && "node-llama-cpp's Windows packages are not installed" },
  () => {
    for (const file of ADDONS) {
      const info = readPe(bufferReader(fs.readFileSync(file)))
      assert.equal(info.machine, AMD64, file)
      const imports = info.imports.map((name) => name.toLowerCase())
      for (const dll of ['msvcp140.dll', 'vcruntime140.dll']) assert.ok(imports.includes(dll), `${file} imports ${dll}`)
    }
  }
)
