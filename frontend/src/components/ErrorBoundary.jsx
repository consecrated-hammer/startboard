import { Component } from 'react'
import { AlertTriangle, Copy, Home, RefreshCcw } from 'lucide-react'
import { btnPrimary, btnSecondary } from './ui.js'

// Errors thrown while loading a code-split chunk usually mean the bundle was
// updated under the user (a fresh deploy). We treat those as "reload to update"
// rather than a code bug.
const CHUNK_ERROR = /(loading chunk|loading css chunk|dynamically imported module|importing a module script failed|failed to fetch dynamically)/i

// App-wide safety net. Without this, a render error (broken code, a bad API
// response a component didn't guard, a stale lazy chunk) unmounts the tree and
// leaves a blank page. Here we keep the chrome and surface both a friendly
// explanation and the raw technical detail to help with troubleshooting.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // Keep a console record for DevTools / log scraping during troubleshooting.
    console.error('Unhandled UI error:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // Recover automatically when the caller changes `resetKey` — e.g. the user
    // navigates to a different route after hitting an error.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null, copied: false })
    }
  }

  handleCopy = () => {
    const { error, info } = this.state
    const details = [
      `${error?.name || 'Error'}: ${error?.message || String(error)}`,
      error?.stack ? `\n${error.stack}` : '',
      info?.componentStack ? `\nComponent stack:${info.componentStack}` : '',
      `\n\nURL: ${window.location.href}`,
      `User agent: ${navigator.userAgent}`,
    ].join('')
    navigator.clipboard?.writeText(details)
      .then(() => {
        this.setState({ copied: true })
        window.setTimeout(() => this.setState({ copied: false }), 2000)
      })
      .catch(() => {})
  }

  render() {
    const { error, info, copied } = this.state
    if (!error) return this.props.children

    const isChunk = CHUNK_ERROR.test(error?.message || '')

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white">
                {isChunk ? 'A new version is available' : 'Something went wrong'}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {isChunk
                  ? 'Part of the app failed to load, usually because it was updated in the background. Reload to pick up the latest version.'
                  : 'An unexpected error stopped this page from rendering. The details below can help track down the cause.'}
              </p>
            </div>
          </div>

          {!isChunk && (
            <div className="mt-4 wrap-break-word rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-300">
              {error?.name ? `${error.name}: ` : ''}{error?.message || String(error)}
            </div>
          )}

          {(error?.stack || info?.componentStack) && (
            <details className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-400">
                Stack trace
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word text-[11px] leading-relaxed text-slate-300">
                {error?.stack || ''}
                {info?.componentStack ? `\nComponent stack:${info.componentStack}` : ''}
              </pre>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => window.location.reload()}>
              <RefreshCcw className="h-4 w-4" />
              <span>Reload page</span>
            </button>
            <a className={btnSecondary} href="/">
              <Home className="h-4 w-4" />
              <span>Back to start</span>
            </a>
            {!isChunk && (
              <button type="button" className={btnSecondary} onClick={this.handleCopy}>
                <Copy className="h-4 w-4" />
                <span>{copied ? 'Copied' : 'Copy details'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
