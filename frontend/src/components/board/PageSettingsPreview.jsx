import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import Favicon from '../Favicon.jsx'

// Live, tab-specific previews for the page settings modal (desktop only). Each
// tab shows only what it actually changes; tabs that don't affect the page
// (Sharing, Manage) get no preview — the default export returns null for them,
// and the modal hides the pane via its own PREVIEW_TABS list.

const PREVIEW_COL_CAP = 6

// Mirrors estimateGroupHeight()/buildColumns() in BoardPage so the layout
// preview arranges groups exactly like the real board does.
function estimateGroupHeight(group) {
  const visible = group?.visible_limit > 0
    ? Math.min(group?.bookmarks?.length ?? 0, group.visible_limit)
    : (group?.bookmarks?.length ?? 0)
  return 1 + visible
}

function buildColumns(groups, count, autoBalance, singleRowOrder) {
  const cols = Array.from({ length: count }, () => [])
  const sorted = [...groups].sort((a, b) => (a.column - b.column) || (a.position - b.position))
  if (autoBalance) {
    if (sorted.length <= count && singleRowOrder === 'tallest_first') {
      const row = [...sorted].sort((a, b) => estimateGroupHeight(b) - estimateGroupHeight(a))
      row.forEach((group, index) => cols[index].push(group))
      return cols
    }
    const heights = Array.from({ length: count }, () => 0)
    for (const group of sorted) {
      let target = 0
      for (let i = 1; i < count; i++) if (heights[i] < heights[target]) target = i
      cols[target].push(group)
      heights[target] += estimateGroupHeight(group)
    }
    return cols
  }
  for (const group of sorted) cols[Math.min(group.column ?? 0, count - 1)].push(group)
  return cols
}

// Stand-ins with varied heights so previews are meaningful on an empty/new page.
const mock = (n) => Array.from({ length: n }, (_, i) => ({ id: i }))
const SAMPLE_GROUPS = [
  { id: 's1', title: 'Group A', column: 0, position: 0, bookmarks: mock(3) },
  { id: 's2', title: 'Group B', column: 1, position: 0, bookmarks: mock(1) },
  { id: 's3', title: 'Group C', column: 2, position: 0, bookmarks: mock(2) },
  { id: 's4', title: 'Group D', column: 0, position: 1, bookmarks: mock(4) },
  { id: 's5', title: 'Group E', column: 1, position: 1, bookmarks: mock(2) },
]

function backgroundPositionForAnchor(position) {
  if (position === 'northeast') return 'right top'
  if (position === 'north') return 'center top'
  if (position === 'southwest') return 'left bottom'
  if (position === 'southeast') return 'right bottom'
  if (position === 'south') return 'center bottom'
  if (position === 'east') return 'right center'
  if (position === 'west') return 'left center'
  if (position === 'northwest') return 'left top'
  return 'center'
}

function anchorLabel(position) {
  if (position === 'northeast') return 'Top right'
  if (position === 'north') return 'Top'
  if (position === 'south') return 'Bottom'
  if (position === 'southwest') return 'Bottom left'
  if (position === 'southeast') return 'Bottom right'
  if (position === 'east') return 'Right'
  if (position === 'west') return 'Left'
  if (position === 'northwest') return 'Top left'
  return 'Center'
}

function fitLabel(fit) {
  if (fit === 'contain') return 'Contain'
  if (fit === 'fill') return 'Fill'
  if (fit === 'scale-down') return 'Scale down'
  return 'Cover'
}

function pagePlacementJustify(position) {
  if (position === 'northwest' || position === 'west' || position === 'southwest') return 'flex-start'
  if (position === 'northeast' || position === 'east' || position === 'southeast') return 'flex-end'
  return 'center'
}

function pagePlacementAlign(position) {
  if (position === 'northwest' || position === 'north' || position === 'northeast') return 'flex-start'
  if (position === 'southwest' || position === 'south' || position === 'southeast') return 'flex-end'
  return 'center'
}

