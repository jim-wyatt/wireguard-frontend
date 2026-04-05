import { useEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

const TREND_WINDOW = 24

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function formatBytes(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTimestamp(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString()
}

function withObserved(hint, payload) {
  return `${hint} | obs ${formatTimestamp(payload?.observed_at)}`
}

function appendTrend(history, key, value) {
  if (!Number.isFinite(Number(value))) return history
  const current = Array.isArray(history[key]) ? history[key] : []
  return {
    ...history,
    [key]: [...current, Number(value)].slice(-TREND_WINDOW),
  }
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

function thresholdMinStatus(value, redMin, amberMin) {
  if (!Number.isFinite(Number(value))) return 'amber'
  const n = Number(value)
  if (n < redMin) return 'red'
  if (n < amberMin) return 'amber'
  return 'green'
}

function sidecarDomainCards(name, payload) {
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

  const baseStatus = payload?.available ? 'green' : 'red'

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
        hint: withObserved(`goroutines ${formatNumber(payload?.go_goroutines, 0)}`, payload),
        status: thresholdMinStatus(payload?.debuginfod_cache_hit_percent, 70, 90),
      },
    ]
  }

  if (name === 'ebpf_agent') {
    return [
      {
        key: `${name}-version`,
        title: 'EBPF AGENT VERSION',
        value: payload?.version || '-',
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
        hint: withObserved(`db v${payload?.db_version || '-'} engine v${payload?.version || '-'}`, payload),
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
  const [metrics, setMetrics] = useState(null)
  const [attestation, setAttestation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [probeLatencyTrends, setProbeLatencyTrends] = useState({})

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

  useEffect(() => {
    const sidecars = metrics?.runtime?.sidecars || {}
    setProbeLatencyTrends((prev) => {
      let next = prev
      Object.entries(sidecars).forEach(([name, payload]) => {
        const probes = Array.isArray(payload?.api_probes) ? payload.api_probes : []
        probes.forEach((probe) => {
          const key = `${name}:${String(probe?.name || 'endpoint')}`
          next = appendTrend(next, key, probe?.latency_ms)
        })
      })
      return next
    })
  }, [metrics])

  const probeDeltaLabel = (probeKey) => {
    const series = Array.isArray(probeLatencyTrends[probeKey]) ? probeLatencyTrends[probeKey] : []
    if (series.length < 2) return 'Δ warmup'
    const delta = Number(series[series.length - 1]) - Number(series[series.length - 2])
    const sign = delta > 0 ? '+' : ''
    return `Δ ${sign}${delta.toFixed(1)}ms`
  }

  const cards = useMemo(() => {
    const probes = metrics?.source_probes || []
    const probeUp = probes.filter((probe) => probe.available).length
    const probePct = probes.length > 0 ? (probeUp / probes.length) * 100 : 0

    const sidecars = metrics?.runtime?.sidecars || {}
    const sidecarEntries = Object.values(sidecars).filter((entry) => entry?.configured !== false)
    const sidecarUp = sidecarEntries.filter((entry) => entry?.available).length
    const sidecarPct = sidecarEntries.length > 0 ? (sidecarUp / sidecarEntries.length) * 100 : 0

    const p95 = metrics?.runtime?.backend?.p95_latency_ms
    const avg = metrics?.runtime?.backend?.avg_latency_ms
    const errRate = metrics?.runtime?.backend?.error_rate_percent
    const uptime = metrics?.runtime?.backend?.uptime_seconds
    const caddyHealthy = metrics?.runtime?.caddy?.reverse_proxy_upstreams?.healthy
    const caddyTotal = metrics?.runtime?.caddy?.reverse_proxy_upstreams?.total
    const caddyPct = Number(caddyTotal) > 0 ? (Number(caddyHealthy || 0) / Number(caddyTotal || 1)) * 100 : null
    const hostCpu = metrics?.runtime?.os?.cpu?.usage_percent
    const hostMem = metrics?.runtime?.os?.memory?.used_percent
    const fdUsage = metrics?.runtime?.process?.fd_usage_percent
    const wgConfigured = metrics?.runtime?.wireguard?.configured_peers
    const wgConnected = metrics?.runtime?.wireguard?.connected_peers
    const wgPct = Number(wgConfigured) > 0 ? (Number(wgConnected || 0) / Number(wgConfigured || 1)) * 100 : null
    const actionCritical = attestation?.security?.remediation?.actionable?.critical
    const actionTotal = attestation?.security?.remediation?.actionable?.total
    const artifactPct = attestation?.evidence?.combined?.percent
    const sbomPct = attestation?.evidence?.sbom?.percent
    const scanPct = attestation?.evidence?.scans?.percent

    const vitals = [
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
        key: 'api-uptime',
        title: 'API UPTIME',
        value: `${formatNumber(Number(uptime || 0) / 3600, 1)}h`,
        hint: `${formatNumber(metrics?.runtime?.backend?.requests_total, 0)} requests total`,
        status: thresholdMinStatus(uptime, 600, 3600),
        importance: 'Sustained uptime reflects control-plane stability.',
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
        progressPercent: artifactPct,
        importance: 'Evidence completeness drives attestation confidence.',
      },
      {
        key: 'wg',
        title: 'MONITOR LINK READY',
        value: `${formatNumber(wgConnected, 0)}/${formatNumber(wgConfigured, 0)}`,
        hint: `${metrics?.runtime?.wireguard?.interface || '-'} ${metrics?.runtime?.wireguard?.is_up ? 'up' : 'down'}`,
        status: thresholdMinStatus(wgPct, 50, 100),
        progressPercent: wgPct,
        importance: 'Secure monitor-link status is the service-level outcome.',
      },
      {
        key: 'edge-upstreams',
        title: 'EDGE UPSTREAMS',
        value: `${formatNumber(caddyHealthy, 0)}/${formatNumber(caddyTotal, 0)}`,
        hint: `in-flight ${formatNumber(metrics?.runtime?.caddy?.requests_in_flight, 0)}`,
        status: thresholdMinStatus(caddyPct, 80, 100),
        progressPercent: caddyPct,
        importance: 'Ingress health gates frontend and API availability.',
      },
      {
        key: 'host-cpu',
        title: 'HOST CPU',
        value: `${formatNumber(hostCpu, 1)}%`,
        hint: `load1 ${formatNumber(metrics?.runtime?.os?.cpu?.load?.load_1m, 2)}`,
        status: thresholdStatus(hostCpu, 70, 90),
        progressPercent: hostCpu,
        importance: 'CPU pressure predicts queueing before hard failures.',
      },
      {
        key: 'host-memory',
        title: 'HOST MEMORY',
        value: `${formatNumber(hostMem, 1)}%`,
        hint: `${formatNumber(metrics?.runtime?.os?.memory?.used_bytes, 0)} used bytes`,
        status: thresholdStatus(hostMem, 75, 90),
        progressPercent: hostMem,
        importance: 'Memory saturation increases restart and OOM risk.',
      },
      {
        key: 'fd-usage',
        title: 'FD USAGE',
        value: `${formatNumber(fdUsage, 1)}%`,
        hint: `${formatNumber(metrics?.runtime?.process?.open_fds, 0)} open fds`,
        status: thresholdStatus(fdUsage, 60, 85),
        progressPercent: fdUsage,
        importance: 'FD exhaustion can cascade into service outages.',
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

  const sidecarCards = Object.entries(metrics?.runtime?.sidecars || {})
    .filter(([, payload]) => payload?.configured !== false)
    .map(([name, payload]) => ({
      key: `sidecar-${name}`,
      title: `SIDECAR ${name.toUpperCase()}`,
      value: payload?.available ? 'ONLINE' : 'OFFLINE',
      hint: `metric ${payload?.status || payload?.version || payload?.up || payload?.go_goroutines || '-'} | api ${formatNumber(payload?.api_probe_summary?.healthy, 0)}/${formatNumber(payload?.api_probe_summary?.total, 0)}`,
      status: payload?.available ? 'green' : 'red',
      progressPercent: Number(payload?.api_probe_summary?.coverage_percent || 0),
      importance: `cache ${payload?.cache_state || '-'} | mode ${payload?.mode || '-'} | api latency ${formatNumber(payload?.api_probe_summary?.avg_latency_ms, 1)} ms`,
    }))

  const sidecarDomainSignalCards = Object.entries(metrics?.runtime?.sidecars || {})
    .flatMap(([name, payload]) => sidecarDomainCards(name, payload))

  const sidecarApiCards = Object.entries(metrics?.runtime?.sidecars || {})
    .filter(([, payload]) => payload?.configured !== false)
    .flatMap(([name, payload]) => {
      const probes = Array.isArray(payload?.api_probes) ? payload.api_probes : []
      return probes.map((probe, idx) => ({
        probeKey: `${name}:${String(probe?.name || 'endpoint')}`,
        key: `sidecar-api-${name}-${idx}`,
        title: `${name.toUpperCase()} API ${String(probe?.name || 'endpoint').toUpperCase()}`,
        value: probe?.available ? `${formatNumber(probe?.status_code, 0)} OK` : `${formatNumber(probe?.status_code, 0)} FAIL`,
        hint: `${formatNumber(probe?.latency_ms, 1)} ms | ${probeDeltaLabel(`${name}:${String(probe?.name || 'endpoint')}`)} | obs ${formatTimestamp(probe?.observed_at)}`,
        status: probe?.available ? 'green' : 'red',
        progressPercent: Number.isFinite(Number(probe?.latency_ms)) ? Math.max(0, 100 - Number(probe.latency_ms) / 10) : undefined,
        importance: probe?.error || `${(probe?.url || '').replace(/^https?:\/\//, '')} | ${formatNumber(probe?.response_bytes, 0)} bytes | ${probe?.content_type || 'unknown content-type'}`,
      }))
    })

  const insightCards = (attestation?.insights || []).map((insight, idx) => ({
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
        <DenseSection title="Operations Vitals" subtitle="top-line operational card deck" colSpan={3} rowSpan={1}>
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

        <DenseSection title="Insight Cards" subtitle="attestation insight stream as cards" colSpan={3} rowSpan={1}>
          <DenseCards>
            {insightCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent}
                trendValues={probeLatencyTrends[card.probeKey]}
              />
            ))}
          </DenseCards>
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
                progressPercent={card.progressPercent}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Sidecar Domain Signals" subtitle="core functionality cards per sidecar with observation timestamps" colSpan={3} rowSpan={1}>
          <DenseCards>
            {sidecarDomainSignalCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent}
              />
            ))}
          </DenseCards>
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Operations
