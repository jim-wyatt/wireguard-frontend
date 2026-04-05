import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function PublicDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const formatLastUpdated = (value) => {
    if (!value) return 'Unknown'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString()
  }

  useEffect(() => {
    const loadStats = async () => {
      setError('')
      try {
        const response = await clientsApi.getStats()
        setStats(response.data)
      } catch (err) {
        setError(err?.response?.data?.detail || err?.message || 'Failed to load public stats')
      } finally {
        setLoading(false)
      }
    }

    loadStats()
    const interval = setInterval(loadStats, 3000)
    return () => clearInterval(interval)
  }, [])

  const cards = [
    {
      key: 'engagement',
      title: 'ENGAGEMENT RATE',
      value: `${((Number(stats?.connected_clients || 0) / Math.max(Number(stats?.active_clients || 1), 1)) * 100).toFixed(0)}%`,
      hint: `${stats?.connected_clients || 0} connected of ${stats?.active_clients || 0} active nodes`,
      status: Number(stats?.active_clients || 0) === 0 ? 'amber' : (Number(stats?.connected_clients || 0) / Math.max(Number(stats?.active_clients || 1), 1)) >= 0.7 ? 'green' : 'amber',
      importance: 'Shows current participation across enabled identities.',
    },
    {
      key: 'total',
      title: 'TOTAL NODES',
      value: String(stats?.total_clients || 0),
      hint: 'registered peer identities',
      status: 'green',
      importance: 'Represents total managed population across environments.',
    },
    {
      key: 'active',
      title: 'ACTIVE NODES',
      value: String(stats?.active_clients || 0),
      hint: 'eligible to connect now',
      status: Number(stats?.active_clients || 0) > 0 ? 'green' : 'amber',
      importance: 'Measures currently enabled access footprint.',
    },
    {
      key: 'connected',
      title: 'CONNECTED NOW',
      value: String(stats?.connected_clients || 0),
      hint: `updated ${formatLastUpdated(stats?.last_updated)}`,
      status: Number(stats?.connected_clients || 0) > 0 ? 'green' : 'amber',
      importance: 'Near-real-time service adoption and live availability signal.',
    },
    {
      key: 'capacity-gap',
      title: 'CAPACITY GAP',
      value: String(Math.max(Number(stats?.active_clients || 0) - Number(stats?.connected_clients || 0), 0)),
      hint: 'active not currently connected',
      status: Math.max(Number(stats?.active_clients || 0) - Number(stats?.connected_clients || 0), 0) <= 2 ? 'green' : 'amber',
      importance: 'Quantifies currently idle capacity in the active roster.',
    },
    {
      key: 'activation-rate',
      title: 'ACTIVATION RATE',
      value: `${((Number(stats?.active_clients || 0) / Math.max(Number(stats?.total_clients || 1), 1)) * 100).toFixed(0)}%`,
      hint: `${stats?.active_clients || 0} active of ${stats?.total_clients || 0} total`,
      status: Number(stats?.total_clients || 0) === 0 ? 'amber' : (Number(stats?.active_clients || 0) / Math.max(Number(stats?.total_clients || 1), 1)) >= 0.75 ? 'green' : 'amber',
      importance: 'Indicates how much of the registered population is enabled.',
    },
    {
      key: 'public-refresh',
      title: 'REFRESH CADENCE',
      value: '3s',
      hint: `last update ${formatLastUpdated(stats?.last_updated)}`,
      status: 'green',
      importance: 'Fast cadence supports public situational awareness.',
    },
  ]

  if (loading) {
    cards.unshift({
      key: 'load-state',
      title: 'PAGE STATE',
      value: 'LOADING',
      hint: 'refreshing public snapshot',
      status: 'amber',
      importance: 'Public board is collecting latest aggregate metrics.',
    })
  }

  if (error) {
    cards.unshift({
      key: 'error-state',
      title: 'PUBLIC FEED',
      value: 'DEGRADED',
      hint: error,
      status: 'red',
      importance: 'Stats endpoint did not return the expected payload.',
    })
  }

  const routeCards = [
    {
      key: 'route-login',
      title: 'ROUTE LOGIN',
      value: '/login',
      hint: 'operator authentication entry point',
      status: 'amber',
      importance: 'Required for privileged management and download operations.',
    },
    {
      key: 'route-dashboard',
      title: 'ROUTE DASHBOARD',
      value: '/dashboard',
      hint: 'cross-tab command deck',
      status: 'green',
      importance: 'Central operator launch surface for all tabs.',
    },
    {
      key: 'route-logs',
      title: 'ROUTE LOGS',
      value: '/logs',
      hint: 'event stream and table view',
      status: 'green',
      importance: 'Primary table-oriented diagnostics and incident triage.',
    },
    {
      key: 'route-attestation',
      title: 'ROUTE ATTESTATION',
      value: '/attestation',
      hint: 'trust posture card deck',
      status: 'green',
      importance: 'Evidence and remediation confidence monitoring.',
    },
    {
      key: 'route-metrics',
      title: 'ROUTE METRICS',
      value: '/metrics',
      hint: 'runtime telemetry card deck',
      status: 'green',
      importance: 'High-frequency health and trend signal review.',
    },
    {
      key: 'route-operations',
      title: 'ROUTE OPERATIONS',
      value: '/operations',
      hint: 'composite readiness card deck',
      status: 'green',
      importance: 'Unified operational and attestation risk panel.',
    },
  ]

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 3 }}>
      <DenseGrid>
        <DenseSection title="Public Vitals" subtitle={`last update ${formatLastUpdated(stats?.last_updated)}`} colSpan={3} rowSpan={2}>
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

        <DenseSection title="Navigation Cards" subtitle="card-based route jumps" colSpan={3} rowSpan={1}>
          <DenseCards>
            {routeCards.map((card) => (
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

export default PublicDashboard