function renderStageBoxStyle(viewport, fit, renderWidth, renderHeight) {
  const viewportWidth = Math.max(1, viewport.width)
  const viewportHeight = Math.max(1, viewport.height)

  if (fit === 'fill') {
    return { width: '100%', height: '100%' }
  }

  const containScale = Math.min(viewportWidth / renderWidth, viewportHeight / renderHeight)
  const coverScale = Math.max(viewportWidth / renderWidth, viewportHeight / renderHeight)
  const scale = fit === 'cover'
    ? coverScale
    : fit === 'scale-down'
      ? Math.min(1, containScale)
      : containScale

  return {
    width: `${(renderWidth * scale / viewportWidth) * 100}%`,
    height: `${(renderHeight * scale / viewportHeight) * 100}%`,
  }
}

function BrowserViewport({
  children, accent, bgMode, bgColor, bgImage, bgImageFit,
  bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, viewport,
}) {
  const aspectRatio = `${Math.max(1, viewport.width)} / ${Math.max(1, viewport.height)}`
  const showRenderedStage = bgRenderEnabled && bgImage && bgRenderWidth > 0 && bgRenderHeight > 0
  const stageStyle = showRenderedStage
    ? renderStageBoxStyle(viewport, bgImageFit, bgRenderWidth, bgRenderHeight)
    : null
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/85 shadow-[0_18px_40px_rgba(2,8,23,0.45)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <div
        className="relative overflow-hidden p-3"
        style={{
          aspectRatio,
          backgroundColor: bgMode === 'solid' ? (bgColor || 'transparent') : '#020617',
          '--color-accent': accent || undefined,
        }}
      >
        {bgImage && !showRenderedStage && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${bgImage}")`,
              backgroundPosition: backgroundPositionForAnchor(bgImagePosition),
              backgroundRepeat: 'no-repeat',
              backgroundSize: fitToBackgroundSize(bgImageFit),
            }}
          />
        )}
        {showRenderedStage && (
          <div
            className="absolute inset-0 flex overflow-hidden"
            style={{
              justifyContent: pagePlacementJustify(bgImagePosition),
              alignItems: pagePlacementAlign(bgImagePosition),
            }}
          >
            <div className="overflow-hidden" style={stageStyle}>
              <div
                className="h-full w-full"
                style={{
                  backgroundImage: `url("${bgImage}")`,
                  backgroundPosition: backgroundPositionForAnchor(bgRenderPosition),
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                }}
              />
            </div>
          </div>
        )}
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </div>
  )
}

