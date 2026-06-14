import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authAPI } from '../services/api.js'
import { offlineStore } from '../services/offline.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offlineAuth, setOfflineAuth] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const me = await authAPI.me()
      setUser(me || null)
      setOfflineAuth(false)
      if (me) offlineStore.writeAuthUser(me)
      else offlineStore.clearAuthUser()
    } catch (err) {
      const cached = offlineStore.readAuthUser()
      if (!err?.response && cached) {
        setUser(cached)
        setOfflineAuth(true)
      } else {
        setUser(null)
        setOfflineAuth(false)
        offlineStore.clearAuthUser()
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial session probe; setState happens async inside refresh().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  const login = useCallback(async (username, password) => {
    const me = await authAPI.login(username, password)
    setUser(me)
    setOfflineAuth(false)
    offlineStore.writeAuthUser(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await authAPI.logout()
    } finally {
      setUser(null)
      setOfflineAuth(false)
      offlineStore.clearAuthUser()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, offlineAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
