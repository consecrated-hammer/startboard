import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, RefreshCcw, Server } from 'lucide-react'
import { adminAPI, errorMessage, pagesAPI } from '../services/api.js'
import Spinner from '../components/Spinner.jsx'
import TopBar from '../components/board/TopBar.jsx'
import BoardColumn from '../components/board/BoardColumn.jsx'
import { btnPrimary, btnSecondary, input, label } from '../components/ui.js'
import useColumnCount from '../hooks/useColumnCount.js'

const SYSTEM_PAGE_ID = 'docker-system'
const GROUP_ALIGN_JUSTIFY = { left: 'start', center: 'center', right: 'end' }

function estimatedGroupHeight(group) {
  return 1 + (group.bookmarks?.length || 0)
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

export default function DockerSystemPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [pages, setPages] = useState([])
  const [templatePage, setTemplatePage] = useState(null)
  const [options, setOptions] = useState({ page: {}, groups: {} })
  const saveTimerRef = useRef(null)
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
      setOptions(systemPage.options || { page: {}, groups: {} })
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

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
  }, [])

  const groupCount = useMemo(() => data?.groups?.length || 0, [data])
  const navPages = useMemo(() => [
    ...pages,
    { id: SYSTEM_PAGE_ID, title: 'Docker services', is_system_page: true },
  ], [pages])
  const systemPage = useMemo(() => ({
    ...templatePage,
    ...(options.page || {}),
    id: SYSTEM_PAGE_ID,
    title: 'Docker services',
    open_new_tab: true,
  }), [templatePage, options.page])
  const responsiveCols = useColumnCount(systemPage.card_max_width ?? 0, systemPage.card_gap_x ?? 16)
  const colCount = systemPage.max_cols > 0 ? Math.min(responsiveCols, systemPage.max_cols) : responsiveCols
  const boardGroups = useMemo(() => (data?.groups || []).map((group, groupIndex) => {
    const groupOptions = options.groups?.[group.title] || {}
    const workloads = [...group.workloads]
    if (groupOptions.bookmark_sort === 'title_asc') workloads.sort((a, b) => a.title.localeCompare(b.title))
    return ({
    id: `docker-group-${groupIndex}`,
    title: group.title,
    icon_url: groupOptions.icon_url || null,
    bg_color: null,
    header_bg_color: null,
    header_text_color: null,
    bookmark_title_color: '',
    icon_color: '',
    transparency: 0,
    display_mode: groupOptions.display_mode || 'list',
    icon_size: groupOptions.icon_size || 'small',
    bookmark_align: groupOptions.bookmark_align || 'auto',
    visible_limit: 0,
    bookmark_sort: groupOptions.bookmark_sort || 'manual',
    column: groupIndex,
    position: Number.isFinite(groupOptions.position) ? groupOptions.position : groupIndex,
    bookmarks: workloads.map((workload) => ({
      ...workload,
      id: `docker-${workload.key}`,
      group_id: `docker-group-${groupIndex}`,
      url: workload.href || `docker://${workload.key}`,
      display_url: workload.href || null,
      launchable: Boolean(workload.href),
    })),
  })}).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title)), [data?.groups, options.groups])
  const displayColumns = useMemo(() => buildColumns(
    boardGroups,
    colCount,
    systemPage.layout_mode === 'balanced' || systemPage.auto_balance,
  ), [boardGroups, colCount, systemPage.layout_mode, systemPage.auto_balance])

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

  const openAllInTabs = (group) => {
    group.bookmarks
      .filter((bookmark) => bookmark.launchable)
      .forEach((bookmark) => window.open(bookmark.url, '_blank', 'noopener,noreferrer'))
  }

  const saveOptions = (next) => {
    setOptions(next)
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const saved = await adminAPI.updateDockerSystemPageOptions(next)
        setOptions(saved)
      } catch (err) {
        setError(errorMessage(err))
        load()
      }
    }, 400)
  }

  const updatePageOption = (key, value) => saveOptions({ ...options, page: { ...(options.page || {}), [key]: value } })
  const updateGroupOption = (title, key, value) => saveOptions({
    ...options,
    groups: { ...(options.groups || {}), [title]: { ...(options.groups?.[title] || {}), [key]: value } },
  })

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
        {data && (
          <details className="mb-5 rounded-2xl border border-white/10 bg-white/3 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-200">Customize Docker page</summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className={label}>Layout</span><select className={input} value={systemPage.layout_mode || 'natural'} onChange={(event) => updatePageOption('layout_mode', event.target.value)}><option value="natural">Natural</option><option value="balanced">Balanced</option></select></label>
                <label><span className={label}>Max columns</span><input className={input} type="number" min="0" max="12" value={systemPage.max_cols ?? 0} onChange={(event) => updatePageOption('max_cols', Number(event.target.value) || 0)} /></label>
                <label><span className={label}>Card width</span><input className={input} type="number" min="0" max="640" value={systemPage.card_max_width ?? 0} onChange={(event) => updatePageOption('card_max_width', Number(event.target.value) || 0)} /></label>
                <label><span className={label}>Group alignment</span><select className={input} value={systemPage.group_align || 'center'} onChange={(event) => updatePageOption('group_align', event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
              </div>
              <div className="space-y-2">
                {boardGroups.map((group) => (
                  <div key={group.title} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_5rem] gap-2 rounded-lg border border-white/10 p-2">
                    <div className="min-w-0"><div className="truncate text-sm text-white">{group.title}</div><input className={`${input} mt-1`} value={group.icon_url || ''} placeholder="Icon URL" onChange={(event) => updateGroupOption(group.title, 'icon_url', event.target.value)} /></div>
                    <label><span className={label}>Layout</span><select className={input} value={group.display_mode} onChange={(event) => updateGroupOption(group.title, 'display_mode', event.target.value)}><option value="list">List</option><option value="detailed">Detailed</option><option value="icons">Icons</option><option value="cloud">Cloud</option></select></label>
                    <label><span className={label}>Sort</span><select className={input} value={group.bookmark_sort} onChange={(event) => updateGroupOption(group.title, 'bookmark_sort', event.target.value)}><option value="manual">Docker order</option><option value="title_asc">Title A-Z</option></select></label>
                    <label><span className={label}>Order</span><input className={input} type="number" value={group.position} onChange={(event) => updateGroupOption(group.title, 'position', Number(event.target.value) || 0)} /></label>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
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
              <BoardColumn
                key={index}
                index={index}
                groups={column}
                editing={false}
                canManage={false}
                groupDndEnabled={false}
                bookmarkDndEnabled={false}
                openNewTab={systemPage.open_new_tab}
                showWebsiteIcons
                cardGap={systemPage.card_gap}
                bookmarkGap={systemPage.bookmark_gap}
                pageTitleColor={systemPage.bookmark_title_color}
                pageIconColor={systemPage.icon_color || ''}
                handlers={{
                  onOpenBookmark: () => {},
                  onOpenAll: openAllInTabs,
                  onCopyBookmarkToPage: setCopying,
                }}
              />
            ))}
          </div>
        )}
      </main>
      {copying && <CopyModal workload={copying} destinations={data?.destinations || []} onClose={() => setCopying(null)} onCopy={copy} busy={copyBusy} />}
    </div>
  )
}
