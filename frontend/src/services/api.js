import axios from 'axios'

// Single axios instance. Cookies carry the session, so withCredentials is on.
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
})

function postTelemetry(path, payload) {
  const base = client.defaults.baseURL || '/api'
  const target = resolveRequestUrl(base, path)
  const body = JSON.stringify(payload || {})
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(target, blob)) return
    } catch {
      // Fall through to fetch.
    }
  }
  fetch(target, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

function resolveRequestUrl(baseURL, url) {
  const base = baseURL || ''
  const path = url || ''
  const joined = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`

  if (joined.startsWith('http://') || joined.startsWith('https://')) return joined
  if (typeof window !== 'undefined' && joined.startsWith('/')) return `${window.location.origin}${joined}`
  return joined
}

// Normalize error messages from FastAPI ({detail: "..."}).
export function errorMessage(err, fallback = 'Something went wrong') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) {
    const issue = detail[0]
    const field = issue?.loc?.[issue.loc.length - 1]
    if (field === 'bg_render_width' && issue.msg.includes('less than or equal to 12000')) {
      return 'Render width must be 12,000 px or less.'
    }
    if (field === 'bg_render_height' && issue.msg.includes('less than or equal to 12000')) {
      return 'Render height must be 12,000 px or less.'
    }
    if (field === 'bg_render_width' && issue.msg.includes('greater than or equal to 1')) {
      return 'Render width must be at least 1 px.'
    }
    if (field === 'bg_render_height' && issue.msg.includes('greater than or equal to 1')) {
      return 'Render height must be at least 1 px.'
    }
    return issue.msg
  }
  if (err?.code === 'ERR_NETWORK') {
    return 'Network error while contacting the Startboard API'
  }
  return err?.message || fallback
}

export function technicalErrorDetails(err) {
  const requestUrl = resolveRequestUrl(err?.config?.baseURL || client.defaults.baseURL, err?.config?.url)
  if (err?.response) {
    return [
      `HTTP ${err.response.status}${err.response.statusText ? ` ${err.response.statusText}` : ''}`,
      requestUrl ? `Request: ${String(err.config?.method || 'GET').toUpperCase()} ${requestUrl}` : null,
    ].filter(Boolean)
  }
  if (err?.code === 'ERR_NETWORK') {
    return [
      'Axios code: ERR_NETWORK',
      requestUrl ? `Request: ${String(err.config?.method || 'GET').toUpperCase()} ${requestUrl}` : null,
      'Likely causes: backend not reachable, Vite proxy mismatch, or browser-side CORS/network blocking.',
    ].filter(Boolean)
  }
  return [
    err?.code ? `Code: ${err.code}` : null,
    requestUrl ? `Request: ${String(err.config?.method || 'GET').toUpperCase()} ${requestUrl}` : null,
    err?.message ? `Message: ${err.message}` : null,
  ].filter(Boolean)
}

export const authAPI = {
  me: () => client.get('/auth/me').then((r) => r.data),
  login: (username, password) =>
    client.post('/auth/login', { username, password }).then((r) => r.data),
  signup: (payload) => client.post('/auth/signup', payload).then((r) => r.data),
  logout: () => client.post('/auth/logout').then((r) => r.data),
  changePassword: (current_password, new_password) =>
    client.post('/auth/password', { current_password, new_password }).then((r) => r.data),
  updateProfile: (patch) => client.post('/auth/profile', patch).then((r) => r.data),
}

export const settingsAPI = {
  get: () => client.get('/settings').then((r) => r.data),
  update: (patch) => client.put('/admin/settings', patch).then((r) => r.data),
}

export const preferencesAPI = {
  get: () => client.get('/preferences').then((r) => r.data),
  update: (patch) => client.put('/preferences', patch).then((r) => r.data),
}

export const extensionSettingsAPI = {
  status: () => client.get('/extension/token').then((r) => r.data),
  createToken: () => client.post('/extension/tokens').then((r) => r.data),
  revokeToken: () => client.delete('/extension/tokens/current').then((r) => r.data),
}

export const pagesAPI = {
  list: () => client.get('/pages').then((r) => r.data),
  create: (title) => client.post('/pages', { title }).then((r) => r.data),
  get: (id) => client.get(`/pages/${id}`).then((r) => r.data),
  update: (id, patch) => client.patch(`/pages/${id}`, patch).then((r) => r.data),
  remove: (id) => client.delete(`/pages/${id}`),
  listArchived: () => client.get('/pages/archived').then((r) => r.data),
  share: (id) => client.post(`/pages/${id}/share`).then((r) => r.data),
  unshare: (id) => client.delete(`/pages/${id}/share`).then((r) => r.data),
  duplicate: (id) => client.post(`/pages/${id}/duplicate`).then((r) => r.data),
  reorder: (id, groups) => client.put(`/pages/${id}/reorder`, { groups }).then((r) => r.data),
  setPositions: (orderedIds) => client.put('/pages/positions', { ids: orderedIds }).then((r) => r.data),
  getPermissions: (id) => client.get(`/pages/${id}/permissions`).then((r) => r.data),
  setPermissions: (id, permissions) =>
    client.put(`/pages/${id}/permissions`, { permissions }).then((r) => r.data),
  listInvites: (id) => client.get(`/pages/${id}/invites`).then((r) => r.data),
  invite: (id, payload) => client.post(`/pages/${id}/invites`, payload).then((r) => r.data),
  revokeInvite: (id, inviteId) => client.delete(`/pages/${id}/invites/${inviteId}`).then((r) => r.data),
  analytics: (id, days = 30) => client.get(`/pages/${id}/analytics`, { params: { days } }).then((r) => r.data),
  trackView: (id, payload = {}) => postTelemetry(`/pages/${id}/analytics/view`, payload),
  trackClick: (id, bookmarkId, payload = {}) => postTelemetry(`/pages/${id}/analytics/click`, { bookmark_id: bookmarkId, ...payload }),
}

export const groupsAPI = {
  create: (pageId, data) =>
    client.post(`/pages/${pageId}/groups`, data).then((r) => r.data),
  update: (groupId, patch) => client.patch(`/groups/${groupId}`, patch).then((r) => r.data),
  duplicate: (groupId) => client.post(`/groups/${groupId}/duplicate`).then((r) => r.data),
  remove: (groupId) => client.delete(`/groups/${groupId}`),
}

export const bookmarksAPI = {
  metadata: (url, config = {}) =>
    client.get('/bookmarks/metadata', { params: { url }, ...config }).then((r) => r.data),
  create: (groupId, data) =>
    client.post(`/groups/${groupId}/bookmarks`, data).then((r) => r.data),
  update: (bookmarkId, patch) =>
    client.patch(`/bookmarks/${bookmarkId}`, patch).then((r) => r.data),
  duplicate: (bookmarkId) => client.post(`/bookmarks/${bookmarkId}/duplicate`).then((r) => r.data),
  moveToEdge: (bookmarkId, edge) => client.post(`/bookmarks/${bookmarkId}/move`, { edge }).then((r) => r.data),
  share: (bookmarkId, payload) => client.post(`/bookmarks/${bookmarkId}/share`, payload).then((r) => r.data),
  remove: (bookmarkId) => client.delete(`/bookmarks/${bookmarkId}`),
  uploadIcon: (file) => {
    const form = new FormData()
    form.append('file', file)
    return client.post('/icons/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}

export const adminAPI = {
  getSettings: () => client.get('/admin/settings').then((r) => r.data),
  listUsers: () => client.get('/admin/users').then((r) => r.data),
  listPendingUsers: () => client.get('/admin/users/pending').then((r) => r.data),
  createUser: (data) => client.post('/admin/users', data).then((r) => r.data),
  updateUser: (id, patch) => client.patch(`/admin/users/${id}`, patch).then((r) => r.data),
  approveUser: (id) => client.post(`/admin/users/${id}/approve`).then((r) => r.data),
  rejectUser: (id) => client.post(`/admin/users/${id}/reject`).then((r) => r.data),
  removeUser: (id) => client.delete(`/admin/users/${id}`),
  listPages: () => client.get('/admin/pages').then((r) => r.data),
  dockerPreview: () => client.get('/admin/docker/preview').then((r) => r.data),
  updateDockerAssignments: (assignments) => client.post('/admin/docker/assignments', { assignments }).then((r) => r.data),
}

export const imagesAPI = {
  catalog: () => client.get('/images').then((r) => r.data),
  list: () => client.get('/images').then((r) => r.data.images || r.data),
  listPages: () => client.get('/images').then((r) => r.data.pages || []),
  stats: () => client.get('/images/stats').then((r) => r.data),
  upload: (files) => {
    const form = new FormData()
    Array.from(files || []).forEach((file) => form.append('images', file, file.name))
    return client.post('/images/upload', form).then((r) => r.data)
  },
  update: (id, patch) => client.patch(`/images/${id}`, patch).then((r) => r.data),
  setAssignment: (id, pageId, mode) => client.post(`/images/${id}/assignments`, { page_id: pageId, mode }).then((r) => r.data),
  replacePageAssignments: (pageId, payload) => client.post(`/images/pages/${pageId}/assignments`, payload).then((r) => r.data),
  reorder: (orderedIds) => client.put('/images/order', { orderedIds }).then((r) => r.data),
  bulk: (ids, action) => client.post('/images/bulk', { ids, action }).then((r) => r.data),
  clearCache: (imageIds = null) => client.post('/images/cache/clear', imageIds ? { imageIds } : {}).then((r) => r.data),
  remove: (id) => client.delete(`/images/${id}`).then((r) => r.data),
  originalUrl: (id) => `${client.defaults.baseURL || '/api'}/images/${id}/file`,
  renderUrl: (id, params) => {
    const base = client.defaults.baseURL || '/api'
    const url = new URL(`${window.location.origin}${String(base).replace(/\/+$/, '')}/images/${id}/render`)
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value))
    })
    return url.toString()
  },
}

export const inboxAPI = {
  list: () => client.get('/inbox').then((r) => r.data),
  summary: () => client.get('/inbox/summary').then((r) => r.data),
  acceptPageInvite: (id) => client.post(`/inbox/page-invites/${id}/accept`).then((r) => r.data),
  rejectPageInvite: (id) => client.post(`/inbox/page-invites/${id}/reject`).then((r) => r.data),
  acceptBookmarkOffer: (id) => client.post(`/inbox/bookmark-offers/${id}/accept`).then((r) => r.data),
  rejectBookmarkOffer: (id) => client.post(`/inbox/bookmark-offers/${id}/reject`).then((r) => r.data),
}

export const publicAPI = {
  view: (shareId) => client.get(`/public/p/${shareId}`).then((r) => r.data),
  trackView: (shareId, payload = {}) => postTelemetry(`/public/p/${shareId}/analytics/view`, payload),
  trackClick: (shareId, bookmarkId, payload = {}) => postTelemetry(`/public/p/${shareId}/analytics/click`, { bookmark_id: bookmarkId, ...payload }),
}

export default client
