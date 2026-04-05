import { useEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

type ApiData = Record<string, unknown>

const TREND_WINDOW = 24

function formatBytes(value: unknown): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  const bytes = Number(value)
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / (1024 ** idx)
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${units[idx]}`
}

function formatNumber(value: unknown, maxDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

function formatPercent(value: unknown, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toFixed(digits)}%`
}

function formatTimestamp(value: unknown): string {
  if (!value) return '-'
  const parsed = new Date(value as string)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString()
}

function formatEpochSeconds(value: unknown): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return new Date(Number(value) * 1000).toLocaleString()
}

function appendTrend(history: Record<string, number[]>, key: string, value: unknown): Record<string, number[]> {
  if (!Number.isFinite(Number(value))) return history
  const current = Array.isArray(history[key]) ? history[key] : []
  const next = [...current, Number(value)].slice(-TREND_WINDOW)
  return { ...history, [key]: next }
}

function thresholdStatus(value: unknown, greenMax: number, amberMax: number): RagStatus {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'amber'
  const n = Number(value)
  if (n <= greenMax) return 'green'
  if (n <= amberMax) return 'amber'
  return 'red'
}

function thresholdMinStatus(value: unknown, redMin: number, amberMin: number): RagStatus {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'amber'
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
  trendKey?: string
}

