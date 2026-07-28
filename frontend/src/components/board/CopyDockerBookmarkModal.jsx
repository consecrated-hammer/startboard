import { useState } from 'react'
import { Copy } from 'lucide-react'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'
import { btnPrimary, btnSecondary, input, label } from '../ui.js'

export default function CopyDockerBookmarkModal({ bookmark, pages, onCopy, onClose, busy }) {
  const destinations = pages.filter((page) => !page.is_system_page)
  const initialPage = destinations.find((page) => page.groups?.length) || null
  const [pageId, setPageId] = useState(String(initialPage?.id || ''))
  const page = destinations.find((item) => String(item.id) === pageId)
  const [groupId, setGroupId] = useState(String(initialPage?.groups?.[0]?.id || ''))

  const changePage = (nextPageId) => {
    setPageId(nextPageId)
    const nextPage = destinations.find((item) => String(item.id) === nextPageId)
    setGroupId(String(nextPage?.groups?.[0]?.id || ''))
  }

  return (
    <Modal title={`Copy ${bookmark.title}`} size="md" onClose={onClose} footer={(
      <>
        <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={() => onCopy(Number(groupId))} disabled={busy || !groupId}>
          {busy ? <Spinner className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span>Copy bookmark</span>
        </button>
      </>
    )}>
      <p className="text-sm text-slate-400">Creates an ordinary bookmark that keeps this service’s live Docker status badge.</p>
      <div className="mt-5 space-y-4">
        <label className="block"><span className={label}>Page</span>
          <select className={input} value={pageId} onChange={(event) => changePage(event.target.value)}>
            {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.title}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Group</span>
          <select className={input} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            {(page?.groups || []).map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
          </select>
        </label>
      </div>
    </Modal>
  )
}
