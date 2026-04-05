import { useEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

interface CardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance?: string
}

interface NodeStats {
  total_clients?: number
  active_clients?: number
  connected_clients?: number
}

type ApiData = Record<string, unknown>

function Dashboard() {
  const [clientStats, setClientStats] = useState<NodeStats | null>(null)
  const [metrics, setMetrics] = useState<ApiData | null>(null)
  const [attestation, setAttestation] = useState<ApiData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    setError('')
    try {
      const [statsRes, metricsRes, attestationRes] = await Promise.all([
        clientsApi.getStats(),
        clientsApi.getMetricsSummary(),
        clientsApi.getAttestationSummary(),
      ])
      setClientStats(statsRes.data as NodeStats)
      setMetrics(metricsRes.data as ApiData)
      setAttestation(attestationRes.data as ApiData)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(e?.response?.data?.detail || e?.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const overviewCards = useMemo(() => {
    const runtime = (metrics?.runtime as ApiData) || {}
    const probes = (metrics?.source_probes as ApiData[]) || []
    const probesUp = probes.filter((p) => p.available).length
    const securityData = (attestation?.security as ApiData) || {}
    const remediationData = (securityData?.remediation as ApiData) || {}
    const actionable = (remediationData?.actionable as ApiData) || {}
    const evidenceData = (attestation?.evidence as ApiData) || {}
    const combinedEvidence = (evidenceData?.combined as ApiData) || {}
    const evidencePct = Number(combinedEvidence?.percent || 0)
    const insights = (attestation?.insights as unknown[]) || []
    const wireguardData = (runtime?.wireguard as ApiData) || {}
    const wireguardUp = Boolean(wireguardData?.is_up)
    const connected = Number(clientStats?.connected_clients || 0)
    const active = Number(clientStats?.active_clients || 0)
    const total = Number(clientStats?.total_clients || 0)
    const adoptionPct = active > 0 ? (connected / active) * 100 : 0
    const backendData = (runtime?.backend as ApiData) || {}
    const p95 = Number(backendData?.p95_latency_ms || 0)
    const avgLatency = Number(backendData?.avg_latency_ms || 0)
    const errRate = Number(backendData?.error_rate_percent || 0)
    const caddyData = (runtime?.caddy as ApiData) || {}
    const inflight = Number(caddyData?.requests_in_flight || 0)
    const backendReq = Number(backendData?.requests_total || 0)
    const insightCount = Number(insights.length)
    const sidecars = (runtime?.sidecars as Record<string, ApiData>) || {}
    const sidecarEntries = Object.values(sidecars).filter((item) => item?.configured !== false)
    const sidecarUp = sidecarEntries.filter((item) => item?.available).length
    const sidecarTotal = sidecarEntries.length
    const trivyServer = (sidecars?.trivy_server as ApiData) || {}
    const trivyAge = Number(trivyServer?.db_age_hours || 0)
    const crowdsecData = (sidecars?.crowdsec as ApiData) || {}
    const crowdsecStatus = String(crowdsecData?.status || 'unknown').toLowerCase()

    const opsScoreParts = [
      wireguardUp ? 100 : 0,
      probes.length > 0 ? (probesUp / probes.length) * 100 : 0,
      p95 <= 300 ? 100 : p95 <= 800 ? 70 : 35,
      errRate <= 1 ? 100 : errRate <= 5 ? 60 : 25,
      Number(actionable.critical || 0) === 0 ? 100 : 25,
    ]
    const opsScore = Math.round(opsScoreParts.reduce((sum, v) => sum + v, 0) / opsScoreParts.length)

    const cards: CardItem[] = [
      {
        key: 'clients',
        title: 'NODES TAB',
        value: `${connected}/${active}`,
        hint: `${total} total nodes | route /nodes`,
        status: active > 0 ? 'green' : 'amber',
        importance: 'Quick view of adoption and current tunnel activity.',
      },
      {
        key: 'client-adoption',
        title: 'SESSION ADOPTION',
        value: `${adoptionPct.toFixed(0)}%`,
        hint: `${connected} connected of ${active} active`,
        status: adoptionPct >= 70 ? 'green' : adoptionPct >= 40 ? 'amber' : 'red',
        importance: 'How much of the active roster is using secure sessions right now.',
      },
      {
        key: 'logs',
        title: 'LOGS TAB',
        value: `${errRate.toFixed(2)}% err`,
        hint: `api p95 ${p95.toFixed(0)} ms | route /logs`,
        status: errRate > 5 ? 'red' : errRate > 1 ? 'amber' : 'green',
        importance: 'Event pressure and latency trend snapshot.',
      },
      {
        key: 'log-load',
        title: 'LOG LOAD',
        value: `${inflight}`,
        hint: 'in-flight gateway requests',
        status: inflight <= 20 ? 'green' : inflight <= 80 ? 'amber' : 'red',
        importance: 'Burst pressure at the edge often predicts operator-visible delays.',
      },
      {
        key: 'attestation',
        title: 'ATTESTATION TAB',
        value: `${Number(actionable.critical || 0)} critical`,
        hint: `${Number(actionable.high || 0)} high findings | route /attestation`,
        status: Number(actionable.critical || 0) > 0 ? 'red' : Number(actionable.high || 0) > 0 ? 'amber' : 'green',
        importance: 'Security and trust posture at a glance.',
      },
      {
        key: 'evidence',
        title: 'EVIDENCE COVERAGE',
        value: `${evidencePct.toFixed(0)}%`,
        hint: `${insightCount} trust insights available`,
        status: evidencePct >= 95 ? 'green' : evidencePct >= 80 ? 'amber' : 'red',
        importance: 'Trust claims are only meaningful when evidence remains complete.',
      },
      {
        key: 'insight-queue',
        title: 'INSIGHT QUEUE',
        value: `${insightCount}`,
        hint: 'attestation-derived operator insights currently available',
        status: insightCount > 0 ? 'green' : 'amber',
        importance: 'Keeps analyst attention on live narrative intelligence volume.',
      },
      {
        key: 'metrics',
        title: 'METRICS TAB',
        value: `${probesUp}/${probes.length}`,
        hint: 'probe coverage | route /metrics',
        status: probes.length === 0 ? 'amber' : probesUp === probes.length ? 'green' : 'amber',
        importance: 'Shows telemetry completeness for informed decisions.',
      },
      {
        key: 'latency-depth',
        title: 'LATENCY BASELINE',
        value: `${avgLatency.toFixed(0)} ms`,
        hint: `${backendReq.toLocaleString()} observed requests`,
        status: avgLatency <= 150 ? 'green' : avgLatency <= 450 ? 'amber' : 'red',
        importance: 'Sustained baseline latency is a leading operational fatigue indicator.',
      },
      {
        key: 'traffic-volume',
        title: 'TRAFFIC VOLUME',
        value: `${backendReq.toLocaleString()} req`,
        hint: 'backend request count in current runtime window',
        status: backendReq > 0 ? 'green' : 'amber',
        importance: 'Volume gives context for interpreting latency and error percentages.',
      },
      {
        key: 'ops',
        title: 'OPERATIONS TAB',
        value: `${opsScore}% ready`,
        hint: `${wireguardUp ? 'tunnel service up' : 'tunnel service down'} | route /operations`,
        status: opsScore >= 90 ? 'green' : opsScore >= 70 ? 'amber' : 'red',
        importance: 'Composite operational readiness for rapid triage.',
      },
      {
        key: 'sidecar-health',
        title: 'SIDECAR HEALTH',
        value: `${sidecarUp}/${sidecarTotal}`,
        hint: sidecarTotal > 0 ? `coverage ${((sidecarUp / sidecarTotal) * 100).toFixed(0)}%` : 'no sidecar telemetry',
        status: sidecarTotal === 0 ? 'amber' : sidecarUp === sidecarTotal ? 'green' : sidecarUp >= Math.ceil(sidecarTotal * 0.8) ? 'amber' : 'red',
        importance: 'Tracks supporting telemetry and security sensors behind the hub.',
      },
      {
        key: 'threat-intel-freshness',
        title: 'THREAT INTEL',
        value: `${trivyAge.toFixed(1)}h`,
        hint: `crowdsec ${crowdsecStatus}`,
        status: trivyAge <= 24 && crowdsecStatus === 'up' ? 'green' : trivyAge <= 72 ? 'amber' : 'red',
        importance: 'Fresh vuln intelligence + healthy detection feed improves trust decisions.',
      },
      {
        key: 'link-state',
        title: 'LINK STATE',
        value: wireguardUp ? 'ONLINE' : 'OFFLINE',
        hint: 'encrypted session transport',
        status: wireguardUp ? 'green' : 'red',
        importance: 'Underlying secure link state is the root prerequisite for collaboration.',
      },
    ]

    if (loading) {
      cards.unshift({
        key: 'loading-state',
        title: 'PAGE STATE',
        value: 'LOADING',
        hint: 'collecting dashboard sources',
        status: 'amber',
        importance: 'Data refresh in progress for cross-tab metrics.',
      })
    }

    if (error) {
      cards.unshift({
        key: 'error-state',
        title: 'DATA PIPELINE',
        value: 'DEGRADED',
        hint: error,
        status: 'red',
        importance: 'One or more upstream summaries failed to load.',
      })
    }

    return cards
  }, [attestation, clientStats, error, loading, metrics])

  const pickCard = (key: string) => overviewCards.find((card) => card.key === key)

  const missionGateCards = [
    pickCard('link-state'),
    pickCard('ops'),
    pickCard('client-adoption'),
    pickCard('attestation'),
  ].filter((c): c is CardItem => Boolean(c))

  const pipelineCards = [
    pickCard('logs'),
    pickCard('latency-depth'),
    pickCard('metrics'),
    pickCard('log-load'),
    pickCard('sidecar-health'),
    pickCard('evidence'),
  ].filter((c): c is CardItem => Boolean(c))

  const quickIntelCards = [
    pickCard('clients'),
    pickCard('threat-intel-freshness'),
    pickCard('traffic-volume'),
    pickCard('insight-queue'),
  ].filter((c): c is CardItem => Boolean(c))

  const stateCards = overviewCards.filter((card) => card.key === 'error-state' || card.key === 'loading-state')

  return (
    <Box>
      <DenseGrid>
        <DenseSection title="Mission Gate" subtitle="trusted exchange hub mission posture" colSpan={3} rowSpan={1}>
          <DenseCards cols={4}>
            {missionGateCards.map((card) => (
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

        <DenseSection title="Pipeline Vitals" subtitle="numeric flow, latency, and evidence telemetry" colSpan={2} rowSpan={2}>
          <DenseCards>
            {[...stateCards, ...pipelineCards].map((card, index) => (
              <DenseMetricCard
                key={`${card.key}-${index}`}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Quick Intel" subtitle="operator-first summary for regular 1080p workflows" colSpan={1} rowSpan={2}>
          <DenseCards cols={1}>
            {quickIntelCards.map((card, index) => (
              <DenseMetricCard
                key={`${card.key}-${index}`}
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

export default Dashboard
