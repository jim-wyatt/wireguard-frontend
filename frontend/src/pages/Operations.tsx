import { useEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

type ApiData = Record<string, unknown>

const TREND_WINDOW = 24

function formatNumber(value: unknown, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function formatBytes(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTimestamp(value: unknown): string {
  if (!value) return '-'
  const parsed = new Date(value as string)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString()
}

function withObserved(hint: string, payload: ApiData): string {
  return `${hint} | obs ${formatTimestamp(payload?.observed_at)}`
}

function appendTrend(history: Record<string, number[]>, key: string, value: unknown): Record<string, number[]> {
  if (!Number.isFinite(Number(value))) return history
  const current = Array.isArray(history[key]) ? history[key] : []
  return { ...history, [key]: [...current, Number(value)].slice(-TREND_WINDOW) }
}

function percentStatus(value: unknown, greenMin = 100, amberMin = 80): RagStatus {
  if (!Number.isFinite(Number(value))) return 'amber'
  const n = Number(value)
  if (n >= greenMin) return 'green'
  if (n >= amberMin) return 'amber'
  return 'red'
}

function thresholdStatus(value: unknown, greenMax: number, amberMax: number): RagStatus {
  if (!Number.isFinite(Number(value))) return 'amber'
  const n = Number(value)
  if (n <= greenMax) return 'green'
  if (n <= amberMax) return 'amber'
  return 'red'
}

function thresholdMinStatus(value: unknown, redMin: number, amberMin: number): RagStatus {
  if (!Number.isFinite(Number(value))) return 'amber'
  const n = Number(value)
  if (n < redMin) return 'red'
  if (n < amberMin) return 'amber'
  return 'green'
}

interface CardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance?: string
  progressPercent?: number | null
  probeKey?: string
}

function sidecarDomainCards(name: string, payload: ApiData): CardItem[] {
  if (payload?.configured === false) {
    return [
      {
        key: `${name}-not-configured`,
        title: `${name.replace('_', ' ').toUpperCase()} DOMAIN`,
        value: 'NOT CONFIGURED',
        hint: `configured no | obs ${formatTimestamp(payload?.observed_at)}`,
        status: 'amber',
        importance: 'Sidecar endpoint is defined but no URL is configured for domain telemetry.',
      },
    ]
  }

  const baseStatus: RagStatus = payload?.available ? 'green' : 'red'

  if (name === 'node_exporter') {
    return [
      {
        key: `${name}-load1`,
        title: 'NODE HOST LOAD1',
        value: formatNumber(payload?.load1, 2),
        hint: withObserved(`load5 ${formatNumber(payload?.load5, 2)}`, payload),
        status: thresholdStatus(payload?.load1, 2, 5),
      },
      {
        key: `${name}-memory`,
        title: 'NODE MEMORY USED',
        value: `${formatNumber(payload?.mem_used_percent, 1)}%`,
        hint: withObserved(`${formatBytes(payload?.mem_available_bytes)} free`, payload),
        status: thresholdStatus(payload?.mem_used_percent, 75, 90),
      },
      {
        key: `${name}-disk`,
        title: 'NODE ROOT DISK',
        value: `${formatNumber(payload?.root_used_percent, 1)}%`,
        hint: withObserved(`${formatBytes(payload?.root_available_bytes)} avail`, payload),
        status: thresholdStatus(payload?.root_used_percent, 80, 92),
      },
    ]
  }

  if (name === 'podman_exporter') {
    return [
      {
        key: `${name}-running`,
        title: 'PODMAN RUNNING',
        value: formatNumber(payload?.containers_running, 0),
        hint: withObserved(`exited ${formatNumber(payload?.containers_exited, 0)}`, payload),
        status: baseStatus,
      },
      {
        key: `${name}-mem`,
        title: 'PODMAN MEM USE',
        value: formatBytes(payload?.container_mem_usage_bytes),
        hint: withObserved(`cpu ${formatNumber(payload?.container_cpu_system_seconds_total, 1)}s`, payload),
        status: baseStatus,
      },
    ]
  }

  if (name === 'postgres_exporter') {
    return [
      {
        key: `${name}-size`,
        title: 'POSTGRES DB SIZE',
        value: formatBytes(payload?.database_size_bytes),
        hint: withObserved(`backends ${formatNumber(payload?.num_backends, 0)}`, payload),
        status: baseStatus,
      },
      {
        key: `${name}-cache`,
        title: 'POSTGRES CACHE HIT',
        value: `${formatNumber(payload?.cache_hit_percent, 1)}%`,
        hint: withObserved(`up ${formatNumber(payload?.up, 0)}`, payload),
        status: thresholdMinStatus(payload?.cache_hit_percent, 90, 98),
      },
    ]
  }

  if (name === 'falcosidekick') {
    return [
      {
        key: `${name}-inputs`,
        title: 'FALCO EVENTS',
        value: formatNumber(payload?.inputs_total, 0),
        hint: withObserved(`rejected ${formatNumber(payload?.inputs_rejected, 0)}`, payload),
        status: baseStatus,
      },
      {
        key: `${name}-reject-rate`,
        title: 'FALCO REJECT RATE',
        value: `${formatNumber(payload?.rejection_percent, 2)}%`,
        hint: withObserved(`goroutines ${formatNumber(payload?.goroutines, 0)}`, payload),
        status: thresholdStatus(payload?.rejection_percent, 1, 5),
      },
    ]
  }

  if (name === 'parca') {
    return [
      {
        key: `${name}-lsm`,
        title: 'PARCA LSM SIZE',
        value: formatBytes(payload?.frostdb_lsm_size_bytes),
        hint: withObserved(`grpc write ok ${formatNumber(payload?.grpc_write_raw_ok_total, 0)}`, payload),
        status: baseStatus,
      },
      {
        key: `${name}-cache`,
        title: 'PARCA CACHE HIT',
        value: `${formatNumber(payload?.debuginfod_cache_hit_percent, 1)}%`,
        hint: withObserved(`goroutines ${formatNumber(payload?.go_goroutines, 0)} | reqs ${formatNumber(payload?.debuginfod_cache_total, 0)}`, payload),
        status: Number(payload?.debuginfod_cache_total ?? 0) < 10
          ? 'amber'
          : thresholdMinStatus(payload?.debuginfod_cache_hit_percent, 70, 90),
      },
    ]
  }

  if (name === 'ebpf_agent') {
    return [
      {
        key: `${name}-version`,
        title: 'EBPF AGENT VERSION',
        value: (payload?.version as string) || '-',
        hint: withObserved(`goroutines ${formatNumber(payload?.go_goroutines, 0)}`, payload),
        status: baseStatus,
      },
      {
        key: `${name}-debuginfo`,
        title: 'EBPF DEBUGINFO BYTES',
        value: formatBytes(payload?.debuginfo_upload_request_bytes),
        hint: withObserved(`resident ${formatBytes(payload?.resident_memory_bytes)}`, payload),
        status: baseStatus,
      },
    ]
  }

  if (name === 'crowdsec') {
    return [
      {
        key: `${name}-status`,
        title: 'CROWDSEC STATUS',
        value: String(payload?.status || (payload?.available ? 'up' : 'down')).toUpperCase(),
        hint: withObserved(`healthy ${payload?.healthy ? 'yes' : 'no'}`, payload),
        status: payload?.healthy ? 'green' : 'red',
      },
    ]
  }

  if (name === 'trivy_server') {
    return [
      {
        key: `${name}-db-age`,
        title: 'TRIVY DB AGE',
        value: `${formatNumber(payload?.db_age_hours, 1)}h`,
        hint: withObserved(`db v${String(payload?.db_version || '-')} engine v${String(payload?.version || '-')}`, payload),
        status: thresholdStatus(payload?.db_age_hours, 24, 72),
      },
      {
        key: `${name}-db-updated`,
        title: 'TRIVY DB UPDATED',
        value: formatTimestamp(payload?.db_updated_at),
        hint: withObserved(`next ${formatTimestamp(payload?.db_next_update)}`, payload),
        status: thresholdStatus(payload?.db_age_hours, 24, 72),
      },
    ]
  }

  if (name === 'wazuh_api' || name === 'fleet_api' || name === 'osquery_exporter') {
    return [
      {
        key: `${name}-status`,
        title: `${name.replace('_', ' ').toUpperCase()} STATUS`,
        value: payload?.available ? 'ONLINE' : 'OFFLINE',
        hint: withObserved(`configured ${payload?.configured !== false ? 'yes' : 'no'}`, payload),
        status: payload?.available ? 'green' : 'red',
      },
    ]
  }

  return []
}

function Operations() {
  const [metrics, setMetrics] = useState<ApiData | null>(null)
  const [attestation, setAttestation] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [probeLatencyTrends, setProbeLatencyTrends] = useState<Record<string, number[]>>({})

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
        setMetrics(metricsRes.data as ApiData)
        setAttestation(attestationRes.data as ApiData)
      } catch (err: unknown) {
        const e = err as { message?: string }
        if (active) setError(e?.message || 'Failed to load operations console')
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

  useEffect(() => {
    const sidecars = ((metrics?.runtime as ApiData)?.sidecars as Record<string, ApiData>) || {}
    setProbeLatencyTrends((prev) => {
      let next = prev
      Object.entries(sidecars).forEach(([name, payload]) => {
        const probes = Array.isArray(payload?.api_probes) ? (payload.api_probes as ApiData[]) : []
        probes.forEach((probe) => {
          const key = `${name}:${String(probe?.name || 'endpoint')}`
          next = appendTrend(next, key, probe?.latency_ms)
        })
      })
      return next
    })
  }, [metrics])

  const probeDeltaLabel = (probeKey: string): string => {
    const series = Array.isArray(probeLatencyTrends[probeKey]) ? probeLatencyTrends[probeKey] : []
    if (series.length < 2) return 'Δ warmup'
    const delta = Number(series[series.length - 1]) - Number(series[series.length - 2])
    const sign = delta > 0 ? '+' : ''
    return `Δ ${sign}${delta.toFixed(1)}ms`
  }

  const cards = useMemo<CardItem[]>(() => {
    const probes = (metrics?.source_probes as ApiData[]) || []
    const probeUp = probes.filter((probe) => probe.available).length
    const probePct = probes.length > 0 ? (probeUp / probes.length) * 100 : 0

    const sidecars = ((metrics?.runtime as ApiData)?.sidecars as Record<string, ApiData>) || {}
    const sidecarEntries = Object.values(sidecars).filter((entry) => entry?.configured !== false)
    const sidecarUp = sidecarEntries.filter((entry) => entry?.available).length
    const sidecarPct = sidecarEntries.length > 0 ? (sidecarUp / sidecarEntries.length) * 100 : 0

    const backend = ((metrics?.runtime as ApiData)?.backend as ApiData) || {}
    const p95 = backend?.p95_latency_ms
    const avg = backend?.avg_latency_ms
    const errRate = backend?.error_rate_percent
    const wg = ((metrics?.runtime as ApiData)?.wireguard as ApiData) || {}
    const wgConfigured = wg?.configured_peers
    const wgConnected = wg?.connected_peers
    const wgPct = Number(wgConfigured) > 0 ? (Number(wgConnected || 0) / Number(wgConfigured || 1)) * 100 : null

    const remediation = ((attestation?.security as ApiData)?.remediation as ApiData) || {}
    const actionable = (remediation?.actionable as ApiData) || {}
    const actionCritical = actionable?.critical
    const actionTotal = actionable?.total
    const evidence = (attestation?.evidence as ApiData) || {}
    const combined = (evidence?.combined as ApiData) || {}
    const sbom = (evidence?.sbom as ApiData) || {}
    const scans = (evidence?.scans as ApiData) || {}
    const artifactPct = combined?.percent
    const sbomPct = sbom?.percent
    const scanPct = scans?.percent

    const vitals: CardItem[] = [
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
        hint: `avg ${formatNumber(avg, 1)} ms | error ${formatNumber(errRate, 2)}%`,
        status: thresholdStatus(p95, 300, 800),
        progressPercent: Number.isFinite(Number(p95)) ? Math.min(100, (Number(p95) / 1000) * 100) : undefined,
        importance: 'Tail latency predicts user-visible degradation earliest.',
      },
      {
        key: 'critical',
        title: 'CRITICAL FINDINGS',
        value: formatNumber(actionCritical, 0),
        hint: `${formatNumber(actionTotal, 0)} actionable findings`,
        status: thresholdStatus(actionCritical, 0, 1),
        progressPercent: Number.isFinite(Number(actionCritical)) ? Math.min(100, Number(actionCritical) * 25) : undefined,
        importance: 'Critical backlog tracks immediate exposure risk.',
      },
      {
        key: 'evidence-coverage',
        title: 'EVIDENCE COVERAGE',
        value: `${formatNumber(artifactPct, 0)}%`,
        hint: `sbom ${formatNumber(sbomPct, 0)}% | scan ${formatNumber(scanPct, 0)}%`,
        status: thresholdMinStatus(artifactPct, 80, 100),
        progressPercent: artifactPct as number | null | undefined,
        importance: 'Evidence completeness drives attestation confidence.',
      },
      {
        key: 'wg',
        title: 'MONITOR LINK READY',
        value: `${formatNumber(wgConnected, 0)}/${formatNumber(wgConfigured, 0)}`,
        hint: `${(wg?.interface as string) || '-'} ${wg?.is_up ? 'up' : 'down'}`,
        status: thresholdMinStatus(wgPct, 50, 100),
        progressPercent: wgPct,
        importance: 'Secure monitor-link status is the service-level outcome.',
      },
    ]

    if (loading) {
      vitals.unshift({
        key: 'state-loading',
        title: 'PAGE STATE',
        value: 'LOADING',
        hint: 'collecting metrics + attestation payloads',
        status: 'amber',
        importance: 'Operations composite is recalculating current readiness.',
      })
    }

    if (error) {
      vitals.unshift({
        key: 'state-error',
        title: 'OPERATIONS FEED',
        value: 'DEGRADED',
        hint: error,
        status: 'red',
        importance: 'One or more source summaries failed in this refresh cycle.',
      })
    }

    return vitals
  }, [attestation, error, loading, metrics])

  const compositeCards = useMemo<CardItem[]>(() => {
    const topKeys = ['probe-cov', 'sidecar-cov', 'latency', 'critical', 'evidence-coverage', 'wg']
    const selected = cards.filter((card) => topKeys.includes(card.key))
    const stateCards = cards.filter((card) => card.key === 'state-loading' || card.key === 'state-error')
    return [...stateCards, ...selected]
  }, [cards])

  const statusFlagCards = useMemo<CardItem[]>(() => {
    const sidecars = ((metrics?.runtime as ApiData)?.sidecars as Record<string, ApiData>) || {}
    const wg = ((metrics?.runtime as ApiData)?.wireguard as ApiData) || {}
    const wgUp = Boolean(wg?.is_up)
    const policy = (attestation?.policy as ApiData) || {}
    const surface = (attestation?.surface as ApiData) || {}
    const lockout = Boolean(policy?.auth_lockout_enabled)
    const docsLocked = !(surface?.api_docs_enabled)
    const rateLimits = Boolean(policy?.rate_limit_enabled)
    const crowdsecHealthy = String(sidecars?.crowdsec?.status || '').toLowerCase() === 'up' || Boolean(sidecars?.crowdsec?.healthy)
    const trivyFresh = Number(sidecars?.trivy_server?.db_age_hours || 9999) <= 24
    const parcaProfiling = Boolean(sidecars?.parca?.available)
    const httpsActive = Boolean(surface?.https_enabled)

    return [
      {
        key: 'flag-wg-link',
        title: 'WG LINK UP',
        value: wgUp ? 'YES' : 'NO',
        hint: `${(wg?.interface as string) || '-'} | peer ${formatNumber(wg?.connected_peers, 0)}/${formatNumber(wg?.configured_peers, 0)}`,
        status: wgUp ? 'green' : 'red',
      },
      {
        key: 'flag-lockout',
        title: 'AUTH LOCKOUT ACTIVE',
        value: lockout ? 'YES' : 'NO',
        hint: 'credential spray resistance control',
        status: lockout ? 'green' : 'amber',
      },
      {
        key: 'flag-docs',
        title: 'API DOCS LOCKED',
        value: docsLocked ? 'YES' : 'NO',
        hint: 'public surface minimization',
        status: docsLocked ? 'green' : 'red',
      },
      {
        key: 'flag-ratelimit',
        title: 'RATE LIMITS ACTIVE',
        value: rateLimits ? 'YES' : 'NO',
        hint: 'abuse and burst damping',
        status: rateLimits ? 'green' : 'red',
      },
      {
        key: 'flag-crowdsec',
        title: 'CROWDSEC HEALTH',
        value: crowdsecHealthy ? 'YES' : 'NO',
        hint: `status ${String(sidecars?.crowdsec?.status || 'unknown')}`,
        status: crowdsecHealthy ? 'green' : 'red',
      },
      {
        key: 'flag-trivy',
        title: 'TRIVY FRESH',
        value: trivyFresh ? 'YES' : 'NO',
        hint: `db age ${formatNumber(sidecars?.trivy_server?.db_age_hours, 1)}h`,
        status: trivyFresh ? 'green' : Number(sidecars?.trivy_server?.db_age_hours || 0) <= 72 ? 'amber' : 'red',
      },
      {
        key: 'flag-parca',
        title: 'PARCA PROFILING',
        value: parcaProfiling ? 'YES' : 'NO',
        hint: `cache ${String(sidecars?.parca?.cache_state || '-')}`,
        status: parcaProfiling ? 'green' : 'amber',
      },
      {
        key: 'flag-https',
        title: 'HTTPS ACTIVE',
        value: httpsActive ? 'YES' : 'NO',
        hint: 'edge transport encryption policy',
        status: httpsActive ? 'green' : 'red',
      },
    ]
  }, [attestation, metrics])

  const sidecarDomainSignalCards = Object.entries(((metrics?.runtime as ApiData)?.sidecars as Record<string, ApiData>) || {})
    .flatMap(([name, payload]) => sidecarDomainCards(name, payload))

  const sidecarApiCards = Object.entries(((metrics?.runtime as ApiData)?.sidecars as Record<string, ApiData>) || {})
    .filter(([, payload]) => payload?.configured !== false)
    .flatMap(([name, payload]) => {
      const probes = Array.isArray(payload?.api_probes) ? (payload.api_probes as ApiData[]) : []
      return probes.map((probe, idx) => {
        const probeKey = `${name}:${String(probe?.name || 'endpoint')}`
        return {
          probeKey,
          key: `sidecar-api-${name}-${idx}`,
          title: `${name.toUpperCase()} API ${String(probe?.name || 'endpoint').toUpperCase()}`,
          value: probe?.available ? `${formatNumber(probe?.status_code, 0)} OK` : `${formatNumber(probe?.status_code, 0)} FAIL`,
          hint: `${formatNumber(probe?.latency_ms, 1)} ms | ${probeDeltaLabel(probeKey)} | obs ${formatTimestamp(probe?.observed_at)}`,
          status: probe?.available ? ('green' as RagStatus) : ('red' as RagStatus),
          progressPercent: Number.isFinite(Number(probe?.latency_ms)) ? Math.max(0, 100 - Number(probe.latency_ms) / 10) : undefined,
          importance: (probe?.error as string) || `${String(probe?.url || '').replace(/^https?:\/\//, '')} | ${formatNumber(probe?.response_bytes, 0)} bytes | ${String(probe?.content_type || 'unknown content-type')}`,
        }
      })
    })

  const insightCards: CardItem[] = ((attestation?.insights as string[]) || []).map((insight, idx) => ({
    key: `insight-${idx}`,
    title: `OP INSIGHT ${idx + 1}`,
    value: insight.toLowerCase().includes('critical') ? 'CRITICAL' : insight.toLowerCase().includes('warning') ? 'WATCH' : 'INFO',
    hint: insight,
    status: insight.toLowerCase().includes('critical') ? 'red' : insight.toLowerCase().includes('warning') ? 'amber' : 'green',
    importance: 'Narrative compressed into measurable operator signal cards.',
  }))

  return (
    <Box>
      <DenseGrid>
        <DenseSection title="Composite Readiness" subtitle="core readiness stack for trusted exchange operations" colSpan={1} rowSpan={1}>
          <DenseCards>
            {compositeCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                progressPercent={card.progressPercent ?? undefined}
                importance={card.importance}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Status Flags" subtitle="logical binary controls grouped for rapid policy checks" colSpan={2} rowSpan={1}>
          <DenseCards cols={4}>
            {statusFlagCards.map((card) => (
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

        <DenseSection title="Sidecar Domain Signals" subtitle="core functionality cards per sidecar with observation timestamps" colSpan={3} rowSpan={1}>
          <DenseCards>
            {[...sidecarDomainSignalCards, ...insightCards].map((card) => (
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

        <DenseSection title="Sidecar API Probes" subtitle="endpoint-level checks beyond raw metrics" colSpan={3} rowSpan={1}>
          <DenseCards>
            {sidecarApiCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent ?? undefined}
              />
            ))}
          </DenseCards>
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Operations
