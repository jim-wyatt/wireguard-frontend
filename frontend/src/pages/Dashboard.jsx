import { useState, useEffect } from 'react'
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt'
import { clientsApi } from '../services/api'

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [connectedClients, setConnectedClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 3000) // Refresh every 3 seconds for real-time updates
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, connectedRes] = await Promise.all([
        clientsApi.getStats(),
        clientsApi.getConnectedClients(),
      ])
      setStats(statsRes.data)
      setConnectedClients(connectedRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  if (loading) {
    return <Typography>Loading...</Typography>
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
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

        <Grid size={{ xs: 12, sm: 4 }}>
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

        <Grid size={{ xs: 12, sm: 4 }}>
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

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Currently Connected Clients
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>IP Address</TableCell>
                <TableCell>Last Handshake</TableCell>
                <TableCell align="right">RX</TableCell>
                <TableCell align="right">TX</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connectedClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No clients currently connected
                  </TableCell>
                </TableRow>
              ) : (
                connectedClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>{client.name || '-'}</TableCell>
                    <TableCell>
                      <Chip label={client.ip_address} size="small" />
                    </TableCell>
                    <TableCell>{formatDate(client.last_handshake)}</TableCell>
                    <TableCell align="right">{formatBytes(client.transfer_rx)}</TableCell>
                    <TableCell align="right">{formatBytes(client.transfer_tx)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

export default Dashboard
