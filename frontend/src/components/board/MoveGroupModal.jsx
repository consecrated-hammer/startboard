import { MoveRight } from 'lucide-react'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'
import { btnPrimary, btnSecondary, input, label } from '../ui.js'

export default function MoveGroupModal({ group, pages, currentPageId, destinationPageId, setDestinationPageId, onClose, onSubmit, busy, error }) {
  const availablePages = pages.filter((page) => page.id !== currentPageId && page.can_edit)

  return (
    <Modal
      title={`Move "${group.title}"`}
      onClose={onClose}
      footer={(
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={onSubmit} disabled={busy || !destinationPageId}>
            {busy ? <Spinner className="h-4 w-4" /> : <MoveRight className="h-4 w-4" />}
            <span>Move section</span>
          </button>
        </>
      )}
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <div className="mb-4 text-sm text-slate-400">
        This moves the whole section and all of its bookmarks to another page you can edit.
      </div>
      <label className={label}>Destination page</label>
      <select
        className={`${input} appearance-none`}
        value={destinationPageId || ''}
        onChange={(e) => setDestinationPageId(Number(e.target.value) || null)}
        autoFocus
      >
        <option value="">Choose a page…</option>
        {availablePages.map((page) => (
          <option key={page.id} value={page.id}>
            {page.title}
          </option>
        ))}
      </select>
      {availablePages.length === 0 && (
        <div className="mt-3 text-sm text-slate-500">No other editable pages available.</div>
      )}
    </Modal>
  )
}
