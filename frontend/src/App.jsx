import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Box, CircularProgress, Container } from '@mui/material'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <CircularProgress />
    </Box>
  )
}

function App() {
  return (
    <Layout>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
          </Routes>
        </Suspense>
      </Container>
    </Layout>
  )
}

export default App
