import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, Copy, ExternalLink, RefreshCcw, Server, XCircle } from 'lucide-react'
import { adminAPI, errorMessage, pagesAPI } from '../services/api.js'
import Favicon from '../components/Favicon.jsx'
import Spinner from '../components/Spinner.jsx'
import TopBar from '../components/board/TopBar.jsx'
import { btnPrimary, btnSecondary, input, label } from '../components/ui.js'
import useColumnCount from '../hooks/useColumnCount.js'

const SYSTEM_PAGE_ID = 'docker-system'
const GROUP_ALIGN_JUSTIFY = { left: 'start', center: 'center', right: 'end' }

function estimatedGroupHeight(group) {
  return 1 + (group.workloads?.length || 0)
}

function buildColumns(groups, count, balanced) {
  const columns = Array.from({ length: Math.max(1, count) }, () => [])
  if (!balanced) {
    groups.forEach((group, index) => columns[index % columns.length].push(group))
    return columns
  }
  const heights = Array.from({ length: columns.length }, () => 0)
  groups.forEach((group) => {
    const target = heights.reduce((best, height, index) => (height < heights[best] ? index : best), 0)
    columns[target].push(group)
    heights[target] += estimatedGroupHeight(group)
  })
  return columns
}

const STATUS_META = {
  healthy: { label: 'Healthy', tone: 'text-emerald-400', Icon: CheckCircle2 },
  running: { label: 'Running', tone: 'text-emerald-400', Icon: CheckCircle2 },
  stopped: { label: 'Stopped', tone: 'text-slate-400', Icon: Circle },
  unhealthy: { label: 'Unhealthy', tone: 'text-red-400', Icon: XCircle },
  unknown: { label: 'Unknown', tone: 'text-amber-400', Icon: Circle },
}

