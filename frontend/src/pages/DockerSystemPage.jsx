import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Copy, ExternalLink, RefreshCcw, Server, XCircle } from 'lucide-react'
import { adminAPI, errorMessage } from '../services/api.js'
import Favicon from '../components/Favicon.jsx'
import Spinner from '../components/Spinner.jsx'
import UserMenu from '../components/board/UserMenu.jsx'
import { btnPrimary, btnSecondary, input, label } from '../components/ui.js'

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
    <article className="rounded-xl border border-white/10 bg-white/5 p-3">
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
      <div className="mt-3 flex justify-end gap-2">
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
        ) : (
          <span className="text-xs text-slate-500">No homepage.href label</span>
        )}
      </div>
    </article>
  )
}

export default function DockerSystemPage() {
  const [data, setData] = useState(null)
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
      setData(await adminAPI.dockerSystemPage())
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
    <div className="min-h-full bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/70 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-white/5">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="text-sm font-semibold text-white">Docker</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={btnSecondary} onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? <Spinner className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
              <span>Refresh</span>
            </button>
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-accent" />
              <h1 className="text-xl font-semibold text-white">Docker services</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">Live system page for running Docker workloads. It updates from the enabled endpoint and is never saved as a regular board.</p>
          </div>
          {data && <div className="text-sm text-slate-400">{data.workload_count} running services in {groupCount} groups</div>}
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        {message && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : data && (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {data.groups.map((group) => (
              <section key={group.title} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <h2 className="mb-3 text-sm font-semibold text-white">{group.title}</h2>
                <div className="space-y-2">
                  {group.workloads.map((workload) => <WorkloadCard key={workload.key} workload={workload} onCopy={setCopying} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      {copying && <CopyModal workload={copying} destinations={data?.destinations || []} onClose={() => setCopying(null)} onCopy={copy} busy={copyBusy} />}
    </div>
  )
}
