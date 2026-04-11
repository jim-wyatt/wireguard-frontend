import type { RagStatus } from '../../components/dense/CyberUi'

export interface SidecarCardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance?: string
  progressPercent?: number
}

interface BuildOptions {
  includeCache?: boolean
}

type SidecarPayload = Record<string, unknown>

function formatNumber(value: unknown, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function formatBytes(value: unknown): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  const bytes = Number(value)
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / 1024 ** idx
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${units[idx]}`
}

function sidecarStatus(payload: SidecarPayload): RagStatus {
  if (typeof payload.healthy === 'boolean') return payload.healthy ? 'green' : payload.available ? 'amber' : 'red'
  if (typeof payload.available === 'boolean') return payload.available ? 'green' : 'red'
  return 'amber'
}

function sidecarValue(payload: SidecarPayload): string {
  if (typeof payload.available === 'boolean') return payload.available ? 'ONLINE' : 'OFFLINE'
  return 'UNKNOWN'
}

function sidecarHint(name: string, payload: SidecarPayload, includeCache: boolean): string {
  let hint = '-'

  if (name === 'node_exporter') {
    hint = `load1 ${formatNumber(payload.load1, 2)} | mem ${formatNumber(payload.memory_used_percent, 1)}%`
  } else if (name === 'podman_exporter') {
    hint = `running ${formatNumber(payload.containers_running, 0)} | exited ${formatNumber(payload.containers_exited, 0)}`
  } else if (name === 'postgres_exporter') {
    hint = `up ${formatNumber(payload.up, 0)} | backends ${formatNumber(payload.num_backends, 0)} | size ${formatBytes(payload.database_size_bytes)}`
  } else if (name === 'falcosidekick') {
    hint = `inputs ${formatNumber(payload.inputs_total, 0)} | rejected ${formatNumber(payload.inputs_rejected, 0)}`
  } else if (name === 'crowdsec') {
    hint = `status ${String(payload.status || '-')} | healthy ${payload.healthy ? 'yes' : 'no'}`
  } else if (name === 'trivy_server') {
    hint = `db age ${formatNumber(payload.db_age_hours, 1)}h | next ${String(payload.db_next_update || '-')}`
  } else if (name === 'parca') {
    hint = `goroutines ${formatNumber(payload.go_goroutines, 0)} | lsm ${formatBytes(payload.frostdb_lsm_size_bytes)}`
  } else if (name === 'ebpf_agent') {
    hint = `goroutines ${formatNumber(payload.go_goroutines, 0)} | upload ${formatBytes(payload.debuginfo_upload_request_bytes)}`
  }

  if (includeCache && (payload.cache_age_seconds !== undefined || payload.cache_ttl_seconds !== undefined)) {
    hint = `${hint} | cache ${formatNumber(payload.cache_age_seconds, 1)}s/${formatNumber(payload.cache_ttl_seconds, 1)}s`
  }

  return hint
}

function sidecarImportance(payload: SidecarPayload): string | undefined {
  const probe = payload.api_probe_summary
  if (typeof probe === 'string' && probe.trim()) return probe
  const version = payload.version || payload.ui_version
  const cache = payload.cache_state
  const details = [version ? `version ${String(version)}` : '', cache ? `cache ${String(cache)}` : ''].filter(Boolean)
  return details.length ? details.join(' | ') : undefined
}

export function buildSidecarCards(sidecars: Record<string, SidecarPayload>, options?: BuildOptions): SidecarCardItem[] {
  const includeCache = options?.includeCache ?? false
  return Object.entries(sidecars).map(([name, payload]) => {
    const status = sidecarStatus(payload)
    return {
      key: `sidecar-${name}`,
      title: `SIDECAR ${name.toUpperCase()}`,
      value: sidecarValue(payload),
      hint: sidecarHint(name, payload, includeCache),
      status,
      importance: sidecarImportance(payload),
      progressPercent: status === 'green' ? 100 : status === 'amber' ? 60 : 0,
    }
  })
}

export function summarizeSidecarRisk(sidecars: Record<string, SidecarPayload>): string {
  const entries = Object.entries(sidecars)
  if (!entries.length) return 'No sidecar telemetry'

  const degraded = entries.filter(([, p]) => sidecarStatus(p) !== 'green')
  if (!degraded.length) return `All ${entries.length} sidecars healthy`

  const names = degraded.map(([n]) => n).slice(0, 3)
  return `Degraded: ${names.join(', ')}${degraded.length > 3 ? '...' : ''}`
}
