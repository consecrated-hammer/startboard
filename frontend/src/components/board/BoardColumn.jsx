import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import GroupColumn from './GroupColumn.jsx'

// One visual column of stacked group widgets. Droppable so groups can be dropped
// into an empty column or below the last group. `cardGap` is a pixel value.
export default function BoardColumn({ index, groups, editing, canManage = false, groupDndEnabled = editing, manualDragEnabled = false, bookmarkDndEnabled = editing, openNewTab, showWebsiteIcons = true, cardGap = 12, bookmarkGap = 2, pageTitleColor = '', pageIconColor = '', handlers, activeManualDragGroupId = null, onManualDragStart }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${index}`,
    data: { type: 'column', index },
  })
  const ids = groups.map((g) => `g:${g.id}`)

  return (
    <div
      ref={setNodeRef}
      style={{ gap: `${cardGap}px` }}
      className={`flex min-h-24 flex-col gap-4 rounded-2xl p-1 transition ${
        isOver && editing ? 'bg-white/3 ring-1 ring-accent/30' : ''
      }`}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {groups.map((g) => (
          <GroupColumn
            key={g.id}
            group={g}
            editing={editing}
            canManage={canManage}
            groupDndEnabled={groupDndEnabled}
            manualDragEnabled={manualDragEnabled}
            manualDragActive={activeManualDragGroupId === g.id}
            onManualDragStart={onManualDragStart}
            bookmarkDndEnabled={bookmarkDndEnabled}
            openNewTab={openNewTab}
            showWebsiteIcons={showWebsiteIcons}
            bookmarkGap={bookmarkGap}
            pageTitleColor={pageTitleColor}
            pageIconColor={pageIconColor}
            onOpenBookmark={handlers.onOpenBookmark}
            onEditBookmark={(b) => handlers.onEditBookmark(g, b)}
            onChangeBookmarkIcon={(b) => handlers.onChangeBookmarkIcon(g, b)}
            onAddBookmark={handlers.onAddBookmark}
            onEditBookmarks={handlers.onEditBookmarks}
            onOpenAll={handlers.onOpenAll}
            onRenameGroup={handlers.onRenameGroup}
            onCopyGroup={handlers.onCopyGroup}
            onMoveGroup={handlers.onMoveGroup}
            onSetBookmarkSort={handlers.onSetBookmarkSort}
            onDeleteGroup={handlers.onDeleteGroup}
            onDuplicateBookmark={handlers.onDuplicateBookmark}
            onMoveBookmark={handlers.onMoveBookmark}
            onCopyBookmarkLink={handlers.onCopyBookmarkLink}
            onMoveBookmarkTop={handlers.onMoveBookmarkTop}
            onMoveBookmarkBottom={handlers.onMoveBookmarkBottom}
            onDeleteBookmark={handlers.onDeleteBookmark}
          />
        ))}
      </SortableContext>
    </div>
  )
}
