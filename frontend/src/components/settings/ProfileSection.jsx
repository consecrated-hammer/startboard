import { useState } from 'react'
import { authAPI, errorMessage } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSaveToast } from '../../context/SaveToastContext.jsx'
import { SettingsSection, SettingsGroup, SettingsRow } from './SettingsKit.jsx'
import { btnSecondary, input } from '../ui.js'

export default function ProfileSection() {
  const { user, refresh } = useAuth()
  const saveToast = useSaveToast()
  const [iconUrl, setIconUrl] = useState(user?.icon_url || '')
  const [error, setError] = useState('')

  const letter = (user?.display_name || user?.username || '?').trim().charAt(0).toUpperCase()

  const persist = async (value) => {
    setError('')
    saveToast.saving()
    try {
      await authAPI.updateProfile({ icon_url: value || null })
      await refresh()
      saveToast.saved()
    } catch (err) {
      setError(errorMessage(err))
      saveToast.failed()
    }
  }

  // Auto-save on blur when the avatar URL actually changed.
  const commitIcon = () => {
    const trimmed = iconUrl.trim()
    if (trimmed !== (user?.icon_url || '')) persist(trimmed)
  }

  return (
    <SettingsSection title="Profile" description="Your account avatar, shown in the top bar.">
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <SettingsGroup>
        <SettingsRow label="Avatar" hint="Paste an image URL to use as your icon.">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-base font-semibold text-white">
            {iconUrl ? <img src={iconUrl} alt="" className="h-full w-full object-cover" /> : letter}
          </div>
        </SettingsRow>
        <SettingsRow label="Icon URL" htmlFor="profile-icon" stack>
          <div className="flex gap-2">
            <input
              id="profile-icon"
              className={input}
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              onBlur={commitIcon}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              placeholder="https://…/avatar.png"
            />
            {iconUrl && (
              <button className={btnSecondary} onClick={() => { setIconUrl(''); persist('') }}>
                Remove
              </button>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
