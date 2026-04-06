import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { clientsApi } from '../services/api'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

interface NodeStats {
  total_clients?: number
  active_clients?: number
  connected_clients?: number
  last_updated?: string
}

interface CardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance: string
}

function PublicDashboard() {
  const [stats, setStats] = useState<NodeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const formatLastUpdated = (value?: string): string => {
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
        setStats(response.data as NodeStats)
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string }
        setError(e?.response?.data?.detail || e?.message || 'Failed to load public stats')
      } finally {
        setLoading(false)
      }
    }

    loadStats()
    const interval = setInterval(loadStats, 3000)
    return () => clearInterval(interval)
  }, [])

  const cards: CardItem[] = [
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
      importance: 'Initial data load in progress.',
    })
  }

  if (error) {
    cards.unshift({
      key: 'error-state',
      title: 'DATA PIPELINE',
      value: 'DEGRADED',
      hint: error,
      status: 'red',
      importance: 'Public stats endpoint returned an error.',
    })
  }

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 3 }}>
      <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, mb: 1.5 }}>
        Public overview is visible to everyone.
      </Typography>

      <DenseGrid>
        <DenseSection title="Public Network Status" subtitle="live node participation — no auth required" colSpan={3} rowSpan={3}>
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
      </DenseGrid>
    </Box>
  )
}

export default PublicDashboard
