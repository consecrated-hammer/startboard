import { useEffect, useState } from 'react'
import { ExternalLink, Plus, RotateCcw } from 'lucide-react'
import { pagesAPI, errorMessage } from '../../services/api.js'
import { useAppState } from '../../context/AppStateContext.jsx'
import { SettingsSection, SettingsGroup, SettingsRow, SettingsFootnote, Toggle } from './SettingsKit.jsx'
import { btnGhost, btnSecondary } from '../ui.js'

// Fixed-width, right-aligned frame so the toggle stays aligned with other rows.
function PreviewFrame({ children }) {
  return <div className="hidden w-40 justify-end sm:flex">{children}</div>
}

// Mini list showing where a newly-added bookmark lands, reflecting the toggle.
function AddToTopPreview({ on }) {
  const newRow = (
    <div className="flex items-center gap-1.5">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent text-white">
        <Plus className="h-2.5 w-2.5" />
      </span>
      <span className="h-1.5 w-16 rounded-full bg-accent/70" />
    </div>
  )
  const plainRow = (width) => (
    <div className="flex items-center gap-1.5">
      <span className="h-3.5 w-3.5 rounded bg-white/10" />
      <span className={`h-1.5 ${width} rounded-full bg-white/20`} />
    </div>
  )
  return (
    <div className="flex w-full flex-col items-end gap-1.5">
      {on && newRow}
      {plainRow('w-20')}
      {plainRow('w-12')}
      {!on && newRow}
    </div>
  )
}

export default function BookmarkPreferencesSection() {
  const { preferences, updatePreferences } = useAppState()
  const [archivedPages, setArchivedPages] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    pagesAPI.listArchived().then(setArchivedPages).catch(() => setArchivedPages([]))
  }, [])

  const setPref = async (patch) => {
    setError('')
    try {
      await updatePreferences(patch)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const restorePage = async (pageId) => {
    setError('')
    try {
      const restored = await pagesAPI.update(pageId, { is_archived: false })
      setArchivedPages((items) => items.filter((page) => page.id !== pageId))
      window.location.assign(`/p/${restored.id}`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <SettingsSection title="Bookmarks" description="Personal defaults for how new bookmarks are added and how your saved pages behave.">
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <SettingsGroup>
        <SettingsRow
          label="Add new bookmarks to the top"
          hint="New bookmarks land at the start of the group instead of the end."
        >
          <PreviewFrame>
            <AddToTopPreview on={preferences.add_bookmarks_to_top} />
          </PreviewFrame>
          <Toggle
            checked={preferences.add_bookmarks_to_top}
            onChange={(next) => setPref({ add_bookmarks_to_top: next })}
            label="Add bookmarks to top"
          />
        </SettingsRow>
        <SettingsRow
          label="Restore the last opened page"
          hint="Reopen the page you were last viewing when you return to Startboard."
        >
          <Toggle
            checked={preferences.restore_last_page}
            onChange={(next) => setPref({ restore_last_page: next })}
            label="Restore the last opened page"
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsFootnote>These defaults apply to your own board editing and navigation.</SettingsFootnote>

      <SettingsSection title="Archived pages" description="Restore pages you previously archived back into the main page tabs.">
        <SettingsGroup>
          {archivedPages.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No archived pages. Pages you archive will show up here so you can bring them back.
            </div>
          ) : archivedPages.map((page) => (
            <SettingsRow key={page.id} label={page.title} hint={page.description || 'Archived page'}>
              <a className={btnGhost} href={`/p/${page.id}`}>
                <ExternalLink className="h-4 w-4" />
                <span>Open</span>
              </a>
              <button className={btnSecondary} onClick={() => restorePage(page.id)}>
                <RotateCcw className="h-4 w-4" />
                <span>Restore</span>
              </button>
            </SettingsRow>
          ))}
        </SettingsGroup>
      </SettingsSection>
    </SettingsSection>
  )
}
