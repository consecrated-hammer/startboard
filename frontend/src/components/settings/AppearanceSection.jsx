import { useState } from 'react'
import { ArrowRight, Check, ExternalLink, Globe, Monitor, Moon, Search, Sun } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppState } from '../../context/AppStateContext.jsx'
import { errorMessage } from '../../services/api.js'
import { ColorField, SettingsSection, SettingsGroup, SettingsRow, SettingsFootnote, Toggle } from './SettingsKit.jsx'
import Favicon from '../Favicon.jsx'

const THEMES = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
]

const ICON_TREATMENTS = [
  { value: 'default', label: 'Default', desc: 'Original colours', help: 'Library/vector icons render in their original colour, with no theme styling.' },
  { value: 'monochrome', label: 'Auto monochrome', desc: 'One theme colour', help: 'Recolours library/vector icons to match the theme — light on dark, dark on light — so they share one consistent colour.' },
  { value: 'tile', label: 'Auto tile background', desc: 'On a rounded tile', help: 'Theme-recolours icons and sets each on a rounded background tile, like app/home-screen icons.' },
]

// A library/Iconify icon used to preview each treatment live. A brand colour is
// baked into the URL so the "Default" card (original colours) stays visibly
// distinct from "Auto monochrome" (theme ink) in light mode as well as dark —
// the monochrome/tile treatments rebuild the URL from the path and override it.
const SAMPLE_ICON_URL = `${import.meta.env.VITE_ICONIFY_API_BASE_URL || 'https://api.iconify.design'}/simple-icons/github.svg?color=%238b5cf6`

// Fixed-width, right-aligned frame so toggles stay vertically aligned across
// rows. Hidden on small screens to avoid crowding the control.
function PreviewFrame({ children }) {
  return <div className="hidden w-44 justify-end sm:flex">{children}</div>
}

