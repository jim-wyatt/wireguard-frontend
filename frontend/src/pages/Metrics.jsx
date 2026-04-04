import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import MemoryIcon from '@mui/icons-material/Memory'
import HubIcon from '@mui/icons-material/Hub'
import LanIcon from '@mui/icons-material/Lan'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import StorageIcon from '@mui/icons-material/Storage'
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck'
import SpeedIcon from '@mui/icons-material/Speed'
import { clientsApi } from '../services/api'

function formatBytes(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  const bytes = Number(value)
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / (1024 ** idx)
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${units[idx]}`
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return '-'
  const total = Math.floor(Number(seconds))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function metricValue(item) {
  return item && item.value !== null && item.value !== undefined ? item.value : null
}

function formatNumber(value, maxDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

function TinySparkline({ values, color = '#1976d2' }) {
  const points = values.filter((v) => Number.isFinite(v)).slice(-24)
  if (points.length < 2) return null

  const width = 120
  const height = 28
  const min = Math.min(...points)
  const max = Math.max(...points)
  const spread = max - min || 1

  const polyline = points
    .map((value, idx) => {
      const x = (idx / (points.length - 1)) * width
      const y = height - ((value - min) / spread) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <Box sx={{ mt: 1 }}>
      <svg width={width} height={height} role="img" aria-label="trend sparkline">
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </Box>
  )
}

function Metrics() {
  const [data, setData] = useState(null)
  const [trends, setTrends] = useState({
    residentMemory: [],
    goroutines: [],
    fdUsage: [],
    inFlight: [],
    gcP50: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const trendStoreRef = useRef({
    residentMemory: [],
    goroutines: [],
    fdUsage: [],
    inFlight: [],
    gcP50: [],
  })

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await clientsApi.getMetricsSummary()
        if (active) {
          setData(response.data)

          const runtime = response.data?.runtime || {}
          const nextValues = {
            residentMemory: Number(runtime?.process?.resident_memory_bytes),
            goroutines: Number(runtime?.go?.goroutines),
            fdUsage: Number(runtime?.process?.fd_usage_percent),
            inFlight: Number(runtime?.caddy?.requests_in_flight),
            gcP50: Number(runtime?.go?.gc_pause_seconds?.p50),
          }

          const keys = Object.keys(trendStoreRef.current)
          for (const key of keys) {
            const current = trendStoreRef.current[key] || []
            const value = nextValues[key]
            const appended = Number.isFinite(value) ? [...current, value] : [...current]
            trendStoreRef.current[key] = appended.slice(-24)
          }
          setTrends({ ...trendStoreRef.current })
        }
      } catch (err) {
        if (active) {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load metrics')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 15000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const highlights = data?.highlights || {}
  const summary = data?.summary || {}
  const runtime = data?.runtime || {}
  const caddy = runtime?.caddy || {}
  const go = runtime?.go || {}
  const processRuntime = runtime?.process || {}
  const generatedAt = data?.generated_at ? new Date(data.generated_at).toLocaleString() : '-'

  const rows = data?.catalog || []
  const columns = useMemo(() => [
    { field: 'name', headerName: 'Metric Name', flex: 1.2, minWidth: 260 },
    { field: 'series', headerName: 'Series', type: 'number', flex: 0.4, minWidth: 90 },
    {
      field: 'sample_value',
      headerName: 'Sample',
      flex: 0.7,
      minWidth: 140,
      renderCell: (params) => {
        const value = params.value
        if (value === null || value === undefined) return '-'
        return Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })
      },
    },
  ], [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Metrics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Operational telemetry sourced from the metrics endpoint and rendered as service health widgets.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Endpoint: {data?.endpoint || '-'} | Last update: {generatedAt}
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <LanIcon color="primary" />
                <Typography variant="subtitle2">Caddy Reload Status</Typography>
              </Stack>
              <Chip
                label={Number(caddy?.config_last_reload_successful) === 1 ? 'success' : 'failed/unknown'}
                color={Number(caddy?.config_last_reload_successful) === 1 ? 'success' : 'warning'}
                size="small"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Last reload age: {formatDuration(caddy?.config_last_reload_age_seconds)}
              </Typography>
              <TinySparkline values={trends.inFlight} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <MemoryIcon color="primary" />
                <Typography variant="subtitle2">Resident Memory</Typography>
              </Stack>
              <Typography variant="h5">{formatBytes(processRuntime?.resident_memory_bytes)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Virtual: {formatBytes(processRuntime?.virtual_memory_bytes)}
              </Typography>
              <TinySparkline values={trends.residentMemory} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <HubIcon color="primary" />
                <Typography variant="subtitle2">Go Runtime</Typography>
              </Stack>
              <Typography variant="h5">{formatNumber(go?.goroutines, 0)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Threads: {formatNumber(go?.threads, 0)} | GOMAXPROCS: {formatNumber(go?.gomaxprocs_threads, 0)}
              </Typography>
              <TinySparkline values={trends.goroutines} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <AccessTimeIcon color="primary" />
                <Typography variant="subtitle2">Process Uptime</Typography>
              </Stack>
              <Typography variant="h5">{formatDuration(processRuntime?.uptime_seconds)}</Typography>
              <Typography variant="body2" color="text.secondary">
                In-flight reqs: {formatNumber(caddy?.requests_in_flight, 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <NetworkCheckIcon color="primary" />
                <Typography variant="subtitle2">Upstream Health</Typography>
              </Stack>
              <Typography variant="h5">{formatNumber(caddy?.reverse_proxy_upstreams?.healthy, 0)} / {formatNumber(caddy?.reverse_proxy_upstreams?.total, 0)}</Typography>
              <Typography variant="body2" color="text.secondary">
                unhealthy: {formatNumber(caddy?.reverse_proxy_upstreams?.unhealthy, 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <SpeedIcon color="primary" />
                <Typography variant="subtitle2">CPU and FDs</Typography>
              </Stack>
              <Typography variant="h5">{formatNumber(processRuntime?.cpu_seconds_total, 3)}s</Typography>
              <Typography variant="body2" color="text.secondary">
                FDs: {formatNumber(processRuntime?.open_fds, 0)}/{formatNumber(processRuntime?.max_fds, 0)} ({formatNumber(processRuntime?.fd_usage_percent, 1)}%)
              </Typography>
              <TinySparkline values={trends.fdUsage} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <StorageIcon color="primary" />
                <Typography variant="subtitle2">Go Heap</Typography>
              </Stack>
              <Typography variant="h5">{formatBytes(go?.heap?.alloc_bytes)}</Typography>
              <Typography variant="body2" color="text.secondary">
                in-use: {formatBytes(go?.heap?.inuse_bytes)} | objects: {formatNumber(go?.heap?.objects, 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <AccessTimeIcon color="primary" />
                <Typography variant="subtitle2">GC Pause</Typography>
              </Stack>
              <Typography variant="h5">p50 {formatNumber(go?.gc_pause_seconds?.p50, 6)}s</Typography>
              <Typography variant="body2" color="text.secondary">
                p75 {formatNumber(go?.gc_pause_seconds?.p75, 6)}s | max {formatNumber(go?.gc_pause_seconds?.max, 6)}s
              </Typography>
              <TinySparkline values={trends.gcP50} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <QueryStatsIcon color="primary" />
              <Typography variant="h6">Metric Catalog</Typography>
            </Stack>
            <DataGrid
              autoHeight
              rows={rows}
              columns={columns}
              disableRowSelectionOnClick
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              sx={{ border: 0 }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Scrape Summary</Typography>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Metric Names</Typography>
                <Chip label={summary.metric_names ?? 0} size="small" />
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Series</Typography>
                <Chip label={summary.series ?? 0} size="small" />
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Parsed Samples</Typography>
                <Chip label={summary.parsed_lines ?? 0} size="small" />
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Open FDs</Typography>
                <Chip label={formatNumber(processRuntime?.open_fds, 0)} size="small" />
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Max FDs</Typography>
                <Chip label={formatNumber(processRuntime?.max_fds, 0)} size="small" />
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">RX Bytes</Typography>
                <Chip label={formatBytes(processRuntime?.network_receive_bytes_total)} size="small" />
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">TX Bytes</Typography>
                <Chip label={formatBytes(processRuntime?.network_transmit_bytes_total)} size="small" />
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Metrics
