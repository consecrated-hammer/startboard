#!/usr/bin/env node
// Fails when a Tailwind arbitrary-value class has a canonical shorthand — the
// same thing the editor surfaces as a `suggestCanonicalClasses` warning, but as
// a hard error so it can't slip through. Conservative by design: only patterns
// with a *definite* canonical form are reported, so legitimate arbitrary values
// (e.g. `min-h-[42vh]`, `bg-[var(--color-icon-tile)]`,
// `shadow-[inset_0_0_0_1px]`) are left alone.
//
// Extend by adding to RENAMES or the rule list in `inspect()`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const STYLES = fileURLToPath(new URL('../src/styles/index.css', import.meta.url))
const CWD = process.cwd()

// Deprecated/renamed utilities → canonical name (Tailwind v4).
const RENAMES = new Map([
  ['break-words', 'wrap-break-word'],
  ['break-word', 'wrap-break-word'],
  ['overflow-ellipsis', 'text-ellipsis'],
  ['overflow-clip', 'text-clip'],
  ['decoration-slice', 'box-decoration-slice'],
  ['decoration-clone', 'box-decoration-clone'],
])

const VARIANT = /^((?:[a-z][a-z0-9-]*:)+)?(.*)$/ // split leading `hover:sm:` variants

// Utilities that resolve px/rem lengths through Tailwind's --spacing scale
// (1 unit = 0.25rem = 4px), so an arbitrary length has a numeric canonical.
// Deliberately excludes font-size (`text-`), tracking, leading, radius, etc.,
// which use their own scales and have no such equivalent.
const SPACING_UTILS = /^(?:w|h|size|min-w|min-h|max-w|max-h|p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|basis|translate-x|translate-y)$/
const THEME_TOKEN_BLOCK = /@theme\s*{([\s\S]*?)}/g
const THEME_COLOR_DECL = /--color-([a-z0-9-]+)\s*:/g

const trim = (n) => String(Math.round(n * 1000) / 1000) // FP-safe, drops trailing zeros

function getThemeColorTokens() {
  const tokens = new Set()
  const css = readFileSync(STYLES, 'utf8')

  for (const block of css.matchAll(THEME_TOKEN_BLOCK)) {
    for (const decl of block[1].matchAll(THEME_COLOR_DECL)) {
      tokens.add(decl[1])
    }
  }

  return tokens
}

const THEME_COLOR_TOKENS = getThemeColorTokens()

function normalizeOpacitySuffix(suffix) {
  if (!suffix) return ''

  const alpha = suffix.match(/^\/\[0?\.(\d+)\]$/)
  if (alpha) {
    const pct = Math.round(Number(`0.${alpha[1]}`) * 1000) / 10
    if (pct >= 0 && pct <= 100) return `/${trim(pct)}`
  }

  const pct = suffix.match(/^\/\[(\d+(?:\.\d+)?)%\]$/)
  if (pct) {
    const value = Number(pct[1])
    if (value >= 0 && value <= 100) return `/${trim(value)}`
  }

  return suffix
}

// Returns a canonical suggestion for one class token, or null.
function inspect(token) {
  const [, prefix = '', base] = token.match(VARIANT)

  // 1) Renamed utilities.
  if (RENAMES.has(base)) return prefix + RENAMES.get(base)

  // 2) Arbitrary opacity modifier → percentage shorthand: `/[0.03]` → `/3`,
  //    `/[4.5%]` → `/4.5`.
  const opacityAlpha = base.match(/^(.+)\/\[0?\.(\d+)\]$/)
  if (opacityAlpha) {
    const pct = Math.round(Number(`0.${opacityAlpha[2]}`) * 1000) / 10
    if (pct >= 0 && pct <= 100) return `${prefix}${opacityAlpha[1]}/${trim(pct)}`
  }
  const opacityPct = base.match(/^(.+)\/\[(\d+(?:\.\d+)?)%\]$/)
  if (opacityPct) {
    const pct = Number(opacityPct[2])
    if (pct >= 0 && pct <= 100) return `${prefix}${opacityPct[1]}/${trim(pct)}`
  }

  // 3) Arbitrary theme color vars: `bg-[var(--color-accent)]` → `bg-accent`,
  //    `ring-[var(--color-accent)]/[0.4]` → `ring-accent/40`.
  const themeColor = base.match(/^([a-z-]+)-\[var\(--color-([a-z0-9-]+)\)\](\/(?:\[(?:0?\.\d+|\d+(?:\.\d+)?%)\]|\d+(?:\.\d+)?))?$/)
  if (themeColor && THEME_COLOR_TOKENS.has(themeColor[2])) {
    return `${prefix}${themeColor[1]}-${themeColor[2]}${normalizeOpacitySuffix(themeColor[3])}`
  }

  // 4) Arbitrary integer z-index: `z-[120]` → `z-120`.
  const z = base.match(/^z-\[(\d+)\]$/)
  if (z) return `${prefix}z-${z[1]}`

  // 5) Arbitrary spacing-scale length: `w-[28rem]` → `w-112`, `min-w-[220px]` → `min-w-55`.
  const len = base.match(/^(.*?)-\[(\d+(?:\.\d+)?)(px|rem)\]$/)
  if (len && SPACING_UTILS.test(len[1])) {
    const value = Number(len[2])
    return `${prefix}${len[1]}-${trim(len[3] === 'px' ? value / 4 : value * 4)}`
  }

  return null
}

const findings = []
function scan(file) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const token of line.match(/[A-Za-z0-9:/[\].%_-]*\[[^\]\s]+\][A-Za-z0-9:/[\].%_-]*|[A-Za-z][A-Za-z0-9:/_-]*/g) || []) {
      const fix = inspect(token)
      if (fix && fix !== token) findings.push({ file, line: i + 1, token, fix })
    }
  })
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.[jt]sx?$/.test(entry)) scan(full)
  }
}

walk(SRC)

if (findings.length) {
  console.error(`\n✖ Tailwind canonical-class check failed (${findings.length} issue(s)):\n`)
  for (const f of findings) {
    console.error(`  ${relative(CWD, f.file)}:${f.line}\n      ${f.token}  →  ${f.fix}`)
  }
  console.error('\nReplace each arbitrary class with its canonical shorthand, then re-run.\n')
  process.exit(1)
}
console.log('✓ Tailwind canonical-class check passed.')
