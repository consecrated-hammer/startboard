import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, Puzzle, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { extensionSettingsAPI, errorMessage } from '../../services/api.js'
import { SettingsFootnote, SettingsSection } from './SettingsKit.jsx'
import { btnPrimary, btnSecondary, input } from '../ui.js'

const mono = 'rounded bg-white/10 px-1.5 py-0.5 text-[0.85em] text-white'

function formatDate(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

// A numbered step in the setup flow, so a first-time user reads it in order.
function StepCard({ n, title, hint, children }) {
  return (
    <section className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4">
      <header className="flex items-start gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          {n}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
      </header>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

// Icon-only copy-to-clipboard button, sized to sit flush next to an input.
// Stays square and stretches to the input's height; flips to a check on success.
function CopyButton({ copied, onClick }) {
  return (
    <button
      className="flex w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
      type="button"
      onClick={onClick}
      title={copied ? 'Copied' : 'Copy'}
      aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

// Compact labelled stat for the token-activity row.
function Stat({ label, value }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm text-slate-300" title={value}>{value}</div>
    </div>
  )
}

export default function BrowserExtensionSection() {
  const [status, setStatus] = useState(null)
  const [rawToken, setRawToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const baseUrl = useMemo(() => window.location.origin, [])
  const hasToken = !!status?.has_token

  useEffect(() => {
    extensionSettingsAPI.status()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const generate = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const next = await extensionSettingsAPI.createToken()
      setStatus(next)
      setRawToken(next.token || '')
      setMessage(next.created_at === next.updated_at ? 'Extension token created.' : 'Extension token rotated.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await extensionSettingsAPI.revokeToken()
      setStatus((current) => current ? {
        ...current,
        has_token: false,
        created_at: null,
        updated_at: null,
        last_used_at: null,
      } : current)
      setRawToken('')
      setMessage('Extension token revoked.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const copyRaw = async (value, key) => {
    if (!value) return
    await navigator.clipboard?.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? '' : current))
    }, 1500)
  }

  return (
    <SettingsSection
      title="Browser Extension"
      description="Install the private Edge companion to save the current tab into Startboard. Three steps and you're set up."
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {message && <div className="mb-3 text-sm text-emerald-400">{message}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Step 1 — install the unpacked extension in Edge */}
        <StepCard n={1} title="Install the extension" hint="Load the companion into Edge.">
          <a className={`${btnPrimary} w-full`} href="/api/extension/download">
            <Download className="h-4 w-4" />
            <span>Download zip</span>
          </a>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Extract the zip to a local folder.</li>
            <li>Open <code className={mono}>edge://extensions</code> and turn on Developer mode.</li>
            <li>Click <strong>Load unpacked</strong> and pick the extracted <code className={mono}>startboard-edge-companion</code> folder.</li>
          </ol>
        </StepCard>

        {/* Step 2 — create the token the extension authenticates with */}
        <StepCard n={2} title="Create a token" hint="The extension signs in with this — keep it private.">
          <button className={`${btnPrimary} w-full`} type="button" onClick={generate} disabled={busy}>
            {hasToken ? <RefreshCcw className="h-4 w-4" /> : <Puzzle className="h-4 w-4" />}
            <span>{hasToken ? 'Rotate token' : 'Generate token'}</span>
          </button>
          {rawToken ? (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
              <div className="mb-1.5 text-xs font-medium text-white">Your new token — copy it now</div>
              <div className="flex gap-2">
                <input className={input} readOnly value={rawToken} />
                <CopyButton copied={copiedKey === 'token'} onClick={() => copyRaw(rawToken, 'token')} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">Shown only once — store it somewhere safe.</p>
            </div>
          ) : hasToken ? (
            <>
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Token active</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/5">
                <Stat label="Created" value={formatDate(status?.created_at)} />
                <Stat label="Rotated" value={formatDate(status?.updated_at)} />
                <Stat label="Used" value={formatDate(status?.last_used_at)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Generates a private token so the extension can connect — shown once.</p>
          )}
          {hasToken && (
            <button className={`${btnSecondary} w-full`} type="button" onClick={revoke} disabled={busy}>
              <Trash2 className="h-4 w-4" />
              <span>Revoke</span>
            </button>
          )}
        </StepCard>

        {/* Step 3 — finish setup inside the extension popup */}
        <StepCard n={3} title="Connect the extension" hint="Finish setup in the extension popup.">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Server URL</div>
            <div className="flex gap-2">
              <input className={input} readOnly value={baseUrl} />
              <CopyButton copied={copiedKey === 'baseUrl'} onClick={() => copyRaw(baseUrl, 'baseUrl')} />
            </div>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Open the Startboard extension popup in Edge.</li>
            <li>Paste the server URL above and your token from step 2.</li>
            <li>Hit <strong>Test connection</strong> to verify.</li>
            <li>Pick a page and group, then save the current tab.</li>
          </ol>
        </StepCard>
      </div>

      <SettingsFootnote>
        Private sideloaded extension. Updates are manual: download a new zip, replace the extracted folder, then reload the extension in Edge.
      </SettingsFootnote>
    </SettingsSection>
  )
}