function Metrics() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [trendHistory, setTrendHistory] = useState<Record<string, number[]>>({})

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await clientsApi.getMetricsSummary()
        if (active) setData(response.data as ApiData)
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string }
        if (active) setError(e?.response?.data?.detail || e?.message || 'Failed to load metrics')
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

  const runtime = (data?.runtime as ApiData) || {}
  const summary = (data?.summary as ApiData) || {}
  const sourceProbes = (data?.source_probes as ApiData[]) || []

  const caddy = (runtime?.caddy as ApiData) || {}
  const backend = (runtime?.backend as ApiData) || {}
  const hostOs = (runtime?.os as ApiData) || {}
  const wireguard = (runtime?.wireguard as ApiData) || {}
  const sidecars = (runtime?.sidecars as Record<string, ApiData>) || {}
  const process = (runtime?.process as ApiData) || {}
  const go = (runtime?.go as ApiData) || {}
  const env = (runtime?.environment as ApiData) || {}

  useEffect(() => {
    if (!data) return

    const rt = (data?.runtime as ApiData) || {}
    const os = (rt?.os as ApiData) || {}
    const bk = (rt?.backend as ApiData) || {}
    const wg = (rt?.wireguard as ApiData) || {}
    const cd = (rt?.caddy as ApiData) || {}
    const pr = (rt?.process as ApiData) || {}
    const goRt = (rt?.go as ApiData) || {}
    const sc = (rt?.sidecars as ApiData) || {}

    const cpuData = (os?.cpu as ApiData) || {}
    const memData = (os?.memory as ApiData) || {}
    const diskData = ((os?.disk as ApiData)?.root as ApiData) || {}
    const upstreams = (cd?.reverse_proxy_upstreams as ApiData) || {}
    const trivyServer = (sc?.trivy_server as ApiData) || {}

    const snapshot: Record<string, unknown> = {
      host_cpu: cpuData?.usage_percent,
      host_mem: memData?.used_percent,
      host_disk: diskData?.usage_percent,
      api_err: bk?.error_rate_percent,
      api_p95: bk?.p95_latency_ms,
      api_avg: bk?.avg_latency_ms,
      fd_usage: pr?.fd_usage_percent,
      wg_peer_ratio: Number(wg?.configured_peers || 0) > 0
        ? (Number(wg?.connected_peers || 0) / Number(wg?.configured_peers || 1)) * 100
        : null,
      wg_handshake_age_min: Number(wg?.latest_handshake_age_seconds || 0) / 60,
      caddy_reload_age: cd?.config_last_reload_age_seconds,
      caddy_upstreams_ratio: Number(upstreams?.total || 0) > 0
        ? (Number(upstreams?.healthy || 0) / Number(upstreams?.total || 1)) * 100
        : null,
      host_net_rx: (os?.network as ApiData)?.rx_bytes_total,
      host_net_tx: (os?.network as ApiData)?.tx_bytes_total,
      process_net_rx: pr?.network_receive_bytes_total,
      process_net_tx: pr?.network_transmit_bytes_total,
      go_gc_age: goRt?.last_gc_age_seconds,
      trivy_db_age_h: trivyServer?.db_age_hours,
    }

    setTrendHistory((prev) => {
      let next = prev
      Object.entries(snapshot).forEach(([key, value]) => {
        next = appendTrend(next, key, value)
      })
      return next
    })
  }, [data])

  const trendDelta = (key: string): number | null => {
    const series = Array.isArray(trendHistory[key]) ? trendHistory[key] : []
    if (series.length < 2) return null
    return Number(series[series.length - 1]) - Number(series[series.length - 2])
  }

  const deltaLabel = (key: string, digits = 1, suffix = ''): string => {
    const delta = trendDelta(key)
    if (!Number.isFinite(Number(delta))) return 'Δ warmup'
    const n = Number(delta)
    const sign = n > 0 ? '+' : ''
    return `Δ ${sign}${n.toFixed(digits)}${suffix}`
  }

  const availableProbes = sourceProbes.filter((probe) => probe.available).length
  const probeCoverage = sourceProbes.length > 0 ? (availableProbes / sourceProbes.length) * 100 : null

  const cpu = (hostOs?.cpu as ApiData) || {}
  const cpuLoad = (cpu?.load as ApiData) || {}
  const mem = (hostOs?.memory as ApiData) || {}
  const disk = ((hostOs?.disk as ApiData)?.root as ApiData) || {}
  const upstreams = (caddy?.reverse_proxy_upstreams as ApiData) || {}
  const heap = (go?.heap as ApiData) || {}

  const primaryCards = useMemo<CardItem[]>(() => {
    const caddyTotal = Number(upstreams?.total || 0)
    const caddyHealthy = Number(upstreams?.healthy || 0)
    const caddyCoverage = caddyTotal > 0 ? (caddyHealthy / caddyTotal) * 100 : null
    const sidecarUp = Object.values(sidecars).filter((s) => s?.available).length
    const sidecarTotal = Object.keys(sidecars).length
    const sidecarCoverage = sidecarTotal > 0 ? (sidecarUp / sidecarTotal) * 100 : null

    const cards: CardItem[] = [
      {
        key: 'cpu',
        title: 'HOST CPU',
        value: formatPercent(cpu?.usage_percent, 1),
        hint: `load1 ${formatNumber(cpuLoad?.load_1m, 2)} | cores ${formatNumber(cpu?.cores, 0)}`,
        status: thresholdStatus(cpu?.usage_percent, 70, 90),
        progressPercent: cpu?.usage_percent as number | null | undefined,
        trendKey: 'host_cpu',
      },
      {
        key: 'memory',
        title: 'HOST MEMORY',
        value: formatPercent(mem?.used_percent, 1),
        hint: `${formatBytes(mem?.used_bytes)} / ${formatBytes(mem?.total_bytes)}`,
        status: thresholdStatus(mem?.used_percent, 75, 90),
        progressPercent: mem?.used_percent as number | null | undefined,
        trendKey: 'host_mem',
      },
      {
        key: 'swap',
        title: 'HOST SWAP',
        value: formatPercent(mem?.swap_used_percent, 1),
        hint: `${formatBytes(mem?.swap_used_bytes)} / ${formatBytes(mem?.swap_total_bytes)}`,
        status: thresholdStatus(mem?.swap_used_percent, 60, 85),
        progressPercent: mem?.swap_used_percent as number | null | undefined,
      },
      {
        key: 'disk',
        title: 'ROOT DISK',
        value: formatPercent(disk?.usage_percent, 1),
        hint: `${formatBytes(disk?.used_bytes)} used`,
        status: thresholdStatus(disk?.usage_percent, 80, 92),
        progressPercent: disk?.usage_percent as number | null | undefined,
        trendKey: 'host_disk',
      },
      {
        key: 'api-errors',
        title: 'API 5XX RATE',
        value: formatPercent(backend?.error_rate_percent, 2),
        hint: `requests ${formatNumber(backend?.requests_total, 0)} | active ${formatNumber(backend?.active_requests, 0)} | ${deltaLabel('api_err', 2, '%')}`,
        status: thresholdStatus(backend?.error_rate_percent, 1, 5),
        progressPercent: Math.min(100, Number(backend?.error_rate_percent || 0) * 20),
        trendKey: 'api_err',
      },
      {
        key: 'api-latency-p95',
        title: 'API LATENCY P95',
        value: `${formatNumber(backend?.p95_latency_ms, 1)} ms`,
        hint: `avg ${formatNumber(backend?.avg_latency_ms, 1)} ms | ${deltaLabel('api_p95', 1, 'ms')}`,
        status: thresholdStatus(backend?.p95_latency_ms, 300, 800),
        progressPercent: Number.isFinite(Number(backend?.p95_latency_ms)) ? Math.min(100, (Number(backend?.p95_latency_ms) / 2000) * 100) : undefined,
        trendKey: 'api_p95',
      },
      {
        key: 'api-latency-avg',
        title: 'API LATENCY AVG',
        value: `${formatNumber(backend?.avg_latency_ms, 1)} ms`,
        hint: `2xx ${formatNumber(backend?.status_2xx, 0)} | 4xx ${formatNumber(backend?.status_4xx, 0)} | ${deltaLabel('api_avg', 1, 'ms')}`,
        status: thresholdStatus(backend?.avg_latency_ms, 120, 350),
        progressPercent: Number.isFinite(Number(backend?.avg_latency_ms)) ? Math.min(100, (Number(backend?.avg_latency_ms) / 1000) * 100) : undefined,
        trendKey: 'api_avg',
      },
      {
        key: 'source-coverage',
        title: 'SOURCE COVERAGE',
        value: `${availableProbes}/${sourceProbes.length}`,
        hint: `${formatNumber(probeCoverage, 0)}% probe availability`,
        status: thresholdMinStatus(probeCoverage, 80, 100),
        progressPercent: probeCoverage,
      },
      {
        key: 'catalog-depth',
        title: 'CATALOG DEPTH',
        value: `${formatNumber(summary.metric_names, 0)} names`,
        hint: `${formatNumber(summary.series, 0)} series | ${formatNumber(summary.parsed_lines, 0)} parsed`,
        status: thresholdMinStatus(summary.metric_names, 50, 120),
      },
      {
        key: 'upstreams',
        title: 'EDGE UPSTREAMS',
        value: `${caddyHealthy}/${caddyTotal}`,
        hint: `in-flight ${formatNumber(caddy?.requests_in_flight, 0)}`,
        status: thresholdMinStatus(caddyCoverage, 80, 100),
        progressPercent: caddyCoverage,
        trendKey: 'caddy_upstreams_ratio',
      },
      {
        key: 'sidecar-health',
        title: 'SIDECAR HEALTH',
        value: `${sidecarUp}/${sidecarTotal}`,
        hint: `${formatNumber(sidecarCoverage, 0)}% sidecar availability`,
        status: thresholdMinStatus(sidecarCoverage, 80, 100),
        progressPercent: sidecarCoverage,
      },
      {
        key: 'process-fd',
        title: 'FD USAGE',
        value: formatPercent(process?.fd_usage_percent, 1),
        hint: `${formatNumber(process?.open_fds, 0)} / ${formatNumber(process?.max_fds, 0)}`,
        status: thresholdStatus(process?.fd_usage_percent, 60, 85),
        progressPercent: process?.fd_usage_percent as number | null | undefined,
        trendKey: 'fd_usage',
      },
      {
        key: 'go-runtime',
        title: 'GO GOROUTINES',
        value: formatNumber(go?.goroutines, 0),
        hint: `threads ${formatNumber(go?.threads, 0)} | gc p75 ${formatNumber((go?.gc_pause_seconds as ApiData)?.p75, 4)}s`,
        status: thresholdStatus(go?.goroutines, 200, 600),
      },
      {
        key: 'service-uptime',
        title: 'SERVICE UPTIME',
        value: `${formatNumber(Number(backend?.uptime_seconds || 0) / 3600, 1)}h`,
        hint: `${(env?.app as ApiData)?.version || '-'} @ ${(env?.host as ApiData)?.hostname || '-'}`,
        status: thresholdMinStatus(backend?.uptime_seconds, 600, 3600),
      },
    ]

    if (loading) {
      cards.unshift({
        key: 'state-loading',
        title: 'PAGE STATE',
        value: 'LOADING',
        hint: 'collecting telemetry summary',
        status: 'amber',
        importance: 'Metric probes are being refreshed.',
      })
    }

    if (error) {
      cards.unshift({
        key: 'state-error',
        title: 'METRICS FEED',
        value: 'DEGRADED',
        hint: error,
        status: 'red',
        importance: 'Telemetry summary endpoint returned an error condition.',
      })
    }

    return cards
  }, [availableProbes, backend, caddy, cpu, cpuLoad, disk, env, error, go, heap, loading, mem, probeCoverage, process, sidecars, sourceProbes.length, summary, trendHistory, upstreams, wireguard])

  const probeCards = useMemo<CardItem[]>(() => sourceProbes.map((probe) => ({
    key: `probe-${probe.id as string}`,
    title: `SOURCE ${String(probe.id).toUpperCase()}`,
    value: probe.available ? 'UP' : 'DOWN',
    hint: `${(probe.mode as string) || 'http'} | status ${(probe.status_code as number | null) ?? '-'} | ${(probe.error as string) || 'ok'}`,
    status: probe.available ? 'green' : 'red',
    progressPercent: probe.available ? 100 : 0,
    importance: probe.url as string,
  })), [sourceProbes])

  const sidecarCards = useMemo<CardItem[]>(() => Object.entries(sidecars).map(([name, payload]) => {
    const keyMetric = payload?.status
      || payload?.version
      || payload?.up
      || payload?.num_backends
      || payload?.containers_running
      || payload?.go_goroutines
      || payload?.db_age_hours
      || '-'

    return {
      key: `sidecar-${name}`,
      title: `SIDECAR ${String(name).toUpperCase()}`,
      value: payload?.available ? 'ONLINE' : 'OFFLINE',
      hint: `metric ${String(keyMetric)} | cache ${formatNumber(payload?.cache_age_seconds, 1)}s/${formatNumber(payload?.cache_ttl_seconds, 1)}s`,
      status: payload?.available ? 'green' : 'red',
      progressPercent: payload?.available ? 100 : 0,
      importance: `cache ${String(payload?.cache_state || '-')}`,
    }
  }), [sidecars])

  const wireguardCards = useMemo<CardItem[]>(() => {
    const wg = wireguard || {}
    return [
      {
        key: 'wg-interface',
        title: 'WG INTERFACE',
        value: (wg?.interface as string) || '-',
        hint: `listen ${formatNumber(wg?.listen_port, 0)} | key ${(wg?.public_key as string) || '-'}`,
        status: wg?.is_up ? 'green' : 'red',
      },
      {
        key: 'wg-handshake-age',
        title: 'WG LAST HANDSHAKE AGE',
        value: `${formatNumber((Number(wg?.latest_handshake_age_seconds || 0) / 60), 1)} min`,
        hint: `at ${formatTimestamp(wg?.latest_handshake)} | ${deltaLabel('wg_handshake_age_min', 1, 'm')}`,
        status: thresholdStatus(Number(wg?.latest_handshake_age_seconds || 0), 180, 600),
        trendKey: 'wg_handshake_age_min',
      },
      {
        key: 'wg-transfer-rx',
        title: 'WG TRANSFER RX',
        value: formatBytes(wg?.transfer_rx),
        hint: 'session cumulative receive',
        status: wg?.is_up ? 'green' : 'amber',
      },
      {
        key: 'wg-transfer-tx',
        title: 'WG TRANSFER TX',
        value: formatBytes(wg?.transfer_tx),
        hint: 'session cumulative transmit',
        status: wg?.is_up ? 'green' : 'amber',
      },
    ]
  }, [wireguard, trendHistory])

  const infraCards = useMemo<CardItem[]>(() => {
    const app = (env?.app as ApiData) || {}
    const host = (env?.host as ApiData) || {}
    const container = (env?.container as ApiData) || {}
    const db = (env?.database as ApiData) || {}
    const osNet = (hostOs?.network as ApiData) || {}
    const gcPause = (go?.gc_pause_seconds as ApiData) || {}

    return [
      {
        key: 'app-version',
        title: 'APP VERSION',
        value: (app?.version as string) || '-',
        hint: `commit ${(app?.commit as string) || '-'} | pid ${formatNumber(app?.pid, 0)}`,
        status: 'green',
      },
      {
        key: 'app-started',
        title: 'APP STARTED AT',
        value: formatTimestamp(app?.started_at),
        hint: `generated ${formatTimestamp(data?.generated_at)}`,
        status: 'green',
      },
      {
        key: 'host-id',
        title: 'HOST IDENTITY',
        value: (host?.hostname as string) || '-',
        hint: `${(host?.platform as string) || '-'} ${(host?.kernel as string) || '-'} | py ${(host?.python_version as string) || '-'}`,
        status: 'green',
      },
      {
        key: 'container-mode',
        title: 'CONTAINER RUNTIME',
        value: (container?.runtime as string) || 'host',
        hint: `containerized ${container?.is_containerized ? 'yes' : 'no'} | cgroup v${formatNumber(container?.cgroup_version, 0)}`,
        status: container?.is_containerized ? 'green' : 'amber',
      },
      {
        key: 'container-limits',
        title: 'CONTAINER LIMITS',
        value: `${formatNumber(container?.cpu_limit_cores, 2)} cores`,
        hint: `mem ${formatBytes(container?.memory_limit_bytes)}`,
        status: container?.is_containerized ? 'green' : 'amber',
      },
      {
        key: 'database-context',
        title: 'DATABASE CONTEXT',
        value: (db?.engine as string) || '-',
        hint: `${(db?.target as string) || '-'} | size ${formatBytes(db?.size_bytes)}`,
        status: db?.engine ? 'green' : 'amber',
      },
      {
        key: 'caddy-reload',
        title: 'CADDY LAST RELOAD',
        value: formatEpochSeconds(caddy?.config_last_reload_timestamp_seconds),
        hint: `age ${formatNumber(caddy?.config_last_reload_age_seconds, 1)}s | ${deltaLabel('caddy_reload_age', 1, 's')} | success ${Number(caddy?.config_last_reload_successful || 0) >= 1 ? 'yes' : 'no'}`,
        status: Number(caddy?.config_last_reload_successful || 0) >= 1 ? 'green' : 'red',
        trendKey: 'caddy_reload_age',
      },
      {
        key: 'host-network',
        title: 'HOST NET TOTALS',
        value: `${formatBytes(osNet?.rx_bytes_total)} rx`,
        hint: `${formatBytes(osNet?.tx_bytes_total)} tx | ifaces ${formatNumber((osNet?.interfaces as unknown[])?.length, 0)} | ${deltaLabel('host_net_rx', 0, 'B')}`,
        status: 'green',
        trendKey: 'host_net_rx',
      },
      {
        key: 'process-network',
        title: 'PROCESS NET TOTALS',
        value: `${formatBytes(process?.network_receive_bytes_total)} rx`,
        hint: `${formatBytes(process?.network_transmit_bytes_total)} tx | cpu ${formatNumber(process?.cpu_seconds_total, 1)}s | ${deltaLabel('process_net_rx', 0, 'B')}`,
        status: 'green',
        trendKey: 'process_net_rx',
      },
      {
        key: 'go-heap',
        title: 'GO HEAP',
        value: formatBytes(heap?.inuse_bytes),
        hint: `alloc ${formatBytes(heap?.alloc_bytes)} | objects ${formatNumber(heap?.objects, 0)}`,
        status: 'green',
      },
      {
        key: 'go-gc-age',
        title: 'GO LAST GC AGE',
        value: `${formatNumber(go?.last_gc_age_seconds, 1)}s`,
        hint: `next gc ${formatBytes(go?.next_gc_bytes)} | p50 ${formatNumber(gcPause?.p50, 4)}s | ${deltaLabel('go_gc_age', 1, 's')}`,
        status: thresholdStatus(go?.last_gc_age_seconds, 30, 120),
        trendKey: 'go_gc_age',
      },
      {
        key: 'trivy-db-freshness',
        title: 'TRIVY DB FRESHNESS TREND',
        value: `${formatNumber(sidecars?.trivy_server?.db_age_hours, 1)}h`,
        hint: `updated ${formatTimestamp(sidecars?.trivy_server?.db_updated_at)} | ${deltaLabel('trivy_db_age_h', 2, 'h')}`,
        status: thresholdStatus(sidecars?.trivy_server?.db_age_hours, 24, 72),
        trendKey: 'trivy_db_age_h',
      },
    ]
  }, [caddy, data, env, go, heap, hostOs, process, sidecars, trendHistory])

  const runtimeCardKeys = ['cpu', 'memory', 'swap', 'disk', 'api-errors', 'api-latency-p95', 'api-latency-avg', 'service-uptime', 'source-coverage', 'catalog-depth']
  const processCardKeys = ['process-fd', 'go-runtime', 'upstreams', 'sidecar-health']

  const runtimeCards = primaryCards.filter((card) => runtimeCardKeys.includes(card.key) || card.key === 'state-loading' || card.key === 'state-error')
  const processCards = primaryCards.filter((card) => processCardKeys.includes(card.key))

  return (
    <Box>
      <DenseGrid>
        <DenseSection
          title="Runtime Vitals"
          subtitle={`high-signal system and API card matrix | refresh ${data?.generated_at ? new Date(data.generated_at as string).toLocaleTimeString() : '-'}`}
          colSpan={2}
          rowSpan={1}
        >
          <DenseCards>
            {runtimeCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent ?? undefined}
                trendValues={card.trendKey ? trendHistory[card.trendKey] : undefined}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="Process + Network" subtitle="fd pressure, go runtime, and edge continuity" colSpan={1} rowSpan={1}>
          <DenseCards>
            {processCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent ?? undefined}
                trendValues={card.trendKey ? trendHistory[card.trendKey] : undefined}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="WireGuard Session Signals" subtitle="tunnel timing and transfer coverage with timestamps" colSpan={1} rowSpan={1}>
          <DenseCards>
            {wireguardCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent ?? undefined}
                trendValues={card.trendKey ? trendHistory[card.trendKey] : undefined}
              />
            ))}
          </DenseCards>
        </DenseSection>

        <DenseSection title="App + Environment Coverage" subtitle="application, container, database, caddy and host/process network context" colSpan={2} rowSpan={1}>
          <DenseCards>
            {infraCards.map((card) => (
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

        <DenseSection title="Source Probes" subtitle="endpoint-level probe measurements" colSpan={3} rowSpan={1}>
          <DenseCards>
            {probeCards.map((card) => (
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

        <DenseSection title="Sidecar Fleet" subtitle="per-sidecar metrics with cache freshness" colSpan={3} rowSpan={1}>
          <DenseCards>
            {sidecarCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
                progressPercent={card.progressPercent ?? undefined}
                trendValues={card.trendKey ? trendHistory[card.trendKey] : undefined}
              />
            ))}
          </DenseCards>
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Metrics
