import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { DataGrid, GridColDef } from '@mui/x-data-grid'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

type ApiData = Record<string, unknown>

const FILE_SOURCES = ['caddy', 'app', 'system']

type LogLevel = 'error' | 'warn' | 'ok' | 'info'

interface LogEntry {
  id: string
  ts: string
  at: number
  level: LogLevel
  source: string
  eventType: string
  target: string
  actor: string
  code: number | null
  latencyMs: number | null
  summary: string
  detail: string
}

interface CardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance?: string
}

function normalizePath(uri: unknown): string {
  if (!uri) return '-'
  const value = String(uri)
  const q = value.indexOf('?')
  return q >= 0 ? value.slice(0, q) : value
}

function durationToMs(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 10 ? n * 1000 : n
}

function ageLabel(timestampMs: number | undefined, nowMs: number): string {
  const diff = Math.max(0, Math.floor((nowMs - Number(timestampMs ?? nowMs)) / 1000))
  if (diff < 60) return `${diff}s`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h`
}

function parseLine(line: string, source: string): LogEntry {
  const now = new Date()
  const nowMs = now.getTime()
  if (source === 'caddy') {
    try {
      const parsed = JSON.parse(line) as ApiData
      const req = (parsed?.request as ApiData) || {}
      const statusCode = Number(parsed?.status || 0)
      const method = (req?.method as string) || '-'
      const path = normalizePath(req?.uri)
      const latencyMs = durationToMs(parsed?.duration)
      const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'ok'
      return {
        id: `${source}-${parsed?.ts || nowMs}-${Math.random()}`,
        ts: typeof parsed?.ts === 'number' ? new Date((parsed.ts as number) * 1000).toLocaleTimeString() : now.toLocaleTimeString(),
        at: typeof parsed?.ts === 'number' ? Math.round((parsed.ts as number) * 1000) : nowMs,
        level,
        source,
        eventType: 'http_access',
        target: `${method} ${path}`,
        actor: (req?.remote_ip || req?.client_ip || '-') as string,
        code: statusCode || null,
        latencyMs,
        summary: `${method} ${path} (${statusCode || '-'})`,
        detail: line,
      }
    } catch {
      // Fallback to plain parsing below.
    }
  }

  const lowered = String(line).toLowerCase()
  const level: LogLevel = lowered.includes('error') ? 'error' : lowered.includes('warn') ? 'warn' : 'info'
  const codeMatch = String(line).match(/\b([1-5][0-9]{2})\b/)
  return {
    id: `${source}-${nowMs}-${Math.random()}`,
    ts: now.toLocaleTimeString(),
    at: nowMs,
    level,
    source,
    eventType: source === 'app' ? 'app_log' : source === 'system' ? 'system_log' : 'log_line',
    target: '-',
    actor: '-',
    code: codeMatch ? Number(codeMatch[1]) : null,
    latencyMs: null,
    summary: String(line).slice(0, 170),
    detail: String(line),
  }
}

function ragFromHealth(ok: boolean): RagStatus {
  return ok ? 'green' : 'red'
}

function levelChip(level: LogLevel): { label: string; color: 'error' | 'warning' | 'success' | 'default' } {
  if (level === 'error') return { label: 'ERR', color: 'error' }
  if (level === 'warn') return { label: 'WARN', color: 'warning' }
  if (level === 'ok') return { label: 'OK', color: 'success' }
  return { label: 'INFO', color: 'default' }
}

interface LineCache {
  queue: string[]
  set: Set<string>
}

function Logs() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [streamError, setStreamError] = useState('')
  const [enabledSources, setEnabledSources] = useState<string[]>(FILE_SOURCES)
  const [filterSource, setFilterSource] = useState('all')
  const [query, setQuery] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())
  const [sidecarState, setSidecarState] = useState<Record<string, ApiData>>({})
  const lastSidecarRef = useRef<Record<string, boolean>>({})
  const recentSourceLinesRef = useRef<Record<string, LineCache>>({})

  const pushEntry = (entry: LogEntry) => {
    setEntries((prev) => {
      const next = [entry, ...prev]
      return next.length > 1000 ? next.slice(0, 1000) : next
    })
  }

  const shouldEmitSourceLine = (source: string, rawLine: string): boolean => {
    const maxCache = 400
    const cache: LineCache = recentSourceLinesRef.current[source] || { queue: [], set: new Set() }
    if (cache.set.has(rawLine)) {
      return false
    }
    cache.queue.push(rawLine)
    cache.set.add(rawLine)
    while (cache.queue.length > maxCache) {
      const dropped = cache.queue.shift()!
      cache.set.delete(dropped)
    }
    recentSourceLinesRef.current[source] = cache
    return true
  }

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    const controllers: AbortController[] = []
    const inFlight = new Set<string>()
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const pollSource = async (source: string) => {
      if (inFlight.has(source)) return
      inFlight.add(source)
      const controller = new AbortController()
      controllers.push(controller)

      try {
        await clientsApi.streamLogs({
          source,
          tail: 120,
          follow: false,
          signal: controller.signal,
          onLine: (line) => {
            if (!active) return
            if (!shouldEmitSourceLine(source, line)) return
            pushEntry(parseLine(line, source))
          },
        })
      } catch (err: unknown) {
        const e = err as { message?: string }
        if (!active || controller.signal.aborted) return
        setStreamError((prev) => `${prev}${prev ? ' | ' : ''}${source}: ${e?.message || 'stream failed'}`)
      } finally {
        inFlight.delete(source)
      }
    }

    const bootstrap = async () => {
      setLoading(true)
      setStreamError('')
      let sourcesToOpen = FILE_SOURCES
      try {
        const attestation = await clientsApi.getAttestationSummary()
        const availableMap = ((attestation?.data as ApiData)?.log_sources as Record<string, unknown>) || {}
        const available = FILE_SOURCES.filter((name) => availableMap[name] !== false)
        sourcesToOpen = available.length > 0 ? available : FILE_SOURCES
        if (active) setEnabledSources(sourcesToOpen)
      } catch {
        sourcesToOpen = FILE_SOURCES
        if (active) setEnabledSources(sourcesToOpen)
      }

      await Promise.all(sourcesToOpen.map((source) => pollSource(source)))
      if (active) setLoading(false)

      pollTimer = setInterval(() => {
        sourcesToOpen.forEach((source) => {
          pollSource(source)
        })
      }, 4000)
    }

    bootstrap()

    return () => {
      active = false
      if (pollTimer) clearInterval(pollTimer)
      controllers.forEach((controller) => controller.abort())
    }
  }, [])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      event.preventDefault()
      const input = document.getElementById('logs-filter-query')
      input?.focus()
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  useEffect(() => {
    let active = true

    const injectSidecarEvents = async () => {
      try {
        const metrics = await clientsApi.getMetricsSummary()
        if (!active) return

        const sidecars = ((metrics?.data as ApiData)?.runtime as ApiData)?.sidecars as Record<string, ApiData> || {}
        setSidecarState(sidecars)

        Object.entries(sidecars).forEach(([name, payload]) => {
          const nowHealthy = Boolean(payload?.available)
          const prevHealthy = lastSidecarRef.current[name]
          const detail = JSON.stringify(payload)
          const keyMetric = payload?.status
            || payload?.version
            || payload?.up
            || payload?.go_goroutines
            || payload?.db_age_hours
            || '-'

          pushEntry({
            id: `sidecar-snapshot-${name}-${Date.now()}-${Math.random()}`,
            ts: new Date().toLocaleTimeString(),
            at: Date.now(),
            level: nowHealthy ? 'info' : 'warn',
            source: `sidecar:${name}`,
            eventType: 'sidecar_snapshot',
            target: name,
            actor: 'sidecar',
            code: nowHealthy ? 200 : 503,
            latencyMs: null,
            summary: `${name} snapshot metric=${String(keyMetric)}`,
            detail,
          })

          if (prevHealthy === undefined || prevHealthy !== nowHealthy) {
            pushEntry({
              id: `sidecar-${name}-${Date.now()}-${Math.random()}`,
              ts: new Date().toLocaleTimeString(),
              at: Date.now(),
              level: nowHealthy ? 'ok' : 'warn',
              source: `sidecar:${name}`,
              eventType: 'sidecar_transition',
              target: name,
              actor: 'sidecar',
              code: nowHealthy ? 200 : 503,
              latencyMs: null,
              summary: `${name} ${nowHealthy ? 'ONLINE' : 'OFFLINE'}`,
              detail,
            })
          }
          lastSidecarRef.current[name] = nowHealthy
        })
      } catch {
        if (!active) return
      }
    }

    injectSidecarEvents()
    const timer = setInterval(injectSidecarEvents, 15000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const telemetry = useMemo(() => {
    const counts: Record<LogLevel, number> = { error: 0, warn: 0, ok: 0, info: 0 }
    entries.forEach((entry) => {
      counts[entry.level] = (counts[entry.level] || 0) + 1
    })
    return counts
  }, [entries])

  const visibleRows = useMemo(() => {
    const base = filterSource === 'all' ? entries : entries.filter((entry) => entry.source === filterSource)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter((entry) => `${entry.summary} ${entry.detail} ${entry.source}`.toLowerCase().includes(q))
  }, [entries, filterSource, query])

  const rows = visibleRows.map((entry) => ({
    id: entry.id,
    ts: entry.ts,
    age: ageLabel(entry.at, nowMs),
    at: entry.at,
    source: entry.source,
    level: entry.level,
    eventType: entry.eventType || 'event',
    target: entry.target || '-',
    actor: entry.actor || '-',
    code: entry.code,
    latencyMs: entry.latencyMs,
    summary: entry.summary,
    detail: entry.detail,
  }))

  const columns: GridColDef[] = [
    { field: 'age', headerName: 'Age', flex: 0.28, minWidth: 72 },
    { field: 'source', headerName: 'Source', flex: 0.6, minWidth: 130 },
    {
      field: 'level',
      headerName: 'Signal',
      flex: 0.35,
      minWidth: 96,
      renderCell: (params) => {
        const cfg = levelChip(params.value as LogLevel)
        return <Chip size="small" label={cfg.label} color={cfg.color} />
      },
    },
    { field: 'eventType', headerName: 'Event', flex: 0.55, minWidth: 120 },
    { field: 'target', headerName: 'Target', flex: 1.0, minWidth: 190 },
    {
      field: 'code',
      headerName: 'Code',
      flex: 0.34,
      minWidth: 78,
      valueFormatter: (value: unknown) => (value === null || value === undefined ? '-' : String(value)),
    },
    {
      field: 'latencyMs',
      headerName: 'Latency',
      flex: 0.45,
      minWidth: 95,
      valueFormatter: (value: unknown) => (Number.isFinite(Number(value)) ? `${Math.round(Number(value))}ms` : '-'),
    },
    { field: 'actor', headerName: 'Actor', flex: 0.45, minWidth: 100 },
    { field: 'summary', headerName: 'Summary', flex: 1.1, minWidth: 220 },
    { field: 'detail', headerName: 'Detail', flex: 1.2, minWidth: 260 },
  ]

  const latencySample = useMemo(() => entries.filter((entry) => Number.isFinite(Number(entry.latencyMs))), [entries])
  const p95LatencyMs = useMemo(() => {
    if (latencySample.length === 0) return null
    const sorted = latencySample
      .map((entry) => Number(entry.latencyMs))
      .sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
    return sorted[idx]
  }, [latencySample])

  const topTarget = useMemo(() => {
    const counts = new Map<string, number>()
    entries.forEach((entry) => {
      const target = entry.target || '-'
      counts.set(target, (counts.get(target) || 0) + 1)
    })
    let best = '-'
    let bestCount = 0
    counts.forEach((count, target) => {
      if (count > bestCount) {
        best = target
        bestCount = count
      }
    })
    return { target: best, count: bestCount }
  }, [entries])

  const errorTarget = useMemo(() => {
    const counts = new Map<string, number>()
    entries
      .filter((entry) => entry.level === 'error' || entry.level === 'warn')
      .forEach((entry) => {
        const target = entry.target || entry.summary || '-'
        counts.set(target, (counts.get(target) || 0) + 1)
      })
    let best = '-'
    let bestCount = 0
    counts.forEach((count, target) => {
      if (count > bestCount) {
        best = target
        bestCount = count
      }
    })
    return { target: best, count: bestCount }
  }, [entries])

  const sourceCoverageTotal = enabledSources.length + Object.keys(sidecarState).length
  const sourceCoverageLive = enabledSources.length + Object.values(sidecarState).filter((value) => value?.available).length
  const uniqueSources = new Set(entries.map((entry) => entry.source)).size
  const visibleRatio = entries.length > 0 ? (rows.length / entries.length) * 100 : 0
  const dominantLevel = (['error', 'warn', 'ok', 'info'] as LogLevel[]).reduce<LogLevel | null>((best, level) => {
    if (!best) return level
    return telemetry[level] > telemetry[best] ? level : best
  }, null)
  const newestTs = entries[0]?.ts || '-'

  const topCards: CardItem[] = [
    {
      key: 'mesh',
      title: 'STREAM MESH',
      value: `${enabledSources.length}/${FILE_SOURCES.length} FILE SOURCES`,
      hint: `${Object.keys(sidecarState).length} sidecar channels detected`,
      status: enabledSources.length === FILE_SOURCES.length ? 'green' : 'amber',
      importance: 'Coverage determines whether operators can see incidents as they happen.',
    },
    {
      key: 'pressure',
      title: 'EVENT PRESSURE',
      value: `${telemetry.error + telemetry.warn} ALERT LINES`,
      hint: `err ${telemetry.error} | warn ${telemetry.warn} | ok ${telemetry.ok} | info ${telemetry.info}`,
      status: telemetry.error > 0 ? 'red' : telemetry.warn > 5 ? 'amber' : 'green',
      importance: 'Error/warn density reflects live operational instability.',
    },
    {
      key: 'coverage',
      title: 'UNIFIED COVERAGE',
      value: `${sourceCoverageLive}/${sourceCoverageTotal || 1}`,
      hint: `filter ${filterSource.toUpperCase()} | rows ${rows.length}`,
      status: ragFromHealth(sourceCoverageLive >= sourceCoverageTotal),
      importance: 'Unified stream must include both file logs and sidecar telemetry.',
    },
    {
      key: 'buffer',
      title: 'BUFFER DEPTH',
      value: `${entries.length}/1000`,
      hint: 'in-memory rolling log window',
      status: entries.length > 900 ? 'red' : entries.length > 700 ? 'amber' : 'green',
      importance: 'Large buffers indicate sustained chatter and potential signal dilution.',
    },
    {
      key: 'sources',
      title: 'SOURCE DIVERSITY',
      value: `${uniqueSources}`,
      hint: 'distinct streams currently represented',
      status: uniqueSources >= 5 ? 'green' : uniqueSources >= 3 ? 'amber' : 'red',
      importance: 'Broader source diversity improves incident context quality.',
    },
    {
      key: 'filter',
      title: 'FILTER IMPACT',
      value: `${visibleRatio.toFixed(0)}%`,
      hint: `query "${query || '-'}"`,
      status: visibleRatio >= 60 ? 'green' : visibleRatio >= 20 ? 'amber' : 'red',
      importance: 'Shows whether active filters are narrowing too aggressively.',
    },
    {
      key: 'dominant',
      title: 'DOMINANT SEVERITY',
      value: String(dominantLevel || '-').toUpperCase(),
      hint: `latest ${newestTs}`,
      status: dominantLevel === 'error' ? 'red' : dominantLevel === 'warn' ? 'amber' : 'green',
      importance: 'Fast severity signal for triage priority decisions.',
    },
    {
      key: 'latency-p95',
      title: 'HTTP LATENCY P95',
      value: Number.isFinite(Number(p95LatencyMs)) ? `${Math.round(Number(p95LatencyMs))}ms` : '-',
      hint: `${latencySample.length} latency samples in buffer`,
      status: !Number.isFinite(Number(p95LatencyMs)) ? 'amber' : Number(p95LatencyMs) <= 300 ? 'green' : Number(p95LatencyMs) <= 800 ? 'amber' : 'red',
      importance: 'High-tail latency is often the first user-visible degradation signal.',
    },
    {
      key: 'top-target',
      title: 'HOT TARGET',
      value: topTarget.target,
      hint: `${topTarget.count} hits in current buffer`,
      status: topTarget.count > 0 ? 'green' : 'amber',
      importance: 'Shows where traffic volume is concentrating right now.',
    },
    {
      key: 'error-hotspot',
      title: 'ALERT HOTSPOT',
      value: errorTarget.target,
      hint: `${errorTarget.count} warn/error events`,
      status: errorTarget.count > 0 ? 'red' : 'green',
      importance: 'Highlights the noisiest failure location for immediate triage.',
    },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Logs Grid :: [event crawler] (o_o)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Unified stream from file sources + sidecar telemetry transitions | dense tactical feed
      </Typography>

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {streamError && <Alert severity="warning" sx={{ mb: 1 }}>{streamError}</Alert>}

      <DenseGrid>
        <DenseSection title="Topline" subtitle="3 high-level cards | pressure + mesh + coverage" colSpan={3} rowSpan={1}>
          <DenseCards>
            {topCards.map((card) => (
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

        <DenseSection title="Controls" subtitle="source filters and quick ops | command-post panel" colSpan={3} rowSpan={1}>
          <Stack spacing={1}>
            <TextField
              id="logs-filter-query"
              size="small"
              label="query (/ to focus)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label="all"
                color={filterSource === 'all' ? 'primary' : 'default'}
                onClick={() => setFilterSource('all')}
              />
              {Array.from(new Set(entries.map((entry) => entry.source))).map((source) => (
                <Chip
                  key={source}
                  size="small"
                  label={source}
                  color={filterSource === source ? 'primary' : 'default'}
                  onClick={() => setFilterSource(source)}
                />
              ))}
            </Stack>

            <Button size="small" variant="outlined" onClick={() => setEntries([])}>
              clear buffer
            </Button>

            <Typography variant="caption" color="text.secondary">Enabled file sources</Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {enabledSources.map((source) => (
                <Chip key={source} size="small" label={source} color="success" />
              ))}
            </Stack>

            <Typography variant="caption" color="text.secondary">Sidecar channels</Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {Object.entries(sidecarState).map(([name, payload]) => (
                <Chip key={name} size="small" label={`${name}:${payload?.available ? 'up' : 'down'}`} color={payload?.available ? 'success' : 'warning'} />
              ))}
            </Stack>
          </Stack>
        </DenseSection>

        <DenseSection title="Unified Stream" subtitle="high-signal table: age + source + event + target + code + latency + summary" colSpan={3} rowSpan={1}>
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25, page: 0 } },
              columns: { columnVisibilityModel: { detail: false, ts: false } },
            }}
            density="compact"
            sx={{ border: 0 }}
          />
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Logs
