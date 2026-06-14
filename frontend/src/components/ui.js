// Shared Tailwind class strings for consistent buttons/inputs across the app.
export const btn =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed'

export const btnPrimary = `${btn} bg-accent text-white hover:bg-accent-dark`
export const btnSecondary = `${btn} border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10`
export const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-700`
export const btnWarning = `${btn} border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25`
export const btnGhost = `${btn} text-slate-300 hover:bg-white/10`

export const input =
  'w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-accent focus:ring-2 focus:ring-accent/40'

export const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400'
