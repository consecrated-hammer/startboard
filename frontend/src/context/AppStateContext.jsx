import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from './AuthContext.jsx'
import { useSaveToast } from './SaveToastContext.jsx'
import { preferencesAPI, settingsAPI } from '../services/api.js'
import { offlineStore } from '../services/offline.js'

const DEFAULT_SETTINGS = {
  site_name: 'Startboard',
  allow_sharing: true,
  icon_treatment: 'default',
  icon_color: '',
}

const DEFAULT_PREFERENCES = {
  theme: 'system',
  show_search_bar: true,
  show_website_icons: true,
  open_links_in_new_tab: true,
  add_bookmarks_to_top: false,
  restore_last_page: false,
  language: 'English',
  country: 'Australia',
}

const AppStateContext = createContext(null)

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function AppStateProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const saveToast = useSaveToast()
  const [settings, setSettings] = useState(() => offlineStore.readSettings() || DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [preferences, setPreferences] = useState(() => offlineStore.readPreferences() || DEFAULT_PREFERENCES)
  const [theme, setTheme] = useState(() => (offlineStore.readPreferences() || DEFAULT_PREFERENCES).theme)
  const [resolvedTheme, setResolvedTheme] = useState(() => getSystemTheme())

  const loadSettings = useCallback(async () => {
    const next = await settingsAPI.get()
    setSettings({
      site_name: next.site_name || DEFAULT_SETTINGS.site_name,
      allow_sharing: Boolean(next.allow_sharing),
      icon_treatment: next.icon_treatment || DEFAULT_SETTINGS.icon_treatment,
      icon_color: next.icon_color || DEFAULT_SETTINGS.icon_color,
    })
    offlineStore.writeSettings({
      site_name: next.site_name || DEFAULT_SETTINGS.site_name,
      allow_sharing: Boolean(next.allow_sharing),
      icon_treatment: next.icon_treatment || DEFAULT_SETTINGS.icon_treatment,
      icon_color: next.icon_color || DEFAULT_SETTINGS.icon_color,
    })
    setSettingsLoaded(true)
    return next
  }, [])

  const loadPreferences = useCallback(async () => {
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES)
      setTheme(DEFAULT_PREFERENCES.theme)
      return DEFAULT_PREFERENCES
    }
    const next = await preferencesAPI.get()
    const merged = {
      ...DEFAULT_PREFERENCES,
      ...next,
      theme: next.theme || DEFAULT_PREFERENCES.theme,
    }
    setPreferences(merged)
    setTheme(merged.theme)
    offlineStore.writePreferences(merged)
    return next
  }, [user])

  const updateSettings = useCallback(async (patch) => {
    saveToast.saving()
    try {
      const next = await settingsAPI.update(patch)
      setSettings({
        site_name: next.site_name || DEFAULT_SETTINGS.site_name,
        allow_sharing: Boolean(next.allow_sharing),
        icon_treatment: next.icon_treatment || DEFAULT_SETTINGS.icon_treatment,
        icon_color: next.icon_color || DEFAULT_SETTINGS.icon_color,
      })
      offlineStore.writeSettings({
        site_name: next.site_name || DEFAULT_SETTINGS.site_name,
        allow_sharing: Boolean(next.allow_sharing),
        icon_treatment: next.icon_treatment || DEFAULT_SETTINGS.icon_treatment,
        icon_color: next.icon_color || DEFAULT_SETTINGS.icon_color,
      })
      saveToast.saved()
      return next
    } catch (err) {
      saveToast.failed()
      throw err
    }
  }, [saveToast])

  const updatePreferences = useCallback(async (patch) => {
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES)
      setTheme(DEFAULT_PREFERENCES.theme)
      return DEFAULT_PREFERENCES
    }
    saveToast.saving()
    try {
      const next = await preferencesAPI.update(patch)
      const merged = { ...DEFAULT_PREFERENCES, ...next }
      setPreferences(merged)
      setTheme(merged.theme)
      offlineStore.writePreferences(merged)
      saveToast.saved()
      return next
    } catch (err) {
      saveToast.failed()
      throw err
    }
  }, [user, saveToast])

  const updateTheme = useCallback((nextTheme) => updatePreferences({ theme: nextTheme }), [updatePreferences])

  useEffect(() => {
    // Initial public settings bootstrap; async state updates happen inside the promise chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings().catch(() => setSettingsLoaded(true))
  }, [loadSettings])

  useEffect(() => {
    if (authLoading) return
    // Auth changes drive preference bootstrap; async state updates happen inside the promise chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPreferences().catch(() => {
      setPreferences(DEFAULT_PREFERENCES)
      setTheme(DEFAULT_PREFERENCES.theme)
    })
  }, [authLoading, loadPreferences])

  useEffect(() => {
    const media = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null

    const applyTheme = () => {
      const nextResolved = theme === 'system'
        ? (media?.matches ? 'light' : 'dark')
        : theme
      setResolvedTheme(nextResolved)
      document.documentElement.dataset.theme = nextResolved
      document.documentElement.style.colorScheme = nextResolved
    }

    applyTheme()
    if (!media) return undefined

    const handleChange = () => {
      if (theme === 'system') applyTheme()
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  const value = useMemo(() => ({
    settings,
    settingsLoaded,
    preferences,
    theme,
    resolvedTheme,
    loadSettings,
    updateSettings,
    updatePreferences,
    updateTheme,
  }), [settings, settingsLoaded, preferences, theme, resolvedTheme, loadSettings, updateSettings, updatePreferences, updateTheme])

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
