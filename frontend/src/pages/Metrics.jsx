import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function formatBytes(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  const bytes = Number(value)
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / (1024 ** idx)
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${units[idx]}`
}

function formatNumber(value, maxDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toFixed(digits)}%`
}

function thresholdStatus(value, greenMax, amberMax) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'amber'
  const n = Number(value)
  if (n <= greenMax) return 'green'
  if (n <= amberMax) return 'amber'
  return 'red'
}

function thresholdMinStatus(value, redMin, amberMin) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'amber'
  const n = Number(value)
  if (n < redMin) return 'red'
  if (n < amberMin) return 'amber'
  return 'green'
}

function booleanStatus(value) {
  if (value === null || value === undefined) return 'amber'
  return value ? 'green' : 'red'
}

function Metrics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await clientsApi.getMetricsSummary()
        if (active) setData(response.data)
      } catch (err) {
        if (active) setError(err?.response?.data?.detail || err?.message || 'Failed to load metrics')
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

  const runtime = data?.runtime || {}
  const summary = data?.summary || {}
  const sourceProbes = data?.source_probes || []

  const caddy = runtime?.caddy || {}
  const backend = runtime?.backend || {}
  const hostOs = runtime?.os || {}
  const wireguard = runtime?.wireguard || {}
  const sidecars = runtime?.sidecars || {}

  const availableProbes = sourceProbes.filter((probe) => probe.available).length
  const probeCoverage = sourceProbes.length > 0 ? (availableProbes / sourceProbes.length) * 100 : null

  const signalCards = useMemo(() => {
    const caddyTotal = Number(caddy?.reverse_proxy_upstreams?.total || 0)
    const caddyHealthy = Number(caddy?.reverse_proxy_upstreams?.healthy || 0)
    const caddyCoverage = caddyTotal > 0 ? (caddyHealthy / caddyTotal) * 100 : null

    return [
      {
        key: 'cpu',
        title: 'HOST CPU',
        value: formatPercent(hostOs?.cpu?.usage_percent, 1),
        hint: `load1 ${formatNumber(hostOs?.cpu?.load?.load_1m, 2)} | cores ${formatNumber(hostOs?.cpu?.cores, 0)}`,
        status: thresholdStatus(hostOs?.cpu?.usage_percent, 70, 90),
        importance: 'Sustained CPU saturation raises packet and API latency.',
      },
      {
        key: 'memory',
        title: 'HOST MEMORY',
        value: formatPercent(hostOs?.memory?.used_percent, 1),
        hint: `${formatBytes(hostOs?.memory?.used_bytes)} / ${formatBytes(hostOs?.memory?.total_bytes)}`,
        status: thresholdStatus(hostOs?.memory?.used_percent, 75, 90),
        importance: 'Memory pressure increases OOM and service restart risk.',
      },
      {
        key: 'disk',
        title: 'ROOT DISK',
        value: formatPercent(hostOs?.disk?.root?.usage_percent, 1),
        hint: `${formatBytes(hostOs?.disk?.root?.used_bytes)} used`,
        status: thresholdStatus(hostOs?.disk?.root?.usage_percent, 80, 92),
        importance: 'Disk exhaustion breaks logs, DB writes, and cache updates.',
      },
      {
        key: 'api-errors',
        title: 'API 5XX RATE',
        value: formatPercent(backend?.error_rate_percent, 2),
        hint: `requests ${formatNumber(backend?.requests_total, 0)} | active ${formatNumber(backend?.active_requests, 0)}`,
        status: thresholdStatus(backend?.error_rate_percent, 1, 5),
        importance: 'Direct indicator of control plane reliability.',
      },
      {
        key: 'api-latency',
        title: 'API LATENCY P95',
        value: `${formatNumber(backend?.p95_latency_ms, 1)} ms`,
        hint: `avg ${formatNumber(backend?.avg_latency_ms, 1)} ms`,
        status: thresholdStatus(backend?.p95_latency_ms, 300, 800),
        importance: 'Tail latency drives user-visible responsiveness.',
      },
      {
        key: 'wg-peers',
        title: 'WIREGUARD PEERS',
        value: `${formatNumber(wireguard?.connected_peers, 0)}/${formatNumber(wireguard?.configured_peers, 0)}`,
        hint: `iface ${wireguard?.interface || '-'} | ${wireguard?.is_up ? 'up' : 'down'}`,
        status: Number(wireguard?.configured_peers || 0) === 0
          ? 'amber'
          : thresholdMinStatus((Number(wireguard?.connected_peers || 0) / Number(wireguard?.configured_peers || 1)) * 100, 50, 100),
        importance: 'Measures whether configured peers are actually connected.',
      },
      {
        key: 'sources',
        title: 'SOURCE COVERAGE',
        value: `${availableProbes}/${sourceProbes.length}`,
        hint: 'telemetry + security + profiling probes',
        status: thresholdMinStatus(probeCoverage, 80, 100),
        importance: 'Coverage gaps create observability blind spots.',
      },
      {
        key: 'upstreams',
        title: 'CADDY UPSTREAMS',
        value: `${caddyHealthy}/${caddyTotal}`,
        hint: `in-flight ${formatNumber(caddy?.requests_in_flight, 0)}`,
        status: thresholdMinStatus(caddyCoverage, 80, 100),
        importance: 'Unhealthy upstreams degrade dashboard and API access.',
      },
      {
        key: 'sidecars',
        title: 'SIDECAR HEALTH',
        value: `${Object.values(sidecars).filter((s) => s?.available).length}/${Object.keys(sidecars).length}`,
        hint: 'node, podman, pg, parca, ebpf, crowdsec, trivy, falco',
        status: thresholdMinStatus(
          (Object.values(sidecars).filter((s) => s?.available).length / Math.max(Object.keys(sidecars).length, 1)) * 100,
          80,
          100,
        ),
        importance: 'Sidecars provide the evidence plane behind all dashboards.',
      },
    ]
  }, [availableProbes, backend, caddy, hostOs, probeCoverage, sidecars, sourceProbes.length, wireguard])

  const metricRows = data?.catalog || []
  const metricColumns = [
    { field: 'name', headerName: 'Metric', flex: 1.15, minWidth: 240 },
    { field: 'series', headerName: 'Series', type: 'number', flex: 0.35, minWidth: 80 },
    {
      field: 'sample_value',
      headerName: 'Sample',
      flex: 0.55,
      minWidth: 120,
      renderCell: (params) => formatNumber(params.value, 6),
    },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Metrics Grid :: [roguelike ops deck] (^_^)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Dense telemetry matrix | heavy mode ON | last refresh {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '-'}
      </Typography>

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <DenseGrid>
        <DenseSection title="Mission Vitals" subtitle="3x3 card slab | status faces + ascii bars" colSpan={3} rowSpan={1}>
          <DenseCards>
            {signalCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Probe Deck" subtitle="all configured sources | unified health glyphs" colSpan={3} rowSpan={1}>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            {sourceProbes.map((probe) => (
              <Chip
                key={probe.id}
                size="small"
                color={probe.available ? 'success' : 'warning'}
                label={`${probe.id}:${probe.available ? 'up' : 'down'}`}
              />
            ))}
          </Stack>
        </DenseSection>

        <DenseSection title="Raw Catalog" subtitle={`names ${summary.metric_names ?? 0} | series ${summary.series ?? 0} | parsed ${summary.parsed_lines ?? 0}`} colSpan={3} rowSpan={1}>
          <DataGrid
            autoHeight
            rows={metricRows}
            columns={metricColumns}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 20, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            density="compact"
            sx={{ border: 0 }}
          />
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Metrics
