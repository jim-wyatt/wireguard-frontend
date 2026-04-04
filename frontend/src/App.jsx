import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress, Container } from '@mui/material'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
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
  const { isAuthenticated } = useAuth()
  
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
      
      {isAuthenticated ? (
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
        </Route>
      ) : (
        <Route path="/dashboard" element={<Navigate to="/login" replace />} />
      )}

      {!isAuthenticated && (
        <Route path="/clients" element={<Navigate to="/login" replace />} />
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
