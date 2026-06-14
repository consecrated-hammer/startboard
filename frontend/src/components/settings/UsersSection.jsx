import { useCallback, useEffect, useState } from 'react'
import { Check, PencilLine, Save, UserPlus, X } from 'lucide-react'
import { adminAPI, errorMessage } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { SettingsSection, Toggle } from './SettingsKit.jsx'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'
import { btnGhost, btnPrimary, btnSecondary, input, label } from '../ui.js'

export default function UsersSection() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editUser, setEditUser] = useState(null) // user object, or {} for new

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([adminAPI.listUsers(), adminAPI.listPendingUsers().catch(() => [])])
      .then(([allUsers, pending]) => {
        const pendingIds = new Set(pending.map((item) => item.id))
        const merged = allUsers.map((item) => (pendingIds.has(item.id) ? { ...item, status: 'pending' } : item))
        setUsers(merged)
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const removeUser = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"? Their pages are removed too.`)) return
    try { await adminAPI.removeUser(u.id); load() }
    catch (err) { setError(errorMessage(err)) }
  }

  return (
    <SettingsSection
      title="Users"
      description="Create accounts, set roles, and reset passwords. Per-page access is granted from each page's settings."
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      <div className="mb-3">
        <button className={btnSecondary} onClick={() => setEditUser({})}>
          <UserPlus className="h-4 w-4" />
          <span>New user</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    <div className="text-slate-100">{u.display_name || u.username}</div>
                    <div className="text-xs text-slate-500">@{u.username}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${u.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-white/10 text-slate-300'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={u.status === 'active' ? 'text-emerald-400' : u.status === 'pending' ? 'text-amber-300' : 'text-slate-400'}>
                      {u.status || (u.is_active ? 'active' : 'disabled')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.status === 'pending' && (
                      <>
                        <button className={`${btnGhost} px-2 text-emerald-300`} onClick={async () => { await adminAPI.approveUser(u.id); load() }}>
                          <Check className="h-4 w-4" />
                          <span>Approve</span>
                        </button>
                        <button className={`${btnGhost} px-2 text-amber-300`} onClick={async () => { await adminAPI.rejectUser(u.id); load() }}>
                          <X className="h-4 w-4" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                    <button className={`${btnGhost} px-2`} onClick={() => setEditUser(u)}>
                      <PencilLine className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                    {u.id !== user.id && (
                      <button className={`${btnGhost} px-2 text-red-400`} onClick={() => removeUser(u)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editUser && (
        <UserModal
          existing={editUser.id ? editUser : null}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load() }}
        />
      )}
    </SettingsSection>
  )
}

function UserModal({ existing, onClose, onSaved }) {
  const editing = Boolean(existing)
  const [username, setUsername] = useState(existing?.username || '')
  const [email, setEmail] = useState(existing?.email || '')
  const [displayName, setDisplayName] = useState(existing?.display_name || '')
  const [role, setRole] = useState(existing?.role || 'user')
  const [isActive, setIsActive] = useState(existing ? existing.is_active : true)
  const [status, setStatus] = useState(existing?.status || 'active')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      if (editing) {
        if (password && password.length < 8) {
          setError('New password must be at least 8 characters')
          setBusy(false)
          return
        }
        const patch = { email: email.trim(), display_name: displayName || null, role, is_active: isActive, status }
        if (password) patch.password = password
        await adminAPI.updateUser(existing.id, patch)
      } else {
        if (!username.trim() || !email.trim() || password.length < 8) {
          setError('Username, email, and an 8+ character password are required')
          setBusy(false)
          return
        }
        await adminAPI.createUser({ username: username.trim(), email: email.trim(), display_name: displayName || null, role, password })
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${existing.username}` : 'New user'}
      onClose={onClose}
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            <span>Save</span>
          </button>
        </>
      }
    >
      {error && <div className="mb-3 text-sm text-red-400">{error}</div>}
      {!editing && (
        <div className="mb-3">
          <label className={label}>Username</label>
          <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
      )}
      <div className="mb-3">
        <label className={label}>Email</label>
        <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus={!editing} />
      </div>
      <div className="mb-3">
        <label className={label}>Display name</label>
        <input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className={label}>Role</label>
          <select className={`${input} appearance-none`} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        {editing && (
          <div className="flex-1">
            <label className={label}>Status</label>
            <select className={`${input} appearance-none`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">active</option>
              <option value="pending">pending</option>
              <option value="rejected">rejected</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
        )}
      </div>
      {editing && (
        <div className="mb-3 flex items-center gap-3 pt-1.5">
          <Toggle checked={isActive} onChange={setIsActive} label="Account active" />
          <span className="text-sm text-slate-300">{isActive ? 'Account enabled' : 'Account disabled'}</span>
        </div>
      )}
      <div>
        <label className={label}>{editing ? 'Reset password (optional)' : 'Password'}</label>
        <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
    </Modal>
  )
}
