const KEYS = {
  authUser: 'startboard.offline.authUser',
  settings: 'startboard.offline.settings',
  theme: 'startboard.offline.theme',
  preferences: 'startboard.offline.preferences',
  pageList: 'startboard.offline.pageList',
  board: (id) => `startboard.offline.board.${id}`,
  publicBoard: (shareId) => `startboard.offline.public.${shareId}`,
}

function readJson(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/storage errors. Offline mode is best-effort.
  }
}

function removeKey(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage errors.
  }
}

export const offlineStore = {
  readAuthUser: () => readJson(KEYS.authUser),
  writeAuthUser: (value) => writeJson(KEYS.authUser, value),
  clearAuthUser: () => removeKey(KEYS.authUser),

  readSettings: () => readJson(KEYS.settings),
  writeSettings: (value) => writeJson(KEYS.settings, value),

  readTheme: () => readJson(KEYS.theme),
  writeTheme: (value) => writeJson(KEYS.theme, value),

  readPreferences: () => readJson(KEYS.preferences),
  writePreferences: (value) => writeJson(KEYS.preferences, value),

  readPageList: () => readJson(KEYS.pageList, []),
  writePageList: (value) => writeJson(KEYS.pageList, value),

  readBoard: (id) => readJson(KEYS.board(id)),
  writeBoard: (id, value) => writeJson(KEYS.board(id), value),

  readPublicBoard: (shareId) => readJson(KEYS.publicBoard(shareId)),
  writePublicBoard: (shareId, value) => writeJson(KEYS.publicBoard(shareId), value),
}
