import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function formatNumber(value, maxDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: maxDigits })
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

function Attestation() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await clientsApi.getAttestationSummary()
        if (active) setData(response.data)
      } catch (err) {
        if (active) setError(err?.response?.data?.detail || err?.message || 'Failed to load attestation')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const sources = data?.sources || {}
  const sourceSummary = sources?.summary || {}
  const sidecarSummary = data?.sidecars?.summary || {}
  const sidecars = data?.sidecars?.services || {}
  const evidence = data?.evidence || {}
  const security = data?.security || {}
  const remediation = security?.remediation || {}
  const actionable = remediation?.actionable || {}
  const wireguard = data?.wireguard || {}
  const auth = data?.auth || {}
  const cloud = data?.cloud || {}

  const sourceCoverage = sourceSummary?.total > 0 ? (sourceSummary.available / sourceSummary.total) * 100 : null
  const sidecarCoverage = sidecarSummary?.total > 0 ? (sidecarSummary.healthy / sidecarSummary.total) * 100 : null
  const wgCoverage = Number(wireguard?.configured_peers || 0) > 0
    ? (Number(wireguard?.connected_peers || 0) / Number(wireguard?.configured_peers || 1)) * 100
    : null

  const cards = useMemo(() => {
    return [
      {
        key: 'source-coverage',
        title: 'SOURCE COVERAGE',
        value: `${sourceSummary?.available || 0}/${sourceSummary?.total || 0}`,
        hint: `telemetry ${sourceSummary?.by_category?.telemetry?.available || 0}/${sourceSummary?.by_category?.telemetry?.total || 0} | profiling ${sourceSummary?.by_category?.profiling?.available || 0}/${sourceSummary?.by_category?.profiling?.total || 0}`,
        status: thresholdMinStatus(sourceCoverage, 80, 100),
        importance: 'Attestation is only as strong as live evidence coverage.',
      },
      {
        key: 'sidecar-health',
        title: 'SIDECAR HEALTH',
        value: `${sidecarSummary?.healthy || 0}/${sidecarSummary?.total || 0}`,
        hint: 'node podman pg parca ebpf crowdsec trivy falco',
        status: thresholdMinStatus(sidecarCoverage, 80, 100),
        importance: 'Sidecars form your observation and defense substrate.',
      },
      {
        key: 'evidence',
        title: 'ARTIFACT COVERAGE',
        value: `${evidence?.combined?.available || 0}/${evidence?.combined?.total || 0}`,
        hint: `trivy ${evidence?.trivy?.available || 0}/${evidence?.trivy?.total || 0} | sbom ${evidence?.sbom?.available || 0}/${evidence?.sbom?.total || 0}`,
        status: thresholdMinStatus(evidence?.combined?.percent, 80, 100),
        importance: 'SBOM + scan completeness underpins supply-chain trust claims.',
      },
      {
        key: 'critical',
        title: 'ACTIONABLE CRITICAL',
        value: formatNumber(actionable?.critical, 0),
        hint: `high ${formatNumber(actionable?.high, 0)} | total ${formatNumber(actionable?.total, 0)}`,
        status: thresholdStatus(actionable?.critical, 0, 1),
        importance: 'Critical findings define immediate exploit risk.',
      },
      {
        key: 'wg-state',
        title: 'WIREGUARD STATE',
        value: wireguard?.is_up ? 'UP' : 'DOWN',
        hint: `${formatNumber(wireguard?.connected_peers, 0)}/${formatNumber(wireguard?.configured_peers, 0)} peers`,
        status: booleanStatus(wireguard?.is_up),
        importance: 'VPN path availability is the service mission output.',
      },
      {
        key: 'wg-peers',
        title: 'PEER READINESS',
        value: wgCoverage === null ? '-' : `${wgCoverage.toFixed(0)}%`,
        hint: `connected ${formatNumber(wireguard?.connected_peers, 0)} / configured ${formatNumber(wireguard?.configured_peers, 0)}`,
        status: thresholdMinStatus(wgCoverage, 50, 100),
        importance: 'Shows whether configured users can actually establish tunnels.',
      },
      {
        key: 'auth-grants',
        title: 'SCOPED TOKEN GRANTS',
        value: auth?.token_grants_configured ? 'ENABLED' : 'DISABLED',
        hint: `legacy token ${auth?.legacy_token_enabled ? 'on' : 'off'}`,
        status: booleanStatus(auth?.token_grants_configured),
        importance: 'Least-privilege API credentials reduce blast radius.',
      },
      {
        key: 'trivy-freshness',
        title: 'TRIVY DB FRESHNESS',
        value: `${formatNumber(sidecars?.trivy_server?.db_age_hours, 1)}h`,
        hint: `version ${sidecars?.trivy_server?.version || '-'} | next ${sidecars?.trivy_server?.db_next_update || '-'}`,
        status: thresholdStatus(sidecars?.trivy_server?.db_age_hours, 24, 72),
        importance: 'Stale vulnerability intelligence weakens risk decisions.',
      },
      {
        key: 'cloud-imds',
        title: 'CLOUD IDENTITY HARDENING',
        value: cloud?.provider || 'local',
        hint: `imds ${cloud?.metadata_reachable ? 'reachable' : 'not reachable'} | v2 ${cloud?.imdsv2_required ? 'required' : 'unknown'}`,
        status: cloud?.provider === 'aws'
          ? (cloud?.imdsv2_required ? 'green' : 'amber')
          : 'green',
        importance: 'Metadata posture materially affects credential theft risk.',
      },
    ]
  }, [
    actionable?.critical,
    actionable?.high,
    actionable?.total,
    auth?.legacy_token_enabled,
    auth?.token_grants_configured,
    cloud?.imdsv2_required,
    cloud?.metadata_reachable,
    cloud?.provider,
    evidence?.combined?.available,
    evidence?.combined?.percent,
    evidence?.combined?.total,
    evidence?.sbom?.available,
    evidence?.sbom?.total,
    evidence?.trivy?.available,
    evidence?.trivy?.total,
    sidecarCoverage,
    sidecarSummary?.healthy,
    sidecarSummary?.total,
    sidecars?.trivy_server?.db_age_hours,
    sidecars?.trivy_server?.db_next_update,
    sidecars?.trivy_server?.version,
    sourceCoverage,
    sourceSummary?.available,
    sourceSummary?.by_category?.profiling?.available,
    sourceSummary?.by_category?.profiling?.total,
    sourceSummary?.by_category?.telemetry?.available,
    sourceSummary?.by_category?.telemetry?.total,
    sourceSummary?.total,
    wgCoverage,
    wireguard?.configured_peers,
    wireguard?.connected_peers,
    wireguard?.is_up,
  ])

  const sourceRows = (sources?.probes || []).map((probe) => ({
    id: probe.id,
    source: probe.id,
    category: probe.category,
    status: probe.available ? 'green' : 'red',
    mode: probe.mode || 'http',
    endpoint: probe.url,
  }))

  const sourceColumns = [
    { field: 'source', headerName: 'Source', flex: 0.6, minWidth: 140 },
    { field: 'category', headerName: 'Class', flex: 0.45, minWidth: 110 },
    {
      field: 'status',
      headerName: 'RAG',
      flex: 0.35,
      minWidth: 100,
      renderCell: (params) => <Chip size="small" label={String(params.value).toUpperCase()} color={params.value === 'red' ? 'error' : 'success'} />,
    },
    { field: 'mode', headerName: 'Mode', flex: 0.45, minWidth: 100 },
    { field: 'endpoint', headerName: 'Endpoint', flex: 1.2, minWidth: 280 },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Attestation Grid :: [trust dungeon] (-_-)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Dense trust controls | evidence-heavy | generated {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '-'}
      </Typography>

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <DenseGrid>
        <DenseSection title="Control Cards" subtitle="3x3 attestation deck | RAG + emoticon readability" colSpan={3} rowSpan={1}>
          <DenseCards>
            {cards.map((card) => (
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

        <DenseSection title="Narrative Signals" subtitle="generated assertions | operator lore feed" colSpan={3} rowSpan={1}>
          <Stack spacing={0.75}>
            {(data?.insights || []).map((insight) => (
              <Alert key={insight} severity={insight.toLowerCase().includes('critical') ? 'warning' : 'info'} sx={{ py: 0 }}>
                <Typography variant="caption">{insight}</Typography>
              </Alert>
            ))}
          </Stack>
        </DenseSection>

        <DenseSection title="Source Evidence Table" subtitle="all probe endpoints | provenance index" colSpan={3} rowSpan={1}>
          <DataGrid
            autoHeight
            rows={sourceRows}
            columns={sourceColumns}
            disableRowSelectionOnClick
            pageSizeOptions={[8, 16, 32]}
            initialState={{ pagination: { paginationModel: { pageSize: 8, page: 0 } } }}
            density="compact"
            sx={{ border: 0 }}
          />
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Attestation
