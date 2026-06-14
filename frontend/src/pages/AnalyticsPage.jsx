import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ExternalLink,
  MousePointerClick,
  Search,
  Users2,
  View,
} from 'lucide-react'
import TopBar from '../components/board/TopBar.jsx'
import Spinner from '../components/Spinner.jsx'
import { btnSecondary, input } from '../components/ui.js'
import { errorMessage, pagesAPI } from '../services/api.js'

const RANGE_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 0, label: 'All' },
]

const BOOKMARK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'clicked', label: 'Clicked' },
  { id: 'unclicked', label: 'Never clicked' },
  { id: 'duplicates', label: 'Duplicates' },
]

const TABS = [
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'viewers', label: 'View source' },
  { id: 'duplicates', label: 'Duplicates' },
]

const EMPTY_BOOKMARKS = []

const ACTOR_LABELS = {
  user: 'Signed-in users',
  viewer: 'Shared or anonymous viewers',
  share: 'Shared link',
  public: 'Public link',
  anonymous: 'Anonymous',
  unknown: 'Unknown',
}

function absolute(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function timeAgo(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

function TimeAgo({ value, className = '' }) {
  if (!value) return <span className={className}>Never</span>
  return <span className={className} title={absolute(value)}>{timeAgo(value)}</span>
}

function actorLabel(type) {
  if (!type) return 'Unknown'
  return ACTOR_LABELS[type] || (type.charAt(0).toUpperCase() + type.slice(1))
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function percent(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

function Kpi({ icon: Icon, label, value, hint }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">{children}</div>
}

function TrendChart({ series }) {
  const data = series?.length ? series : []
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.views || 0, item.clicks || 0]))
  const width = 100
  const height = 44
  const pad = 3
  const point = (item, index, key) => {
    const x = data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width
    const y = height - pad - ((item[key] || 0) / maxValue) * (height - pad * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }
  const viewPoints = data.map((item, index) => point(item, index, 'views')).join(' ')
  const clickPoints = data.map((item, index) => point(item, index, 'clicks')).join(' ')
  const last = data[data.length - 1]

  return (
    <section className="flex h-full min-h-36 flex-col border-t border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.11),transparent_38%)] px-4 py-3 xl:border-l xl:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Trend</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {data.length ? `Showing ${data.length} recorded day${data.length === 1 ? '' : 's'}.` : 'No recorded activity for this range.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-300" />Views</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" />Clicks</span>
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-hidden px-1">
        {data.length ? (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Views and clicks trend" className="h-16 w-full overflow-visible sm:h-20">
              <line x1="0" y1={height - pad} x2={width} y2={height - pad} className="stroke-white/10" strokeWidth="0.4" />
              <line x1="0" y1={pad} x2={width} y2={pad} className="stroke-white/5" strokeWidth="0.35" />
              <polyline points={viewPoints} fill="none" className="stroke-cyan-300" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
              <polyline points={clickPoints} fill="none" className="stroke-amber-300" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
              {data.map((item, index) => {
                const [cx, cy] = point(item, index, 'views').split(',')
                return <circle key={`${item.date}-views`} cx={cx} cy={cy} r="0.9" className="fill-cyan-200" />
              })}
            </svg>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{formatDate(data[0].date)}</span>
              <span className="text-slate-400">{last ? `${last.views || 0} views · ${last.clicks || 0} clicks` : null}</span>
              <span>{formatDate(data[data.length - 1].date)}</span>
            </div>
          </>
        ) : (
          <EmptyState>No trend data yet.</EmptyState>
        )}
      </div>
    </section>
  )
}

function BookmarkTable({ bookmarks, selectedId, duplicateUrls, onSelect }) {
  if (!bookmarks.length) return <EmptyState>No bookmarks match this filter.</EmptyState>
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/25">
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(100px,0.8fr)_96px_96px_82px] gap-3 border-b border-white/10 bg-white/4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
        <div>Bookmark</div>
        <div>Group</div>
        <div>Last click</div>
        <div>Unique</div>
        <div className="text-right">Clicks</div>
      </div>
      <div className="max-h-136 divide-y divide-white/10 overflow-y-auto">
        {bookmarks.map((item) => {
          const selected = selectedId === item.bookmark_id
          const duplicate = duplicateUrls.has(item.url)
          return (
            <button
              key={item.bookmark_id}
              type="button"
              onClick={() => onSelect(item.bookmark_id)}
              className={`grid w-full gap-2 px-4 py-3 text-left text-sm transition md:grid-cols-[minmax(0,2fr)_minmax(100px,0.8fr)_96px_96px_82px] md:items-center md:gap-3 ${
                selected ? 'bg-accent/14 shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-white/4.5'
              }`}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-white">{item.title}</span>
                  {duplicate && <span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">Duplicate</span>}
                  {!item.clicks && <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">No clicks</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{item.url || 'No URL'}</div>
              </div>
              <div className="truncate text-slate-300">{item.group_title}</div>
              <TimeAgo value={item.last_clicked_at} className="truncate text-slate-300" />
              <div className="text-slate-300 tabular-nums">{item.unique_clickers}</div>
              <div className={`font-semibold tabular-nums md:text-right ${item.clicks ? 'text-white' : 'text-slate-600'}`}>{item.clicks}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BookmarkInspector({ bookmark }) {
  if (!bookmark) return <EmptyState>Select a bookmark to inspect click detail.</EmptyState>
  return (
    <aside className="border-t border-white/10 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-white">{bookmark.title}</h3>
        <div className="mt-1 break-all text-xs text-slate-500">{bookmark.url || 'No URL'}</div>
      </div>
                    <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10">
        <MiniStat label="Clicks" value={bookmark.clicks} strong />
        <MiniStat label="Unique" value={bookmark.unique_clickers} strong />
        <MiniStat label="Last" value={bookmark.last_clicked_at ? timeAgo(bookmark.last_clicked_at) : 'Never'} />
      </div>
      <div className="mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clickers</h4>
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {bookmark.clickers?.length ? bookmark.clickers.map((clicker) => (
            <div key={`${bookmark.bookmark_id}-${clicker.actor_type}-${clicker.actor_label}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/4 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-white">{clicker.actor_label}</div>
                <div className="text-xs text-slate-500">{actorLabel(clicker.actor_type)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-white">{clicker.clicks}</div>
                <TimeAgo value={clicker.last_clicked_at} className="text-[11px] text-slate-500" />
              </div>
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
              Nobody has clicked this bookmark in this range.
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function MiniStat({ label, value, strong = false }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate ${strong ? 'text-base font-semibold text-white tabular-nums' : 'text-sm text-slate-300'}`}>{value}</div>
    </div>
  )
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const { pageId } = useParams()
  const [pages, setPages] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rangeDays, setRangeDays] = useState(30)
  const [activeTab, setActiveTab] = useState('bookmarks')
  const [bookmarkFilter, setBookmarkFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedBookmarkId, setSelectedBookmarkId] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const pageList = await pagesAPI.list()
        if (!alive) return
        setPages(pageList)
        const targetId = Number(pageId) || pageList[0]?.id
        if (!targetId) {
          setData(null)
          setLoading(false)
          return
        }
        const analytics = await pagesAPI.analytics(targetId, rangeDays)
        if (!alive) return
        setData(analytics)
        if (!pageId || Number(pageId) !== targetId) navigate(`/analytics/${targetId}`, { replace: true })
      } catch (err) {
        if (!alive) return
        setError(errorMessage(err))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [navigate, pageId, rangeDays])

  const summary = data?.summary
  const currentPageId = data?.page?.id ?? (Number(pageId) || null)
  const allBookmarks = summary?.all_bookmarks || EMPTY_BOOKMARKS
  const duplicateCount = summary?.duplicate_count ?? summary?.duplicate_links?.length ?? 0
  const duplicateUrls = useMemo(() => new Set((summary?.duplicate_links || []).map((item) => item.url)), [summary?.duplicate_links])
  const clickThroughRate = summary?.total_views ? (summary.total_clicks / summary.total_views) * 100 : 0

  const filteredBookmarks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return allBookmarks.filter((item) => {
      if (bookmarkFilter === 'clicked' && !item.clicks) return false
      if (bookmarkFilter === 'unclicked' && item.clicks) return false
      if (bookmarkFilter === 'duplicates' && !duplicateUrls.has(item.url)) return false
      if (!needle) return true
      return [item.title, item.url, item.group_title].some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [allBookmarks, bookmarkFilter, duplicateUrls, query])

  const effectiveSelectedBookmarkId = useMemo(() => {
    if (!allBookmarks.length) return null
    if (allBookmarks.some((item) => item.bookmark_id === selectedBookmarkId)) return selectedBookmarkId
    return allBookmarks[0].bookmark_id
  }, [selectedBookmarkId, allBookmarks])

  const selectedBookmark = useMemo(
    () => allBookmarks.find((item) => item.bookmark_id === effectiveSelectedBookmarkId) || null,
    [effectiveSelectedBookmarkId, allBookmarks],
  )

  const addPage = async () => {
    const name = window.prompt('New page name')
    if (!name?.trim()) return
    const page = await pagesAPI.create(name.trim())
    navigate(`/p/${page.id}`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        pages={pages}
        currentPageId={currentPageId}
        onSelectPage={(id) => navigate(`/analytics/${id}`)}
        onAddPage={addPage}
        canEdit={false}
        showSearch={false}
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Startboard intelligence</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Page analytics</h1>
            <p className="mt-1 truncate text-sm text-slate-400">
              {data?.page ? (
                <>
                  <span className="text-slate-200">{data.page.title}</span>
                  {` · Tracking ${data.analytics_enabled ? 'on' : 'off'} · last view ${timeAgo(summary?.last_view_at)}`}
                </>
              ) : 'Views, click behaviour, duplicates, and low-engagement links per page.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                className={`${input} h-10 w-40 cursor-pointer appearance-none py-0 pr-9`}
                value={currentPageId || ''}
                onChange={(event) => navigate(`/analytics/${event.target.value}`)}
                aria-label="Select analytics page"
              >
                {pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRangeDays(option.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    rangeDays === option.value ? 'bg-accent text-white' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {data?.page?.id && (
              <button className={btnSecondary} onClick={() => navigate(`/p/${data.page.id}`)}>
                <span>Open page</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center"><Spinner /></div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        ) : !data ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-8 text-center text-slate-400">
            No pages available yet.
          </div>
        ) : (
          <div className="space-y-5">
            {!data.analytics_enabled && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Analytics are disabled for this page. Enable them in Page settings → Preferences to start recording views and clicks.
              </div>
            )}

            <section className="grid overflow-hidden rounded-2xl border border-white/10 bg-white/3.5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.42fr)]">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-white/10">
                <Kpi icon={View} label="Views" value={summary.total_views} hint={`${summary.views_7d} in last 7 days`} />
                <Kpi icon={Users2} label="Unique viewers" value={summary.unique_viewers} hint="User or session based" />
                <Kpi icon={MousePointerClick} label="Clicks" value={summary.total_clicks} hint={`${summary.clicks_7d} in last 7 days`} />
                <Kpi icon={BarChart3} label="Click rate" value={percent(clickThroughRate)} hint="Clicks divided by views" />
                <Kpi icon={ExternalLink} label="Needs attention" value={summary.unclicked_bookmarks + duplicateCount} hint={`${summary.unclicked_bookmarks} unclicked · ${duplicateCount} duplicate`} />
              </div>
              <TrendChart series={summary.trend || []} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/4.5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/30 p-1">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                        activeTab === tab.id ? 'bg-accent text-white' : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-slate-500">{rangeDays ? `Last ${rangeDays} days` : 'All recorded time'}</div>
              </div>

              {activeTab === 'bookmarks' && (
                <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="relative min-w-55 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          className={`${input} pl-9`}
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Filter bookmarks, groups, or URLs"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {BOOKMARK_FILTERS.map((filter) => (
                          <button
                            key={filter.id}
                            type="button"
                            onClick={() => setBookmarkFilter(filter.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              bookmarkFilter === filter.id
                                ? 'border-accent bg-accent/18 text-white'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <BookmarkTable bookmarks={filteredBookmarks} selectedId={effectiveSelectedBookmarkId} duplicateUrls={duplicateUrls} onSelect={setSelectedBookmarkId} />
                  </div>
                  <BookmarkInspector bookmark={selectedBookmark} />
                </div>
              )}

              {activeTab === 'viewers' && (
                <div className="p-4">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/20">
                    <div className="border-b border-white/10 px-4 py-3">
                      <h2 className="text-base font-semibold text-white">View source</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Signed-in users are authenticated Startboard sessions. Shared or anonymous viewers use the browser/session key where available.
                      </p>
                    </div>
                    <div className="divide-y divide-white/10">
                      {summary.views_by_actor?.length ? summary.views_by_actor.map((item) => (
                        <div key={item.actor_type} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{actorLabel(item.actor_type)}</div>
                            <div className="text-xs text-slate-500">{item.actor_type}</div>
                          </div>
                          <div className="text-lg font-semibold tabular-nums text-white">{item.count}</div>
                        </div>
                      )) : <EmptyState>No page views recorded yet.</EmptyState>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'duplicates' && (
                <div className="p-4">
                  {summary.duplicate_links?.length ? (
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/25">
                      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px] gap-3 border-b border-white/10 bg-white/4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                        <div>URL</div>
                        <div>Bookmarks</div>
                        <div className="text-right">Copies</div>
                      </div>
                      <div className="max-h-136 divide-y divide-white/10 overflow-y-auto">
                        {summary.duplicate_links.map((item) => (
                          <div key={item.url} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px] md:items-center md:gap-3">
                            <div className="min-w-0 truncate font-medium text-white">{item.url}</div>
                            <div className="min-w-0 truncate text-slate-400">{item.titles}</div>
                            <div className="font-semibold tabular-nums text-white md:text-right">{item.copies}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState>No duplicate bookmark URLs found on this page.</EmptyState>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
