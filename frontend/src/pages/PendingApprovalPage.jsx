import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { btnSecondary } from '../components/ui.js'

export default function PendingApprovalPage() {
  const { user, logout } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.status === 'active') return <Navigate to="/" replace />

  const title = user.status === 'rejected' ? 'Signup rejected' : 'Pending approval'
  const body = user.status === 'rejected'
    ? 'An administrator rejected this signup request. Ask an admin if you need the account reactivated.'
    : 'Your account exists, but an administrator still needs to approve it before normal access is enabled.'

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-800/80 p-8 shadow-2xl">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm text-slate-300">{body}</p>
        <p className="mt-2 text-xs text-slate-500">
          Signed in as <span className="font-mono text-slate-300">{user.username}</span>.
        </p>
        <div className="mt-6">
          <button className={btnSecondary} onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
