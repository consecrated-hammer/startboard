import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { CircleHelp, Save } from 'lucide-react'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'
import Favicon from '../Favicon.jsx'
import { btnDanger, btnPrimary, btnSecondary, input, label } from '../ui.js'
import { ColorField, RangeField } from '../settings/SettingsKit.jsx'
import { bookmarksAPI, errorMessage } from '../../services/api.js'

const GROUP_TABS = [
  { id: 'general', label: 'General' },
  { id: 'icon', label: 'Icon' },
  { id: 'background', label: 'Background' },
  { id: 'display', label: 'Display' },
]

const DEFAULT_ICONIFY_API_BASE = (import.meta.env.VITE_ICONIFY_API_BASE_URL || 'https://api.iconify.design').replace(/\/+$/, '')
const DEFAULT_SELFHST_INDEX_URL = import.meta.env.VITE_SELFHST_INDEX_URL || 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/index-consolidated.json'
const DEFAULT_SELFHST_CDN_BASE = (import.meta.env.VITE_SELFHST_CDN_BASE_URL || 'https://cdn.jsdelivr.net/gh/selfhst/icons@main').replace(/\/+$/, '')
const DEFAULT_DASH_METADATA_URL = import.meta.env.VITE_DASHBOARDICONS_METADATA_URL || 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/metadata.json'
const DEFAULT_DASH_CDN_BASE = (import.meta.env.VITE_DASHBOARDICONS_CDN_BASE_URL || 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main').replace(/\/+$/, '')
const UPLOAD_MAX_BYTES_BY_EXT = {
  svg: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_SVG_BYTES || 256 * 1024),
  ico: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_ICO_BYTES || 512 * 1024),
  png: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_PNG_BYTES || 1024 * 1024),
  webp: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_WEBP_BYTES || 1024 * 1024),
  jpg: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_JPG_BYTES || 1024 * 1024),
  jpeg: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_JPG_BYTES || 1024 * 1024),
  gif: Number(import.meta.env.VITE_ICON_UPLOAD_MAX_GIF_BYTES || 1024 * 1024),
}

const ICON_SOURCES = [
  { id: 'auto', label: 'Auto favicon' },
  { id: 'direct', label: 'Direct / self-hosted URL' },
  { id: 'upload', label: 'Upload file' },
  { id: 'library', label: 'Library' },
]

const LIBRARY_PROVIDERS = [
  { id: 'selfhst', kind: 'selfhst', label: 'selfh.st/icons', hint: 'Self-hosted service logos' },
  { id: 'dashboardicons', kind: 'dashboardicons', label: 'Dashboard Icons', hint: 'Homarr dashboard icon catalog' },
  { id: 'lucide', kind: 'iconify', prefix: 'lucide', label: 'Lucide', hint: 'General-purpose line icons' },
  { id: 'ph', kind: 'iconify', prefix: 'ph', label: 'Phosphor', hint: 'Flexible app and concept icons' },
  { id: 'ri', kind: 'iconify', prefix: 'ri', label: 'Remix Icon', hint: 'Broad system and app icon set' },
  { id: 'heroicons', kind: 'iconify', prefix: 'heroicons', label: 'Heroicons', hint: 'Clean Tailwind-style interface icons' },
  { id: 'iconoir', kind: 'iconify', prefix: 'iconoir', label: 'Iconoir', hint: 'Lightweight generic product icons' },
  { id: 'material-symbols', kind: 'iconify', prefix: 'material-symbols', label: 'Google Material Symbols', hint: 'Google UI/system icons' },
  { id: 'simple-icons', kind: 'iconify', prefix: 'simple-icons', label: 'Simple Icons', hint: 'Brands and services' },
  { id: 'tabler', kind: 'iconify', prefix: 'tabler', label: 'Tabler', hint: 'Large UI icon set' },
]

const PREVIEW_BOOKMARKS = [
  { id: 1, title: 'Dashboard', description: 'Core overview and entry point', url: 'https://example.invalid/dashboard' },
  { id: 2, title: 'Analytics', description: 'Reports, insights, and charts', url: 'https://example.invalid/analytics' },
  { id: 3, title: 'Media Queue', description: 'Pending items and processing status', url: 'https://example.invalid/media' },
  { id: 4, title: 'System Health', description: 'Status checks and alerts', url: 'https://example.invalid/health' },
  { id: 5, title: 'Automation', description: 'Background jobs and schedules', url: 'https://example.invalid/automation' },
  { id: 6, title: 'Docs', description: 'Notes, links, and reference material', url: 'https://example.invalid/docs' },
]

const PREVIEW_ICON_SIZE_MAP = { small: 18, medium: 22, large: 28, xl: 34 }

function parseIconifyUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/icons/')) return null
    const match = parsed.pathname.match(/(.*)\/([^/]+)\/([^/.]+)\.svg$/)
    if (!match) return null
    return {
      baseUrl: `${parsed.origin}${match[1]}`,
      prefix: decodeURIComponent(match[2]),
      name: decodeURIComponent(match[3]),
      color: parsed.searchParams.get('color') || '',
    }
  } catch {
    return null
  }
}

function inferLibraryProvider(iconUrl, parsedIconify) {
  const url = iconUrl || ''
  if (url.includes('selfhst/icons@') || url.includes('/selfhst/icons/')) return 'selfhst'
  if (url.includes('dashboard-icons@') || url.includes('/dashboard-icons/')) return 'dashboardicons'
  if (parsedIconify?.prefix && LIBRARY_PROVIDERS.some((provider) => provider.kind === 'iconify' && provider.prefix === parsedIconify.prefix)) {
    return parsedIconify.prefix
  }
  return 'selfhst'
}

function buildIconifyUrl({ baseUrl, prefix, name, color }) {
  if (!baseUrl.trim() || !prefix.trim() || !name.trim()) return ''
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const url = new URL(`${normalizedBase}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`, window.location.origin)
  if (color.trim()) url.searchParams.set('color', color.trim())
  url.searchParams.set('sb_tintable', '1')
  return url.toString()
}

function buildSelfhStIconUrl({ cdnBaseUrl, ref, hasSvg }) {
  if (!cdnBaseUrl.trim() || !ref.trim()) return ''
  const format = hasSvg ? 'svg' : 'png'
  return `${cdnBaseUrl.replace(/\/+$/, '')}/${format}/${encodeURIComponent(ref)}.${format}`
}

function buildDashIconUrl({ cdnBaseUrl, ref, base }) {
  if (!cdnBaseUrl.trim() || !ref.trim()) return ''
  const format = base === 'png' ? 'png' : 'svg'
  return `${cdnBaseUrl.replace(/\/+$/, '')}/${format}/${encodeURIComponent(ref)}.${format}`
}

function libraryProviderMeta(providerId) {
  return LIBRARY_PROVIDERS.find((provider) => provider.id === providerId) || LIBRARY_PROVIDERS[0]
}

function formatUploadLimit(limitBytes) {
  if (limitBytes % (1024 * 1024) === 0) return `${limitBytes / (1024 * 1024)} MB`
  return `${Math.round(limitBytes / 1024)} KB`
}

function uploadLimitForFile(file) {
  const ext = (file?.name?.split('.').pop() || '').toLowerCase()
  return UPLOAD_MAX_BYTES_BY_EXT[ext] || null
}

