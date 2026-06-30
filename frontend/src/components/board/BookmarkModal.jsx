import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, Save } from 'lucide-react'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'
import Favicon from '../Favicon.jsx'
import { btnDanger, btnPrimary, btnSecondary, input, label } from '../ui.js'
import { ColorField } from '../settings/SettingsKit.jsx'
import { bookmarksAPI, errorMessage, pagesAPI } from '../../services/api.js'

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

// Seed icon-search with the bookmark's title, falling back to the docker ref's
// base image name (e.g. "lscr.io/linuxserver/plex:latest" → "plex").
function iconSearchSeed(title, dockerRef) {
  const t = (title || '').trim()
  if (t) return t
  const ref = (dockerRef || '').trim()
  if (ref) return ref.split('/').pop().split(':')[0].trim()
  return ''
}

function parseIconifyUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/icons/')) {
      return null
    }
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
  const url = new URL(
    `${normalizedBase}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
    window.location.origin,
  )
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
  const previewUrl = buildIconifyUrl({
    baseUrl,
    prefix,
    name,
    color,
  })

  return (
    <button
      type="button"
      onClick={() => onSelect(icon)}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? 'border-accent bg-accent/15'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
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
  const previewUrl = buildSelfhStIconUrl({
    cdnBaseUrl,
    ref: icon.ref,
    hasSvg: icon.hasSvg,
  })

  return (
    <button
      type="button"
      onClick={() => onSelect(icon)}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? 'border-accent bg-accent/15'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <Favicon iconUrl={previewUrl} title={icon.name} size={20} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{icon.name}</div>
        <div className="truncate text-xs text-slate-400">
          {icon.ref}
          {icon.category ? ` · ${icon.category}` : ''}
        </div>
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
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? 'border-accent bg-accent/15'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <Favicon iconUrl={previewUrl} title={icon.name} size={20} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-white">{icon.name}</div>
        <div className="truncate text-xs text-slate-400">
          {icon.ref}
          {icon.categories[0] ? ` · ${icon.categories[0].replace(/-/g, ' ')}` : ''}
        </div>
      </div>
    </button>
  )
}

// A labelled field wrapper (uppercase caption + control).
function Labeled({ text, children }) {
  return <div><label className={label}>{text}</label>{children}</div>
}

// Collapsible "Advanced settings" disclosure for power-user icon config.
function Advanced({ children, summary = 'Catalog settings' }) {
  return (
    <details className="[&_summary::-webkit-details-marker]:hidden">
      <summary
        className="inline-flex cursor-pointer list-none items-center rounded-md px-1 py-1 text-xs font-medium text-slate-500 hover:text-white"
        title="Only needed if you want to point Startboard at a mirrored or self-hosted icon catalog."
      >
        {summary}
      </summary>
      <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/30 p-3">{children}</div>
    </details>
  )
}

// Shared results pane: header + busy/error/empty states + scrollable grid.
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
      {empty ? (
        <div className="text-xs text-slate-400">{empty}</div>
      ) : (
        <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">{children}</div>
      )}
    </div>
  )
}

// Add or edit a bookmark. `bookmark` null => create mode.
export default function BookmarkModal({ bookmark, groups = [], pages = [], currentPageId = null, currentGroupId = null, focusIcon = false, onSave, onDelete, onClose }) {
  const editing = Boolean(bookmark)
  const iconPanelRef = useRef(null)
  const parsedIconify = useMemo(() => parseIconifyUrl(bookmark?.icon_url || ''), [bookmark?.icon_url])
  // Pages the bookmark can be moved to: the current page plus any editable page.
  const movablePages = useMemo(
    () => pages.filter((page) => page.id === currentPageId || page.can_edit),
    [pages, currentPageId],
  )
  const [pageId, setPageId] = useState(currentPageId ? String(currentPageId) : '')
  const onCurrentPage = !pageId || Number(pageId) === currentPageId
  // Groups for a page other than the current one, fetched on demand. The current
  // page reuses the groups already in memory.
  const [fetchedGroups, setFetchedGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState('')
  const pageGroups = onCurrentPage ? groups : fetchedGroups
  const sortedGroups = useMemo(
    () => [...pageGroups].sort((a, b) => (a.column - b.column) || (a.position - b.position) || a.title.localeCompare(b.title)),
    [pageGroups],
  )
  const [url, setUrl] = useState(bookmark?.url || '')
  const [title, setTitle] = useState(bookmark?.title || '')
  const [titleColor, setTitleColor] = useState(bookmark?.title_color || '')
  const [iconColor, setIconColor] = useState(bookmark?.icon_color || '')
  const [description, setDescription] = useState(bookmark?.description || '')
  const [dockerRef, setDockerRef] = useState(bookmark?.docker_ref || '')
  const [groupId, setGroupId] = useState(String(bookmark?.group_id || currentGroupId || ''))
  // Live link preview (create mode): fetch the site's title/description/favicon
  // shortly after typing so the user sees what will be saved. Auto-fill only
  // untouched fields so manual edits are never clobbered.
  const [meta, setMeta] = useState(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const titleTouchedRef = useRef(Boolean(bookmark?.title))
  const descTouchedRef = useRef(bookmark?.description != null)

  // When the target page changes, load its groups and select the first one. The
  // current page reuses the groups already in memory.
  useEffect(() => {
    if (onCurrentPage) return undefined
    let cancelled = false
    // Network-driven group load for the chosen page; updates happen in the chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroupsLoading(true)
    setGroupsError('')
    pagesAPI.get(Number(pageId))
      .then((data) => {
        if (cancelled) return
        const list = data.groups || []
        setFetchedGroups(list)
        setGroupId(list[0] ? String(list[0].id) : '')
      })
      .catch((err) => {
        if (cancelled) return
        setGroupsError(errorMessage(err, 'Could not load groups for that page'))
        setFetchedGroups([])
        setGroupId('')
      })
      .finally(() => { if (!cancelled) setGroupsLoading(false) })
    return () => { cancelled = true }
  }, [pageId, onCurrentPage])

  // When opened via the "Change icon" context-menu action, scroll the icon panel
  // into view and move focus to the icon source picker instead of the URL field.
  useEffect(() => {
    if (!focusIcon) return
    const panel = iconPanelRef.current
    if (!panel) return
    panel.scrollIntoView({ block: 'nearest' })
    panel.querySelector('button')?.focus()
  }, [focusIcon])

  const [iconSource, setIconSource] = useState('auto')
  const [iconSourceDirty, setIconSourceDirty] = useState(false)
  const [libraryProvider, setLibraryProvider] = useState(inferLibraryProvider(bookmark?.icon_url || '', parsedIconify))
  const [directIconUrl, setDirectIconUrl] = useState(parsedIconify || (bookmark?.icon_url || '').startsWith('/api/icons/') ? '' : (bookmark?.icon_url || ''))
  const [uploadedIconUrl, setUploadedIconUrl] = useState((bookmark?.icon_url || '').startsWith('/api/icons/') ? bookmark.icon_url : '')
  const [uploadedFileName, setUploadedFileName] = useState('')
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
  const [searchQuery, setSearchQuery] = useState(
    parsedIconify?.name || iconSearchSeed(bookmark?.title, bookmark?.docker_ref),
  )
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [searchResults, setSearchResults] = useState([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activeLibraryProvider = useMemo(() => libraryProviderMeta(libraryProvider), [libraryProvider])
  const trimmedSearchQuery = deferredSearchQuery.trim()
  const currentIconUrl = bookmark?.icon_url || ''

  const resolvedIconUrl = useMemo(() => {
    if (iconSource === 'auto') return ''
    if (iconSource === 'direct') return directIconUrl.trim()
    if (iconSource === 'upload') return uploadedIconUrl.trim()
    if (libraryProvider === 'selfhst') {
      return buildSelfhStIconUrl({
        cdnBaseUrl: selfhStCdnBaseUrl,
        ref: selfhStRef,
        hasSvg: selfhStSelection?.hasSvg ?? true,
      })
    }
    if (libraryProvider === 'dashboardicons') {
      return buildDashIconUrl({
        cdnBaseUrl: dashCdnBaseUrl,
        ref: dashRef,
        base: dashSelection?.base ?? 'svg',
      })
    }
    return buildIconifyUrl({
      baseUrl: iconifyBaseUrl,
      prefix: iconifyPrefix,
      name: iconifyName,
      color: iconifyColor,
    })
  }, [iconSource, libraryProvider, directIconUrl, uploadedIconUrl, iconifyBaseUrl, iconifyPrefix, iconifyName, iconifyColor, selfhStCdnBaseUrl, selfhStRef, selfhStSelection, dashCdnBaseUrl, dashRef, dashSelection])

  const selfhStResults = useMemo(() => {
    const query = trimmedSearchQuery.toLowerCase()
    if (iconSource !== 'library' || libraryProvider !== 'selfhst' || query.length < 2) return []
    return selfhStIcons
      .filter((icon) => (
        icon.name.toLowerCase().includes(query)
        || icon.ref.toLowerCase().includes(query)
        || icon.category.toLowerCase().includes(query)
      ))
      .slice(0, 40)
  }, [iconSource, libraryProvider, trimmedSearchQuery, selfhStIcons])

  const dashResults = useMemo(() => {
    const query = trimmedSearchQuery.toLowerCase()
    if (iconSource !== 'library' || libraryProvider !== 'dashboardicons' || query.length < 2) return []
    return dashIcons
      .filter((icon) => (
        icon.ref.toLowerCase().includes(query)
        || icon.aliases.some((a) => a.toLowerCase().includes(query))
        || icon.categories.some((c) => c.toLowerCase().includes(query))
      ))
      .slice(0, 40)
  }, [iconSource, libraryProvider, trimmedSearchQuery, dashIcons])

  useEffect(() => {
    if (iconSource !== 'library' || !LIBRARY_PROVIDERS.some((provider) => provider.kind === 'iconify' && provider.id === libraryProvider)) return undefined
    if (!iconifyBaseUrl.trim() || trimmedSearchQuery.length < 2) return undefined

    const controller = new AbortController()
    const query = trimmedSearchQuery
    const endpoint = `${iconifyBaseUrl.replace(/\/+$/, '')}/search?query=${encodeURIComponent(query)}&prefix=${encodeURIComponent(iconifyPrefix)}&limit=32`

    // Network-driven search bootstrap; async updates happen in the fetch chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchBusy(true)
    setSearchError('')
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

    // Catalog bootstrap for the selfh.st icon source; async updates happen in the fetch chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelfhStLoading(true)
    setSelfhStError('')
    fetch(selfhStIndexUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`selfh.st index failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        const mapped = Array.isArray(data)
          ? data.map((row) => ({
            name: String(row?.[0] || ''),
            ref: String(row?.[1] || ''),
            hasSvg: String(row?.[2] || '').toUpperCase() === 'Y',
            category: String(row?.[7] || ''),
          })).filter((icon) => icon.name && icon.ref)
          : []
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

    // Catalog bootstrap for Dashboard Icons; async updates happen in the fetch chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDashLoading(true)
    setDashError('')
    fetch(dashIndexUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Dashboard Icons catalog failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        const mapped = data && typeof data === 'object'
          ? Object.entries(data).map(([slug, meta]) => ({
            name: slug,
            ref: slug,
            base: meta?.base === 'png' ? 'png' : 'svg',
            aliases: Array.isArray(meta?.aliases) ? meta.aliases.map(String) : [],
            categories: Array.isArray(meta?.categories) ? meta.categories.map(String) : [],
          })).filter((icon) => icon.ref)
          : []
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

  // Debounced live metadata lookup. Create mode only — editing keeps the saved
  // values. A short delay after each keypress avoids a request per character.
  useEffect(() => {
    if (editing) return undefined
    const candidate = url.trim()
    if (candidate.length < 4 || !candidate.includes('.')) {
      // Clear any stale preview once the URL is no longer fetchable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMeta(null)
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setMetaLoading(true)
      bookmarksAPI.metadata(candidate, { signal: controller.signal })
        .then((data) => {
          setMeta(data)
          if (!titleTouchedRef.current && data.title) setTitle(data.title)
          if (!descTouchedRef.current && data.description) setDescription(data.description)
        })
        .catch((err) => {
          if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return
          setMeta(null)
        })
        .finally(() => setMetaLoading(false))
    }, 550)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [url, editing])

  const save = async () => {
    if (!url.trim()) {
      setError('A URL is required')
      return
    }
    if (groupsLoading) return
    if (editing && !groupId) {
      setError('Choose a destination group')
      return
    }
    if (iconSource === 'upload' && !uploadedIconUrl.trim()) {
      setError('Upload an icon file before saving')
      return
    }
    if (iconSource === 'library') {
      if (libraryProvider === 'selfhst' && !selfhStRef.trim()) {
        setError('Choose a selfh.st icon or enter its reference name')
        return
      }
      if (libraryProvider === 'dashboardicons' && !dashRef.trim()) {
        setError('Choose a Dashboard Icon or enter its name')
        return
      }
      if (!['selfhst', 'dashboardicons'].includes(libraryProvider) && (!iconifyPrefix.trim() || !iconifyName.trim())) {
        setError('Choose an icon or enter an icon name')
        return
      }
    }
    setBusy(true)
    setError('')
    // On create with the auto source, save the favicon previewed from the site so
    // the stored icon matches what the user just saw; null falls back to lookup.
    const autoCreateIcon = !editing && iconSource === 'auto' ? (meta?.icon_url || null) : null
    try {
      await onSave({
        group_id: groupId ? Number(groupId) : undefined,
        url: url.trim(),
        title: title.trim() || null,
        title_color: titleColor.trim(),
        icon_color: iconColor.trim(),
        description: description.trim() || null,
        icon_url: editing && !iconSourceDirty ? (bookmark?.icon_url ?? null) : (resolvedIconUrl || autoCreateIcon || null),
        docker_ref: dockerRef.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save bookmark'))
      setBusy(false)
    }
  }

  const chooseSearchResult = (icon) => {
    const [prefix, name] = icon.split(':')
    setIconSourceDirty(true)
    setIconifyPrefix(prefix)
    setIconifyName(name)
  }

  const chooseIconSource = (sourceId) => {
    // Switching to a search tab with no query yet → prefill from title/docker ref.
    if (sourceId === 'library' && iconSource !== 'library') {
      setSearchQuery((q) => q.trim() || iconSearchSeed(title, dockerRef))
    }
    if (sourceId !== 'upload') {
      setUploadError('')
    }
    setIconSourceDirty(true)
    setIconSource(sourceId)
  }

  const chooseLibraryProvider = (providerId) => {
    setLibraryProvider(providerId)
    setSearchQuery((q) => q.trim() || iconSearchSeed(title, dockerRef))
    const provider = LIBRARY_PROVIDERS.find((item) => item.id === providerId)
    if (provider?.kind === 'iconify') {
      setIconifyPrefix(provider.prefix)
    }
    if (providerId === 'selfhst' && !selfhStSelection) setSelfhStRef('')
    if (providerId === 'dashboardicons' && !dashSelection) setDashRef('')
  }

  const chooseSelfhStIcon = (icon) => {
    setIconSourceDirty(true)
    setSelfhStSelection(icon)
    setSelfhStRef(icon.ref)
  }

  const chooseDashIcon = (icon) => {
    setIconSourceDirty(true)
    setDashSelection(icon)
    setDashRef(icon.ref)
  }

  const uploadIconFile = async (file) => {
    if (!file) return
    const sizeLimit = uploadLimitForFile(file)
    if (sizeLimit && file.size > sizeLimit) {
      setUploadedIconUrl('')
      setUploadedFileName('')
      setUploadError(`${file.name} exceeds the ${formatUploadLimit(sizeLimit)} limit for .${file.name.split('.').pop().toLowerCase()} files`)
      return
    }
    setUploadBusy(true)
    setUploadError('')
    try {
      const result = await bookmarksAPI.uploadIcon(file)
      setUploadedIconUrl(result.icon_url || '')
      setUploadedFileName(file.name || '')
      setIconSourceDirty(true)
      setIconSource('upload')
    } catch (err) {
      setUploadedIconUrl('')
      setUploadedFileName('')
      setUploadError(errorMessage(err, 'Could not upload icon'))
    } finally {
      setUploadBusy(false)
    }
  }

  const librarySearchPlaceholder = activeLibraryProvider.id === 'selfhst'
    ? 'Search selfh.st/icons, e.g. immich, sonarr, nextcloud'
    : activeLibraryProvider.id === 'dashboardicons'
      ? 'Search Dashboard Icons, e.g. ntopng, plex'
      : `Search ${activeLibraryProvider.label}, e.g. shield, plex`

  const iconifyResultsEmpty = trimmedSearchQuery.length < 2
    ? `Type at least 2 characters to search ${activeLibraryProvider.label}.`
    : (searchResults.length === 0 && !searchBusy ? `No matches in ${activeLibraryProvider.label} for "${trimmedSearchQuery}".` : '')

  const selfhStResultsEmpty = !selfhStLoaded && !selfhStLoading
    ? `Loading ${activeLibraryProvider.label} catalog…`
    : trimmedSearchQuery.length < 2
      ? `Type at least 2 characters to search ${activeLibraryProvider.label}.`
      : (selfhStResults.length === 0 && !selfhStLoading ? `No matches in ${activeLibraryProvider.label} for "${trimmedSearchQuery}".` : '')

  const dashResultsEmpty = !dashLoaded && !dashLoading
    ? `Loading ${activeLibraryProvider.label} catalog…`
    : trimmedSearchQuery.length < 2
      ? `Type at least 2 characters to search ${activeLibraryProvider.label}.`
      : (dashResults.length === 0 && !dashLoading ? `No matches in ${activeLibraryProvider.label} for "${trimmedSearchQuery}".` : '')

  return (
    <Modal
      title={editing ? 'Edit bookmark' : 'Add bookmark'}
      size="6xl"
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button className={`${btnDanger} mr-auto`} onClick={onDelete} disabled={busy}>
              Delete
            </button>
          )}
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={btnPrimary} onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span>Save</span>
          </button>
        </>
      }
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.82fr)_minmax(560px,1.28fr)] 2xl:items-start">
        <div className="space-y-3">
          {editing && movablePages.length > 1 && (
            <Labeled text="Page">
              <select className={input} value={pageId} onChange={(e) => setPageId(e.target.value)}>
                {movablePages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title}
                  </option>
                ))}
              </select>
            </Labeled>
          )}
          {(sortedGroups.length > 1 || groupsLoading || groupsError) && (
            <Labeled text="Group">
              <select className={input} value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={groupsLoading || sortedGroups.length === 0}>
                {groupsLoading && <option value="">Loading groups…</option>}
                {sortedGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.title}
                  </option>
                ))}
              </select>
              {groupsError && <p className="mt-1 text-xs text-red-400">{groupsError}</p>}
            </Labeled>
          )}
          <Labeled text="URL">
            <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" autoFocus={!focusIcon} />
          </Labeled>
          {!editing && (metaLoading || meta) && (
            <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2.5">
              <Favicon iconUrl={meta?.icon_url || ''} title={meta?.title || title || url} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">From the site</span>
                  {metaLoading && <Spinner className="h-3 w-3" />}
                </div>
                {meta?.title && <div className="truncate text-sm font-medium text-white">{meta.title}</div>}
                {meta?.description && <div className="line-clamp-2 text-xs text-slate-400">{meta.description}</div>}
                {!metaLoading && meta && !meta.title && !meta.description && (
                  <div className="text-xs text-slate-500">No title or description found — using the favicon.</div>
                )}
              </div>
            </div>
          )}
          <Labeled text="Title">
            <input className={input} value={title} onChange={(e) => { titleTouchedRef.current = true; setTitle(e.target.value) }} placeholder="Defaults to the site's domain" />
          </Labeled>
          <Labeled text="Title colour (optional)">
            <ColorField value={titleColor} onChange={setTitleColor} />
            <p className="mt-1 text-xs text-slate-500">Overrides the group and page defaults. Leave blank to inherit.</p>
          </Labeled>
          <Labeled text="Icon colour (optional)">
            <ColorField value={iconColor} onChange={setIconColor} />
            <p className="mt-1 text-xs text-slate-500">Overrides the group and page icon colour. Leave blank to inherit. Only applies to monochrome icons from the Library (Iconify sets like Lucide) and uploaded SVGs — it has no effect on website favicons or full-colour logos (e.g. selfh.st, Dashboard Icons).</p>
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Labeled text="Description (optional)">
              <input className={input} value={description} onChange={(e) => { descTouchedRef.current = true; setDescription(e.target.value) }} />
            </Labeled>
            <Labeled text="Docker reference (optional)">
              <input className={input} value={dockerRef} onChange={(e) => setDockerRef(e.target.value)} placeholder="e.g. beszel" />
            </Labeled>
          </div>
          <p className="text-xs text-slate-500">Docker reference: container/service name for live status — leave blank to hide it.</p>
        </div>

        <div ref={iconPanelRef} className="rounded-xl border border-white/10 bg-white/5 p-4 2xl:p-5">
          <div className="mb-3 text-sm font-medium text-white">Icon</div>

          <div className="mb-3 inline-flex flex-wrap gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
            {ICON_SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => chooseIconSource(source.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  iconSource === source.id ? 'bg-accent text-white' : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/30 px-3 py-2">
            {editing && currentIconUrl && (
              <div className="flex items-center gap-2">
                <Favicon iconUrl={currentIconUrl} title={bookmark?.title || bookmark?.url} size={18} color={iconColor} />
                <span className="text-xs text-slate-500">Current</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Favicon iconUrl={resolvedIconUrl} title={title || url} size={18} color={iconColor} />
              <span className="text-xs text-slate-400">Preview</span>
            </div>
          </div>

          {iconSource === 'auto' && (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-xs text-slate-400">
              Startboard will keep using its normal favicon lookup for this bookmark.
            </div>
          )}

          {iconSource === 'direct' && (
            <div>
              <input
                className={input}
                value={directIconUrl}
                onChange={(e) => { setIconSourceDirty(true); setDirectIconUrl(e.target.value) }}
                placeholder="/icons/plex.svg or https://cdn.example.com/plex.svg"
              />
              <p className="mt-1.5 text-xs text-slate-400">Self-hosted SVG/PNG asset or any explicit image URL.</p>
            </div>
          )}

          {iconSource === 'upload' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-900/30 p-3">
                <label className="flex cursor-pointer flex-col gap-2">
                  <span className="text-sm font-medium text-white">Upload icon file</span>
                  <span className="text-xs text-slate-400">SVG up to 256 KB, ICO up to 512 KB, PNG/WEBP/JPG/GIF up to 1 MB. Uploaded icons are stored locally and served from Startboard.</span>
                  <input
                    type="file"
                    accept=".svg,.png,.ico,.webp,.jpg,.jpeg,.gif,image/svg+xml,image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      void uploadIconFile(file)
                      e.target.value = ''
                    }}
                  />
                  <div className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
                    {uploadBusy ? <Spinner className="h-4 w-4" /> : null}
                    <span>{uploadBusy ? 'Uploading…' : 'Choose file'}</span>
                  </div>
                </label>
              </div>
              {uploadError && <div className="text-sm text-red-400">{uploadError}</div>}
              {uploadedIconUrl ? (
                <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-slate-900/50">
                    <Favicon iconUrl={uploadedIconUrl} title={uploadedFileName || title || url} size={32} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{uploadedFileName || 'Uploaded icon'}</div>
                    <div className="truncate text-xs text-slate-400">{uploadedIconUrl}</div>
                  </div>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => { setUploadedIconUrl(''); setUploadedFileName(''); setUploadError('') }}
                    disabled={uploadBusy}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400">No uploaded icon selected yet.</div>
              )}
            </div>
          )}

          {iconSource === 'library' && (
            <div className="space-y-3">
              <div className={`grid gap-3 ${LIBRARY_PROVIDERS.some((provider) => provider.kind === 'iconify' && provider.id === libraryProvider) ? 'xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_220px]' : 'xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]'}`}>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label className={label}>Library provider</label>
                    <span
                      className="inline-flex text-slate-500"
                      title={activeLibraryProvider.hint}
                      aria-label={activeLibraryProvider.hint}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <select
                    className={input}
                    value={libraryProvider}
                    onChange={(e) => chooseLibraryProvider(e.target.value)}
                  >
                    {LIBRARY_PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={label}>Search</label>
                  <input
                    className={input}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={librarySearchPlaceholder}
                  />
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
                  <IconResults
                    title={`${activeLibraryProvider.label} results`}
                    subtitle={trimmedSearchQuery ? `Query: ${trimmedSearchQuery}` : activeLibraryProvider.hint}
                    busy={selfhStLoading}
                    error={selfhStError}
                    empty={selfhStResultsEmpty}
                  >
                    {selfhStResults.map((icon) => (
                      <SelfhStResultButton
                        key={icon.ref}
                        icon={icon}
                        selected={icon.ref === selfhStRef}
                        onSelect={chooseSelfhStIcon}
                        cdnBaseUrl={selfhStCdnBaseUrl}
                      />
                    ))}
                  </IconResults>

                  <Advanced summary="Catalog settings">
                    <div className="space-y-3">
                      <Labeled text="Selected reference">
                        <input
                          className={input}
                          value={selfhStRef}
                          onChange={(e) => { setIconSourceDirty(true); setSelfhStRef(e.target.value); setSelfhStSelection(null) }}
                          placeholder="immich"
                        />
                      </Labeled>
                      <Labeled text="selfh.st index URL">
                        <input
                          className={input}
                          value={selfhStIndexUrl}
                          onChange={(e) => { setSelfhStIndexUrl(e.target.value); setSelfhStLoaded(false); setSelfhStIcons([]) }}
                        />
                      </Labeled>
                      <Labeled text="Icon CDN base">
                        <input className={input} value={selfhStCdnBaseUrl} onChange={(e) => setSelfhStCdnBaseUrl(e.target.value)} />
                      </Labeled>
                    </div>
                  </Advanced>
                </>
              ) : libraryProvider === 'dashboardicons' ? (
                <>
                  <IconResults
                    title={`${activeLibraryProvider.label} results`}
                    subtitle={trimmedSearchQuery ? `Query: ${trimmedSearchQuery}` : activeLibraryProvider.hint}
                    busy={dashLoading}
                    error={dashError}
                    empty={dashResultsEmpty}
                  >
                    {dashResults.map((icon) => (
                      <DashResultButton
                        key={icon.ref}
                        icon={icon}
                        selected={icon.ref === dashRef}
                        onSelect={chooseDashIcon}
                        cdnBaseUrl={dashCdnBaseUrl}
                      />
                    ))}
                  </IconResults>

                  <Advanced summary="Catalog settings">
                    <div className="space-y-3">
                      <Labeled text="Selected name">
                        <input
                          className={input}
                          value={dashRef}
                          onChange={(e) => { setIconSourceDirty(true); setDashRef(e.target.value); setDashSelection(null) }}
                          placeholder="ntopng"
                        />
                      </Labeled>
                      <Labeled text="Metadata URL">
                        <input
                          className={input}
                          value={dashIndexUrl}
                          onChange={(e) => { setDashIndexUrl(e.target.value); setDashLoaded(false); setDashIcons([]) }}
                        />
                      </Labeled>
                      <Labeled text="Icon CDN base">
                        <input className={input} value={dashCdnBaseUrl} onChange={(e) => setDashCdnBaseUrl(e.target.value)} />
                      </Labeled>
                    </div>
                  </Advanced>
                </>
              ) : (
                <>
                  <IconResults
                    title={`${activeLibraryProvider.label} results`}
                    subtitle={trimmedSearchQuery ? `Query: ${trimmedSearchQuery}` : activeLibraryProvider.hint}
                    busy={searchBusy}
                    error={searchError}
                    empty={iconifyResultsEmpty}
                  >
                    {searchResults.map((icon) => (
                      <SearchResultButton
                      key={icon}
                      icon={icon}
                      selected={icon === `${iconifyPrefix}:${iconifyName}`}
                      onSelect={chooseSearchResult}
                      baseUrl={iconifyBaseUrl}
                      color={iconifyColor}
                    />
                  ))}
                </IconResults>

                  <Advanced summary="Provider settings">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Labeled text="Selected name">
                        <input className={input} value={iconifyName} onChange={(e) => { setIconSourceDirty(true); setIconifyName(e.target.value) }} placeholder="settings" />
                      </Labeled>
                      <Labeled text="Collection prefix">
                        <input className={input} value={iconifyPrefix} onChange={(e) => { setIconSourceDirty(true); setIconifyPrefix(e.target.value) }} placeholder="lucide" />
                      </Labeled>
                    <Labeled text="Icon API base">
                      <input className={input} value={iconifyBaseUrl} onChange={(e) => setIconifyBaseUrl(e.target.value)} placeholder="https://api.iconify.design" />
                    </Labeled>
                    </div>
                  </Advanced>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
