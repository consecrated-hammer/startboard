import { useEffect, useState } from 'react'
import { useAppState } from '../../context/AppStateContext.jsx'
import { errorMessage } from '../../services/api.js'
import { SettingsSection, SettingsGroup, SettingsRow, SettingsFootnote, Toggle } from './SettingsKit.jsx'
import { input } from '../ui.js'

export default function GeneralSection() {
  const { settings, updateSettings } = useAppState()
  const [siteName, setSiteName] = useState(settings.site_name)
  const [allowSharing, setAllowSharing] = useState(settings.allow_sharing)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setSiteName(settings.site_name)
      setAllowSharing(settings.allow_sharing)
    })
    return () => { cancelled = true }
  }, [settings])

  // Auto-save: text fields commit on blur/Enter, toggles on change. The global
  // save toast (driven from updateSettings) reports progress.
  const commitSiteName = () => {
    const trimmed = siteName.trim()
    if (!trimmed) { setSiteName(settings.site_name); return }
    if (trimmed === settings.site_name) return
    setError('')
    updateSettings({ site_name: trimmed }).catch((err) => setError(errorMessage(err)))
  }

  const commitSharing = (next) => {
    setAllowSharing(next)
    setError('')
    updateSettings({ allow_sharing: next }).catch((err) => setError(errorMessage(err)))
  }

  return (
    <SettingsSection title="General" description="Branding and global policy for this Startboard instance.">
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <SettingsGroup>
        <SettingsRow label="Site name" hint="Shown in the top bar and on shared pages." htmlFor="site-name" stack>
          <input
            id="site-name"
            className={input}
            value={siteName}
            maxLength={60}
            onChange={(e) => setSiteName(e.target.value)}
            onBlur={commitSiteName}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </SettingsRow>
        <SettingsRow label="Public sharing" hint="When off, no one can create public share links.">
          <Toggle checked={allowSharing} onChange={commitSharing} label="Allow public sharing" />
        </SettingsRow>
      </SettingsGroup>
      <SettingsFootnote>Turning sharing off does not delete existing links, but they stop resolving.</SettingsFootnote>
    </SettingsSection>
  )
}
