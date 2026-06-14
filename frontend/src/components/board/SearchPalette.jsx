import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import Favicon from '../Favicon.jsx'
import { bookmarkDisplayUrl, isBookmarkLaunchable, openBookmark } from '../../lib/bookmarkLinks.js'

function normalize(text) {
  return String(text || '').trim().toLowerCase()
}

export default function SearchPalette({ open, groups, openNewTab = true, shortcutLabel = 'Ctrl K', onOpenBookmark, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  const results = useMemo(() => {
    const term = normalize(query)
    const items = groups.flatMap((group) => group.bookmarks.map((bookmark) => ({
      id: bookmark.id,
      groupTitle: group.title,
      bookmark,
      haystack: [
        bookmark.title,
        bookmarkDisplayUrl(bookmark),
        bookmark.description,
        group.title,
      ].map(normalize).join('\n'),
    })))
    const filtered = term
      ? items.filter((item) => item.haystack.includes(term))
      : items
    return filtered.slice(0, 40)
  }, [groups, query])
  const clampedActiveIndex = results.length ? Math.min(activeIndex, results.length - 1) : 0

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      setQuery('')
      setActiveIndex(0)
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => (results.length ? (current + 1) % results.length : 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => (results.length ? (current - 1 + results.length) % results.length : 0))
      } else if (event.key === 'Enter' && results[clampedActiveIndex]) {
        event.preventDefault()
        const bookmark = results[clampedActiveIndex].bookmark
        onOpenBookmark?.(bookmark)
        if (openBookmark(bookmark, openNewTab)) onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clampedActiveIndex, onClose, onOpenBookmark, open, openNewTab, results])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 py-[12vh] backdrop-blur-md"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900/96 shadow-2xl">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bookmarks"
              className="w-full bg-transparent text-base text-white placeholder-slate-500 outline-none"
            />
            <span className="hidden shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400 sm:inline">
              {shortcutLabel}
            </span>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onOpenBookmark?.(item.bookmark)
                    if (!openBookmark(item.bookmark, openNewTab)) return
                    onClose?.()
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    index === clampedActiveIndex ? 'bg-accent/18 text-white' : 'text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <Favicon
                    iconUrl={item.bookmark.icon_url}
                    title={item.bookmark.title}
                    size={20}
                    show
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.bookmark.title}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {item.groupTitle}{bookmarkDisplayUrl(item.bookmark) ? ` · ${bookmarkDisplayUrl(item.bookmark)}` : ' · No link'}
                    </span>
                  </span>
                  {isBookmarkLaunchable(item.bookmark) && <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
              <div className="text-sm font-medium text-white">No bookmarks found</div>
              <div className="mt-1 text-sm text-slate-400">Try a title, URL, description, or group name.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