// Mini search field that mirrors the "Search bar" toggle state.
function SearchBarPreview({ on }) {
  return (
    <div
      className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition ${
        on ? 'border-white/10 bg-white/5 text-slate-300' : 'border-dashed border-white/15 text-slate-500'
      }`}
    >
      <Search className="h-3 w-3 shrink-0" />
      <span className="truncate">Search bookmarks</span>
      <span className="ml-auto rounded border border-white/10 px-1 text-[10px] text-slate-400">⌘K</span>
    </div>
  )
}

// Two mock bookmark lines; the favicon tile appears only when icons are on.
function WebsiteIconsPreview({ on }) {
  return (
    <div className="flex w-full flex-col items-end gap-1.5">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center gap-1.5">
          {on && (
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-accent/80">
              <Globe className="h-2.5 w-2.5 text-white" />
            </span>
          )}
          <span className={`h-1.5 rounded-full bg-white/20 ${row === 0 ? 'w-20' : 'w-14'}`} />
        </div>
      ))}
    </div>
  )
}

// Value chip that flips between new-tab and same-tab.
function OpenTabPreview({ on }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
      {on ? <ExternalLink className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
      <span>{on ? 'New tab' : 'Same tab'}</span>
    </div>
  )
}

export default function AppearanceSection() {
  const { user } = useAuth()
  const { theme, settings, preferences, updateTheme, updateSettings, updatePreferences } = useAppState()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [iconBusy, setIconBusy] = useState(false)
  const [iconColorBusy, setIconColorBusy] = useState(false)
  const [prefBusy, setPrefBusy] = useState(false)

  const onChange = async (value) => {
    setBusy(true)
    setError('')
    try {
      await updateTheme(value)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const onChangeIconTreatment = async (value) => {
    setIconBusy(true)
    setError('')
    try {
      await updateSettings({ icon_treatment: value })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIconBusy(false)
    }
  }

  const onChangePreference = async (patch) => {
    setPrefBusy(true)
    setError('')
    try {
      await updatePreferences(patch)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPrefBusy(false)
    }
  }

  const onChangeIconColor = async (value) => {
    setIconColorBusy(true)
    setError('')
    try {
      await updateSettings({ icon_color: value })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIconColorBusy(false)
    }
  }

  return (
    <SettingsSection title="Appearance" description="How the board looks while you are signed in.">
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <SettingsGroup>
        <SettingsRow label="Theme" hint="“System” follows your device’s light/dark setting.">
          <div role="group" aria-label="Theme" className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            {THEMES.map((t) => {
              const active = theme === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onChange(t.value)}
                  disabled={busy}
                  aria-pressed={active}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? 'bg-accent text-white shadow'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </SettingsRow>
        <SettingsRow label="Search bar" hint="Show the board search box on your pages.">
          <PreviewFrame>
            <SearchBarPreview on={preferences.show_search_bar} />
          </PreviewFrame>
          <Toggle
            checked={preferences.show_search_bar}
            disabled={prefBusy}
            onChange={(next) => onChangePreference({ show_search_bar: next })}
            label="Show search bar"
          />
        </SettingsRow>
        <SettingsRow label="Website icons" hint="Show icons next to bookmark links.">
          <PreviewFrame>
            <WebsiteIconsPreview on={preferences.show_website_icons} />
          </PreviewFrame>
          <Toggle
            checked={preferences.show_website_icons}
            disabled={prefBusy}
            onChange={(next) => onChangePreference({ show_website_icons: next })}
            label="Show website icons"
          />
        </SettingsRow>
        <SettingsRow label="Open links in a new tab" hint="Choose where bookmark links open by default.">
          <PreviewFrame>
            <OpenTabPreview on={preferences.open_links_in_new_tab} />
          </PreviewFrame>
          <Toggle
            checked={preferences.open_links_in_new_tab}
            disabled={prefBusy}
            onChange={(next) => onChangePreference({ open_links_in_new_tab: next })}
            label="Open links in a new tab"
          />
        </SettingsRow>
        {user?.role === 'admin' && (
          <SettingsRow
            label="Icon treatment"
            hint="Site-wide theme-aware styling for library/vector icons only. Service logos, uploads, and favicons stay untouched."
            stack
          >
            <div className="grid grid-cols-3 gap-2">
              {ICON_TREATMENTS.map((option) => {
                const selected = (settings.icon_treatment || 'default') === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.help}
                    disabled={iconBusy}
                    onClick={() => onChangeIconTreatment(option.value)}
                    aria-pressed={selected}
                    className={`group relative flex cursor-pointer flex-col items-center gap-3 rounded-xl border p-4 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? 'border-accent bg-accent/10 ring-1 ring-accent/40'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <span
                      className={`flex h-16 w-16 items-center justify-center rounded-xl bg-slate-900/60 ring-1 ring-inset transition ${
                        selected ? 'ring-accent/30' : 'ring-white/10 group-hover:ring-white/20'
                      }`}
                    >
                      <Favicon iconUrl={SAMPLE_ICON_URL} title="Sample" size={34} treatment={option.value} />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-white">{option.label}</span>
                      <span className="text-[11px] leading-tight text-slate-400">{option.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </SettingsRow>
        )}
        {user?.role === 'admin' && (
          <SettingsRow
            label="Default icon colour"
            hint="Site-wide fallback for tintable SVG and library icons. Pages, groups, and bookmarks can override it."
            stack
          >
            <div className={iconColorBusy ? 'pointer-events-none opacity-70' : ''}>
              <ColorField value={settings.icon_color || ''} onChange={onChangeIconColor} />
            </div>
          </SettingsRow>
        )}
      </SettingsGroup>
      <SettingsFootnote>
        Theme is saved to your account and applied instantly across your devices.
        {user?.role === 'admin' ? ' Icon treatment updates apply site-wide.' : ''}
      </SettingsFootnote>
    </SettingsSection>
  )
}
