// Apple-HIG-style settings building blocks (grouped inset "cards").
// Shared by the unified Settings page and the per-page settings modal.

import { ChevronDown } from 'lucide-react'
import { input } from '../ui.js'

// Styled native <select> with a visible chevron affordance. `className` sizes
// the wrapper (e.g. "w-32"); the select fills it.
export function Select({ value, onChange, disabled = false, children, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${input} appearance-none pr-9 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

export function SettingsSection({ title, description, children }) {
  return (
    <section className="mb-8 last:mb-0">
      {(title || description) && (
        <div className="mb-3 px-1">
          {title && <h2 className="text-base font-semibold text-white">{title}</h2>}
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

// A rounded inset card; direct children are separated by hairline dividers.
export function SettingsGroup({ children, className = '' }) {
  return (
    <div className={`divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5 ${className}`}>
      {children}
    </div>
  )
}

// A single row. Default: label left / control right. `stack` puts the control on
// its own full-width line below the label (for inputs/textareas).
export function SettingsRow({ label, hint, children, stack = false, htmlFor }) {
  if (stack) {
    return (
      <div className="px-4 py-3">
        {label && (
          <label htmlFor={htmlFor} className="block text-sm text-white">{label}</label>
        )}
        {hint && <p className="mt-0.5 mb-2 text-xs text-slate-400">{hint}</p>}
        <div className={hint ? '' : 'mt-2'}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        {label && <label htmlFor={htmlFor} className="block text-sm text-white">{label}</label>}
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

// Optional small footnote under a group (HIG grouped-list caption).
export function SettingsFootnote({ children }) {
  return <p className="mt-2 px-1 text-xs text-slate-400">{children}</p>
}

// A range slider with a live numeric read-out. `value`/`onChange` are numbers.
// `format(value)` overrides the read-out text (e.g. 0 → "Auto").
export function RangeField({ value, onChange, min = 0, max = 24, step = 1, unit = 'px', format }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-accent"
      />
      <span className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-300">
        {format ? format(value) : `${value}${unit}`}
      </span>
    </div>
  )
}

// Named preset swatches — the name shows on hover instead of the hex code.
const DEFAULT_SWATCHES = [
  { value: '#0ea5b7', name: 'Teal' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#8b5cf6', name: 'Violet' },
  { value: '#ec4899', name: 'Pink' },
  { value: '#ef4444', name: 'Red' },
  { value: '#f59e0b', name: 'Amber' },
  { value: '#10b981', name: 'Emerald' },
  { value: '#64748b', name: 'Slate' },
]

// Colour control: preset swatches + native OS picker (custom) + a "None" clear.
// `value` is a hex string or '' (none / inherit theme).
export function ColorField({ value, onChange, swatches = DEFAULT_SWATCHES }) {
  const active = (value || '').toLowerCase()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {swatches.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          title={c.name}
          aria-label={c.name}
          className={`h-7 w-7 rounded-full border transition ${
            active === c.value.toLowerCase() ? 'border-white ring-2 ring-white/40' : 'border-white/20 hover:border-white/50'
          }`}
          style={{ background: c.value }}
        />
      ))}
      <label
        title="Custom colour"
        className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-white/20 hover:border-white/50"
      >
        <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button
        type="button"
        onClick={() => onChange('')}
        className={`rounded-lg border px-2.5 py-1 text-xs transition ${
          !value ? 'border-white/40 bg-white/10 text-white' : 'border-white/15 text-slate-300 hover:bg-white/10'
        }`}
      >
        None
      </button>
    </div>
  )
}

// Apple-style toggle switch. `checked`/`onChange(next)` are controlled.
export function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
        checked ? 'bg-accent' : 'bg-white/20'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
