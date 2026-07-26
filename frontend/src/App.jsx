import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Spinner from './components/Spinner.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'))
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage.jsx'))
const BoardPage = lazy(() => import('./pages/BoardPage.jsx'))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
const PublicBoardPage = lazy(() => import('./pages/PublicBoardPage.jsx'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'))

function RequireAuth({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.status && user.status !== 'active') return <Navigate to="/pending" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pending" element={<PendingApprovalPage />} />
          {/* Public read-only share view (no auth) */}
          <Route path="/s/:shareId" element={<PublicBoardPage />} />
          <Route path="/s/:shareId/:slug" element={<PublicBoardPage />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <BoardPage />
              </RequireAuth>
            }
          >
            <Route index element={null} />
            <Route path="p/:pageId" element={null} />
          </Route>
          <Route
            path="/preferences"
            element={
              <RequireAuth>
                <SettingsPage mode="preferences" />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={<Navigate to="/preferences" replace />}
          />
          <Route
            path="/settings/admin"
            element={
              <RequireAuth adminOnly>
                <SettingsPage mode="admin" />
              </RequireAuth>
            }
          />
          <Route
            path="/analytics"
            element={
              <RequireAuth adminOnly>
                <AnalyticsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/analytics/:pageId"
            element={
              <RequireAuth adminOnly>
                <AnalyticsPage />
              </RequireAuth>
            }
          />
          {/* Consolidated: old Account/Admin pages now live under /settings */}
          <Route path="/account" element={<Navigate to="/preferences" replace />} />
          <Route path="/admin" element={<Navigate to="/settings/admin" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
