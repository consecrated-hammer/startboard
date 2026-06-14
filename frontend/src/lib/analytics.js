const VIEWER_KEY = 'startboard.analytics.viewerKey'

export function getAnalyticsViewerKey() {
  try {
    let key = window.localStorage.getItem(VIEWER_KEY)
    if (!key) {
      key = `viewer-${Math.random().toString(36).slice(2, 12)}`
      window.localStorage.setItem(VIEWER_KEY, key)
    }
    return key
  } catch {
    return `viewer-${Math.random().toString(36).slice(2, 12)}`
  }
}
