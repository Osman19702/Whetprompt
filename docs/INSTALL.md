# Installing Whetprompt

Windows is first; [macOS](#macos) is further down.

## Windows

Whetprompt is a desktop app. You download one file, run it, and it works — there is nothing to
install first, no Node.js, no command line, no account.

### Requirements

- Windows 10 or 11, 64-bit
- About 3.5 GB of free disk space (the app is ~350 MB; the language model it downloads on first run
  is 2.5 GB)
- 8 GB of RAM, or 4 GB with the smaller "lite" model. A GPU is used automatically if you have one
  (NVIDIA, AMD or Intel); without one it still works, more slowly.

### Install

1. Download **Whetprompt-0.7.0-win-x64.exe**: press **Download** on
   [www.whetprompt.com](https://www.whetprompt.com/), or take it from
   the [v0.7.0 release page](https://github.com/Osman19702/Whetprompt/releases/tag/v0.7.0) or the
   download button on [osmanturalioglu.com](https://www.osmanturalioglu.com/).
2. Double-click it. Windows may show a blue **"Windows protected your PC"** screen because the
   installer is not yet code-signed. Click **More info**, then **Run anyway**. (To check the file
   first, compare its SHA-256 with the line in `SHA256SUMS.txt` on the same release page. In
   PowerShell: `(Get-FileHash .\Whetprompt-0.7.0-win-x64.exe).Hash.ToLower()`, which for 0.7.0
   must print `c11bff46a8298a16cb26ea1b9c307e0327e3be82f1fe2994b137575bf8319e41`.)
3. Choose an install folder or accept the default, and finish. Whetprompt opens by itself and adds a
   Start menu entry.

### First run

The app opens on an empty editor. Linting and scoring work immediately: paste any prompt and you
will see a score and a list of findings as you type, with nothing sent anywhere.

To use **Fix prompt**, the app needs its language model once:

1. In the top-right provider selector, **Local model** is already chosen.
2. The results pane shows **"Download the local model"** with the size (2.5 GB). Click **Download**.
   You can keep using the linter while it runs, and you can pause and resume; it survives a restart.
3. When it finishes, the model loads (about 15 seconds the first time) and **Fix prompt** becomes
   available. From here on the app works with no internet connection at all.

If your machine has less than 8 GB of RAM, pick the **lite** model in the tier selector next to the
provider before downloading — it is 1 GB and runs on anything.

### Where your data lives

- Your saved prompts (the Library): `%APPDATA%\Whetprompt\data\library.json`
- The downloaded model: `%USERPROFILE%\.whetprompt\models\`, or `%USERPROFILE%\.promptfixer\models\`
  when PromptFixer downloaded it (see below)

Both survive uninstalling and reinstalling the app. Use **Library → Export** to move your prompts to
another machine and **Import** to merge them back; nothing you already have is ever overwritten.

### Upgrading from PromptFixer

Whetprompt is PromptFixer renamed, from 0.5.0 on. Install it over PromptFixer as you would any new
version: the installer removes the old app first, so there is one in the Start menu afterwards.
On the page that asks where to install, it suggests the folder PromptFixer was in and would put
Whetprompt in a folder inside it (`C:\Program Files\PromptFixer\Whetprompt`); choose
`C:\Program Files` instead and it installs into `C:\Program Files\Whetprompt`. Nothing else needs
doing:

- **The library and your `.env`** are copied from `%APPDATA%\PromptFixer\` to
  `%APPDATA%\Whetprompt\` the first time Whetprompt starts. Copied, not moved: the old folder is
  left as it was, and can be deleted once you have seen your prompts in Whetprompt.
- **The model** stays where PromptFixer downloaded it, `%USERPROFILE%\.promptfixer\models\`, and
  Whetprompt uses it from there, so nothing is downloaded again.
- **Settings in `.env`** keep working under their old names (`PROMPTFIXER_MODEL` and the rest);
  the new names are `WHETPROMPT_*`, and a new name wins when both are set.
- **Prompt files** for `npm run lint:prompts` may keep `<!-- promptfixer: intent=… -->` as their
  first line; `<!-- whetprompt: intent=… -->` is the new spelling.

### The Microsoft Store version

From 0.6.0, Whetprompt is also [in the Microsoft Store](https://apps.microsoft.com/detail/9P750H35HR59). It is the same app as the
download above, built in the same run from the same release, but the Store installs and updates it,
and it opens without the "Windows protected your PC" screen. It is free to try for 30 days, then a
one-off purchase (£0.79 in the UK; the Store shows the price in your currency). After a trial that
ends unbought it no longer opens, so export your library first if you decide against it. Windows gives a Store app storage of its own, and
that is the one difference to know about:

- **On a PC that never had Whetprompt**, the Store version keeps its library, its settings and the
  model it downloads in that storage. The app sees them as `%APPDATA%\Whetprompt\` and
  `%LOCALAPPDATA%\Whetprompt\models\`; in File Explorer they are under
  `%LOCALAPPDATA%\Packages\TuralioLabs.Whetprompt_7a4rf7jk3z6yp\LocalCache\`. **Uninstalling it
  removes them**, so export your library first (**Library → Export**) to keep your prompts.
- **On a PC that already has the download version**, the Store version uses what is there: the
  library and settings in `%APPDATA%\Whetprompt\`, and the model wherever the download version or
  PromptFixer put it. Both versions then share them, and uninstalling the Store version leaves
  them where they are. PromptFixer's library is copied into the Store version's own storage the
  first time it starts, as the download version copies it into its folder.
- **Cloud provider keys** go in a `.env` file as described below, in the folder the Store version
  uses: `%APPDATA%\Whetprompt\` when it shares the download version's, and otherwise
  `%LOCALAPPDATA%\Packages\TuralioLabs.Whetprompt_7a4rf7jk3z6yp\LocalCache\Roaming\whetprompt\`.
  From 0.7.0, **Settings** writes that file for you.

Both versions can be installed at once; they are then two entries called Whetprompt in the Start
menu. To move to the Store version, install it, check that your library is there, and uninstall
the download version: its library and model stay behind, and the Store version goes on using them.

### Optional: cloud providers

If you would rather use Claude, OpenAI, Gemini or OpenRouter, you need an API key from that
provider. From 0.7.0, press **Settings** in the top bar, paste the key next to the
provider and press **Save key**: the provider is ready at once, and **Test** asks it whether it
accepts the key. Settings saves the key in the `.env` file described next, and never shows it again.

Up to 0.6.0, create that file yourself: a text file named `.env` in `%APPDATA%\Whetprompt\`
containing your key, for example `ANTHROPIC_API_KEY=sk-ant-…`, then restart the app. The provider
appears in the selector. Ollama needs no key. Keys stay on your machine; the app never displays
them.

### Uninstall

Settings → Apps → Whetprompt → Uninstall. This removes the app only; your library and the model
are left in place. Delete the two folders above if you want them gone too. What uninstalling the
Store version removes is in [The Microsoft Store version](#the-microsoft-store-version).

### Trouble?

- **"Prompt is too long for the local model"** — the local model has an 8k-token context. Shorten
  the prompt or use a cloud provider for that one.
- **Slow fixes (over a minute)** — you are probably on CPU. Check the chip under the editor after the
  first fix: it names the backend. Switch to the lite model, or add a cloud provider.
- **The download stopped** — click Download again; it resumes where it left off.
- **"Local model problem" with `NoBinaryFoundError`** — PromptFixer 0.4.0 needs Microsoft's
  Visual C++ Redistributable, which a freshly installed Windows does not have. Install it from
  Microsoft, [aka.ms/vc14/vc_redist.x64.exe](https://aka.ms/vc14/vc_redist.x64.exe), then press
  **Retry**; the app does not need a restart. Versions after 0.4.0 bring their own copy, and when
  the model cannot start they say why.
- **Is there a newer version, and what changed?** — The website,
  [www.whetprompt.com](https://www.whetprompt.com/), has the latest
  download and the notes of every release; from 0.4.0, **What's new** in the app's top bar opens
  it. The app never checks for updates by itself.

## macOS

There is no macOS build of Whetprompt yet. The newest is 0.4.0, from before the rename, so the disk
images, the app and its folders below are all called PromptFixer, and it is 0.4.0 without the fixes
of 0.5.0 and later. When Whetprompt comes to macOS, it will take over PromptFixer's library and model the
way the Windows version does.

The macOS build is a disk image. There is one for each kind of Mac, and the wrong one still runs
(an Intel build on Apple Silicon goes through Rosetta, slowly), so pick the right one:

- **[PromptFixer-0.4.0-mac-arm64.dmg](https://github.com/Osman19702/Whetprompt/releases/download/v0.4.0/PromptFixer-0.4.0-mac-arm64.dmg)** (138.9 MiB) for Apple Silicon
  (M1 and later). The model runs on the GPU through Metal.
- **[PromptFixer-0.4.0-mac-x64.dmg](https://github.com/Osman19702/Whetprompt/releases/download/v0.4.0/PromptFixer-0.4.0-mac-x64.dmg)** (144.1 MiB) for an Intel Mac. The
  model runs on the CPU; expect a fix to take a minute or two, and consider the **lite** model.

Apple menu → **About This Mac** says which you have. Both are on the
[v0.4.0 release page](https://github.com/Osman19702/Whetprompt/releases/tag/v0.4.0) and on
[www.whetprompt.com](https://www.whetprompt.com/).

### Requirements

- macOS 13 (Ventura) or later
- About 3 GB of free disk space (the app is ~300 MB; the language model it downloads on first run
  is 2.5 GB)
- 8 GB of memory, or 4 GB with the smaller "lite" model

### Install

1. Open the `.dmg` and drag **PromptFixer** onto the **Applications** folder shown next to it.
2. Open PromptFixer from Applications. The first time, macOS refuses: the app is not notarized
   with Apple (it is signed only with an ad-hoc signature, which is what makes it launch at all on
   Apple Silicon), so Gatekeeper says **"Apple could not verify PromptFixer is free of malware"**
   and offers only *Done*. Click *Done*, open **System Settings → Privacy & Security**, scroll
   down to the line that says PromptFixer was blocked and click **Open Anyway**, then confirm.
   This happens once. The same thing from a terminal, if you prefer it:

   ```bash
   xattr -d com.apple.quarantine /Applications/PromptFixer.app
   ```

   To check the file before trusting it, compare its SHA-256 with the line in `SHA256SUMS.txt`
   on the release page: `shasum -a 256 ~/Downloads/PromptFixer-0.4.0-mac-arm64.dmg`. For 0.4.0 the
   Apple Silicon image is `5950705c72d5e19e6b2abd7d8d334db50dabcee3c595b3248488303c814c17fa` and the
   Intel image `6a5d3963ee807391be127626bee786bddf24a403a65de8546bf4feb4e7ea4b0c`.
3. Eject the disk image. The app is in Applications; the `.dmg` can go.

### First run

The same as on Windows: paste a prompt and it is scored immediately, and **Fix prompt** needs the
model downloaded once (**Download** in the results pane, 2.5 GB, resumable). After that the app
works with no internet connection.

### Where your data lives

- Your saved prompts (the Library): `~/Library/Application Support/PromptFixer/data/library.json`
- The downloaded model: `~/.promptfixer/models/`
- Optional cloud keys: a text file named `.env` in `~/Library/Application Support/PromptFixer/`,
  for example `ANTHROPIC_API_KEY=sk-ant-…`; restart the app and the provider appears in the
  selector.

All three survive deleting and reinstalling the app, and they are where a macOS Whetprompt will look
for them.

### Uninstall

Drag PromptFixer out of Applications into the Trash. Your library and the model stay where they
are; delete the two folders above if you want them gone too.
