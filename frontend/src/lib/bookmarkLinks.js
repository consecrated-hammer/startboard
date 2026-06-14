export function isBookmarkLaunchable(bookmark) {
  return Boolean(bookmark?.launchable && bookmark?.url)
}

export function bookmarkDisplayUrl(bookmark) {
  return bookmark?.display_url || ''
}

export function openBookmark(bookmark, openNewTab = true) {
  if (!isBookmarkLaunchable(bookmark)) return false
  if (openNewTab) {
    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    return true
  }
  window.location.assign(bookmark.url)
  return true
}
