import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { keyedProviders, keyState } from '../lib/ui'
import type { KeyCheck, ProviderInfo } from '../types'

interface Props {
  providers: ProviderInfo[]
  /** Where the server keeps keys: named, so the user knows; never read here. */
  keysFile?: string
  /** The provider whose field takes the focus, when Settings opened to add its key. */
  focus?: string | null
  onClose: () => void
  /** A key was saved or removed: the parent reloads the config, so the whole app sees it. */
  onChanged: () => void
  onNotice?: (message: string) => void
}

const STATE_LABEL = { saved: 'Key saved', missing: 'No key', elsewhere: 'Set outside Whetprompt' }

export function Settings({ providers, keysFile, focus, onClose, onChanged, onNotice }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" data-testid="settings-drawer" role="dialog" aria-label="Settings">
        <div className="pane-head">
          <span className="pane-title">Settings</span>
          <div className="topbar-spacer" />
          <button className="btn ghost sm" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="pane-body">
          <div className="section-title">Cloud model keys</div>
          <p className="settings-intro">
            Optional: the built-in model needs no key. With a key you can choose a cloud provider in
            the top bar instead; the prompts you fix with it go to that provider.
          </p>
          <div className="key-list">
            {keyedProviders(providers).map((p) => (
              <KeyRow key={p.id} provider={p} focused={focus === p.id} onChanged={onChanged} onNotice={onNotice} />
            ))}
          </div>
          {keysFile && (
            <p className="settings-note">
              Keys are saved on this computer, in <code data-testid="keys-file">{keysFile}</code>. A saved key
              is never shown again; to change one, replace it.
            </p>
          )}
        </div>
      </aside>
    </>
  )
}

interface RowProps {
  provider: ProviderInfo
  focused: boolean
  onChanged: () => void
  onNotice?: (message: string) => void
}

function KeyRow({ provider, focused, onChanged, onNotice }: RowProps) {
  const state = keyState(provider)
  const [editing, setEditing] = useState(state === 'missing')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null)
  // What Test answered, or why a save or a removal failed: said where it happened.
  const [note, setNote] = useState<KeyCheck | null>(null)

  // Saved, removed or set elsewhere, the row follows the server, not the last
  // click; and a test result is about the key that was there when it ran.
  useEffect(() => {
    setEditing(state === 'missing')
    setDraft('')
    setNote(null)
  }, [state])

  const act = async (kind: 'save' | 'remove' | 'test', run: () => Promise<void>) => {
    setBusy(kind)
    setNote(null)
    try {
      await run()
    } catch (err) {
      setNote({ ok: false, message: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    draft.trim() &&
    act('save', async () => {
      await api.keys.save(provider.id, draft)
      // Out of this page as soon as the server has it.
      setDraft('')
      onNotice?.(`${provider.label} key saved`)
      onChanged()
    })

  const remove = () =>
    act('remove', async () => {
      await api.keys.remove(provider.id)
      onNotice?.(`${provider.label} key removed`)
      onChanged()
    })

  const test = () => act('test', async () => setNote(await api.keys.test(provider.id)))

  return (
    <div className="key-row" role="group" aria-label={provider.label} data-testid={`key-row-${provider.id}`}>
      <div className="key-row-head">
        <span className="key-row-name">{provider.label}</span>
        <span className={`chip${state === 'saved' ? ' good' : ''}`}>{STATE_LABEL[state]}</span>
        <div className="topbar-spacer" />
        {/* Where to get one, opened in the user's browser like every other address. */}
        {provider.docs.startsWith('https://') && (
          <a className="key-row-link" href={provider.docs} target="_blank" rel="noreferrer">
            Get a key
            <span aria-hidden="true"> ↗</span>
          </a>
        )}
      </div>

      {state === 'elsewhere' && (
        <p className="key-row-hint">
          Set in the system environment or in a .env file read before Settings, so that is the key in use.
          Change it where it is set.
        </p>
      )}

      {editing && state !== 'elsewhere' ? (
        <div className="key-row-edit">
          <input
            type="password"
            aria-label={`${provider.label} API key`}
            placeholder={`Paste your ${provider.label} API key`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus={focused}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn primary sm" onClick={save} disabled={!draft.trim() || busy != null}>
            {busy === 'save' ? 'Saving…' : 'Save key'}
          </button>
          {state === 'saved' && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setEditing(false)
                setDraft('')
              }}
              disabled={busy != null}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="key-row-edit">
          <button className="btn sm" onClick={test} disabled={busy != null} title={`Ask ${provider.label} whether it accepts the key`}>
            {busy === 'test' ? 'Testing…' : 'Test'}
          </button>
          {state === 'saved' && (
            <>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setEditing(true)
                  setNote(null)
                }}
                disabled={busy != null}
              >
                Replace
              </button>
              <button className="btn ghost sm" onClick={remove} disabled={busy != null}>
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </button>
            </>
          )}
        </div>
      )}

      {note && (
        <p className={`key-row-result ${note.ok ? 'ok' : 'bad'}`} role="status">
          <span aria-hidden="true">{note.ok ? '✓ ' : '✕ '}</span>
          {note.message}
        </p>
      )}
    </div>
  )
}