function CopyModal({ workload, destinations, onClose, onCopy, busy }) {
  const initialPage = destinations.find((page) => page.groups.length) || null
  const [pageId, setPageId] = useState(String(initialPage?.id || ''))
  const page = destinations.find((item) => String(item.id) === pageId)
  const [groupId, setGroupId] = useState(String(initialPage?.groups[0]?.id || ''))

  const changePage = (nextPageId) => {
    setPageId(nextPageId)
    const nextPage = destinations.find((item) => String(item.id) === nextPageId)
    setGroupId(String(nextPage?.groups[0]?.id || ''))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="docker-copy-title">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <h2 id="docker-copy-title" className="text-lg font-semibold text-white">Copy {workload.title}</h2>
        <p className="mt-1 text-sm text-slate-400">Creates an ordinary bookmark that keeps this service’s live Docker status badge.</p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className={label}>Page</span>
            <select className={input} value={pageId} onChange={(event) => changePage(event.target.value)}>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>{destination.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Group</span>
            <select className={input} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {(page?.groups || []).map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={btnPrimary} onClick={() => onCopy(groupId)} disabled={busy || !groupId}>
            {busy ? <Spinner className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>Copy bookmark</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkloadCard({ workload, onCopy }) {
  const status = workload.docker_status?.status || 'unknown'
  const meta = STATUS_META[status] || STATUS_META.unknown
  const StatusIcon = meta.Icon
  return (
    <article className="rounded-lg px-2 py-1.5 transition hover:bg-white/5">
      <div className="flex items-start gap-3">
        <Favicon iconUrl={workload.icon_url} title={workload.title} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-white" title={workload.title}>{workload.title}</h3>
            <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${meta.tone}`} title={`Docker status: ${meta.label}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={workload.key}>{workload.key}</p>
          {workload.description && <p className="mt-2 line-clamp-2 text-xs text-slate-400">{workload.description}</p>}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {workload.href ? (
          <>
            <a className={btnSecondary} href={workload.href} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open</span>
            </a>
            <button type="button" className={btnSecondary} onClick={() => onCopy(workload)}>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy to page</span>
            </button>
          </>
        ) : null}
      </div>
    </article>
  )
}

export default function DockerSystemPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [pages, setPages] = useState([])
  const [templatePage, setTemplatePage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copying, setCopying] = useState(null)
  const [copyBusy, setCopyBusy] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const [systemPage, boardPages, template] = await Promise.all([
        adminAPI.dockerSystemPage(),
        pagesAPI.list(),
        pagesAPI.get(1).catch(() => null),
      ])
      setData(systemPage)
      setPages(boardPages)
      setTemplatePage(template?.page || null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const groupCount = useMemo(() => data?.groups?.length || 0, [data])
  const navPages = useMemo(() => [
    ...pages,
    { id: SYSTEM_PAGE_ID, title: 'Docker services', is_system_page: true },
  ], [pages])
  const systemPage = useMemo(() => ({
    ...templatePage,
    id: SYSTEM_PAGE_ID,
    title: 'Docker services',
    open_new_tab: true,
  }), [templatePage])
  const responsiveCols = useColumnCount(systemPage.card_max_width ?? 0, systemPage.card_gap_x ?? 16)
  const colCount = systemPage.max_cols > 0 ? Math.min(responsiveCols, systemPage.max_cols) : responsiveCols
  const displayColumns = useMemo(() => buildColumns(
    data?.groups || [],
    colCount,
    systemPage.layout_mode === 'balanced' || systemPage.auto_balance,
  ), [data?.groups, colCount, systemPage.layout_mode, systemPage.auto_balance])

  const copy = async (groupId) => {
    if (!copying) return
    setCopyBusy(true)
    setError('')
    try {
      const result = await adminAPI.copyDockerSystemWorkload(copying.key, Number(groupId))
      setMessage(`${result.title} copied to the selected group.`)
      setCopying(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCopyBusy(false)
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{
        '--color-accent': systemPage.accent || undefined,
        '--color-accent-dark': systemPage.accent
          ? `color-mix(in oklab, ${systemPage.accent} 82%, black)`
          : undefined,
      }}
    >
      <TopBar
        pages={navPages}
        currentPageId={SYSTEM_PAGE_ID}
        currentPage={systemPage}
        onSelectPage={(id) => navigate(id === SYSTEM_PAGE_ID ? '/p/docker' : `/p/${id}`)}
        onAddPage={() => {}}
        onReorderPages={() => {}}
        editing={false}
        onToggleEdit={() => {}}
        canEdit={false}
        onOpenSettings={() => {}}
        onOpenPageSettings={() => {}}
        onSharePage={() => {}}
        onUnsharePage={() => {}}
        onCopyPageShareLink={() => {}}
        onAddGroup={() => {}}
      />
      <main
        className="flex-1 overflow-auto p-4 sm:p-5"
        style={{
          backgroundColor: systemPage.bg_image_mode === 'solid' ? (systemPage.bg_color || undefined) : undefined,
          backgroundImage: systemPage.background_url || systemPage.bg_image ? `url(${systemPage.background_url || systemPage.bg_image})` : undefined,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: systemPage.bg_image_fit === 'fill'
            ? '100% 100%'
            : (systemPage.bg_image_fit === 'contain' || systemPage.bg_image_fit === 'scale-down' ? 'contain' : 'cover'),
        }}
      >
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-accent" />
              <h1 className="text-xl font-semibold text-white">Docker services</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">Live system page for running Docker workloads.</p>
          </div>
          <div className="flex items-center gap-2">
            {data && <div className="text-sm text-slate-400">{data.workload_count} running services in {groupCount} groups</div>}
            <button type="button" className={btnSecondary} onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? <Spinner className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
              <span>Refresh</span>
            </button>
          </div>
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        {message && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : data && (
          <div
            className="grid items-start"
            style={{
              gridTemplateColumns: `repeat(${displayColumns.length || colCount}, minmax(0, ${systemPage.card_max_width ? `${systemPage.card_max_width}px` : '1fr'}))`,
              columnGap: `${systemPage.card_gap_x ?? 16}px`,
              rowGap: `${systemPage.card_gap ?? 12}px`,
              justifyContent: GROUP_ALIGN_JUSTIFY[systemPage.group_align] || 'center',
            }}
          >
            {displayColumns.map((column, index) => (
              <div key={index} className="flex min-w-0 flex-col" style={{ gap: `${systemPage.card_gap ?? 12}px` }}>
                {column.map((group) => (
                  <section key={group.title} className="flex w-full flex-col rounded-2xl border border-white/10 bg-white/3">
                    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                      <Favicon title={group.title} size={18} color={systemPage.icon_color || ''} />
                      <h2 className="flex-1 truncate text-sm font-semibold uppercase tracking-wide text-slate-300">{group.title}</h2>
                    </div>
                    <div className="space-y-1 p-2">
                      {group.workloads.map((workload) => <WorkloadCard key={workload.key} workload={workload} onCopy={setCopying} />)}
                    </div>
                  </section>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
      {copying && <CopyModal workload={copying} destinations={data?.destinations || []} onClose={() => setCopying(null)} onCopy={copy} busy={copyBusy} />}
    </div>
  )
}