function SearchResultButton({ icon, selected, onSelect, baseUrl, color = '' }) {
  const [prefix, name] = icon.split(':')
  const previewUrl = buildIconifyUrl({ baseUrl, prefix, name, color })
  return (
    <button
      type="button"
      onClick={() => onSelect(icon)}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${selected ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
    >
      <Favicon iconUrl={previewUrl} title={name} size={20} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{name}</div>
        <div className="truncate text-xs text-slate-400">{prefix}</div>
      </div>
    </button>
  )
}

function SelfhStResultButton({ icon, selected, onSelect, cdnBaseUrl }) {
  const previewUrl = buildSelfhStIconUrl({ cdnBaseUrl, ref: icon.ref, hasSvg: icon.hasSvg })
  return (
    <button
      type="button"
      onClick={() => onSelect(icon)}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${selected ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
    >
      <Favicon iconUrl={previewUrl} title={icon.name} size={20} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{icon.name}</div>
        <div className="truncate text-xs text-slate-400">{icon.ref}{icon.category ? ` · ${icon.category}` : ''}</div>
      </div>
    </button>
  )
}

function DashResultButton({ icon, selected, onSelect, cdnBaseUrl }) {
  const previewUrl = buildDashIconUrl({ cdnBaseUrl, ref: icon.ref, base: icon.base })
  return (
    <button
      type="button"
      onClick={() => onSelect(icon)}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${selected ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
    >
      <Favicon iconUrl={previewUrl} title={icon.name} size={20} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{icon.name}</div>
        <div className="truncate text-xs text-slate-400">{icon.ref}{icon.categories[0] ? ` · ${icon.categories[0].replace(/-/g, ' ')}` : ''}</div>
      </div>
    </button>
  )
}

function Labeled({ text, children }) {
  return <div><label className={label}>{text}</label>{children}</div>
}

function Advanced({ children, summary = 'Catalog settings' }) {
  return (
    <details className="[&_summary::-webkit-details-marker]:hidden">
      <summary className="inline-flex cursor-pointer list-none items-center rounded-md px-1 py-1 text-xs font-medium text-slate-500 hover:text-white" title="Only needed if you want to point Startboard at a mirrored or self-hosted icon catalog.">
        {summary}
      </summary>
      <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/30 p-3">{children}</div>
    </details>
  )
}

function IconResults({ title = 'Results', subtitle = '', busy, error, empty, children }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-300">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
        </div>
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      {error && <div className="mb-2 text-sm text-red-400">{error}</div>}
      {empty ? <div className="text-xs text-slate-400">{empty}</div> : <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">{children}</div>}
    </div>
  )
}

function GroupPreview({ title, iconUrl, iconColor, bgColor, headerBgColor, headerTextColor, bookmarkTitleColor, transparency, displayMode, iconSize, bookmarkAlign, visibleLimit, bookmarks = [] }) {
  const sourceBookmarks = bookmarks.length ? bookmarks : PREVIEW_BOOKMARKS
  const previewBookmarks = visibleLimit > 0 ? sourceBookmarks.slice(0, visibleLimit) : sourceBookmarks
  const resolvedIconSize = PREVIEW_ICON_SIZE_MAP[iconSize] || PREVIEW_ICON_SIZE_MAP.small
  const iconStageSize = Math.max(resolvedIconSize + 10, 28)
  const alignMode = bookmarkAlign || 'auto'
  const iconsJustify = alignMode === 'left' ? 'start' : 'center'
  const itemTextClass = alignMode === 'center' ? 'text-center' : 'text-left'
  const itemJustifyClass = alignMode === 'center' ? 'justify-center' : 'justify-start'

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      <div className="mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Live preview</div>
        <div className="mt-1 text-sm text-slate-300">How this group will look on the board.</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/3 shadow-lg">
        <div
          className="flex items-center gap-2 border-b border-white/10 px-4 py-3"
          style={{
            backgroundColor: headerBgColor || undefined,
            color: headerTextColor || undefined,
          }}
        >
          <Favicon iconUrl={iconUrl} title={title} size={18} color={iconColor} />
          <h3 className={`flex-1 truncate text-sm font-semibold uppercase tracking-wide ${headerTextColor ? '' : 'text-slate-300'}`}>
            {title.trim() || 'Untitled group'}
          </h3>
        </div>
        <div
          className="p-2"
          style={{
            display: 'grid',
            gap: '2px',
            backgroundColor: bgColor
              ? `color-mix(in oklab, ${bgColor} ${Math.max(6, 100 - (transparency ?? 0))}%, transparent)`
              : undefined,
          }}
        >
          {displayMode === 'cloud' ? (
            <div className="flex flex-wrap gap-2 p-1">
              {previewBookmarks.map((bookmark, index) => (
                <span
                  key={bookmark.id}
                  className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-slate-200"
                  style={{ fontSize: `${0.76 + (index * 0.08)}rem` }}
                >
                  <Favicon iconUrl={bookmark.icon_url} title={bookmark.title} size={Math.max(16, resolvedIconSize - 2)} color={bookmark.icon_color || iconColor} />
                  <span className="truncate" style={{ color: bookmarkTitleColor || undefined }}>{bookmark.title}</span>
                </span>
              ))}
            </div>
          ) : displayMode === 'icons' ? (
            <div
              className="grid p-2"
              style={{
                gap: '10px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(44px, max-content))',
                justifyContent: iconsJustify,
                alignContent: 'start',
              }}
            >
              {previewBookmarks.map((bookmark) => (
                <div key={bookmark.id} className={`sb-link flex w-auto min-w-0 rounded-md px-1.5 py-1 text-sm text-slate-200 ${alignMode === 'center' ? 'justify-self-center text-center' : 'justify-self-start text-left'}`}>
                  <span className="flex items-center justify-center" style={{ width: iconStageSize, height: iconStageSize }}>
                    <Favicon iconUrl={bookmark.icon_url} title={bookmark.title} size={resolvedIconSize} treatment="tile" color={bookmark.icon_color || iconColor} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            previewBookmarks.map((bookmark) => (
              <div key={bookmark.id} className={`sb-link flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 ${itemJustifyClass} ${itemTextClass}`}>
                <Favicon iconUrl={bookmark.icon_url} title={bookmark.title} size={resolvedIconSize} color={bookmark.icon_color || iconColor} />
                <span className={`min-w-0 flex-1 ${displayMode === 'detailed' ? '' : 'truncate'}`}>
                  <span className="block truncate" style={{ color: bookmarkTitleColor || undefined }}>{bookmark.title}</span>
                  {displayMode === 'detailed' && bookmark.description && (
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{bookmark.description}</span>
                  )}
                </span>
              </div>
            ))
          )}
          {previewBookmarks.length === 0 && (
            <div className="px-2 py-3 text-xs text-slate-500">No bookmarks visible.</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GroupModal({ group, onSave, onDelete, onClose }) {
  const editing = Boolean(group)
  const parsedIconify = useMemo(() => parseIconifyUrl(group?.icon_url || ''), [group?.icon_url])
  const [activeTab, setActiveTab] = useState('general')
  const [title, setTitle] = useState(group?.title || '')
  const [bgColor, setBgColor] = useState(group?.bg_color || '')
  const [headerBgColor, setHeaderBgColor] = useState(group?.header_bg_color || '')
  const [headerTextColor, setHeaderTextColor] = useState(group?.header_text_color || '')
  const [bookmarkTitleColor, setBookmarkTitleColor] = useState(group?.bookmark_title_color || '')
  const [iconColor, setIconColor] = useState(group?.icon_color || '')
  const [transparency, setTransparency] = useState(group?.transparency ?? 0)
  const [displayMode, setDisplayMode] = useState(group?.display_mode || 'list')
  const [iconSize, setIconSize] = useState(group?.icon_size || 'small')
  const [bookmarkAlign, setBookmarkAlign] = useState(group?.bookmark_align || 'auto')
  const [visibleLimit, setVisibleLimit] = useState(group?.visible_limit ?? 0)
  const [iconSource, setIconSource] = useState('auto')
  const [iconSourceDirty, setIconSourceDirty] = useState(false)
  const [libraryProvider, setLibraryProvider] = useState(inferLibraryProvider(group?.icon_url || '', parsedIconify))
  const [directIconUrl, setDirectIconUrl] = useState(parsedIconify || (group?.icon_url || '').startsWith('/api/icons/') ? '' : (group?.icon_url || ''))
  const [uploadedIconUrl, setUploadedIconUrl] = useState((group?.icon_url || '').startsWith('/api/icons/') ? group.icon_url : '')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [iconifyBaseUrl, setIconifyBaseUrl] = useState(parsedIconify?.baseUrl || DEFAULT_ICONIFY_API_BASE)
  const [iconifyPrefix, setIconifyPrefix] = useState(parsedIconify?.prefix || 'lucide')
  const [iconifyName, setIconifyName] = useState(parsedIconify?.name || '')
  const [iconifyColor, setIconifyColor] = useState(parsedIconify?.color || '')
  const [selfhStIndexUrl, setSelfhStIndexUrl] = useState(DEFAULT_SELFHST_INDEX_URL)
  const [selfhStCdnBaseUrl, setSelfhStCdnBaseUrl] = useState(DEFAULT_SELFHST_CDN_BASE)
  const [selfhStIcons, setSelfhStIcons] = useState([])
  const [selfhStLoaded, setSelfhStLoaded] = useState(false)
  const [selfhStLoading, setSelfhStLoading] = useState(false)
  const [selfhStError, setSelfhStError] = useState('')
  const [selfhStRef, setSelfhStRef] = useState('')
  const [selfhStSelection, setSelfhStSelection] = useState(null)
  const [dashIndexUrl, setDashIndexUrl] = useState(DEFAULT_DASH_METADATA_URL)
  const [dashCdnBaseUrl, setDashCdnBaseUrl] = useState(DEFAULT_DASH_CDN_BASE)
  const [dashIcons, setDashIcons] = useState([])
  const [dashLoaded, setDashLoaded] = useState(false)
  const [dashLoading, setDashLoading] = useState(false)
  const [dashError, setDashError] = useState('')
  const [dashRef, setDashRef] = useState('')
  const [dashSelection, setDashSelection] = useState(null)
  const [searchQuery, setSearchQuery] = useState(parsedIconify?.name || (group?.title || ''))
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [searchResults, setSearchResults] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activeLibraryProvider = useMemo(() => libraryProviderMeta(libraryProvider), [libraryProvider])
  const trimmedSearchQuery = deferredSearchQuery.trim()
  const currentIconUrl = group?.icon_url || ''

  const resolvedIconUrl = useMemo(() => {
    if (iconSource === 'auto') return ''
    if (iconSource === 'direct') return directIconUrl.trim()
    if (iconSource === 'upload') return uploadedIconUrl.trim()
    if (libraryProvider === 'selfhst') return buildSelfhStIconUrl({ cdnBaseUrl: selfhStCdnBaseUrl, ref: selfhStRef, hasSvg: selfhStSelection?.hasSvg ?? true })
    if (libraryProvider === 'dashboardicons') return buildDashIconUrl({ cdnBaseUrl: dashCdnBaseUrl, ref: dashRef, base: dashSelection?.base ?? 'svg' })
    return buildIconifyUrl({ baseUrl: iconifyBaseUrl, prefix: iconifyPrefix, name: iconifyName, color: iconifyColor })
  }, [iconSource, libraryProvider, directIconUrl, uploadedIconUrl, iconifyBaseUrl, iconifyPrefix, iconifyName, iconifyColor, selfhStCdnBaseUrl, selfhStRef, selfhStSelection, dashCdnBaseUrl, dashRef, dashSelection])

  const selfhStResults = useMemo(() => {
    const query = trimmedSearchQuery.toLowerCase()
    if (iconSource !== 'library' || libraryProvider !== 'selfhst' || query.length < 2) return []
    return selfhStIcons.filter((icon) => icon.name.toLowerCase().includes(query) || icon.ref.toLowerCase().includes(query) || icon.category.toLowerCase().includes(query)).slice(0, 40)
  }, [iconSource, libraryProvider, trimmedSearchQuery, selfhStIcons])

  const dashResults = useMemo(() => {
    const query = trimmedSearchQuery.toLowerCase()
    if (iconSource !== 'library' || libraryProvider !== 'dashboardicons' || query.length < 2) return []
    return dashIcons.filter((icon) => icon.ref.toLowerCase().includes(query) || icon.aliases.some((a) => a.toLowerCase().includes(query)) || icon.categories.some((c) => c.toLowerCase().includes(query))).slice(0, 40)
  }, [iconSource, libraryProvider, trimmedSearchQuery, dashIcons])

  useEffect(() => {
    if (iconSource !== 'library' || !LIBRARY_PROVIDERS.some((provider) => provider.kind === 'iconify' && provider.id === libraryProvider)) return undefined
    if (!iconifyBaseUrl.trim() || trimmedSearchQuery.length < 2) return undefined
    const controller = new AbortController()
    const endpoint = `${iconifyBaseUrl.replace(/\/+$/, '')}/search?query=${encodeURIComponent(trimmedSearchQuery)}&prefix=${encodeURIComponent(iconifyPrefix)}&limit=32`
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setSearchBusy(true)
      setSearchError('')
    })
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Icon search failed (${response.status})`)
        return response.json()
      })
      .then((data) => setSearchResults(Array.isArray(data.icons) ? data.icons : []))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setSearchResults([])
        setSearchError(err.message || 'Could not search icons')
      })
      .finally(() => setSearchBusy(false))
    return () => controller.abort()
  }, [iconSource, libraryProvider, iconifyBaseUrl, iconifyPrefix, trimmedSearchQuery])

  useEffect(() => {
    if (iconSource !== 'library' || libraryProvider !== 'selfhst' || selfhStLoaded || !selfhStIndexUrl.trim()) return undefined
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setSelfhStLoading(true)
      setSelfhStError('')
    })
    fetch(selfhStIndexUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`selfh.st index failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        const mapped = Array.isArray(data) ? data.map((row) => ({
          name: String(row?.[0] || ''),
          ref: String(row?.[1] || ''),
          hasSvg: String(row?.[2] || '').toUpperCase() === 'Y',
          category: String(row?.[7] || ''),
        })).filter((icon) => icon.name && icon.ref) : []
        setSelfhStIcons(mapped)
        setSelfhStLoaded(true)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setSelfhStError(err.message || 'Could not load selfh.st icons')
      })
      .finally(() => setSelfhStLoading(false))
    return () => controller.abort()
  }, [iconSource, libraryProvider, selfhStLoaded, selfhStIndexUrl])

  useEffect(() => {
    if (iconSource !== 'library' || libraryProvider !== 'dashboardicons' || dashLoaded || !dashIndexUrl.trim()) return undefined
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setDashLoading(true)
      setDashError('')
    })
    fetch(dashIndexUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Dashboard Icons catalog failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        const mapped = data && typeof data === 'object' ? Object.entries(data).map(([slug, meta]) => ({
          name: slug,
          ref: slug,
          base: meta?.base === 'png' ? 'png' : 'svg',
          aliases: Array.isArray(meta?.aliases) ? meta.aliases.map(String) : [],
          categories: Array.isArray(meta?.categories) ? meta.categories.map(String) : [],
        })).filter((icon) => icon.ref) : []
        setDashIcons(mapped)
        setDashLoaded(true)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setDashError(err.message || 'Could not load Dashboard Icons')
      })
      .finally(() => setDashLoading(false))
    return () => controller.abort()
  }, [iconSource, libraryProvider, dashLoaded, dashIndexUrl])

  const chooseIconSource = (sourceId) => {
    if (sourceId === 'library' && iconSource !== 'library') setSearchQuery((q) => q.trim() || title.trim())
    if (sourceId !== 'upload') setUploadError('')
    setIconSourceDirty(true)
    setIconSource(sourceId)
  }

  const chooseLibraryProvider = (providerId) => {
    setLibraryProvider(providerId)
    setSearchQuery((q) => q.trim() || title.trim())
    const provider = LIBRARY_PROVIDERS.find((item) => item.id === providerId)
    if (provider?.kind === 'iconify') setIconifyPrefix(provider.prefix)
    if (providerId === 'selfhst' && !selfhStSelection) setSelfhStRef('')
    if (providerId === 'dashboardicons' && !dashSelection) setDashRef('')
  }

  const uploadIconFile = async (file) => {
    if (!file) return
    const sizeLimit = uploadLimitForFile(file)
    if (sizeLimit && file.size > sizeLimit) {
      setUploadedIconUrl('')
      setUploadError(`${file.name} exceeds the ${formatUploadLimit(sizeLimit)} limit for .${file.name.split('.').pop().toLowerCase()} files`)
      return
    }
    setUploadBusy(true)
    setUploadError('')
    try {
      const result = await bookmarksAPI.uploadIcon(file)
      setUploadedIconUrl(result.icon_url || '')
      setIconSourceDirty(true)
      setIconSource('upload')
    } catch (err) {
      setUploadedIconUrl('')
      setUploadError(errorMessage(err, 'Could not upload icon'))
    } finally {
      setUploadBusy(false)
    }
  }

  const save = async () => {
    if (!title.trim()) {
      setError('A group title is required')
      return
    }
    if (iconSource === 'upload' && !uploadedIconUrl.trim()) {
      setError('Upload an icon file before saving')
      return
    }
    if (iconSource === 'library') {
      if (libraryProvider === 'selfhst' && !selfhStRef.trim()) return setError('Choose a selfh.st icon or enter its reference name')
      if (libraryProvider === 'dashboardicons' && !dashRef.trim()) return setError('Choose a Dashboard Icon or enter its name')
      if (!['selfhst', 'dashboardicons'].includes(libraryProvider) && (!iconifyPrefix.trim() || !iconifyName.trim())) return setError('Choose an icon or enter an icon name')
    }
    setBusy(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        icon_url: editing && !iconSourceDirty ? (group?.icon_url ?? null) : (resolvedIconUrl || null),
        bg_color: bgColor.trim(),
        header_bg_color: headerBgColor.trim(),
        header_text_color: headerTextColor.trim(),
        bookmark_title_color: bookmarkTitleColor.trim(),
        icon_color: iconColor.trim(),
        transparency,
        display_mode: displayMode,
        icon_size: iconSize,
        bookmark_align: bookmarkAlign,
        visible_limit: visibleLimit,
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save group'))
      setBusy(false)
    }
  }

  const librarySearchPlaceholder = activeLibraryProvider.id === 'selfhst'
    ? 'Search selfh.st/icons, e.g. immich, sonarr, nextcloud'
    : activeLibraryProvider.id === 'dashboardicons'
      ? 'Search Dashboard Icons, e.g. ntopng, plex'
      : `Search ${activeLibraryProvider.label}, e.g. shield, database`

  const iconifyResultsEmpty = trimmedSearchQuery.length < 2 ? `Type at least 2 characters to search ${activeLibraryProvider.label}.` : (searchResults.length === 0 && !searchBusy ? `No matches in ${activeLibraryProvider.label} for "${trimmedSearchQuery}".` : '')
  const selfhStResultsEmpty = !selfhStLoaded && !selfhStLoading ? `Loading ${activeLibraryProvider.label} catalog…` : trimmedSearchQuery.length < 2 ? `Type at least 2 characters to search ${activeLibraryProvider.label}.` : (selfhStResults.length === 0 && !selfhStLoading ? `No matches in ${activeLibraryProvider.label} for "${trimmedSearchQuery}".` : '')
  const dashResultsEmpty = !dashLoaded && !dashLoading ? `Loading ${activeLibraryProvider.label} catalog…` : trimmedSearchQuery.length < 2 ? `Type at least 2 characters to search ${activeLibraryProvider.label}.` : (dashResults.length === 0 && !dashLoading ? `No matches in ${activeLibraryProvider.label} for "${trimmedSearchQuery}".` : '')

  return (
    <Modal
      title={editing ? 'Edit group' : 'Add group'}
      size="6xl"
      onClose={onClose}
      footer={
        <>
          {editing && <button className={`${btnDanger} mr-auto`} onClick={onDelete} disabled={busy}>Delete</button>}
          <button className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}<span>Save</span></button>
        </>
      }
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                activeTab === tab.id ? 'bg-accent/15 text-white' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="xl:hidden">
          <GroupPreview
            title={title}
            iconUrl={resolvedIconUrl || currentIconUrl}
            iconColor={iconColor}
            bgColor={bgColor}
            transparency={transparency}
            displayMode={displayMode}
            iconSize={iconSize}
            visibleLimit={visibleLimit}
            bookmarks={group?.bookmarks || []}
            headerBgColor={headerBgColor}
            headerTextColor={headerTextColor}
            bookmarkTitleColor={bookmarkTitleColor}
            bookmarkAlign={bookmarkAlign}
          />
        </div>

        {activeTab === 'general' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <Labeled text="Title">
              <input className={input} value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
            </Labeled>
          </div>
        )}

        {activeTab === 'icon' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 inline-flex flex-wrap gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
              {ICON_SOURCES.map((source) => (
                <button key={source.id} type="button" onClick={() => chooseIconSource(source.id)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${iconSource === source.id ? 'bg-accent text-white' : 'text-slate-300 hover:bg-white/10'}`}>{source.label}</button>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/30 px-3 py-2">
              {editing && currentIconUrl && <div className="flex items-center gap-2"><Favicon iconUrl={currentIconUrl} title={group?.title} size={18} color={iconColor} /><span className="text-xs text-slate-500">Current</span></div>}
              <div className="flex items-center gap-2"><Favicon iconUrl={resolvedIconUrl} title={title} size={18} color={iconColor} /><span className="text-xs text-slate-400">Preview</span></div>
            </div>
            {iconSource === 'auto' && <div className="rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-xs text-slate-400">Startboard will show the letter tile for this group.</div>}
            {iconSource === 'direct' && <div><input className={input} value={directIconUrl} onChange={(e) => setDirectIconUrl(e.target.value)} placeholder="/icons/folder.svg or https://cdn.example.com/folder.svg" /><p className="mt-1.5 text-xs text-slate-400">Self-hosted SVG/PNG asset or any explicit image URL.</p></div>}
            {iconSource === 'upload' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-dashed border-white/15 bg-slate-900/30 p-3">
                  <label className="flex cursor-pointer flex-col gap-2">
                    <span className="text-sm font-medium text-white">Upload icon file</span>
                    <span className="text-xs text-slate-400">SVG up to 256 KB, ICO up to 512 KB, PNG/WEBP/JPG/GIF up to 1 MB. Uploaded icons are stored locally and served from Startboard.</span>
                    <input type="file" accept=".svg,.png,.ico,.webp,.jpg,.jpeg,.gif,image/svg+xml,image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg,image/gif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; void uploadIconFile(file); e.target.value = '' }} />
                    <div className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">{uploadBusy ? <Spinner className="h-4 w-4" /> : null}<span>{uploadBusy ? 'Uploading…' : 'Choose file'}</span></div>
                  </label>
                </div>
                {uploadError && <div className="text-sm text-red-400">{uploadError}</div>}
              </div>
            )}
            {iconSource === 'library' && (
              <div className="space-y-3">
                <div className={`grid gap-3 ${LIBRARY_PROVIDERS.some((provider) => provider.kind === 'iconify' && provider.id === libraryProvider) ? 'xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_220px]' : 'xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]'}`}>
                  <div>
                    <div className="mb-1 flex items-center gap-2"><label className={label}>Library provider</label><span className="inline-flex text-slate-500" title={activeLibraryProvider.hint} aria-label={activeLibraryProvider.hint}><CircleHelp className="h-3.5 w-3.5" /></span></div>
                    <select className={input} value={libraryProvider} onChange={(e) => chooseLibraryProvider(e.target.value)}>
                      {LIBRARY_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Search</label>
                    <input className={input} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={librarySearchPlaceholder} />
                  </div>
                  {LIBRARY_PROVIDERS.some((provider) => provider.kind === 'iconify' && provider.id === libraryProvider) && (
                    <div>
                      <label className={label}>Icon colour</label>
                      <ColorField value={iconifyColor} onChange={setIconifyColor} />
                    </div>
                  )}
                </div>
                {libraryProvider === 'selfhst' ? (
                  <>
                    <IconResults title={`${activeLibraryProvider.label} results`} subtitle={trimmedSearchQuery ? `Query: ${trimmedSearchQuery}` : activeLibraryProvider.hint} busy={selfhStLoading} error={selfhStError} empty={selfhStResultsEmpty}>
                      {selfhStResults.map((icon) => <SelfhStResultButton key={icon.ref} icon={icon} selected={icon.ref === selfhStRef} onSelect={(selected) => { setSelfhStSelection(selected); setSelfhStRef(selected.ref); }} cdnBaseUrl={selfhStCdnBaseUrl} />)}
                    </IconResults>
                    <Advanced summary="Catalog settings">
                      <div className="space-y-3">
                        <Labeled text="Selected reference"><input className={input} value={selfhStRef} onChange={(e) => { setSelfhStRef(e.target.value); setSelfhStSelection(null) }} placeholder="immich" /></Labeled>
                        <Labeled text="selfh.st index URL"><input className={input} value={selfhStIndexUrl} onChange={(e) => { setSelfhStIndexUrl(e.target.value); setSelfhStLoaded(false); setSelfhStIcons([]) }} /></Labeled>
                        <Labeled text="Icon CDN base"><input className={input} value={selfhStCdnBaseUrl} onChange={(e) => setSelfhStCdnBaseUrl(e.target.value)} /></Labeled>
                      </div>
                    </Advanced>
                  </>
                ) : libraryProvider === 'dashboardicons' ? (
                  <>
                    <IconResults title={`${activeLibraryProvider.label} results`} subtitle={trimmedSearchQuery ? `Query: ${trimmedSearchQuery}` : activeLibraryProvider.hint} busy={dashLoading} error={dashError} empty={dashResultsEmpty}>
                      {dashResults.map((icon) => <DashResultButton key={icon.ref} icon={icon} selected={icon.ref === dashRef} onSelect={(selected) => { setDashSelection(selected); setDashRef(selected.ref); }} cdnBaseUrl={dashCdnBaseUrl} />)}
                    </IconResults>
                    <Advanced summary="Catalog settings">
                      <div className="space-y-3">
                        <Labeled text="Selected name"><input className={input} value={dashRef} onChange={(e) => { setDashRef(e.target.value); setDashSelection(null) }} placeholder="ntopng" /></Labeled>
                        <Labeled text="Metadata URL"><input className={input} value={dashIndexUrl} onChange={(e) => { setDashIndexUrl(e.target.value); setDashLoaded(false); setDashIcons([]) }} /></Labeled>
                        <Labeled text="Icon CDN base"><input className={input} value={dashCdnBaseUrl} onChange={(e) => setDashCdnBaseUrl(e.target.value)} /></Labeled>
                      </div>
                    </Advanced>
                  </>
                ) : (
                  <>
                    <IconResults title={`${activeLibraryProvider.label} results`} subtitle={trimmedSearchQuery ? `Query: ${trimmedSearchQuery}` : activeLibraryProvider.hint} busy={searchBusy} error={searchError} empty={iconifyResultsEmpty}>
                      {searchResults.map((icon) => <SearchResultButton key={icon} icon={icon} selected={icon === `${iconifyPrefix}:${iconifyName}`} onSelect={(selected) => { const [prefix, name] = selected.split(':'); setIconifyPrefix(prefix); setIconifyName(name) }} baseUrl={iconifyBaseUrl} color={iconifyColor} />)}
                    </IconResults>
                    <Advanced summary="Provider settings">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Labeled text="Selected name"><input className={input} value={iconifyName} onChange={(e) => setIconifyName(e.target.value)} placeholder="folder" /></Labeled>
                        <Labeled text="Collection prefix"><input className={input} value={iconifyPrefix} onChange={(e) => setIconifyPrefix(e.target.value)} placeholder="lucide" /></Labeled>
                        <Labeled text="Icon API base"><input className={input} value={iconifyBaseUrl} onChange={(e) => setIconifyBaseUrl(e.target.value)} placeholder="https://api.iconify.design" /></Labeled>
                      </div>
                    </Advanced>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'background' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="space-y-3">
              <div>
                <label className={label}>Default icon colour</label>
                <ColorField value={iconColor} onChange={setIconColor} />
                <p className="mt-1 text-xs text-slate-500">Applies to this group icon and its bookmarks unless a bookmark sets its own icon colour.</p>
              </div>
              <div>
                <label className={label}>Background colour</label>
                <ColorField value={bgColor} onChange={setBgColor} />
              </div>
              <div>
                <label className={label}>Header background</label>
                <ColorField value={headerBgColor} onChange={setHeaderBgColor} />
              </div>
              <div>
                <label className={label}>Header text colour</label>
                <ColorField value={headerTextColor} onChange={setHeaderTextColor} />
              </div>
              <div>
                <label className={label}>Bookmark title colour</label>
                <ColorField value={bookmarkTitleColor} onChange={setBookmarkTitleColor} />
                <p className="mt-1 text-xs text-slate-500">Default for bookmarks in this group. Overrides the page default; a bookmark’s own colour wins.</p>
              </div>
              <div>
                <label className={label}>Widget transparency</label>
                <RangeField value={transparency} onChange={setTransparency} min={0} max={100} unit="%" format={(value) => `${value}%`} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'display' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="space-y-3">
              <div>
                <label className={label}>Show bookmarks</label>
                <select className={input} value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
                  <option value="list">List</option>
                  <option value="detailed">Detailed</option>
                  <option value="icons">Icons</option>
                  <option value="cloud">Cloud</option>
                </select>
              </div>
              <div>
                <label className={label}>Icon size</label>
                <select className={input} value={iconSize} onChange={(e) => setIconSize(e.target.value)}>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="xl">XL</option>
                </select>
              </div>
              <div>
                <label className={label}>Bookmark alignment</label>
                <select className={input} value={bookmarkAlign} onChange={(e) => setBookmarkAlign(e.target.value)}>
                  <option value="auto">Automatic</option>
                  <option value="left">Left aligned</option>
                  <option value="center">Centered</option>
                </select>
              </div>
              <div>
                <label className={label}>Visible bookmarks</label>
                <select className={input} value={visibleLimit} onChange={(e) => setVisibleLimit(Number(e.target.value))}>
                  <option value={0}>All</option>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                </select>
              </div>
            </div>
          </div>
        )}

        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-0">
            <GroupPreview
              title={title}
              iconUrl={resolvedIconUrl || currentIconUrl}
              iconColor={iconColor}
              bgColor={bgColor}
              transparency={transparency}
              displayMode={displayMode}
              iconSize={iconSize}
              visibleLimit={visibleLimit}
              bookmarks={group?.bookmarks || []}
              headerBgColor={headerBgColor}
              headerTextColor={headerTextColor}
              bookmarkTitleColor={bookmarkTitleColor}
              bookmarkAlign={bookmarkAlign}
            />
          </div>
        </aside>
      </div>
    </Modal>
  )
}
