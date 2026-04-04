import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
const Logs = lazy(() => import('./pages/Logs'))
const Attestation = lazy(() => import('./pages/Attestation'))
const Metrics = lazy(() => import('./pages/Metrics'))
const Operations = lazy(() => import('./pages/Operations'))
const Login = lazy(() => import('./pages/Login'))
const PublicDashboard = lazy(() => import('./pages/PublicDashboard'))

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <CircularProgress />
    </Box>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/public" element={
        <Suspense fallback={<PageLoader />}>
          <PublicDashboard />
        </Suspense>
      } />

      <Route path="/login" element={
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      } />
      
      <Route element={<Layout />}>
        <Route path="/dashboard" element={
          <Suspense fallback={<PageLoader />}>
            <Dashboard />
          </Suspense>
        } />
        <Route path="/clients" element={
          <Suspense fallback={<PageLoader />}>
            <Clients />
          </Suspense>
        } />
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
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
