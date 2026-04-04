import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function percentStatus(value, greenMin = 100, amberMin = 80) {
  if (!Number.isFinite(Number(value))) return 'amber'
  const n = Number(value)
  if (n >= greenMin) return 'green'
  if (n >= amberMin) return 'amber'
  return 'red'
}

function thresholdStatus(value, greenMax, amberMax) {
  if (!Number.isFinite(Number(value))) return 'amber'
  const n = Number(value)
  if (n <= greenMax) return 'green'
  if (n <= amberMax) return 'amber'
  return 'red'
}

function Operations() {
  const [metrics, setMetrics] = useState(null)
  const [attestation, setAttestation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [metricsRes, attestationRes] = await Promise.all([
          clientsApi.getMetricsSummary(),
          clientsApi.getAttestationSummary(),
        ])
        if (!active) return
        setMetrics(metricsRes.data)
        setAttestation(attestationRes.data)
      } catch (err) {
        if (active) setError(err?.message || 'Failed to load operations console')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 20000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const cards = useMemo(() => {
    const probes = metrics?.source_probes || []
    const probeUp = probes.filter((probe) => probe.available).length
    const probePct = probes.length > 0 ? (probeUp / probes.length) * 100 : 0

    const sidecars = metrics?.runtime?.sidecars || {}
    const sidecarEntries = Object.values(sidecars)
    const sidecarUp = sidecarEntries.filter((entry) => entry?.available).length
    const sidecarPct = sidecarEntries.length > 0 ? (sidecarUp / sidecarEntries.length) * 100 : 0

    const p95 = metrics?.runtime?.backend?.p95_latency_ms
    const errRate = metrics?.runtime?.backend?.error_rate_percent
    const actionCritical = attestation?.security?.remediation?.actionable?.critical

    return [
      {
        key: 'probe-cov',
        title: 'PROBE COVERAGE',
        value: `${probeUp}/${probes.length}`,
        hint: `pct ${formatNumber(probePct, 1)}% | configured runtime sources`,
        status: percentStatus(probePct, 100, 80),
        progressPercent: probePct,
        importance: 'Monitoring confidence is bounded by probe coverage.',
      },
      {
        key: 'sidecar-cov',
        title: 'SIDECAR UPTIME',
        value: `${sidecarUp}/${sidecarEntries.length}`,
        hint: `pct ${formatNumber(sidecarPct, 1)}% | observability mesh`,
        status: percentStatus(sidecarPct, 100, 80),
        progressPercent: sidecarPct,
        importance: 'Sidecars supply profiling, security, and diagnostics context.',
      },
      {
        key: 'latency',
        title: 'API P95 LATENCY',
        value: `${formatNumber(p95, 1)} ms`,
        hint: `error rate ${formatNumber(errRate, 2)}%`,
        status: thresholdStatus(p95, 300, 800),
        progressPercent: Number.isFinite(Number(p95)) ? Math.min(100, (Number(p95) / 1000) * 100) : undefined,
        importance: 'Tail latency predicts user-visible degradation earliest.',
      },
      {
        key: 'critical',
        title: 'CRITICAL FINDINGS',
        value: formatNumber(actionCritical, 0),
        hint: `actionable critical vulnerabilities`,
        status: thresholdStatus(actionCritical, 0, 1),
        progressPercent: Number.isFinite(Number(actionCritical)) ? Math.min(100, Number(actionCritical) * 25) : undefined,
        importance: 'Critical backlog tracks immediate exposure risk.',
      },
      {
        key: 'wg',
        title: 'WIREGUARD READY',
        value: `${formatNumber(metrics?.runtime?.wireguard?.connected_peers, 0)}/${formatNumber(metrics?.runtime?.wireguard?.configured_peers, 0)}`,
        hint: `${metrics?.runtime?.wireguard?.interface || '-'} ${metrics?.runtime?.wireguard?.is_up ? 'up' : 'down'}`,
        status: metrics?.runtime?.wireguard?.is_up ? 'green' : 'red',
        importance: 'Peer tunnel status is the service-level outcome.',
      },
      {
        key: 'db-age',
        title: 'TRIVY DB AGE',
        value: `${formatNumber(metrics?.runtime?.sidecars?.trivy_server?.db_age_hours, 1)}h`,
        hint: `v${metrics?.runtime?.sidecars?.trivy_server?.version || '-'} vuln intelligence freshness`,
        status: thresholdStatus(metrics?.runtime?.sidecars?.trivy_server?.db_age_hours, 24, 72),
        importance: 'Outdated vuln DB reduces trust in attestation posture.',
      },
    ]
  }, [attestation, metrics])

  const sidecarCards = Object.entries(metrics?.runtime?.sidecars || {}).map(([name, payload]) => ({
    key: `sidecar-${name}`,
    title: `SIDECAR ${name.toUpperCase()}`,
    value: payload?.available ? 'ONLINE' : 'OFFLINE',
    hint: `metric ${payload?.status || payload?.version || payload?.up || payload?.go_goroutines || '-'} | mode ${payload?.mode || '-'}`,
    status: payload?.available ? 'green' : 'red',
    importance: 'Sidecar state contributes to complete operational visibility.',
  }))

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Operations Console :: [party HUD] (^-^*)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Cross-page summary board (metrics + attestation + sidecar state)
      </Typography>

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <DenseGrid>
        <DenseSection title="Operations Vitals" subtitle="2x1 compact card slab" colSpan={2} rowSpan={1}>
          <DenseCards>
            {cards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                progressPercent={card.progressPercent}
                importance={card.importance}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Sources" subtitle="1x1 live channel states" colSpan={1} rowSpan={1}>
          <DenseCards>
            {sidecarCards.slice(0, 3).map((card) => (
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

        <DenseSection title="Operator Lore" subtitle="3x1 insights queue" colSpan={3} rowSpan={1}>
          <Stack spacing={0.7}>
            {(attestation?.insights || []).map((insight) => (
              <Alert key={insight} severity={insight.toLowerCase().includes('critical') ? 'warning' : 'info'} sx={{ py: 0 }}>
                <Typography variant="caption">{insight}</Typography>
              </Alert>
            ))}
          </Stack>
        </DenseSection>

        <DenseSection title="Sidecar Cards" subtitle="3x1 expanded per-sidecar cards" colSpan={3} rowSpan={1}>
          <DenseCards>
            {sidecarCards.map((card) => (
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
      </DenseGrid>
    </Box>
  )
}

export default Operations
