import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import RouterIcon from '@mui/icons-material/Router'
import DnsIcon from '@mui/icons-material/Dns'
import LanIcon from '@mui/icons-material/Lan'
import { clientsApi } from '../services/api'

const SOURCE_OPTIONS = [
  { value: 'caddy', label: 'Caddy Access', icon: <LanIcon fontSize="small" /> },
  { value: 'app', label: 'Application', icon: <RouterIcon fontSize="small" /> },
  { value: 'system', label: 'System', icon: <DnsIcon fontSize="small" /> },
]

function parseLine(line, source) {
  if (source === 'caddy') {
    try {
      const parsed = JSON.parse(line)
      const req = parsed?.request || {}
      return {
        id: `${parsed?.ts || Date.now()}-${req?.method || 'GET'}-${req?.uri || Math.random()}`,
        timestamp: typeof parsed?.ts === 'number' ? new Date(parsed.ts * 1000).toLocaleTimeString() : '-',
        level: parsed?.status >= 500 ? 'error' : parsed?.status >= 400 ? 'warn' : 'ok',
        source: 'caddy',
        summary: `${req?.method || '-'} ${req?.uri || '-'} (${parsed?.status || '-'})`,
        detail: line,
      }
    } catch {
      return {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        source,
        summary: line.slice(0, 120),
        detail: line,
      }
    }
  }

  const lowered = line.toLowerCase()
  const level = lowered.includes('error') ? 'error' : lowered.includes('warn') ? 'warn' : 'info'
  return {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toLocaleTimeString(),
    level,
    source,
    summary: line.slice(0, 140),
    detail: line,
  }
}

function statusChip(level) {
  if (level === 'error') return { label: 'Error', color: 'error' }
  if (level === 'warn') return { label: 'Warn', color: 'warning' }
  if (level === 'ok') return { label: 'OK', color: 'success' }
  return { label: 'Info', color: 'default' }
}

function Logs() {
  const [source, setSource] = useState('caddy')
  const [entries, setEntries] = useState([])
  const [streamStatus, setStreamStatus] = useState('idle')
  const [streamError, setStreamError] = useState('')
  const reconnectTimerRef = useRef(null)
  const hasStreamingSupport =
    typeof window.fetch === 'function' &&
    (window.localStorage.getItem('apiToken') || '').trim().length > 0

  useEffect(() => {
    if (!hasStreamingSupport) {
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
      setStreamStatus('connecting')
      setStreamError('')

      try {
        await clientsApi.streamLogs({
          source,
          signal: controller.signal,
          tail: 120,
          onLine: (line) => {
            if (!isMounted) return
            const parsed = parseLine(line, source)
            setStreamStatus('live')
            setEntries((prev) => {
              const next = [parsed, ...prev]
              return next.length > 600 ? next.slice(0, 600) : next
            })
          },
        })

        if (isMounted) {
          setStreamStatus('disconnected')
          scheduleReconnect()
        }
      } catch (err) {
        if (!isMounted || controller.signal.aborted) return
        setStreamStatus('error')
        setStreamError(err?.message || 'Unable to stream logs')
        scheduleReconnect()
      }
    }

    connectStream()

    return () => {
      isMounted = false
      clearReconnect()
      controller.abort()
    }
  }, [source, hasStreamingSupport])

  const telemetry = useMemo(() => {
    const counts = { error: 0, warn: 0, ok: 0, info: 0 }
    for (const entry of entries) {
      counts[entry.level] = (counts[entry.level] || 0) + 1
    }
    return counts
  }, [entries])

  const selectedSource = SOURCE_OPTIONS.find((item) => item.value === source)
  const effectiveStreamStatus = hasStreamingSupport ? streamStatus : 'disabled'

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Live Logs
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <ReceiptLongIcon color="primary" />
              <Typography variant="h6">Stream Health</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                color={
                  effectiveStreamStatus === 'live'
                    ? 'success'
                    : effectiveStreamStatus === 'connecting'
                      ? 'warning'
                      : effectiveStreamStatus === 'error'
                        ? 'error'
                        : 'default'
                }
                label={effectiveStreamStatus}
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                Source: {selectedSource?.label || source}
              </Typography>
            </Stack>
            {effectiveStreamStatus === 'connecting' && <LinearProgress sx={{ mt: 2 }} />}
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Event Snapshot
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Errors ${telemetry.error}`} color="error" size="small" />
              <Chip label={`Warn ${telemetry.warn}`} color="warning" size="small" />
              <Chip label={`OK ${telemetry.ok}`} color="success" size="small" />
              <Chip label={`Info ${telemetry.info}`} size="small" />
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="log-source-label">Log Source</InputLabel>
            <Select
              labelId="log-source-label"
              value={source}
              label="Log Source"
              onChange={(event) => {
                setEntries([])
                setSource(event.target.value)
              }}
            >
              {SOURCE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {option.icon}
                    <span>{option.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button size="small" onClick={() => setEntries([])}>
            Clear Buffer
          </Button>
        </Stack>

        {streamError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {streamError}
          </Alert>
        )}

        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Level</TableCell>
                <TableCell>Summary</TableCell>
                <TableCell>Detail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No log lines yet for this source.</TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const chip = statusChip(entry.level)
                  return (
                    <TableRow key={entry.id} hover>
                      <TableCell>{entry.timestamp}</TableCell>
                      <TableCell>
                        <Chip label={chip.label} color={chip.color} size="small" />
                      </TableCell>
                      <TableCell>{entry.summary}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{entry.detail}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

export default Logs
