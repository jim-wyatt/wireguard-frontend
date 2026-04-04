import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress, Container } from '@mui/material'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
const Login = lazy(() => import('./pages/Login'))

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <CircularProgress />
    </Box>
  )
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return children
}

function App() {
  const { isAuthenticated } = useAuth()
  
  return (
    <Routes>
      <Route path="/login" element={
        <Suspense fallback={<PageLoader />}>
          <Login />
        </Suspense>
      } />
      
      {isAuthenticated ? (
        <Route element={<Layout />}>
          <Route path="/" element={
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
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  )
}

export default App
