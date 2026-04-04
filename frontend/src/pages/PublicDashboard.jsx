import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Container,
  Button,
  Paper,
  Stack,
} from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt'
import { clientsApi } from '../services/api'

function PublicDashboard() {
  const [stats, setStats] = useState(null)

  const formatLastUpdated = (value) => {
    if (!value) return 'Unknown'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString()
  }

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await clientsApi.getStats()
        setStats(response.data)
      } catch (err) {
        console.error('Failed to load public stats:', err)
      }
    }

    loadStats()
    const interval = setInterval(loadStats, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Box
          component="img"
          src="/favicon.svg"
          alt="Security shield"
          sx={{ width: 40, height: 40 }}
        />
        <Typography variant="h3" gutterBottom sx={{ mb: 0 }}>
          WireGuard Status
        </Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Public aggregate metrics for the VPN service.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Last updated: {formatLastUpdated(stats?.last_updated)}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <PeopleIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h4">{stats?.total_clients || 0}</Typography>
                  <Typography color="text.secondary">Total Clients</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CheckCircleIcon sx={{ fontSize: 40, mr: 2, color: 'success.main' }} />
                <Box>
                  <Typography variant="h4">{stats?.active_clients || 0}</Typography>
                  <Typography color="text.secondary">Active Clients</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <SignalCellularAltIcon sx={{ fontSize: 40, mr: 2, color: 'info.main' }} />
                <Box>
                  <Typography variant="h4">{stats?.connected_clients || 0}</Typography>
                  <Typography color="text.secondary">Connected Now</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h6">Administrator Access</Typography>
          <Typography color="text.secondary">Login to manage clients and view detailed connection data.</Typography>
        </Box>
        <Button variant="contained" component={RouterLink} to="/login">
          Login
        </Button>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Browse Public Pages</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          These pages are readable without authentication.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap">
          <Button variant="outlined" component={RouterLink} to="/dashboard">Dashboard</Button>
          <Button variant="outlined" component={RouterLink} to="/clients">Clients</Button>
          <Button variant="outlined" component={RouterLink} to="/logs">Logs</Button>
          <Button variant="outlined" component={RouterLink} to="/attestation">Attestation</Button>
          <Button variant="outlined" component={RouterLink} to="/metrics">Metrics</Button>
        </Stack>
      </Paper>
    </Container>
  )
}

export default PublicDashboard
