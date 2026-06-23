import { useMemo, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CircleAlert, CircleCheckBig, CircleHelp, CircleX, Copy, ExternalLink, GripVertical, MoreVertical, PencilLine, Trash2 } from 'lucide-react'
import Favicon from '../Favicon.jsx'
import ContextMenu from '../ContextMenu.jsx'
import { bookmarkDisplayUrl, isBookmarkLaunchable, openBookmark } from '../../lib/bookmarkLinks.js'

function DockerStatusBadge({ status }) {
  if (!status?.status) return null
  const meta = {
    healthy: { Icon: CircleCheckBig, tone: 'text-emerald-400', label: 'healthy' },
    running: { Icon: CircleCheckBig, tone: 'text-emerald-400', label: 'healthy' },
    stopped: { Icon: CircleX, tone: 'text-rose-400', label: 'stopped' },
    unhealthy: { Icon: CircleAlert, tone: 'text-amber-400', label: 'unhealthy' },
    unknown: { Icon: CircleHelp, tone: 'text-slate-400', label: 'unknown' },
  }[status.status] || { Icon: CircleHelp, tone: 'text-slate-400', label: status.status }
  return (
    <span
      className={`shrink-0 inline-flex items-center ${meta.tone}`}
      title={`Docker status: ${meta.label}`}
      aria-label={`Docker status: ${meta.label}`}
    >
      <meta.Icon className="h-4 w-4" />
    </span>
  )
}

const ICON_SIZE_MAP = { small: 18, medium: 22, large: 28, xl: 34 }

function buildBookmarkMenuItems(bookmark, canManage, {
  onOpen,
  onEdit,
  onChangeIcon,
  onDuplicate,
  onMove,
  onCopyLink,
  onMoveTop,
  onMoveBottom,
  onDelete,
}) {
  const launchable = isBookmarkLaunchable(bookmark)
  const items = [
    {
      key: 'open-new-window',
      label: 'Open in new window',
      icon: ExternalLink,
      disabled: !launchable,
      onClick: () => {
        onOpen?.(bookmark)
        openBookmark(bookmark, true)
      },
    },
    {
      key: 'copy-link',
      label: 'Copy link to clipboard',
      icon: Copy,
      disabled: !launchable,
      onClick: () => onCopyLink?.(bookmark),
    },
  ]
  if (!canManage) return items
  items.push(
    {
      key: 'edit-bookmark',
      label: 'Edit bookmark',
      icon: PencilLine,
      onClick: () => onEdit?.(bookmark),
    },
    {
      key: 'change-icon',
      label: 'Change icon',
      icon: PencilLine,
      onClick: () => (onChangeIcon || onEdit)?.(bookmark),
    },
    {
      key: 'duplicate-bookmark',
      label: 'Duplicate bookmark',
      icon: Copy,
      onClick: () => onDuplicate?.(bookmark),
    },
    {
      key: 'move-bookmark',
      label: 'Move bookmark',
      icon: GripVertical,
      onClick: () => (onMove || onEdit)?.(bookmark),
    },
    {
      key: 'move-top',
      label: 'Send to top',
      glyph: '↑',
      onClick: () => onMoveTop?.(bookmark),
    },
    {
      key: 'move-bottom',
      label: 'Send to bottom',
      glyph: '↓',
      onClick: () => onMoveBottom?.(bookmark),
    },
    {
      key: 'delete-bookmark',
      label: 'Delete',
      icon: Trash2,
      danger: true,
      onClick: () => onDelete?.(bookmark),
    },
  )
  return items
}

