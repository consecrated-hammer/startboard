import { useMemo, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDownAZ, ArrowUpDown, Copy, GripVertical, MoreVertical, MoveRight, PencilLine, SquarePen, Trash2 } from 'lucide-react'
import SortableBookmark from './SortableBookmark.jsx'
import Favicon from '../Favicon.jsx'
import ContextMenu from '../ContextMenu.jsx'

// Kebab menu for a group. In edit mode it holds the management actions; in view
// mode it holds just "Open all links" (extensible for future view-mode items).
function buildGroupMenuItems(group, canManage, {
  onOpenAll,
  onAddBookmark,
  onEditBookmarks,
  onRenameGroup,
  onCopyGroup,
  onMoveGroup,
  onDeleteGroup,
}) {
  const items = []
  if (group.bookmarks.length > 0) {
    items.push({
      key: 'open-all',
      label: 'Open all links',
      icon: MoveRight,
      onClick: () => onOpenAll(group),
    })
  }
  if (!canManage) return items
  items.push(
    {
      key: 'edit-group',
      label: 'Edit group',
      icon: PencilLine,
      onClick: () => onRenameGroup(group),
    },
    {
      key: 'add-bookmark',
      label: 'Add bookmark',
      icon: SquarePen,
      onClick: () => onAddBookmark(group),
    },
    {
      key: 'edit-bookmarks',
      label: 'Edit bookmarks',
      icon: PencilLine,
      onClick: () => onEditBookmarks(group),
    },
    {
      key: 'copy-group',
      label: 'Copy group',
      icon: Copy,
      onClick: () => onCopyGroup(group),
    },
    {
      key: 'move-group',
      label: 'Move group',
      icon: MoveRight,
      onClick: () => onMoveGroup(group),
    },
    {
      key: 'delete-group',
      label: 'Delete group',
      icon: Trash2,
      danger: true,
      onClick: () => onDeleteGroup(group),
    },
  )
  return items
}

