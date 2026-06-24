import { useState } from 'react'
import { useAppState } from '../context/AppStateContext.jsx'

const THEME_ICON_COLORS = {
  dark: '#f8fafc',
  light: '#1e293b',
}

const LOCAL_ICON_PREFIX = '/api/icons/'

function parseIconifyUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/icons/')) {
      return null
    }
    const match = parsed.pathname.match(/(.*)\/([^/]+)\/([^/.]+)\.svg$/)
    if (!match) return null
    return {
      baseUrl: `${parsed.origin}${match[1]}`,
      prefix: decodeURIComponent(match[2]),
      name: decodeURIComponent(match[3]),
    }
  } catch {
    return null
  }
}

function buildIconifyUrl({ baseUrl, prefix, name, color }) {
  const url = new URL(
    `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
    window.location.origin,
  )
  if (color) url.searchParams.set('color', color)
  return url.toString()
}

function parseLocalSvgUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith(LOCAL_ICON_PREFIX) || !parsed.pathname.endsWith('.svg')) {
      return null
    }
    return {
      filename: decodeURIComponent(parsed.pathname.slice(LOCAL_ICON_PREFIX.length)),
      tintable: parsed.searchParams.get('sb_tintable') === '1',
    }
  } catch {
    return null
  }
}

function buildLocalSvgRenderUrl({ filename, color }) {
  const url = new URL(`${window.location.origin}/api/icons/render/${encodeURIComponent(filename)}`)
  if (color) url.searchParams.set('color', color)
  return url.toString()
}

// Renders a bookmark favicon; on load error falls back to a letter tile.
// `treatment` overrides the site-wide icon_treatment (used by the settings preview).
export default function Favicon({ iconUrl, title, size = 18, show = true, treatment, color = '' }) {
  const { settings, resolvedTheme } = useAppState()
  const [failedUrl, setFailedUrl] = useState(null)
  const iconTreatment = treatment || settings.icon_treatment || 'default'
  const parsedIconify = parseIconifyUrl(iconUrl)
  const parsedLocalSvg = parseLocalSvgUrl(iconUrl)
  const requestedColor = color.trim() || (settings.icon_color || '').trim()
  const treatmentColor = THEME_ICON_COLORS[resolvedTheme] || THEME_ICON_COLORS.dark
  const effectiveColor = requestedColor || (iconTreatment !== 'default' ? treatmentColor : '')
  const shouldTreatAsIcon = (parsedIconify || parsedLocalSvg?.tintable) && (iconTreatment !== 'default' || !!requestedColor)
  const effectiveUrl = parsedIconify && effectiveColor
    ? buildIconifyUrl({
      ...parsedIconify,
      color: effectiveColor,
    })
    : parsedLocalSvg && effectiveColor
      ? buildLocalSvgRenderUrl({ filename: parsedLocalSvg.filename, color: effectiveColor })
      : iconUrl
  const failed = failedUrl === effectiveUrl
  const letter = (title || '?').trim().charAt(0).toUpperCase()
  const tilePadding = iconTreatment === 'tile' ? Math.max(1, Math.round(size * 0.14)) : 0
  const imageSize = shouldTreatAsIcon && iconTreatment === 'tile'
    ? Math.max(8, size - (tilePadding * 2))
    : size

  if (!show) return null

  if (!effectiveUrl || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded bg-accent-dark text-[10px] font-semibold text-white"
        style={{ width: size, height: size }}
      >
        {letter}
      </span>
    )
  }

  const image = (
    <img
      src={effectiveUrl}
      alt=""
      width={imageSize}
      height={imageSize}
      className="shrink-0 rounded object-contain"
      loading="lazy"
      onError={() => setFailedUrl(effectiveUrl)}
    />
  )

  if (shouldTreatAsIcon && iconTreatment === 'tile') {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-md bg-[var(--color-icon-tile)]"
        style={{ width: size, height: size, padding: tilePadding }}
      >
        {image}
      </span>
    )
  }

  return (
    image
  )
}
