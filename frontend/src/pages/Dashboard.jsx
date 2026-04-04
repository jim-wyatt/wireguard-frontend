import { useState, useEffect, useRef } from 'react'
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Stack,
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

function parseAccessLogLine(line) {
  try {
    const parsed = JSON.parse(line)
    const request = parsed?.request || {}
    const headers = request?.headers || {}

    const timestamp =
      typeof parsed?.ts === 'number'
        ? new Date(parsed.ts * 1000).toLocaleTimeString()
        : '-'

    const status = Number.isFinite(parsed?.status) ? parsed.status : null
    const durationMs =
      typeof parsed?.duration === 'number'
        ? Math.round(parsed.duration * 1000)
        : null

    return {
      id: `${parsed?.ts || Date.now()}-${request?.method || 'UNKNOWN'}-${request?.uri || Math.random()}`,
      timestamp,
      ip: request?.client_ip || request?.remote_ip || '-',
      method: request?.method || '-',
      path: request?.uri || '-',
      status,
      durationMs,
      bytes: Number.isFinite(parsed?.size) ? parsed.size : null,
      userAgent: headers['User-Agent']?.[0] || '-',
    }
  } catch {
    return null
  }
}

function statusColor(status) {
  if (!status) return 'default'
  if (status >= 500) return 'error'
  if (status >= 400) return 'warning'
  if (status >= 300) return 'info'
  return 'success'
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [connectedClients, setConnectedClients] = useState([])
  const [logEntries, setLogEntries] = useState([])
  const [logStatus, setLogStatus] = useState('idle')
  const [logError, setLogError] = useState('')
  const [loading, setLoading] = useState(true)
  const reconnectTimerRef = useRef(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 3000) // Refresh every 3 seconds for real-time updates
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const token = (window.localStorage.getItem('apiToken') || '').trim()
    if (!token || typeof window.fetch !== 'function') {
      setLogStatus('disabled')
      return undefined
    }

    let isMounted = true
    let controller = new AbortController()

    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      clearReconnect()
      reconnectTimerRef.current = setTimeout(() => {
        if (isMounted) connectStream()
      }, 2000)
    }

    const connectStream = async () => {
      controller = new AbortController()
      setLogStatus('connecting')
      setLogError('')

      try {
        await clientsApi.streamCaddyAccessLog({
          signal: controller.signal,
          tail: 120,
          onLine: (line) => {
            if (!isMounted) return
            const parsed = parseAccessLogLine(line)
            if (!parsed) return
            setLogStatus('live')
            setLogEntries((prev) => {
              const next = [parsed, ...prev]
              return next.length > 500 ? next.slice(0, 500) : next
            })
          },
        })

        if (isMounted) {
          setLogStatus('disconnected')
          scheduleReconnect()
        }
      } catch (err) {
        if (!isMounted || controller.signal.aborted) return
        setLogStatus('error')
        setLogError(err?.message || 'Unable to stream logs')
        scheduleReconnect()
      }
    }

    connectStream()

    return () => {
      isMounted = false
      clearReconnect()
      controller.abort()
    }
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

      <Paper sx={{ p: 2, mt: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6">Live Caddy Access Log</Typography>
          <Stack direction="row" spacing={1}>
            <Chip
              size="small"
              color={
                logStatus === 'live'
                  ? 'success'
                  : logStatus === 'connecting'
                    ? 'warning'
                    : logStatus === 'error'
                      ? 'error'
                      : 'default'
              }
              label={
                logStatus === 'live'
                  ? 'Live'
                  : logStatus === 'connecting'
                    ? 'Connecting'
                    : logStatus === 'disconnected'
                      ? 'Disconnected'
                      : logStatus === 'disabled'
                        ? 'Disabled'
                        : 'Error'
              }
            />
            <Button size="small" onClick={() => setLogEntries([])}>
              Clear
            </Button>
          </Stack>
        </Stack>

        {logError && (
          <Typography color="error" variant="body2" sx={{ mb: 1 }}>
            {logError}
          </Typography>
        )}

        <TableContainer sx={{ maxHeight: 380 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Latency</TableCell>
                <TableCell align="right">Bytes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    No access entries yet. New requests appear at the top.
                  </TableCell>
                </TableRow>
              ) : (
                logEntries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>{entry.timestamp}</TableCell>
                    <TableCell>{entry.ip}</TableCell>
                    <TableCell>
                      <Chip label={entry.method} size="small" />
                    </TableCell>
                    <TableCell title={entry.userAgent}>{entry.path}</TableCell>
                    <TableCell>
                      <Chip
                        label={entry.status ?? '-'}
                        size="small"
                        color={statusColor(entry.status)}
                      />
                    </TableCell>
                    <TableCell align="right">{entry.durationMs != null ? `${entry.durationMs} ms` : '-'}</TableCell>
                    <TableCell align="right">{entry.bytes != null ? entry.bytes : '-'}</TableCell>
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