function GroupMenu({ items, editing }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className={`rounded p-1 transition hover:text-white focus-visible:opacity-100 focus-visible:outline-none ${
          editing
            ? 'text-slate-400 opacity-0 group-hover:opacity-100'
            : 'text-slate-500 opacity-0 group-hover:opacity-100 hover:opacity-100'
        }`}
        title="Group options"
        aria-haspopup="menu"
        aria-expanded={open}
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

// `bookmarkGap` is a pixel value.
export default function GroupColumn({ group, editing, canManage = false, groupDndEnabled = editing, manualDragEnabled = false, manualDragActive = false, onManualDragStart, bookmarkDndEnabled = editing, openNewTab, showWebsiteIcons = true, bookmarkGap = 2, pageTitleColor = '', pageIconColor = '', onOpenBookmark, onEditBookmark, onChangeBookmarkIcon, onAddBookmark, onEditBookmarks, onOpenAll, onRenameGroup, onCopyGroup, onMoveGroup, onSetBookmarkSort, onDeleteGroup, onDuplicateBookmark, onMoveBookmark, onCopyBookmarkLink, onMoveBookmarkTop, onMoveBookmarkBottom, onDeleteBookmark }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g:${group.id}`,
    data: { type: 'group', group },
    disabled: !groupDndEnabled,
  })
  // Droppable area so empty groups can still receive bookmarks.
  const { setNodeRef: setDropRef } = useDroppable({
    id: `gdrop:${group.id}`,
    data: { type: 'group-drop', groupId: group.id },
  })

  const style = { transform: CSS.Transform.toString(transform), transition }
  const bookmarkIds = group.bookmarks.map((b) => `b:${b.id}`)
  const [contextMenu, setContextMenu] = useState(null)
  const menuItems = useMemo(() => buildGroupMenuItems(group, canManage, {
    onOpenAll,
    onAddBookmark,
    onEditBookmarks,
    onRenameGroup,
    onCopyGroup,
    onMoveGroup,
    onDeleteGroup,
  }), [group, canManage, onOpenAll, onAddBookmark, onEditBookmarks, onRenameGroup, onCopyGroup, onMoveGroup, onDeleteGroup])
  const openContextMenu = (event) => {
    if (!menuItems.length) return
    if (event.target instanceof Element && event.target.closest('[data-bookmark-context="true"]')) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`flex w-full flex-col rounded-2xl border border-white/10 bg-white/3 ${
          isDragging || manualDragActive ? 'sb-dragging' : ''
        }`}
        onContextMenuCapture={openContextMenu}
      >
      <div
        className="group flex items-center gap-2 border-b border-white/10 px-4 py-3"
        style={{
          backgroundColor: group.header_bg_color || undefined,
          color: group.header_text_color || undefined,
        }}
        onContextMenuCapture={openContextMenu}
      >
        {(groupDndEnabled || manualDragEnabled) && (
          <span
            className={`cursor-grab ${group.header_text_color ? '' : 'text-slate-500'}`}
            {...(groupDndEnabled ? attributes : {})}
            {...(groupDndEnabled ? listeners : {})}
            onPointerDown={manualDragEnabled ? (event) => onManualDragStart?.(event, group) : undefined}
            title={manualDragEnabled ? 'Drag group freely' : 'Drag column'}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <Favicon iconUrl={group.icon_url} title={group.title} size={18} color={group.icon_color || pageIconColor} />
        <h3 className={`flex-1 truncate text-sm font-semibold uppercase tracking-wide ${group.header_text_color ? '' : 'text-slate-300'}`}>
          {group.title}
        </h3>
        <button
          type="button"
          onClick={() => onSetBookmarkSort(group, group.bookmark_sort === 'manual' ? 'title_asc' : 'manual')}
          className={`inline-flex items-center rounded p-1 transition hover:text-white focus-visible:opacity-100 focus-visible:outline-none ${
            group.header_text_color ? 'opacity-0 group-hover:opacity-100' : 'text-slate-500 opacity-0 group-hover:opacity-100'
          }`}
          title={group.bookmark_sort === 'title_asc' ? 'Bookmarks sorted A-Z' : 'Manual bookmark order'}
          aria-label={group.bookmark_sort === 'title_asc' ? 'Bookmarks sorted A-Z' : 'Manual bookmark order'}
        >
          {group.bookmark_sort === 'title_asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
        </button>
        {(editing || group.bookmarks.length > 0) && (
          <GroupMenu items={menuItems} editing={editing} />
        )}
      </div>

      <div
        ref={setDropRef}
        className="flex-1 p-2"
        style={{
          display: 'grid',
          gap: `${group.display_mode === 'icons' ? Math.max(bookmarkGap, 10) : bookmarkGap}px`,
          gridTemplateColumns: group.display_mode === 'icons'
            ? 'repeat(auto-fit, minmax(44px, max-content))'
            : undefined,
          justifyContent: group.display_mode === 'icons'
            ? (group.bookmark_align === 'left' ? 'start' : 'center')
            : undefined,
          alignContent: group.display_mode === 'icons' ? 'start' : undefined,
          backgroundColor: group.bg_color
            ? `color-mix(in oklab, ${group.bg_color} ${Math.max(6, 100 - (group.transparency ?? 0))}%, transparent)`
            : undefined,
        }}
      >
        <SortableContext items={bookmarkIds} strategy={verticalListSortingStrategy}>
          {(group.visible_limit > 0 ? group.bookmarks.slice(0, group.visible_limit) : group.bookmarks).map((b) => (
            <SortableBookmark
              key={b.id}
              bookmark={b}
              editing={editing}
              canManage={canManage}
              dndEnabled={bookmarkDndEnabled}
              openNewTab={openNewTab}
              showWebsiteIcons={showWebsiteIcons}
              displayMode={group.display_mode}
              iconSize={group.icon_size}
              bookmarkAlign={group.bookmark_align}
              titleColor={group.bookmark_title_color || pageTitleColor}
              iconColor={group.icon_color || pageIconColor}
              onOpen={onOpenBookmark}
              onEdit={onEditBookmark}
              onChangeIcon={onChangeBookmarkIcon || onEditBookmark}
              onDuplicate={onDuplicateBookmark}
              onMove={onMoveBookmark}
              onCopyLink={onCopyBookmarkLink}
              onMoveTop={onMoveBookmarkTop}
              onMoveBottom={onMoveBookmarkBottom}
              onDelete={onDeleteBookmark}
            />
          ))}
        </SortableContext>
        {group.bookmarks.length === 0 && (
          <div className="px-2 py-3 text-xs text-slate-500">No bookmarks yet.</div>
        )}
      </div>
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
