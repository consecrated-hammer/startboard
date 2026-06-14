import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Columns3, Palette, PencilLine, Plus, Search, Settings2 } from 'lucide-react'
import { useAppState } from '../../context/AppStateContext.jsx'
import { btnGhost, btnPrimary, btnSecondary, input } from '../ui.js'
import { ColorField, RangeField } from '../settings/SettingsKit.jsx'
import UserMenu from './UserMenu.jsx'

function ToolbarPopover({ button, children, width = 'w-80' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className={btnSecondary} aria-expanded={open}>
        {button}
      </button>
      {open && (
        <div className={`absolute right-0 top-[calc(100%+0.5rem)] z-40 ${width} rounded-2xl border border-white/10 bg-slate-900/96 p-3 shadow-2xl backdrop-blur`}>
          {children}
        </div>
      )}
    </div>
  )
}

function AppearanceMenu({ page, onPatchPage }) {
  return (
    <ToolbarPopover
      width="w-88"
      button={(
        <>
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">Appearance</span>
        </>
      )}
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Appearance</h3>
          <p className="mt-1 text-xs text-slate-400">Quick page accent controls while you edit.</p>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Accent colour</div>
            <ColorField value={page.accent || ''} onChange={(value) => onPatchPage({ accent: value ?? '' })} />
          </div>
        </div>
      </div>
    </ToolbarPopover>
  )
}

function ColumnsMenu({ page, onPatchPage }) {
  const layoutMode = page.layout_mode || (page.auto_balance ? 'balanced' : 'natural')
  return (
    <ToolbarPopover
      width="w-96"
      button={(
        <>
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">Columns</span>
        </>
      )}
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Layout & spacing</h3>
          <p className="mt-1 text-xs text-slate-400">Tune layout without leaving edit mode.</p>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Layout mode</span>
            <select
              className={`${input} appearance-none`}
              value={layoutMode}
              onChange={(e) => onPatchPage({ layout_mode: e.target.value, auto_balance: e.target.value === 'balanced' })}
            >
              <option value="natural">Natural</option>
              <option value="balanced">Balanced</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Max columns</span>
              <select
                className={`${input} appearance-none`}
                value={page.max_cols ?? 0}
                onChange={(e) => onPatchPage({ max_cols: Number(e.target.value) })}
              >
                <option value={0}>Max</option>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Single row order</span>
              <select
                className={`${input} appearance-none`}
                value={page.single_row_order || 'natural'}
                onChange={(e) => onPatchPage({ single_row_order: e.target.value })}
                disabled={layoutMode !== 'balanced'}
              >
                <option value="natural">Natural</option>
                <option value="tallest_first">Tallest first</option>
              </select>
            </label>
          </div>
          {layoutMode === 'manual' && (
            <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-xs text-slate-300">
              Drag groups directly on the page. Their manual positions are remembered when you switch away and back.
            </div>
          )}
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Card width</div>
            <RangeField
              value={page.card_max_width ?? 0}
              onChange={(value) => onPatchPage({ card_max_width: value })}
              min={0}
              max={560}
              step={20}
              format={(value) => (value === 0 ? 'Auto' : `${value}px`)}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Horizontal spacing</div>
            <RangeField
              value={page.card_gap_x ?? 16}
              onChange={(value) => onPatchPage({ card_gap_x: value })}
              min={0}
              max={48}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Vertical spacing</div>
            <RangeField
              value={page.card_gap ?? 12}
              onChange={(value) => onPatchPage({ card_gap: value })}
              min={0}
              max={48}
            />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Bookmark spacing</div>
            <RangeField
              value={page.bookmark_gap ?? 2}
              onChange={(value) => onPatchPage({ bookmark_gap: value })}
              min={0}
              max={24}
            />
          </div>
        </div>
      </div>
    </ToolbarPopover>
  )
}

export default function TopBar({
  pages, currentPageId, onSelectPage, onAddPage,
  editing, onToggleEdit, canEdit, onOpenSettings, onAddGroup, currentPage, onPatchPage,
  showSearch = false, onOpenSearch, searchShortcutLabel = 'Ctrl K',
}) {
  const { settings } = useAppState()

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/70 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Link
          to="/"
          className="-ml-2 flex shrink-0 items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-white/5"
          title="Go to home"
        >
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="hidden text-sm font-semibold text-white sm:inline">{settings.site_name}</span>
        </Link>

        <div className="ml-1 flex min-w-0 flex-1 items-center gap-3">
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {pages.length > 0 ? (
            <>
              {pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPage(p.id)}
                  className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                    p.id === currentPageId
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {p.title}
                </button>
              ))}
              <button onClick={onAddPage} className={`${btnGhost} px-2 py-1.5`} title="New page" aria-label="New page">
                <Plus className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">No pages yet</span>
              <button onClick={onAddPage} className={btnSecondary}>
                <Plus className="h-4 w-4" />
                <span>Create page</span>
              </button>
            </div>
          )}
          </nav>
        </div>

        {showSearch && (
          <div className="hidden shrink-0 lg:flex">
            <button
              type="button"
              onClick={() => onOpenSearch?.()}
              className="flex h-10 w-112 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-left text-sm text-slate-300 transition hover:bg-white/10"
              aria-label="Search bookmarks"
            >
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1 text-slate-400">Search bookmarks</span>
              <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400">
                {searchShortcutLabel}
              </span>
            </button>
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {canEdit && (
            <>
              {editing && (
                <>
                  <button onClick={onAddGroup} className={btnSecondary} title="Add group" aria-label="Add group">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Group</span>
                  </button>
                  {currentPage && onPatchPage && (
                    <>
                      <AppearanceMenu page={currentPage} onPatchPage={onPatchPage} />
                      <ColumnsMenu page={currentPage} onPatchPage={onPatchPage} />
                    </>
                  )}
                  <button onClick={onOpenSettings} className={btnSecondary} title="Page settings" aria-label="Page settings">
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Page</span>
                  </button>
                </>
              )}
              <button onClick={onToggleEdit} className={editing ? btnPrimary : btnSecondary} title={editing ? 'Done editing' : 'Edit board'}>
                {editing ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                <span>{editing ? 'Done' : 'Edit'}</span>
              </button>
            </>
          )}
          {showSearch && (
            <button
              type="button"
              onClick={() => onOpenSearch?.()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 lg:hidden"
              aria-label="Search bookmarks"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
