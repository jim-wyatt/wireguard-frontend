import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

const FILE_SOURCES = ['caddy', 'app', 'system']

function parseLine(line, source) {
  const now = new Date()
  if (source === 'caddy') {
    try {
      const parsed = JSON.parse(line)
      const req = parsed?.request || {}
      const statusCode = Number(parsed?.status || 0)
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'ok'
      return {
        id: `${source}-${parsed?.ts || now.getTime()}-${Math.random()}`,
        ts: typeof parsed?.ts === 'number' ? new Date(parsed.ts * 1000).toLocaleTimeString() : now.toLocaleTimeString(),
        level,
        source,
        summary: `${req?.method || '-'} ${req?.uri || '-'} (${statusCode || '-'})`,
        detail: line,
      }
    } catch {
      // Fallback to plain parsing below.
    }
  }

  const lowered = String(line).toLowerCase()
  const level = lowered.includes('error') ? 'error' : lowered.includes('warn') ? 'warn' : 'info'
  return {
    id: `${source}-${now.getTime()}-${Math.random()}`,
    ts: now.toLocaleTimeString(),
    level,
    source,
    summary: String(line).slice(0, 170),
    detail: String(line),
  }
}

function ragFromHealth(ok) {
  return ok ? 'green' : 'red'
}

function levelChip(level) {
  if (level === 'error') return { label: 'ERR', color: 'error' }
  if (level === 'warn') return { label: 'WARN', color: 'warning' }
  if (level === 'ok') return { label: 'OK', color: 'success' }
  return { label: 'INFO', color: 'default' }
}

function Logs() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [streamError, setStreamError] = useState('')
  const [enabledSources, setEnabledSources] = useState(FILE_SOURCES)
  const [filterSource, setFilterSource] = useState('all')
  const [query, setQuery] = useState('')
  const [sidecarState, setSidecarState] = useState({})
  const lastSidecarRef = useRef({})
  const recentSourceLinesRef = useRef({})

  const pushEntry = (entry) => {
    setEntries((prev) => {
      const next = [entry, ...prev]
      return next.length > 1000 ? next.slice(0, 1000) : next
    })
  }

  const shouldEmitSourceLine = (source, rawLine) => {
    const maxCache = 400
    const cache = recentSourceLinesRef.current[source] || { queue: [], set: new Set() }
    if (cache.set.has(rawLine)) {
      return false
    }
    cache.queue.push(rawLine)
    cache.set.add(rawLine)
    while (cache.queue.length > maxCache) {
      const dropped = cache.queue.shift()
      cache.set.delete(dropped)
    }
    recentSourceLinesRef.current[source] = cache
    return true
  }

  useEffect(() => {
    let active = true
    const controllers = []
    const inFlight = new Set()
    let pollTimer = null

    const pollSource = async (source) => {
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
      } catch (err) {
        if (!active || controller.signal.aborted) return
        setStreamError((prev) => `${prev}${prev ? ' | ' : ''}${source}: ${err?.message || 'stream failed'}`)
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
        const availableMap = attestation?.data?.log_sources || {}
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
    const onKeydown = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
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

        const sidecars = metrics?.data?.runtime?.sidecars || {}
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

          // Always emit periodic sidecar snapshots so unified logs include sidecar feeds continuously.
          pushEntry({
            id: `sidecar-snapshot-${name}-${Date.now()}-${Math.random()}`,
            ts: new Date().toLocaleTimeString(),
            level: nowHealthy ? 'info' : 'warn',
            source: `sidecar:${name}`,
            summary: `${name} snapshot metric=${String(keyMetric)}`,
            detail,
          })

          if (prevHealthy === undefined || prevHealthy !== nowHealthy) {
            pushEntry({
              id: `sidecar-${name}-${Date.now()}-${Math.random()}`,
              ts: new Date().toLocaleTimeString(),
              level: nowHealthy ? 'ok' : 'warn',
              source: `sidecar:${name}`,
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
    const counts = { error: 0, warn: 0, ok: 0, info: 0 }
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
    source: entry.source,
    level: entry.level,
    summary: entry.summary,
    detail: entry.detail,
  }))

  const columns = [
    { field: 'ts', headerName: 'Time', flex: 0.45, minWidth: 100 },
    { field: 'source', headerName: 'Source', flex: 0.65, minWidth: 150 },
    {
      field: 'level',
      headerName: 'Level',
      flex: 0.35,
      minWidth: 105,
      renderCell: (params) => {
        const cfg = levelChip(params.value)
        return <Chip size="small" label={cfg.label} color={cfg.color} />
      },
    },
    { field: 'summary', headerName: 'Summary', flex: 1.0, minWidth: 220 },
    { field: 'detail', headerName: 'Detail', flex: 1.3, minWidth: 300 },
  ]

  const sourceCoverageTotal = enabledSources.length + Object.keys(sidecarState).length
  const sourceCoverageLive = enabledSources.length + Object.values(sidecarState).filter((value) => value?.available).length

  const topCards = [
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

        <DenseSection title="Unified Stream" subtitle="all sources in one feed | sidecar transitions included" colSpan={2} rowSpan={2}>
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
            density="compact"
            sx={{ border: 0 }}
          />
        </DenseSection>

        <DenseSection title="Controls" subtitle="source filters and quick ops | command-post panel" colSpan={1} rowSpan={2}>
          <Stack spacing={1}>
            <TextField
              id="logs-filter-query"
              size="small"
              label="query (/ to focus)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
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
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
              {enabledSources.map((source) => (
                <Chip key={source} size="small" label={source} color="success" />
              ))}
            </Stack>

            <Typography variant="caption" color="text.secondary">Sidecar channels</Typography>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
              {Object.entries(sidecarState).map(([name, payload]) => (
                <Chip key={name} size="small" label={`${name}:${payload?.available ? 'up' : 'down'}`} color={payload?.available ? 'success' : 'warning'} />
              ))}
            </Stack>
          </Stack>
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Logs
