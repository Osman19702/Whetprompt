# Changelog

All notable changes to Whetprompt, called PromptFixer until 0.5.0, are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). How a release is cut, and what counts as a patch, a
minor or a breaking change while the version starts with 0, is in
[docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

## [0.5.0] - 2026-10-23

### Added

- **A macOS build.** `npm run dist:mac` writes two disk images into `release/`,
  `Whetprompt-<version>-mac-arm64.dmg` for Apple Silicon and `Whetprompt-<version>-mac-x64.dmg`
  for Intel, both from one machine of either kind. The app is signed with an ad-hoc signature
  (there is no Apple Developer ID yet, and without any signature it would not start on Apple
  Silicon) and not notarized, so the first launch goes through **System Settings → Privacy &
  Security → Open Anyway**; [docs/INSTALL.md](docs/INSTALL.md#macos) walks through it. macOS 13
  or later, which is what Electron 44 asks for. On Apple Silicon the model runs on the GPU
  through Metal; on an Intel Mac it runs on the CPU. The Release workflow still builds Windows
  only; a macOS image is built and attached by hand (docs/RELEASING.md). The 0.4.0 images were
  built this way on 2026-10-16 and added to the v0.4.0 release, with `SHA256SUMS.txt` there
  extended to list them; the README, [docs/INSTALL.md](docs/INSTALL.md#macos) and
  [docs/releases/v0.4.0.md](docs/releases/v0.4.0.md) quote their sizes and hashes.
- **The website offers the macOS images next to the Windows installer.** `site/releases.json`
  gains a `mac` field per release, `{ arm64, x64 }`, each with the same name, link, size, hash
  and `SHA256SUMS.txt` link as the installer or null when the release has no such image
  (`scripts/site-releases.mjs`, with tests); a release's checksum file is now fetched when it
  has any download, not only an installer. The download card shows a macOS section with both
  images, the hero names them under the Windows button, the release list links every file a
  release has, and "Before you run it" gives the `shasum` command and the Gatekeeper steps. A
  release without an image, which is every one before 0.4.0, looks as it did.

### Changed

- **PromptFixer is now Whetprompt.** The app and its window, the installer
  (`Whetprompt-<version>-win-x64.exe`), the Start menu entry, the website
  (<https://osman19702.github.io/Whetprompt/>), the repository
  (<https://github.com/Osman19702/Whetprompt>), the package name, a library export
  (`whetprompt-library-<date>.json`), the configuration variables (`WHETPROMPT_*`) and the data
  folders (`%APPDATA%\Whetprompt`, `~/.whetprompt/models`) all carry the new name. Nothing a
  PromptFixer user has stops working:
  - The installer replaces PromptFixer instead of installing beside it: `nsis.guid` in
    `package.json` keeps PromptFixer's uninstall ID. Its folder page suggests the folder
    PromptFixer was in, and puts the app in a `Whetprompt` folder inside any folder that is not
    already one, so the default after an upgrade is `C:\Program Files\PromptFixer\Whetprompt`;
    choose `C:\Program Files` there for `C:\Program Files\Whetprompt`.
  - The first start copies the library and `.env` from PromptFixer's user-data folder
    (`electron/migrate.js`, with tests). They are copied, not moved, so a PromptFixer that is
    still installed keeps its own, and nothing Whetprompt already has is written over.
  - A model PromptFixer downloaded into `~/.promptfixer/models` is used from there, not
    downloaded again (`defaultModelDir()` in `server/models.js`).
  - `PROMPTFIXER_*` variables are read under their `WHETPROMPT_*` names, a new name winning when
    both are set (`server/legacy-env.js`); `<!-- promptfixer: intent=… -->` still sets a prompt
    file's intent; and preferences or a draft the browser kept under the old keys are read when
    there is nothing under the new ones.
  - The releases published as PromptFixer keep their file names, and the website and
    `npm run release:checksums` recognise both names.

  What does not follow is the old website address: GitHub does not redirect a project site once
  its repository is renamed, so osman19702.github.io/PromptFixer stops answering, and with it
  **What's new** in PromptFixer 0.4.0 and earlier. The repository's own addresses, downloads
  included, are redirected.
- **The local model stays loaded until the app quits, as it did before 0.3.0.** Since 0.3.0 it
  was released after 15 minutes with nothing to do, and the next fix waited for the whole load
  again, about 40 s on a laptop with integrated graphics, so a fix after a pause was much slower
  than in the builds before. `WHETPROMPT_IDLE_UNLOAD_MS` still releases it after that many
  milliseconds for whoever needs the memory back (`900000` for the old fifteen minutes).

### Deprecated

- The `PROMPTFIXER_*` environment variables and the `<!-- promptfixer: … -->` prompt-file
  comment, in favour of `WHETPROMPT_*` and `<!-- whetprompt: … -->`. Both still work; a later
  release will stop reading the old names.

### Removed

- **The models-on-disk row above the results.** Added in 0.3.0, it showed how much disk the
  downloaded models take and whether the model was in memory, and offered **Release model** and
  **Delete**. It stood on the main screen through every fix, its "loaded in memory" appeared when a
  fix started and read as the model being loaded again for each request, and **Release model**
  made the next fix load it again for real (about 40 s on a laptop with integrated graphics). Its
  own work was not the cost: the disk figures behind it take about 0.2 ms per status poll. Nothing
  else goes with it: a download that will not fit is still refused, and `POST /api/local/unload`
  and `DELETE /api/local/model/:tier` still do what the two buttons did.

### Fixed

- **The local model starts on a Windows machine that never had the Visual C++ runtime.** On a
  fresh Windows install, 0.4.0 opened as usual and then showed "Local model problem: Could not
  load the model: NoBinaryFoundError" for good. The prebuilt llama.cpp binaries import
  `MSVCP140.dll`, `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll` from Microsoft's Visual C++
  Redistributable, which Electron itself does not need, so on a machine without it every binary
  failed its start-up check and nothing said why. The installer now carries those DLLs next to
  each llama.cpp binary. `scripts/bundle-vcruntime.js`, an electron-builder `afterPack` hook with
  tests, reads which runtime DLLs the binaries import and copies them from Visual Studio's
  redistributable folder (the Release workflow's runner has one) or from the folder in
  `WHETPROMPT_VCRUNTIME_DIR`. It refuses an x86 copy, or one older than the binaries were built
  for (and never older than 14.40, below which they can crash), and a Windows build that finds
  none fails instead of writing an installer that only works where the runtime is installed
  already. Checked on such a machine: the packaged app loads the model and fixes a prompt.
- **A model that cannot start says why.** When none of the bundled llama.cpp binaries starts,
  node-llama-cpp's error is its own class name, `NoBinaryFoundError`, and that was the whole
  message. Now, when System32 lacks the Visual C++ runtime too (running from source on such a
  machine, say), the message names the missing DLLs and links to Microsoft's download; otherwise
  it says that no bundled build passed its start-up check (`server/vcruntime.js`, with tests).
  Retry works once the runtime is installed, without a restart. An `https://` address in the
  local model banner is a link.
- **Retry on the local model banner answers.** A retry that failed at once left the banner exactly
  as it was, with a toast as the only sign, so the button looked dead. It now says *Retrying…*
  while it waits, the banner follows the load, and the banner is redrawn from the server's answer;
  a failure the banner already explains gets a one-line toast instead of the same text twice.
- **The window fits the screen.** It opened 880 pixels tall whatever the screen, more than the 816
  that a 1080p display at 125% scaling leaves above the taskbar, so the bottom of the interface
  was under the taskbar: the Fix button, and every toast, the one a failed Retry showed included.
  The opening and minimum sizes are now clamped to the primary screen's work area
  (`fitToWorkArea` in `electron/handlers.js`, with tests).

## [0.4.0] - 2026-09-27

### Added

- **A website: <https://osman19702.github.io/PromptFixer/>.** What PromptFixer does, the latest
  installer with its size and SHA-256, and the notes of every release, newest first. The page is
  the `site/` folder, published by a Pages workflow (`.github/workflows/pages.yml`) that runs when
  a release is published and when `site/` changes on master. Before it uploads the page it runs
  `npm run site:releases` (`scripts/site-releases.mjs`), which writes the git-ignored
  `site/releases.json` from the GitHub Releases API — every published release with its installer,
  the installer's size, and its hash read from the release's own `SHA256SUMS.txt` — so the page
  cannot quote a number that is not on a release, and a fetch that fails keeps the previous
  deployment live rather than publishing an empty list. Once loaded, the page asks
  `api.github.com` once whether a newer release exists than the one it was built with, so a
  deployment that lagged behind a release still points at the newest one. It loads no fonts,
  scripts or analytics from anywhere else.
- **What's new** in the top bar opens that website in your own browser. `GET /api/config` gains
  `homepage`, read from `package.json` exactly as `version` is, and the interface shows the link
  only when it is an `https://` address. It is a link, not an update check: the app never requests
  the site, there is still no update check, and scenario F11 (nothing leaves the machine) still
  runs on every push. In the desktop app the link takes the same road as any other external
  address — the window stays ours and the system browser opens it — which `electron/handlers.js`
  now holds as `windowOpenGuard`, with tests. Acceptance scenario H15 covers the link.

### Changed

- `package.json` `homepage` is the website instead of the README.
- [docs/PRIVACY.md](docs/PRIVACY.md) names the link and says that clicking it is the only way the
  app's window reaches the site.

## [0.3.0] - 2026-09-21

### Added

- `npm run visual -- --against <ref>` compares the interface with a commit instead of with
  approved pictures: the ref is checked out into `.elastishot/against/<sha>`, built there and
  served by its own server, its screens become the pictures of that one run, and the working tree
  is compared with them. Nothing has to be approved or committed first, and your approved pictures
  are neither read nor written. A screen the ref cannot be driven to is reported as new; a ref no
  screen of which can be captured (v0.1.0, which predates the hooks the check drives the page by)
  is an error that says so.
- CI keeps its reports. A third job compares every screen of a pushed commit with the commit it
  was pushed onto (a pull request: its target branch) and keeps the Elastishot report as the
  `elastishot-report` artifact, with its table as the job's summary page; a difference does not
  fail that job, a comparison that could not be made does. The acceptance job keeps
  `docs/ATDD-RESULTS.pdf` as the run printed it (`acceptance-report`) and shows the traceability
  table as its summary page. Both are kept for 14 days whatever the run's outcome.

- **Every saved result records the build that produced it.** A library entry gains `appVersion`,
  and `GET /api/library/export` gains one for the file as a whole, beside the unchanged format
  `version`. The scoring rules change between releases, so a score that has moved since you saved
  it is either a rule change or a defect — and this is what tells them apart.
  It is never guessed. A save is written by this build and gets this version; an import keeps
  whatever the exporting build wrote, because that entry's provenance is not ours to restate; and
  an entry carrying no version — saved before the field existed, or imported from a build that did
  not write one — stays unknown, and the library drawer shows it as "version unknown" rather than
  claiming a build that never saw it. Re-saving an entry stamps it with the build that rewrote it,
  the same write `updatedAt` already describes.
- `server/version.js` is the single import for the running version. `server/index.js` and
  `server/store.js` both read it from there instead of parsing `package.json` themselves, so the
  version is still written down in exactly one place.

- The running version is shown in the interface, beside the app name, so a bug report can name
  the build it came from without going looking for it. `GET /api/config` gains `version`, read
  from `package.json` exactly as `GET /api/health` reads it, so the two cannot disagree and the
  version is still written down in only one place.

- **The rewrite appears as it is written.** `POST /api/fix` streams its progress when the request
  asks for it (`Accept: application/x-ndjson`): one JSON object per line, reporting each attempt,
  the rewrite as the model produces it, and finally the same result body the route returned before.
  A request without that header gets exactly the JSON object it always did. The rewrite is the
  first field the grammar emits, so it can be read out of a reply that is still arriving; the Fixed
  tab shows it as plain text while the fix runs, because the scores, the diff and the marks all
  need the finished result.
- **The spinner says which wait this is.** A line beside the Fix button names it: waiting for the
  job in front of it (only one model job runs at a time), loading the model, writing the rewrite,
  or the second attempt after a rewrite failed the quality check. That last one used to double the
  wait with nothing on screen to explain it.
- **The editor warns about an over-long prompt while you type.** `GET /api/local/status` reports
  `inputBudgetTokens`, the room the prompt has once the reply is reserved, so a prompt too big for
  the local model is flagged under the editor in under a second instead of being refused half a
  minute later, once the model has loaded and counted it. A warning, never a block: the estimate is
  four characters to the token and the real budget follows the context the model managed to load.
- **Real numbers on the load and the download.** Loading the model shows a progress bar instead of
  a bare spinner for about fifteen seconds, and the download shows its speed and how long is left
  next to the percentage.
- **The model is released when nobody is using it.** After fifteen minutes with nothing to do it is
  unloaded and the memory goes back, so the app can sit open next to a browser and a test runner on
  an 8 GB laptop; the next fix loads it again. **Release model** does it at once. Set
  `PROMPTFIXER_IDLE_UNLOAD_MS=0` to keep it loaded for ever.
- **A stalled local fix is stopped.** A generation that produces nothing for five minutes is ended
  rather than holding the single model queue for the rest of the session. It is a stall limit, not
  a stopwatch on the whole run: every chunk the model emits resets it, so a slow machine is never
  cut off mid-answer. Measured on a CPU-only machine, a first fix takes about 100 s and a "fix
  again" — which sends the whole previous rewrite back, and may be retried once — comfortably
  exceeds five minutes while working perfectly. `PROMPTFIXER_FIX_TIMEOUT_MS` changes the limit,
  `0` removes it.
- **Disk is checked before a download, and can be reclaimed from inside the app.** A 2.5 GB
  download that will not fit is refused in under a second, naming both numbers, instead of failing
  an hour in; free space that cannot be read never blocks a download. `DELETE
  /api/local/model/:tier` deletes a model and any part-finished download of it, and the row under
  the provider selectors shows what each tier occupies and offers to delete it — so trying all
  three tiers no longer means clearing 8.2 GB by hand from a hidden folder.

- **"Nothing leaves your machine" is now a test, not a claim.** Acceptance scenario F11 was the
  project's only manual charter: a person unplugging a network cable. It now runs on every push.
  The server is started under `acceptance/support/netwatch.mjs`, which intercepts outbound TCP
  (and so TLS, HTTP, HTTPS and `fetch`), UDP, and the whole `dns` resolution family, and records
  every destination that is not this machine. A full session — score, fix, save, list, export,
  import, and the same session again in a real browser — has to leave that record empty. The test
  proves the watcher works before trusting it, by making a deliberate call off the machine and
  asserting it was caught, and it fails if the session starts a child process, because a child's
  traffic is the one thing the watcher cannot see through. The browser half asserts the page
  requests nothing beyond its own origin, from the first request of the document load onwards,
  and blocks service workers outright.
- The watcher has its own regression suite, `server/netwatch.test.js`: seventeen checks, each one
  a way code reached the network past an earlier version of it. A port passed as a string rather
  than a number; `dns.resolve*`, which builds its socket in C++ and so never appears at the socket
  layer; an ESM `import { lookup } from 'node:dns'`, which binds to the unpatched function because
  a builtin's named exports freeze when the facade is first instantiated; `execSync`, which does
  not call the `spawnSync` export; a worker created with `execArgv: []`; a connected UDP socket,
  whose `send` names no address; a TLS tunnel whose destination exists only as `servername`; and a
  Windows UNC path, which carries bytes to another host with no socket to it. All were found by
  trying to break the watcher on purpose and all are now closed. The watcher is installed through
  `NODE_OPTIONS` rather than a command-line flag, because a worker and a spawned node child
  inherit the environment but not the flag.
- F11 refuses to vouch for a machine with a proxy variable set: a proxy on loopback makes every
  destination look like this machine, so a clean result there would mean nothing. The harness
  blanks the proxy variables for every server under test and the watcher reports any that survive.
- [docs/PRIVACY.md](docs/PRIVACY.md): one page naming every host the app can reach and when, where
  your prompts and library are stored, what F11 checks, and "What the test does not cover" —
  the page to hand to whoever approves software where you work.

### Changed

- **The app no longer builds its model engine from source.** `getLlama()` was called with the
  default `build: 'auto'`, which on a machine with no matching prebuilt binary resolves a release
  from GitHub, clones llama.cpp and may fetch a toolchain — real network traffic, unasked, from an
  app whose headline claim is that it makes none. It is now called with `build: 'never'` and
  `skipDownload: true`, so a missing binary is a clear error instead of a silent download. The
  installer ships the binary, so this only fires on a platform there is no build for.
- A fix is no longer a pure function of the prompt, and the documentation now says so. Up to two
  rewrites from your own library go to the model as examples, so the input changes as the library
  grows. "Repeatable runs" in the README says what to turn off before comparing or timing two runs.
- The error path of `POST /api/fix` finishes a streaming reply with an `error` event. The status
  line has already gone out as 200 by the time the model is called, so a failure that used to
  arrive as a status code now arrives as the last line of the stream.

## [0.2.0] - 2026-09-17

### Added

- **Fix again with your marks.** On the Fixed tab, select any passage of the rewrite and press
  **Keep it — I loved it** or **Change it — I didn't like it**. Kept passages are highlighted
  green and passages to change red, in the Diff tab's colours, and the bar counts them. **Fix
  again with my marks** sends the marked rewrite back to the model, which revises it instead of
  starting over. The prompt you wrote stays the yardstick, so the before score, the Diff tab and
  the strength guard measure every attempt against the same original and the scores stay
  comparable. Click a highlight to remove it (from the keyboard, Tab to it and press Enter or
  Space), mark it the other way to change your mind, or press **Clear marks**. Up to 20 passages
  of each kind can be marked. Marks belong to the one rewrite they were made on: a new fix or a
  step through the fix history drops them.
- The guard checks your marks the way it checks the strength. Every kept passage has to come back
  word for word, and every passage marked for change has to occur fewer times than it did in the
  marked rewrite. A rewrite that misses a mark is retried once with the missed passages quoted;
  if the retry misses one too, you get the attempt that ignored fewer marks, under a yellow **Did
  not follow all of your marks** warning that says how many. The What changed line of a refined
  result ends "refined with your marks (1 kept, 1 changed)" and counts only the marks the model
  followed. The README's "Rewrite strength, and the guard behind it" has the rules in full.
- For scripts that call the API: `POST /api/fix` takes an optional
  `feedback: { previous, keep, change }` — the rewrite that was marked, and the passages of it to
  keep and to change — while `prompt` stays the original. The response gains `meta.feedback`
  (`keep`, `change`, `missingKeep`, `unchangedChange`), present only when marks were applied, and
  `meta.warningKind` gains a fourth value, `feedback`. Marks are coerced rather than refused:
  passages that are not in `previous` are dropped, duplicates collapse, each list stops at 20
  passages and each passage at 2,000 characters. Only a `previous` over the 60,000-character
  prompt limit is refused (413). A request without `feedback`, or with nothing usable in it, is
  the same fix as in 0.1.0.
- Visual checks for contributors, with [Elastishot](https://github.com/Osman19702/elastishot).
  `npm run visual:approve` stores pictures of seven screens, each at two window sizes, as the
  approved look; `npm run visual` captures them again and fails on any difference, naming the
  element behind it. Both start the scripted stub provider and a throwaway server, so no key, no
  model and no network are needed. The approved pictures are per machine and git-ignored
  (`.elastishot/`), because fonts and antialiasing differ from one machine to the next; for the
  same reason the check is not part of `npm run test:all`. The screens are listed in
  `elastishot.config.mjs`.
- Acceptance Groups M (marking a rewrite and fixing it again, through the API and the browser)
  and N (the visual check, run through the real Elastishot command line). The suite went from 95
  scenarios to 113, of which 102 are automated.
- `scripts/capture-screenshot.mjs` reads `SHOT_PROMPT` (the prompt typed into the editor) and
  `SHOT_INTENT` (the Task type chosen for it), so the app screenshot can show any prompt, not
  only the blog-post sample.
- This changelog, the release checklist in [docs/RELEASING.md](docs/RELEASING.md), and a Release
  workflow that builds the Windows installer when a `v*.*.*` tag is pushed and attaches it, with
  `SHA256SUMS.txt`, to a draft GitHub release. `npm run check:release` is the gate in front of
  it: `package.json`, `package-lock.json` and this file have to name the same version, and no
  source file may repeat it. Started by hand, the same workflow is a rehearsal: it builds
  everything on the runner and creates no release.
- A CI workflow. Every push to any branch, and every pull request from a fork, runs the release
  check, the typecheck, the build and the unit and component tests in one job and the acceptance
  suite with the traceability check in another, both on a Windows runner.
- `scripts/capture-screenshot.mjs` also reads `SHOT_MARKS=1`: the rewrite is marked before the
  picture is taken — one passage kept, one to change, chosen from what the model returned and
  still in view — so the app screenshot can show the marks. `SHOT_KEEP` and `SHOT_CHANGE` name
  the passages instead.

### Changed

- `npm run test:acceptance` takes about four minutes instead of about eighty seconds: each of
  Group N's seven scenarios starts the Elastishot command line and a browser of its own.
- `GET /api/health` reports the version from `package.json` instead of a number written into the
  handler, so it cannot fall behind a release.
- When a fix fails, the error banner is scrolled into view. Pressed from the bottom of a long
  rewrite, a failure used to look like a dead button.
- The score panel, the issue list, the diff, the Library drawer and the date on a Library entry
  carry `data-testid` attributes, so the visual check can name them in a report and keep what
  varies between runs off the pictures.

### Fixed

- Saving to the library on Windows failed when another program — an indexer, antivirus, a backup
  tool — had `library.json` open at that instant, because Windows refuses to rename over an open
  file (`EPERM`, `EBUSY` or `EACCES`). The save now tries the rename again for about a second,
  which outlasts such a reader, and a save that still fails removes its temporary file instead
  of leaving it next to the library.
- The acceptance harness cleans up after a server that fails to start: the child process is
  stopped and its two temp folders are removed. A start that timed out used to leave the server
  running and the folders behind.

## [0.1.0] - 2026-09-11

First public release: a Windows x64 installer.

### Added

- The linter: a prompt is scored as you type against about 30 prompt-engineering rules, with the
  findings grouped by category and severity. It is deterministic and local; no model is involved.
- **Fix prompt** with a built-in local model (Qwen3-4B-Instruct-2507; a 1 GB `lite` tier and a
  4.7 GB `quality` tier are one setting away), so the app works offline and nothing you type
  leaves your machine. The model is downloaded once, resumably, from inside the app or with
  `npm run setup`. CUDA, Vulkan or Metal is picked automatically, with a CPU fallback, and the
  output is grammar-constrained to the result schema.
- Every rewrite is scored again with the same rules, next to a word-level diff and a change log
  that explains each edit.
- Three rewrite strengths (Light touch, Balanced, Full rebuild) and a guard behind them: the
  server checks how much of your vocabulary survived, how much was added, and whether the model
  pasted its own instructions into the output. A failed rewrite is retried once; if the retry
  fails too, you get the better attempt under a yellow warning.
- The Library: save a prompt with its rewrite (the 500 most recent are kept), export it to a
  JSON file and import one back, merged by id without overwriting anything. Each fix shows the
  model up to two of your saved rewrites that resemble the current prompt as examples of how
  much change you like (`options.fewShot: false` turns that off; `meta.examplesUsed` reports it).
- Eight built-in example prompts (also at `GET /api/examples`), a history of the last ten fixes
  with prev/next controls, and a one-shot **Undo** after **Apply**.
- Optional cloud providers: Anthropic, OpenAI, OpenRouter, Gemini, Ollama and any
  OpenAI-compatible endpoint, configured in a `.env` file. Keys stay on the server side and are
  never sent to the interface.
- Two ways to run it: the desktop app (Electron, with the server in-process on a free port and
  the library in the per-user data folder) and browser mode (`npm run dev`, `npm start`).
- `npm run lint:prompts`: the same rules over prompt files, for CI, with exit codes 0, 1 and 2.
- The Windows installer (NSIS, x64, about 355 MB because it ships prebuilt CPU, Vulkan and CUDA
  llama.cpp backends; the model is not bundled). It is not code-signed; `SHA256SUMS.txt`,
  written by `npm run release:checksums`, is attached to the release for checking the download.
- Tests in tiers: unit and component tests (`npm test`), 95 acceptance scenarios in Groups A–L
  that drive the API, the CLI, the browser and the Electron window
  (`npm run test:acceptance`), a traceability matrix (`npm run test:trace`) and a results report
  (`npm run test:report`).

[Unreleased]: https://github.com/Osman19702/Whetprompt/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Osman19702/Whetprompt/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Osman19702/Whetprompt/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Osman19702/Whetprompt/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Osman19702/Whetprompt/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Osman19702/Whetprompt/releases/tag/v0.1.0
