import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Peers = lazy(() => import('./pages/Peers'))
const Logs = lazy(() => import('./pages/Logs'))
const Attestation = lazy(() => import('./pages/Attestation'))
const Metrics = lazy(() => import('./pages/Metrics'))
const Operations = lazy(() => import('./pages/Operations'))
const Debug = lazy(() => import('./pages/Debug'))
const Login = lazy(() => import('./pages/Login'))
const PublicDashboard = lazy(() => import('./pages/PublicDashboard'))

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <CircularProgress />
    </Box>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated } = useAuth()

  const dashboardElement = (
    <Suspense fallback={<PageLoader />}>
      {isAuthenticated ? <Dashboard /> : <PublicDashboard />}
    </Suspense>
  )

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={dashboardElement} />
        <Route path="/dashboard" element={dashboardElement} />
        <Route path="/public" element={<Navigate to="/" replace />} />
      </Route>

      <Route path="/login" element={
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      } />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/peers" element={
          <Suspense fallback={<PageLoader />}>
            <Peers />
          </Suspense>
        } />
        <Route path="/clients" element={<Navigate to="/peers" replace />} />
        <Route path="/logs" element={
          <Suspense fallback={<PageLoader />}>
            <Logs />
          </Suspense>
        } />
        <Route path="/attestation" element={
          <Suspense fallback={<PageLoader />}>
            <Attestation />
          </Suspense>
        } />
        <Route path="/metrics" element={
          <Suspense fallback={<PageLoader />}>
            <Metrics />
          </Suspense>
        } />
        <Route path="/operations" element={
          <Suspense fallback={<PageLoader />}>
            <Operations />
          </Suspense>
        } />
        <Route path="/debug" element={
          <Suspense fallback={<PageLoader />}>
            <Debug />
          </Suspense>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
