import { useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { authAPI, errorMessage } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { SettingsSection, SettingsGroup, SettingsRow } from './SettingsKit.jsx'
import { btnPrimary, btnSecondary, input } from '../ui.js'
import Spinner from '../Spinner.jsx'

const MIN_LEN = 8

// Password input with an inline show/hide (eye) toggle.
function PwField({ id, value, onChange, autoComplete, show, onToggle, autoFocus }) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={`${input} pr-10`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        title={show ? 'Hide passwords' : 'Show passwords'}
        aria-label={show ? 'Hide passwords' : 'Show passwords'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function PasswordSection() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LEN
  const canSubmit = currentPassword && newPassword.length >= MIN_LEN && newPassword === confirmPassword

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowPw(false)
    setError('')
  }

  const close = () => { reset(); setOpen(false) }

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await authAPI.changePassword(currentPassword, newPassword)
      reset()
      setOpen(false)
      setMessage('Password updated.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection title="Password" description="Update the password you use to sign in.">
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {message && <div className="mb-3 text-sm text-emerald-400">{message}</div>}

      {!open ? (
        <SettingsGroup>
          <SettingsRow label="Password" hint="Change the password you use to sign in.">
            <span className="mr-1 text-sm tracking-widest text-slate-500" aria-hidden="true">••••••••</span>
            <button className={btnSecondary} onClick={() => { setMessage(''); setOpen(true) }}>
              <KeyRound className="h-4 w-4" />
              <span>Change password</span>
            </button>
          </SettingsRow>
        </SettingsGroup>
      ) : (
        <form onSubmit={submit}>
          {/* Hidden username so password managers can associate the credential. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user?.username || ''}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <SettingsGroup>
            <SettingsRow label="Current password" htmlFor="current-password" stack>
              <PwField
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                show={showPw}
                onToggle={() => setShowPw((s) => !s)}
                autoFocus
              />
            </SettingsRow>
            <SettingsRow label="New password" hint={`At least ${MIN_LEN} characters. Use a password you don’t reuse elsewhere.`} htmlFor="new-password" stack>
              <PwField
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                show={showPw}
                onToggle={() => setShowPw((s) => !s)}
              />
              {tooShort && <p className="mt-1.5 text-xs text-amber-400">Use at least {MIN_LEN} characters.</p>}
            </SettingsRow>
            <SettingsRow label="Confirm new password" htmlFor="confirm-password" stack>
              <PwField
                id="confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                show={showPw}
                onToggle={() => setShowPw((s) => !s)}
              />
              {mismatch && <p className="mt-1.5 text-xs text-red-400">Passwords don’t match.</p>}
            </SettingsRow>
          </SettingsGroup>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} type="submit" disabled={busy || !canSubmit}>
              {busy ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              <span>Update password</span>
            </button>
            <button className={btnSecondary} type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </SettingsSection>
  )
}