function BookmarkMenu({ items }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)

  return (
    <div className="relative flex w-6 shrink-0 justify-end">
      <button
        ref={buttonRef}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-white hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
        title="Bookmark actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <ContextMenu
        open={open}
        anchorRef={buttonRef}
        items={items}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

export default function SortableBookmark({ bookmark, editing, canManage = false, dndEnabled = editing, openNewTab = true, showWebsiteIcons = true, displayMode = 'list', iconSize = 'small', bookmarkAlign = 'auto', titleColor = '', iconColor = '', onOpen, onEdit, onChangeIcon, onDuplicate, onMove, onCopyLink, onMoveTop, onMoveBottom, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `b:${bookmark.id}`,
    data: { type: 'bookmark', bookmark },
    disabled: !dndEnabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const resolvedIconSize = ICON_SIZE_MAP[iconSize] || ICON_SIZE_MAP.small
  const iconStageSize = Math.max(resolvedIconSize + 10, 28)
  const launchable = isBookmarkLaunchable(bookmark)
  const displayUrl = bookmarkDisplayUrl(bookmark)
  const alignMode = bookmarkAlign || 'auto'
  const isCentered = alignMode === 'center'
  // Title colour cascade: per-bookmark override wins over the page/group default.
  const resolvedTitleColor = bookmark.title_color || titleColor || undefined
  const [contextMenu, setContextMenu] = useState(null)
  const menuItems = useMemo(() => buildBookmarkMenuItems(bookmark, canManage, {
    onOpen,
    onEdit,
    onChangeIcon,
    onDuplicate,
    onMove,
    onCopyLink,
    onMoveTop,
    onMoveBottom,
    onDelete,
  }), [bookmark, canManage, onOpen, onEdit, onChangeIcon, onDuplicate, onMove, onCopyLink, onMoveTop, onMoveBottom, onDelete])
  const openContextMenu = (event) => {
    if (!menuItems.length) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  const iconNode = displayMode === 'icons' ? (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: iconStageSize, height: iconStageSize }}
    >
      <Favicon iconUrl={bookmark.icon_url} title={bookmark.title} size={resolvedIconSize} show={showWebsiteIcons} treatment="tile" color={bookmark.icon_color || iconColor} />
    </span>
  ) : (
    <Favicon iconUrl={bookmark.icon_url} title={bookmark.title} size={resolvedIconSize} show={showWebsiteIcons} color={bookmark.icon_color || iconColor} />
  )

  const inner = (
    <>
      {iconNode}
      {displayMode !== 'icons' && (
        <span className={`min-w-0 flex-1 ${displayMode === 'detailed' ? '' : 'truncate'} ${isCentered ? 'text-center' : 'text-left'}`}>
          <span className="block truncate" style={{ color: resolvedTitleColor }}>{bookmark.title}</span>
          {displayMode === 'detailed' && bookmark.description && (
            <span className="mt-0.5 block truncate text-xs text-slate-400">{bookmark.description}</span>
          )}
        </span>
      )}
      <DockerStatusBadge status={bookmark.docker_status} />
    </>
  )

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        data-bookmark-context="true"
        className={`sb-link group flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-200 ${
          isDragging ? 'sb-dragging' : ''
        } ${displayMode === 'icons' ? `w-auto px-1.5 py-1 ${isCentered ? 'justify-self-center justify-center text-center' : 'justify-self-start justify-start text-left'}` : ''} ${displayMode === 'cloud' ? 'flex-wrap' : ''}`}
        onContextMenuCapture={openContextMenu}
      >
      {dndEnabled && (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center self-center text-slate-500 hover:text-slate-300"
          title="Drag bookmark to reorder or move to another group"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      {editing ? (
        <>
          <div className={`flex min-w-0 flex-1 ${displayMode === 'icons' ? `flex-col gap-1.5 py-1 ${isCentered ? 'items-center' : 'items-start'}` : `items-center gap-2 ${isCentered ? 'justify-center text-center' : ''}`}`}>
            {inner}
          </div>
          {canManage && <BookmarkMenu items={menuItems} />}
        </>
      ) : (
        <button
          type="button"
          title={bookmark.description || displayUrl || (launchable ? bookmark.url : 'Visibility-only Docker entry')}
          aria-disabled={!launchable}
          className={`flex min-w-0 flex-1 ${displayMode === 'icons' ? `flex-col justify-center gap-1.5 py-1 ${isCentered ? 'items-center text-center' : 'items-start text-left'}` : `items-center gap-2 ${isCentered ? 'justify-center text-center' : ''}`} ${displayMode === 'cloud' ? 'flex-wrap' : ''} ${launchable ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => {
            if (!launchable) return
            onOpen?.(bookmark)
            openBookmark(bookmark, openNewTab)
          }}
          onContextMenuCapture={openContextMenu}
        >
          {inner}
        </button>
      )}
      </div>
      <ContextMenu
        open={!!contextMenu}
        position={contextMenu}
        items={menuItems}
        onClose={() => setContextMenu(null)}
      />
    </>
  )
}
