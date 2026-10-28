# The Microsoft Store listing

What goes into each page of a Whetprompt submission in Partner Center (**Apps and games →
Whetprompt**), written once here so that a submission is pasted rather than retyped, and so that a
later one starts from what the last one said. How a release gets its package is in
[RELEASING.md](RELEASING.md#microsoft-store).

| | |
| --- | --- |
| Product | Whetprompt, an MSIX app; Store ID `9P750H35HR59` |
| Store page | <https://apps.microsoft.com/detail/9P750H35HR59> |
| Developer account | Turalio Labs, an individual account |
| Package identity | `TuralioLabs.Whetprompt`, publisher `CN=2983B22E-31A1-4704-9688-153EBAC48AD9`, family name `TuralioLabs.Whetprompt_7a4rf7jk3z6yp` |
| Published | 0.6.0 on 25 October 2026 (submission 1), 0.7.0 on 28 October 2026 (submission 2) |

Store policies are quoted by number from version 7.20, current since 22 October 2026. Four of them
shape this listing:

- **11.16, live generative AI.** The listing must say that the app uses generative AI, the
  submission must declare it, and the app must let people report what the model wrote. The first
  sentence of the description says it, **Properties** declares it, and the Report link beside
  every rewrite is the way to report it.
- **10.2.4, dependencies.** Fix needs a model the app downloads on first use, and the cloud
  providers need the user's own key. A dependency like that belongs at the beginning of the
  description, so that is where both are.
- **10.5.1, privacy policy.** Every desktop app needs one, at a URL entered under **Properties**.
- **10.8.7, pricing.** A price only has to be lawful and not irrationally high; the rule against
  charging for open-source software was dropped in July 2022 (7.16.1). Whetprompt sells for
  £0.79 with a 30-day free trial, as decided on 23 October 2026, and its price can change in any
  later submission. Selling needs a tax profile and then a payout profile in Partner Center
  (**Account settings → Payout and tax profiles**, up to 48 hours to validate). Microsoft keeps
  15% of an app's price after VAT.
- **10.8.4, trials.** The listing must state the trial's terms, and warn in advance when a trial
  cuts off what the user made. Once a trial has ended unbought, Windows does not start the app and
  offers to buy it instead, so the library can no longer be opened in it. The description says so,
  and how to export the library first. The app has no licensing code of its own: Windows enforces
  the trial at launch, and an app that is open when the trial ends goes on until it is closed.

## Pricing and availability

- **Markets:** all markets.
- **Discoverability:** public, discoverable in the Store.
- **Pricing:** base price £0.79 (GBP, United Kingdom) for the Default market group, all 240
  markets, converted for the others (**Review price per market**). The page takes a price tier or
  a free-form price in a market's own currency. No sale.
- **Free trial:** Time-limited, 30 days, starting as soon as possible, never ending, offered to
  everyone.
- **Schedule:** as soon as the submission passes certification, unless a date is wanted.

## Properties

- **Category:** Developer tools. If a subcategory is asked for: Utilities.
- **Privacy policy URL:** <https://github.com/Osman19702/Whetprompt/blob/master/docs/PRIVACY.md>
- **Website:** <https://www.whetprompt.com/>, from submission 2 (0.7.0). Submission 1 (0.6.0) went
  in with the old address, https://osman19702.github.io/Whetprompt/, which redirects here.
- **Support contact info:** <https://github.com/Osman19702/Whetprompt/issues>
- **Personal information:** "Yes, my product uses personal information". Policy 10.5.1 counts
  every desktop app as having access to it, and the prompts people type can hold it. The privacy
  policy URL box appears after this answer.
- **Display mode:** neither PC nor HoloLens; that is for mixed-reality apps.
- **Product declarations:**
  - Ticked: "This product incorporates generative AI features", the policy 11.16 declaration;
    the notes for certification say it as well.
  - Ticked: customers can install the product to alternate drives (the default).
  - Not ticked: automatic backups of the product's data to OneDrive. The library holds what people
    type, and the privacy page says it stays on the PC.
  - Not ticked: recording and broadcasting clips, which the page says is for games only.
  - Not ticked: purchases outside the Store's commerce system (there are none), pen and ink, and
    tested for accessibility (H11 and H12 test the keyboard and the contrast, which is not a full
    accessibility review).
- **System requirements:** Memory, minimum 4 GB and recommended 8 GB. Keyboard and mouse ticked
  as recommended only: a minimum the device lacks shows customers a warning and stops them rating
  the app, and a tablet's on-screen keyboard works. Graphics stays empty: the app runs without a
  GPU, and a technical name there (Vulkan) reads like a requirement most buyers cannot judge. The
  description says in plain words that a graphics card makes a fix faster.

## Age ratings

The IARC questionnaire, answered for what the app does:

- It is not a game, and it is a productivity or developer tool.
- It has no violence, sexual content, profanity, drugs, gambling or scary content of its own.
- Users cannot talk to each other or share content with other users through the app, and it does
  not share the user's location.
- It sells nothing, and it shows no advertising.
- It does not give unrestricted access to the internet, as a web browser would.
- Where the questionnaire asks about generative AI or other content the app does not control:
  yes. The model writes text in reply to what the user types: a rewrite of the user's own prompt.

Policy 11.11.2 asks for the answers to be kept true: a release that changes any of them (a chat, a
way to share, a store of downloadable prompts) takes the questionnaire again.

The result, confirmed by IARC's Live Rating Notice of 23 October 2026: **IARC 3+**, Microsoft 3+,
PEGI 3, USK 0 and 0+ in Russia. Global Rating ID `e35a5bc9-48ed-8565-8740-3fb146a9c385`: another
storefront that uses IARC takes this ID instead of the questionnaire. Under IARC's terms (4 and 5)
an update keeps the rating unless it changes an answer above; one that does takes the
questionnaire again.

## Packages

Upload `Whetprompt-x.y.z-win-x64.appx`, from the Release workflow's artifact
`Whetprompt-vx.y.z-store`. Device family: Windows 10/11 Desktop. Nothing else is uploaded: the
package carries the manifest and its images, and the Store signs it.

On an update, as with submission 2 (0.7.0), Partner Center strikes through the previous package,
because the new one is a higher version for the same devices, and **Save** removes it: let it, as
every customer gets the new one. Every upload shows a validation warning that `runFullTrust` needs
approval; that is the restricted capability the justification under **Submission options**
answers. Leave **Roll out update gradually** and **Make this update mandatory** unticked: the first
holds the update back from some customers, and the second applies to UWP apps only.

## Store listing (English)

**Description**

```text
Whetprompt uses generative AI: a language model that runs on your own PC rewrites the prompts you give it. To do that, it downloads the model the first time you press Fix: 2.5 GB, or 1 GB for the lite version. After that it works offline. Cloud models are optional: add your own API key in Settings (Anthropic, OpenAI, Google Gemini or OpenRouter), or use a model you run yourself with Ollama.

Whetprompt checks and improves the prompts you write for AI models, before you send them. A clearer prompt means a better first answer and fewer wasted tokens.

• Score: paste a prompt and it is checked at once against about 30 prompt-engineering rules, with a score out of 100 and a list of what to fix. This part needs no model at all.
• Fix: the built-in model rewrites the prompt, and the rewrite is scored again, so you see what improved.
• See every change: a word-level diff and a change log explain each edit.
• Keep or change: select any passage of the rewrite, mark it "Keep it" or "Change it", and fix again. The model revises its own rewrite, and a check makes sure what you kept comes back word for word.
• Library: save the prompts that work, and export or import them.
• Settings: add an API key for a cloud model, test it, and use it at once. It is saved on your PC and never shown again.
• Private by default: the built-in model runs on your PC, and an automated test fails every build in which the app connects to anything but your own machine. No account, no telemetry, no ads.
• Report: if a rewrite is ever harmful or inappropriate, the Report link beside it opens a report form in your browser.

Try every feature free for 30 days. After the trial, Whetprompt opens only once you have bought it, so if you decide not to, export your library first (Library, then Export) to keep your prompts.

Requirements: 8 GB of memory (4 GB with the lite model) and about 3.5 GB of free disk space. A graphics card is used if you have one (NVIDIA, AMD or Intel); without one, a fix takes longer.

Uninstalling Whetprompt removes your library and the model it downloaded. To keep your prompts, export them from the Library first.

Whetprompt is open source, under the MIT licence: https://github.com/Osman19702/Whetprompt
```

**What's new in this version**, for submission 2 (0.7.0):

```text
New in 0.7.0: Settings, in the top bar. Add your own API key for Anthropic, OpenAI, OpenRouter or Google Gemini, test it, and fix prompts with that provider at once, with no file to edit and no restart. Fixing with the newest Claude models works, and the top bar fits small windows.
```

For the first submission (0.6.0) it was:

```text
The first release in the Microsoft Store. New in 0.6.0: a Report link beside every rewrite.
```

**Product features**

```text
Scores a prompt at once against about 30 prompt-engineering rules, with no model needed
Rewrites prompts with a built-in AI model that runs on your PC, offline after one download
Re-scores the rewrite and shows a word-level diff and a change log for every edit
Mark passages to keep or to change, and fix again
A library of your prompts, with export and import
Optional cloud models: add your own API key in Settings
No account, no telemetry, no ads
```

**Screenshots:** four PNGs of the real app with the real local model, 2560 × 1440, made by
`scripts/capture-screenshot.mjs` into `release/store-listing/` (its header has the commands; a
new release with a changed interface takes new ones, as 0.7.0 did for Settings in the top bar).
Upload them in this order, with these captions:

1. `A weak prompt scored 42 out of 100, rewritten to 93, with what changed and why.`
2. `Every edit, word by word.`
3. `Instant feedback as you type: the issues that cost a prompt its score.`
4. `Mark what to keep and what to change, then fix again.`

**Store logos:** the 1:1 app tile icon, 300 × 300, which the Store shows in place of the
package's own icon: `build/store/AppTileIcon-300.png`, drawn with the package images by
`scripts/appx-assets.mjs`.

**Short description**

```text
Lint, score and rewrite your AI prompts. The built-in model runs on your own PC and works offline, so what you type stays on your machine unless you choose a cloud model.
```

**Search terms** (seven at most, policy 10.1.3; no other product's name)

```text
prompt engineering
prompt optimizer
AI prompts
LLM
prompt linter
local AI
prompt rewriter
```

**Copyright and trademark info:** `© 2026 Osman Turalioglu`

**Additional license terms:** left blank, so the Standard Application License Terms apply to the
Store copy. Those also protect the Microsoft Visual C++ runtime files the package carries, as
Microsoft's terms for redistributing them ask, which the MIT licence does not. The source stays
MIT on GitHub, and the description says so.

**Developed by:** `Osman Turalioglu`

## Submission options

**Publishing hold options:** "Don't publish this submission until I select Publish now". A
certified version then waits for **Publish now**, so that it goes live together with the GitHub
release, the website and the portfolio, and only once the tax and payout profiles are validated.
An update inherits the hold: submission 2 (0.7.0) went in with it, its GitHub release already out.
Change it under **Modify publishing time** on the overview while the update is in certification,
or press **Publish now** once it has passed.

**Notes for certification** go on their own page, **Supplemental info → Additional Testing
Information**, not on Submission options:

```text
Whetprompt uses live generative AI (policy 11.16): a language model, built in and running on the user's PC, rewrites the prompt the user typed. Cloud models are optional and use the user's own API key, added in Settings in the top bar; nothing in this test needs one.
No account or sign-in is needed.
Scoring works at once: paste any prompt, for example "explain how machine learning works", and the score and the issues appear with no download.
To test Fix: pick the lite model in the tier selector next to "Local (built-in)" (1 GB, the quickest to download), press Download in the results pane, and wait until it has downloaded and loaded. Then press "Fix prompt". The rewrite appears in the Fixed tab.
The Report link for generative AI output (policy 11.16) is in the results toolbar, next to Copy, Apply and Save, once there is a rewrite. It opens a report form on GitHub in the browser.
The app runs a small web server on 127.0.0.1 (a random port) that only its own window uses.
```

**Restricted capabilities.** The package declares `runFullTrust`, as every desktop app packaged
for the Store does. The justification box cuts long text off without saying so, so it is two
sentences:

```text
Whetprompt is a desktop app built with Electron. It needs full trust to run its built-in local language model (llama.cpp) and the small web server on 127.0.0.1 that only its own window uses.
```
