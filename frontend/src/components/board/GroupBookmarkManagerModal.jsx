import { useMemo, useState } from 'react'
import { PencilLine, Plus, Share2, Trash2 } from 'lucide-react'
import Modal from '../Modal.jsx'
import { btnPrimary, btnSecondary, input } from '../ui.js'
import { bookmarkDisplayUrl } from '../../lib/bookmarkLinks.js'

export default function GroupBookmarkManagerModal({ group, onAdd, onEdit, onDelete, onShare, onClose }) {
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return group.bookmarks
    return group.bookmarks.filter((bookmark) => (
      bookmark.title.toLowerCase().includes(normalized)
      || bookmarkDisplayUrl(bookmark).toLowerCase().includes(normalized)
      || (bookmark.description || '').toLowerCase().includes(normalized)
    ))
  }, [group.bookmarks, query])

  return (
    <Modal
      title={`${group.title} bookmarks`}
      size="6xl"
      onClose={onClose}
      footer={<button className={btnPrimary} onClick={onClose}>Done</button>}
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <input
          className={input}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://"
        />
        <button
          className={btnPrimary}
          onClick={async () => {
            if (!url.trim()) return
            await onAdd(group, url.trim())
            setUrl('')
          }}
        >
          <Plus className="h-4 w-4" />
          <span>Add</span>
        </button>
      </div>

      <div className="mb-4">
        <input
          className={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bookmark widgets"
        />
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10">
        <div className="divide-y divide-white/10">
          {filtered.map((bookmark) => (
            <div key={bookmark.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{bookmark.title}</span>
              <button className={btnSecondary} onClick={() => onEdit(group, bookmark)}>
                <PencilLine className="h-4 w-4" />
                <span>Edit</span>
              </button>
              {onShare && (
                <button className={btnSecondary} onClick={() => onShare(bookmark)}>
                  <Share2 className="h-4 w-4" />
                  <span>Share</span>
                </button>
              )}
              <button className={btnSecondary} onClick={() => onDelete(bookmark)}>
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-400">No bookmarks match this filter.</div>
          )}
        </div>
      </div>
    </Modal>
  )
}