function PreviewFrame({
  label, summary, children, accent, bgMode, bgColor, bgImage, bgImageFit,
  bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, viewport, browserSized = false,
}) {
  const summaryLines = Array.isArray(summary) ? summary.filter(Boolean) : (summary ? [summary] : [])
  return (
    <div
      className="rounded-xl border border-white/10 bg-slate-900/40 p-3"
      style={{ '--color-accent': accent || undefined }}
    >
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {browserSized
        ? <BrowserViewport accent={accent} bgMode={bgMode} bgColor={bgColor} bgImage={bgImage} bgImageFit={bgImageFit} bgImagePosition={bgImagePosition} bgRenderEnabled={bgRenderEnabled} bgRenderWidth={bgRenderWidth} bgRenderHeight={bgRenderHeight} bgRenderPosition={bgRenderPosition} viewport={viewport}>{children}</BrowserViewport>
        : <div className="rounded-lg p-2" style={{ background: bgColor || 'transparent' }}>{children}</div>}
      {summaryLines.length > 0 && (
        <div className="mt-2 rounded-lg border border-white/8 bg-slate-950/35 px-2.5 py-2 text-[10px] leading-4 text-slate-300">
          {summaryLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// A miniature group card; its height tracks the bookmark count.
function GroupBlock({ group }) {
  const count = group?.bookmarks?.length ?? 0
  const lines = Math.min(Math.max(count, 1), 6)
  return (
    <div className="overflow-hidden rounded-md border border-white/10 bg-white/5">
      <div className="h-1.5 bg-accent/70" />
      <div className="space-y-1 p-1.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-1 rounded bg-white/15" style={{ width: `${55 + ((i * 37) % 40)}%` }} />
        ))}
      </div>
    </div>
  )
}

// A simple equal-column row of sample groups, used as board context.
function MiniGroups({ groups, cols = 3, className = '' }) {
  const source = (groups?.length ?? 0) > 0 ? groups.slice(0, cols) : SAMPLE_GROUPS.slice(0, cols)
  return (
    <div className={`grid gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {source.map((group) => <GroupBlock key={group.id} group={group} />)}
    </div>
  )
}

function OverviewHeading({ title, description, size = 'sm' }) {
  return (
    <div>
      <div className={`truncate font-semibold text-white ${size === 'sm' ? 'text-sm' : 'text-xs'}`}>
        {title?.trim() || 'Untitled page'}
      </div>
      {description?.trim()
        ? <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-slate-300">{description}</p>
        : <p className="mt-0.5 text-[11px] italic text-slate-500">No description</p>}
    </div>
  )
}

function GeneralPreview({ title, description, groups, accent, bgMode, bgColor, bgImage, bgImageFit, bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, viewport }) {
  return (
    <PreviewFrame label="Page overview" accent={accent} bgMode={bgMode} bgColor={bgColor} bgImage={bgImage} bgImageFit={bgImageFit} bgImagePosition={bgImagePosition} bgRenderEnabled={bgRenderEnabled} bgRenderWidth={bgRenderWidth} bgRenderHeight={bgRenderHeight} bgRenderPosition={bgRenderPosition} viewport={viewport} browserSized>
      <div className="space-y-2.5">
        <OverviewHeading title={title} description={description} />
        <MiniGroups groups={groups} className="opacity-70" />
      </div>
    </PreviewFrame>
  )
}

function fitToBackgroundSize(fit) {
  if (fit === 'contain') return 'contain'
  if (fit === 'fill') return '100% 100%'
  if (fit === 'scale-down') return 'contain'
  return 'cover'
}

function BackgroundPreview({ bgMode, bgColor, bgImage, bgImageFit, bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, accent, groups, viewport }) {
  const renderSummary = [
    `Available page area: ${Math.round(viewport.width)}×${Math.round(viewport.height)}`,
    bgRenderEnabled && bgRenderWidth > 0 && bgRenderHeight > 0
      ? `Render crop: ${bgRenderWidth}×${bgRenderHeight}, keep ${anchorLabel(bgRenderPosition)}`
      : null,
    `Fit on page: ${fitLabel(bgImageFit)}`,
    (bgImageFit === 'contain' || bgImageFit === 'scale-down')
      ? `Place on page: ${anchorLabel(bgImagePosition)}`
      : null,
  ]
  return (
    <PreviewFrame
      label="Background & accent"
      summary={renderSummary}
      accent={accent}
      bgMode={bgMode}
      bgColor={bgColor}
      bgImage={bgImage}
      bgImageFit={bgImageFit}
      bgImagePosition={bgImagePosition}
      bgRenderEnabled={bgRenderEnabled}
      bgRenderWidth={bgRenderWidth}
      bgRenderHeight={bgRenderHeight}
      bgRenderPosition={bgRenderPosition}
      viewport={viewport}
      browserSized
    >
      <div className="h-full rounded-lg p-2.5">
        <MiniGroups groups={groups} />
      </div>
    </PreviewFrame>
  )
}

function CardPreview({ group, bookmarkGap, cardMaxWidth, accent, bgColor }) {
  const bookmarks = (group?.bookmarks ?? []).slice(0, 5)
  // Cap the visual width to the pane; "Auto" fills it.
  const width = cardMaxWidth ? Math.min(cardMaxWidth, 252) : '100%'
  return (
    <PreviewFrame label="Card & bookmark spacing" accent={accent} bgColor={bgColor}>
      <div className="mx-auto overflow-hidden rounded-lg border border-white/10 bg-white/5" style={{ width, maxWidth: '100%' }}>
        <div className="truncate border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          {group?.title || 'Example group'}
        </div>
        <div className="grid p-2" style={{ gap: `${bookmarkGap}px` }}>
          {bookmarks.length > 0 ? (
            bookmarks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-200">
                <Favicon iconUrl={b.icon_url} title={b.title} size={14} />
                <span className="truncate">{b.title}</span>
              </div>
            ))
          ) : (
            ['Example link', 'Another link', 'One more'].map((t) => (
              <div key={t} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-200">
                <span className="h-3.5 w-3.5 shrink-0 rounded bg-accent/70" />
                <span className="truncate">{t}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </PreviewFrame>
  )
}

function LayoutPreview({ groups, maxCols, cardGap, cardGapX, autoBalance, singleRowOrder, accent, bgMode, bgColor, bgImage, bgImageFit, bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, viewport }) {
  const unlimited = !maxCols || Number(maxCols) <= 0
  const cols = unlimited ? 4 : Math.min(Number(maxCols), PREVIEW_COL_CAP)
  const source = (groups?.length ?? 0) > 0 ? groups : SAMPLE_GROUPS
  const columns = buildColumns(source, cols, autoBalance, singleRowOrder)
  const singleRow = autoBalance && source.length <= cols
  const mode = autoBalance
    ? (singleRow && singleRowOrder === 'tallest_first' ? 'Balanced · tallest first' : 'Balanced')
    : 'Natural order'
  const label = `Layout — ${unlimited ? 'Max' : `${cols} column${cols === 1 ? '' : 's'}`} · ${mode}`
  return (
    <PreviewFrame label={label} accent={accent} bgMode={bgMode} bgColor={bgColor} bgImage={bgImage} bgImageFit={bgImageFit} bgImagePosition={bgImagePosition} bgRenderEnabled={bgRenderEnabled} bgRenderWidth={bgRenderWidth} bgRenderHeight={bgRenderHeight} bgRenderPosition={bgRenderPosition} viewport={viewport} browserSized>
      <div className="grid items-start" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: `${cardGapX}px` }}>
        {columns.map((col, ci) => (
          <div key={ci} className="grid content-start" style={{ rowGap: `${cardGap}px` }}>
            {col.map((group) => <GroupBlock key={group.id} group={group} />)}
          </div>
        ))}
      </div>
    </PreviewFrame>
  )
}

function PreferencesPreview({ showOverview, searchVisible, title, description, groups, accent, bgMode, bgColor, bgImage, bgImageFit, bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, viewport }) {
  return (
    <PreviewFrame label="Page preview" accent={accent} bgMode={bgMode} bgColor={bgColor} bgImage={bgImage} bgImageFit={bgImageFit} bgImagePosition={bgImagePosition} bgRenderEnabled={bgRenderEnabled} bgRenderWidth={bgRenderWidth} bgRenderHeight={bgRenderHeight} bgRenderPosition={bgRenderPosition} viewport={viewport} browserSized>
      <div className="space-y-2">
        {searchVisible && (
          <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
            <Search className="h-3 w-3" />
            <span>Search bookmarks</span>
          </div>
        )}
        {showOverview && <OverviewHeading title={title} description={description} size="xs" />}
        <MiniGroups groups={groups} />
      </div>
    </PreviewFrame>
  )
}

export default function PageSettingsPreview({
  activeTab, title, description, groups,
  maxCols, cardGap, cardGapX, bookmarkGap, cardMaxWidth, autoBalance, singleRowOrder,
  bgMode, bgColor, bgImage, bgImageFit, bgImagePosition, bgRenderEnabled, bgRenderWidth, bgRenderHeight, bgRenderPosition, bgRotationImages, bgSlideshowIntervalValue, bgSlideshowIntervalUnit, bgSlideshowAdvanceMode,
  accent, showOverview, searchMode, searchDefault,
}) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }))
  const [slideshowIndex, setSlideshowIndex] = useState(0)

  useEffect(() => {
    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  useEffect(() => {
    if (bgMode !== 'managed_rotation' || (bgRotationImages?.length || 0) <= 1) return undefined
    const intervalSeconds = Math.max(1, Number(bgSlideshowIntervalValue) || 30) * (bgSlideshowIntervalUnit === 'minutes' ? 60 : 1)
    const timer = window.setInterval(() => {
      setSlideshowIndex((current) => {
        const total = bgRotationImages.length
        if (bgSlideshowAdvanceMode === 'random' || bgSlideshowAdvanceMode === 'shuffle') {
          if (total <= 1) return 0
          let next = Math.floor(Math.random() * total)
          if (next === current) next = (next + 1) % total
          return next
        }
        return (current + 1) % total
      })
    }, intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [bgMode, bgRotationImages, bgSlideshowAdvanceMode, bgSlideshowIntervalUnit, bgSlideshowIntervalValue])

  const activeRotationImage = bgRotationImages?.length
    ? bgRotationImages[Math.min(slideshowIndex, bgRotationImages.length - 1)]?.url
    : ''
  const effectiveBgImage = bgMode === 'managed_rotation'
    ? activeRotationImage
    : bgImage

  const wrap = (children) => <div className="space-y-4 pt-0.5">{children}</div>

  if (activeTab === 'general') {
    return wrap(<GeneralPreview title={title} description={description} groups={groups} accent={accent} bgMode={bgMode} bgColor={bgColor} bgImage={effectiveBgImage} bgImageFit={bgImageFit} bgImagePosition={bgImagePosition} bgRenderEnabled={bgRenderEnabled} bgRenderWidth={bgRenderWidth} bgRenderHeight={bgRenderHeight} bgRenderPosition={bgRenderPosition} viewport={viewport} />)
  }
  if (activeTab === 'background') {
    return wrap(<BackgroundPreview bgMode={bgMode} bgColor={bgColor} bgImage={effectiveBgImage} bgImageFit={bgImageFit} bgImagePosition={bgImagePosition} bgRenderEnabled={bgRenderEnabled} bgRenderWidth={bgRenderWidth} bgRenderHeight={bgRenderHeight} bgRenderPosition={bgRenderPosition} accent={accent} groups={groups} viewport={viewport} />)
  }
  if (activeTab === 'columns') {
    const sample = (groups ?? []).find((g) => (g?.bookmarks?.length ?? 0) > 0) || (groups ?? [])[0]
    return wrap(
      <>
        <CardPreview group={sample} bookmarkGap={bookmarkGap} cardMaxWidth={cardMaxWidth} accent={accent} bgColor={bgColor} />
        <LayoutPreview
          groups={groups}
          maxCols={maxCols}
          cardGap={cardGap}
          cardGapX={cardGapX}
          autoBalance={autoBalance}
          singleRowOrder={singleRowOrder}
          accent={accent}
          bgMode={bgMode}
          bgColor={bgColor}
          bgImage={effectiveBgImage}
          bgImageFit={bgImageFit}
          bgImagePosition={bgImagePosition}
          bgRenderEnabled={bgRenderEnabled}
          bgRenderWidth={bgRenderWidth}
          bgRenderHeight={bgRenderHeight}
          bgRenderPosition={bgRenderPosition}
          viewport={viewport}
        />
      </>,
    )
  }
  if (activeTab === 'preferences') {
    const searchVisible = searchMode === 'show' || (searchMode === 'inherit' && searchDefault)
    return wrap(
      <PreferencesPreview
        showOverview={showOverview}
        searchVisible={searchVisible}
        title={title}
        description={description}
        groups={groups}
        accent={accent}
        bgMode={bgMode}
        bgColor={bgColor}
        bgImage={effectiveBgImage}
        bgImageFit={bgImageFit}
        bgImagePosition={bgImagePosition}
        bgRenderEnabled={bgRenderEnabled}
        bgRenderWidth={bgRenderWidth}
        bgRenderHeight={bgRenderHeight}
        bgRenderPosition={bgRenderPosition}
        viewport={viewport}
      />,
    )
  }
  return null
}
