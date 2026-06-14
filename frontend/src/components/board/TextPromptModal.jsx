import { useState } from 'react'
import { Save } from 'lucide-react'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'
import { btnPrimary, btnSecondary, input, label } from '../ui.js'
import { errorMessage } from '../../services/api.js'

// Minimal single-field prompt (used for adding/renaming pages and groups).
export default function TextPromptModal({ title, fieldLabel, initial = '', onSubmit, onClose }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!value.trim()) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(value.trim())
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span>Save</span>
          </button>
        </>
      }
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <label className={label}>{fieldLabel}</label>
      <input
        className={input}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
    </Modal>
  )
}
