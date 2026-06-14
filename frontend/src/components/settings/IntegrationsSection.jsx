import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CheckCircle2, ChevronDown, Database, ExternalLink, RefreshCcw, Search, Server } from 'lucide-react'
import { adminAPI, errorMessage } from '../../services/api.js'
import { useAppState } from '../../context/AppStateContext.jsx'
import { useSaveToast } from '../../context/SaveToastContext.jsx'
import Favicon from '../Favicon.jsx'
import { SettingsSection, SettingsGroup, SettingsRow, SettingsFootnote, Toggle as KitToggle } from './SettingsKit.jsx'
import { btnSecondary, input } from '../ui.js'
import Spinner from '../Spinner.jsx'

const TABS = [
  { id: 'connection', label: 'Connection', icon: Activity },
  { id: 'assignments', label: 'Assignments', icon: Database },
]

export default function IntegrationsSection() {
  const { updateSettings } = useAppState()
  const saveToast = useSaveToast()
  const [tab, setTab] = useState('connection')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dockerEnabled, setDockerEnabled] = useState(false)
  const [dockerEndpoint, setDockerEndpoint] = useState('unix:///var/run/docker.sock')
  const [pollSeconds, setPollSeconds] = useState('30')
  // Last-persisted connection values, so blur-to-save skips no-op writes.
  const savedDockerRef = useRef(null)

  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [query, setQuery] = useState('')
  // Single-select facet: null, 'nourl', `status:<status>`, or `group:<hint>`.
  const [activeFilter, setActiveFilter] = useState(null)
  const [draftAssignments, setDraftAssignments] = useState({})
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)

  const load = useCallback(() => {
    setLoading(true)
    adminAPI.getSettings()
      .then((s) => {
        const enabled = Boolean(s.docker_integration_enabled)
        const endpoint = s.docker_api_endpoint || 'unix:///var/run/docker.sock'
        const poll = Number(s.docker_status_poll_seconds || 30)
        setDockerEnabled(enabled)
        setDockerEndpoint(endpoint)
        setPollSeconds(String(poll))
        savedDockerRef.current = { enabled, endpoint, poll }
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Auto-save a single connection field. Skips no-op writes (e.g. a blur with no
  // change) so we don't fire a redundant save toast. updateSettings drives it.
  const commitDocker = (field, value) => {
    const saved = savedDockerRef.current
    if (saved && saved[field] === value) return
    setError('')
    setMessage('')
    const patch = {
      enabled: { docker_integration_enabled: value },
      endpoint: { docker_api_endpoint: value },
      poll: { docker_status_poll_seconds: value },
    }[field]
    updateSettings(patch)
      .then(() => { savedDockerRef.current = { ...savedDockerRef.current, [field]: value } })
      .catch((err) => setError(errorMessage(err)))
  }

  const chooseDefaultGroup = useCallback((pages, groupHint, pageId = null) => {
    const normalizedHint = (groupHint || '').trim().toLowerCase()
    const pagePool = pageId ? pages.filter((page) => page.id === pageId) : pages
    if (normalizedHint) {
      for (const page of pagePool) {
        const match = page.groups.find((group) => group.title.trim().toLowerCase() === normalizedHint)
        if (match) return { pageId: page.id, groupId: match.id }
      }
    }
    const targetPage = pagePool.find((page) => page.groups.length) || pages.find((page) => page.groups.length)
    if (!targetPage) return { pageId: pageId || null, groupId: null }
    return { pageId: targetPage.id, groupId: targetPage.groups[0]?.id ?? null }
  }, [])

  const hydrateDrafts = useCallback((data) => {
    const next = {}
    for (const workload of data.workloads || []) {
      const assignment = workload.assignment
      const guessed = assignment
        ? { pageId: assignment.page_id, groupId: assignment.group_id }
        : chooseDefaultGroup(data.pages || [], workload.group_hint, null)
      next[workload.key] = {
        enabled: Boolean(assignment),
        pageId: guessed.pageId,
        groupId: guessed.groupId,
      }
    }
    setDraftAssignments(next)
  }, [chooseDefaultGroup])

  const testDocker = async () => {
    setPreviewBusy(true)
    setPreview(null)
    setError('')
    setMessage('')
    try {
      const data = await adminAPI.dockerPreview()
      setPreview(data)
      hydrateDrafts(data)
      setTab('assignments')
      setMessage(`Connected to Docker. Found ${data.workload_count} workloads.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPreviewBusy(false)
    }
  }

  const saveAssignments = useCallback(async () => {
    if (!preview) return
    setDirty(false)
    dirtyRef.current = false
    saveToast.saving()
    setError('')
    try {
      const assignments = preview.workloads.map((workload) => {
        const draft = draftAssignments[workload.key] || {}
        return {
          key: workload.key,
          enabled: Boolean(draft.enabled),
          group_id: draft.enabled ? (draft.groupId || null) : null,
        }
      })
      const data = await adminAPI.updateDockerAssignments(assignments)
      setPreview(data)
      // Only re-sync drafts from the server if no newer edits arrived mid-save.
      if (!dirtyRef.current) hydrateDrafts(data)
      saveToast.saved()
    } catch (err) {
      setError(errorMessage(err))
      saveToast.failed()
    }
  }, [preview, draftAssignments, hydrateDrafts, saveToast])

  // Auto-save: debounce a write whenever the admin changes an assignment.
  useEffect(() => {
    if (!dirty || !preview) return undefined
    const timer = setTimeout(saveAssignments, 700)
    return () => clearTimeout(timer)
  }, [dirty, preview, saveAssignments])

  const facets = useMemo(() => {
    const items = preview?.workloads || []
    const statusCounts = {}
    const groupCounts = {}
    let noUrl = 0
    for (const workload of items) {
      const status = workload.docker_status?.status || 'unknown'
      statusCounts[status] = (statusCounts[status] || 0) + 1
      if (!workload.href) noUrl += 1
      if (workload.group_hint) groupCounts[workload.group_hint] = (groupCounts[workload.group_hint] || 0) + 1
    }
    return { statusCounts, groupCounts, noUrl }
  }, [preview])

  const filteredWorkloads = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = preview?.workloads || []
    return items.filter((workload) => {
      if (activeFilter === 'nourl' && workload.href) return false
      if (activeFilter?.startsWith('status:') && (workload.docker_status?.status || 'unknown') !== activeFilter.slice(7)) return false
      if (activeFilter?.startsWith('group:') && (workload.group_hint || '') !== activeFilter.slice(6)) return false
      if (!q) return true
      return workload.title.toLowerCase().includes(q)
        || workload.key.toLowerCase().includes(q)
        || (workload.description || '').toLowerCase().includes(q)
        || (workload.group_hint || '').toLowerCase().includes(q)
        || (workload.container_names || []).some((name) => name.toLowerCase().includes(q))
    })
  }, [preview, query, activeFilter])

  // Single-select: clicking the active chip clears it.
  const selectFilter = (key) => setActiveFilter((current) => (current === key ? null : key))

  const updateDraft = (key, patch) => {
    setDraftAssignments((current) => ({ ...current, [key]: { ...current[key], ...patch } }))
    setDirty(true)
    dirtyRef.current = true
    saveToast.saving() // instant feedback; stays on "Saving…" through rapid edits
  }

  const groupsForPage = (pageId) => preview?.pages?.find((page) => page.id === pageId)?.groups || []

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>

  return (
    <>
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {message && <div className="mb-3 text-sm text-emerald-400">{message}</div>}

      <SettingsSection
        title="Docker integration"
        description="Discover containers and compose services live from Docker, then choose exactly which ones should appear on which page/group."
      >
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                tab === id ? 'bg-accent/15 text-white' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {tab === 'connection' && (
          <>
            <SettingsGroup>
              <SettingsRow label="Enabled">
                <Toggle
                  value={dockerEnabled}
                  onChange={(next) => { setDockerEnabled(next); commitDocker('enabled', next) }}
                />
              </SettingsRow>
              <SettingsRow
                label="Docker API endpoint"
                hint="Use unix:///var/run/docker.sock for a local daemon, or an http://host:port endpoint."
                htmlFor="docker-endpoint"
                stack
              >
                <input
                  id="docker-endpoint"
                  className={input}
                  value={dockerEndpoint}
                  disabled={!dockerEnabled}
                  placeholder="unix:///var/run/docker.sock"
                  onChange={(e) => setDockerEndpoint(e.target.value)}
                  onBlur={() => commitDocker('endpoint', dockerEndpoint.trim())}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
              </SettingsRow>
              <SettingsRow label="Poll interval (seconds)">
                <input
                  className={`${input} w-28`}
                  type="number"
                  min="5"
                  max="3600"
                  value={pollSeconds}
                  disabled={!dockerEnabled}
                  onChange={(e) => setPollSeconds(e.target.value)}
                  onBlur={() => commitDocker('poll', Number(pollSeconds) || 30)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
              </SettingsRow>
            </SettingsGroup>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={btnSecondary} onClick={testDocker} disabled={previewBusy || !dockerEndpoint.trim()}>
                {previewBusy ? <Spinner className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                <span>Test connection</span>
              </button>
            </div>

            {preview && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SummaryCard icon={Server} label="Endpoint" value={preview.endpoint} mono />
                <SummaryCard icon={Database} label="Workloads" value={String(preview.workload_count)} />
                <SummaryCard icon={CheckCircle2} label="Assigned" value={String(preview.assigned_count)} />
              </div>
            )}
          </>
        )}

        {tab === 'assignments' && (
          <>
            {!preview ? (
              <SettingsGroup>
                <SettingsRow
                  label="No live inventory yet"
                  hint="Run Test connection first so Startboard can list all discovered Docker workloads, including stopped ones."
                >
                  <button className={btnSecondary} onClick={testDocker} disabled={previewBusy || !dockerEndpoint.trim()}>
                    {previewBusy ? <Spinner className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
                    <span>Test connection</span>
                  </button>
                </SettingsRow>
              </SettingsGroup>
            ) : (
              <>
                <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search workloads, labels, or container names"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button className={btnSecondary} onClick={testDocker} disabled={previewBusy}>
                      {previewBusy ? <Spinner className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}
                      <span>Refresh inventory</span>
                    </button>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {STATUS_ORDER.filter((status) => facets.statusCounts[status]).map((status) => (
                    <FilterChip
                      key={status}
                      active={activeFilter === `status:${status}`}
                      onClick={() => selectFilter(`status:${status}`)}
                      dot={STATUS_META[status].dot}
                      count={facets.statusCounts[status]}
                    >
                      {STATUS_META[status].label}
                    </FilterChip>
                  ))}
                  {facets.noUrl > 0 && (
                    <FilterChip
                      active={activeFilter === 'nourl'}
                      onClick={() => selectFilter('nourl')}
                      count={facets.noUrl}
                    >
                      No URL
                    </FilterChip>
                  )}
                  {Object.keys(facets.groupCounts).sort().map((group) => (
                    <FilterChip
                      key={group}
                      active={activeFilter === `group:${group}`}
                      onClick={() => selectFilter(`group:${group}`)}
                      count={facets.groupCounts[group]}
                    >
                      {group}
                    </FilterChip>
                  ))}
                  {activeFilter && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter(null)}
                      className="ml-1 cursor-pointer text-xs text-slate-400 underline-offset-2 transition hover:text-white hover:underline"
                    >
                      Clear filter
                    </button>
                  )}
                </div>

                <SettingsGroup className="divide-y-0 p-3">
                  <div className="grid gap-3">
                    {filteredWorkloads.map((workload) => {
                      const draft = draftAssignments[workload.key] || { enabled: false, pageId: null, groupId: null }
                      const availableGroups = groupsForPage(draft.pageId)
                      return (
                        <DockerWorkloadRow
                          key={workload.key}
                          workload={workload}
                          draft={draft}
                          pages={preview.pages || []}
                          groups={availableGroups}
                          onChangeEnabled={(enabled) => {
                            const fallback = chooseDefaultGroup(preview.pages || [], workload.group_hint, draft.pageId)
                            updateDraft(workload.key, {
                              enabled,
                              pageId: draft.pageId || fallback.pageId,
                              groupId: draft.groupId || fallback.groupId,
                            })
                          }}
                          onChangePage={(pageId) => {
                            const pageGroups = groupsForPage(pageId)
                            const hintMatch = workload.group_hint
                              ? pageGroups.find((group) => group.title.trim().toLowerCase() === workload.group_hint.trim().toLowerCase())
                              : null
                            updateDraft(workload.key, {
                              pageId,
                              groupId: hintMatch?.id || pageGroups[0]?.id || null,
                            })
                          }}
                          onChangeGroup={(groupId) => updateDraft(workload.key, { groupId })}
                        />
                      )
                    })}
                    {filteredWorkloads.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                        No Docker workloads matched {query.trim() || activeFilter ? 'those filters' : 'that search'}.
                      </div>
                    )}
                  </div>
                </SettingsGroup>
              </>
            )}
          </>
        )}
      </SettingsSection>

      <SettingsFootnote>
        Existing Docker-linked bookmarks are preserved and surfaced here as managed assignments. Services without a
        `homepage.href` label can still be assigned for visibility and live status; they simply render as non-clickable entries until a URL is available.
      </SettingsFootnote>
    </>
  )
}

function Toggle({ value, onChange, disabled = false }) {
  return <KitToggle checked={value} onChange={onChange} disabled={disabled} />
}

const STATUS_META = {
  running: { label: 'Running', dot: 'bg-emerald-400' },
  healthy: { label: 'Healthy', dot: 'bg-emerald-400' },
  unhealthy: { label: 'Unhealthy', dot: 'bg-amber-400' },
  stopped: { label: 'Stopped', dot: 'bg-rose-400' },
  unknown: { label: 'Unknown', dot: 'bg-slate-400' },
}
const STATUS_ORDER = ['running', 'healthy', 'unhealthy', 'stopped', 'unknown']

function FilterChip({ active, onClick, dot, count, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-transparent bg-accent text-white shadow-sm shadow-accent/30'
          : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      <span>{children}</span>
      {typeof count === 'number' && (
        <span className={active ? 'text-white/70' : 'text-slate-500'}>{count}</span>
      )}
    </button>
  )
}

function SummaryCard({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={`text-sm text-white ${mono ? 'font-mono break-all' : ''}`}>{value}</div>
    </div>
  )
}

function DockerWorkloadRow({ workload, draft, pages, groups, onChangeEnabled, onChangePage, onChangeGroup }) {
  const statusTone = {
    healthy: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    running: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    stopped: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
    unhealthy: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    unknown: 'text-slate-300 border-white/10 bg-white/5',
  }[workload.docker_status?.status || 'unknown'] || 'text-slate-300 border-white/10 bg-white/5'

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-3">
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="pt-0.5">
              <Favicon iconUrl={workload.icon_url} title={workload.title} size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold text-white">{workload.title}</div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone}`}>
                  {workload.docker_status?.status || 'unknown'}
                </span>
                {workload.href && (
                  <a
                    href={workload.href}
                    target="_blank"
                    rel="noreferrer"
                    title={workload.href}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/20"
                  >
                    <ExternalLink className="h-3 w-3" />
                    URL
                  </a>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-x-2 overflow-hidden text-xs text-slate-400">
                <span className="shrink-0 font-mono text-slate-300">{workload.key}</span>
                {workload.group_hint && (
                  <>
                    <span className="shrink-0 text-slate-500">·</span>
                    <span className="shrink-0">Group: {workload.group_hint}</span>
                  </>
                )}
                {(workload.container_names || []).length > 0 && (
                  <>
                    <span className="shrink-0 text-slate-500">·</span>
                    <span className="truncate">{workload.container_names.join(', ')}</span>
                  </>
                )}
                {workload.description && (
                  <>
                    <span className="shrink-0 text-slate-500">·</span>
                    <span className="truncate text-slate-500">{workload.description}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-3 self-start md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex h-10 items-center self-start">
            <Toggle value={Boolean(draft.enabled)} onChange={onChangeEnabled} />
          </div>
          <CompactSelect
            value={draft.pageId || ''}
            disabled={!draft.enabled}
            onChange={(e) => onChangePage(Number(e.target.value))}
          >
            <option value="">Choose page</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>{page.owner_username} / {page.title}</option>
            ))}
          </CompactSelect>
          <CompactSelect
            value={draft.groupId || ''}
            disabled={!draft.enabled || !draft.pageId}
            onChange={(e) => onChangeGroup(Number(e.target.value))}
          >
            <option value="">Choose group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.title}</option>
            ))}
          </CompactSelect>
        </div>
      </div>
    </div>
  )
}

function CompactSelect({ children, className = '', ...props }) {
  return (
    <div className="relative min-w-0">
      <select
        className={`h-10 w-full appearance-none rounded-lg border border-white/12 bg-slate-950/55 px-3 pr-9 text-sm text-slate-100 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
