import { useState } from 'react'
import { ArrowRight, Images, Sparkles } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAppState } from '../context/AppStateContext.jsx'
import { authAPI, errorMessage, technicalErrorDetails } from '../services/api.js'
import { btnPrimary, btnSecondary, input, label } from '../components/ui.js'
import Spinner from '../components/Spinner.jsx'

export default function LoginPage() {
  const { user, login } = useAuth()
  const { settings } = useAppState()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [technical, setTechnical] = useState([])
  const [message, setMessage] = useState('')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [signupForm, setSignupForm] = useState({ username: '', email: '', display_name: '', password: '' })

  const exposeTechnicalDetails = (err) => {
    const status = err?.response?.status
    if (!status) return true
    return status >= 500
  }

  if (user) {
    return <Navigate to={user.status && user.status !== 'active' ? '/pending' : '/'} replace />
  }

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setTechnical([])
    setMessage('')
  }

  const submitLogin = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setTechnical([])
    setMessage('')
    try {
      const me = await login(loginForm.username.trim(), loginForm.password)
      navigate(me.status && me.status !== 'active' ? '/pending' : '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Login failed'))
      setTechnical(exposeTechnicalDetails(err) ? technicalErrorDetails(err) : [])
    } finally {
      setBusy(false)
    }
  }

  const submitSignup = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setTechnical([])
    setMessage('')
    try {
      await authAPI.signup(signupForm)
      setMessage('Account request received. You can sign in once it has been activated.')
      setMode('login')
      setSignupForm({ username: '', email: '', display_name: '', password: '' })
    } catch (err) {
      setError(errorMessage(err, 'Signup failed'))
      setTechnical(exposeTechnicalDetails(err) ? technicalErrorDetails(err) : [])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute left-[10%] top-[8%] h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[8%] top-[18%] h-72 w-72 rounded-full bg-sky-500/12 blur-3xl" />
        <div className="absolute bottom-[6%] left-[28%] h-64 w-64 rounded-full bg-teal-300/8 blur-3xl" />
        <div className="absolute inset-x-0 top-[14%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      </div>

      <div className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/40 shadow-[0_32px_80px_rgba(2,8,23,0.55)] backdrop-blur-xl">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <section className="relative border-b border-white/10 px-6 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.18),rgba(15,23,42,0.02))]" />
            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 bg-gradient-to-br from-cyan-300/18 via-cyan-400/20 to-sky-500/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <img src="/favicon.svg" alt="" className="h-9 w-9" />
                </div>
                <div>
                  <div className="text-2xl font-semibold tracking-tight text-white">{settings.site_name}</div>
                  <div className="mt-1 text-sm text-slate-400">A polished home surface for bookmarks, pages, and backgrounds.</div>
                </div>
              </div>

              <div className="mt-10 max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-300/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-100/90">
                  <Sparkles className="h-3.5 w-3.5" />
                  Start Pages, Refined
                </div>
                <h1 className="mt-5 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                  Build a start page that feels personal, polished, and actually useful every day.
                </h1>
                <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
                  Keep bookmarks, visual pages, immersive backgrounds, and selective sharing in one place instead of scattering them across separate tools.
                </p>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                <FeatureTile
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Curated pages"
                  text="Create pages that feel more like designed surfaces than plain bookmark lists."
                />
                <FeatureTile
                  icon={<Images className="h-4 w-4" />}
                  title="Background-rich layouts"
                  text="Pair links with full-page imagery, accents, and visual identity that fits the space."
                />
                <FeatureTile
                  icon={<ArrowRight className="h-4 w-4" />}
                  title="Selective sharing"
                  text="Share whole pages or specific content with the right people without giving up control."
                />
              </div>
            </div>
          </section>

          <section className="px-6 py-7 sm:px-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-md">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {mode === 'login'
                      ? 'Open your pages, bookmarks, and saved layout.'
                      : 'Set up your profile and start with your own workspace.'}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} shrink-0`}
                  onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                >
                  {mode === 'login' ? 'Create account' : 'Have an account?'}
                </button>
              </div>

              {error && (
                <div className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <div>{error}</div>
                  {technical.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-red-500/20 pt-3 text-xs text-red-100/85">
                      {technical.map((line) => (
                        <div key={line} className="font-mono break-all">{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {message && (
                <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  {message}
                </div>
              )}

              {mode === 'login' ? (
                <form onSubmit={submitLogin} className="space-y-4">
                  <div>
                    <label className={label} htmlFor="username">Username</label>
                    <input
                      id="username"
                      className={`${input} h-12 rounded-xl`}
                      value={loginForm.username}
                      onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      className={`${input} h-12 rounded-xl`}
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                      autoComplete="current-password"
                    />
                  </div>
                  <button type="submit" className={`${btnPrimary} h-12 w-full justify-center rounded-xl text-base`} disabled={busy}>
                    {busy ? <Spinner className="h-4 w-4" /> : 'Open Startboard'}
                  </button>
                </form>
              ) : (
                <form onSubmit={submitSignup} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label}>Username</label>
                      <input
                        className={`${input} h-12 rounded-xl`}
                        value={signupForm.username}
                        onChange={(event) => setSignupForm((current) => ({ ...current, username: event.target.value }))}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={label}>Display name</label>
                      <input
                        className={`${input} h-12 rounded-xl`}
                        value={signupForm.display_name}
                        onChange={(event) => setSignupForm((current) => ({ ...current, display_name: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={label}>Email</label>
                    <input
                      className={`${input} h-12 rounded-xl`}
                      type="email"
                      value={signupForm.email}
                      onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className={label}>Password</label>
                    <input
                      className={`${input} h-12 rounded-xl`}
                      type="password"
                      value={signupForm.password}
                      onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))}
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="rounded-2xl border border-amber-300/18 bg-amber-300/8 px-4 py-3 text-sm leading-6 text-amber-100/92">
                    New accounts may require activation before first sign-in.
                  </div>

                  <button type="submit" className={`${btnPrimary} h-12 w-full justify-center rounded-xl text-base`} disabled={busy}>
                    {busy ? <Spinner className="h-4 w-4" /> : 'Create account'}
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function FeatureTile({ icon, title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3.5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-cyan-200">
        {icon}
      </div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{text}</div>
    </div>
  )
}
