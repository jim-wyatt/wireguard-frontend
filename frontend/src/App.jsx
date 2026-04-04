import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress, Container } from '@mui/material'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
const Logs = lazy(() => import('./pages/Logs'))
const Attestation = lazy(() => import('./pages/Attestation'))
const Metrics = lazy(() => import('./pages/Metrics'))
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
      <Route path="/" element={
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
          <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          </Container>
        } />
        <Route path="/clients" element={
          <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Suspense fallback={<PageLoader />}>
              <Clients />
            </Suspense>
          </Container>
        } />
        <Route path="/logs" element={
          <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Suspense fallback={<PageLoader />}>
              <Logs />
            </Suspense>
          </Container>
        } />
        <Route path="/attestation" element={
          <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Suspense fallback={<PageLoader />}>
              <Attestation />
            </Suspense>
          </Container>
        } />
        <Route path="/metrics" element={
          <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Suspense fallback={<PageLoader />}>
              <Metrics />
            </Suspense>
          </Container>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
