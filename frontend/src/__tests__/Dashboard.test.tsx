import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'
import { clientsApi } from '../services/api'

vi.mock('../services/api', () => ({
  clientsApi: {
    getStats: vi.fn(),
    getMetricsSummary: vi.fn(),
    getAttestationSummary: vi.fn(),
    streamCaddyAccessLog: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockedClientsApi = clientsApi as unknown as {
  getStats: ReturnType<typeof vi.fn>
  getMetricsSummary: ReturnType<typeof vi.fn>
  getAttestationSummary: ReturnType<typeof vi.fn>
  streamCaddyAccessLog: ReturnType<typeof vi.fn>
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cross-tab summary cards', async () => {
    mockedClientsApi.getStats.mockResolvedValue({
      data: {
        total_clients: 8,
        active_clients: 5,
        connected_clients: 2,
      },
    })

    mockedClientsApi.getMetricsSummary.mockResolvedValue({
      data: {
        runtime: {
          backend: { error_rate_percent: 0.5, p95_latency_ms: 120 },
          wireguard: { is_up: true },
        },
        source_probes: [
          { id: 'p1', available: true },
          { id: 'p2', available: true },
        ],
      },
    })

    mockedClientsApi.getAttestationSummary.mockResolvedValue({
      data: {
        security: {
          remediation: {
            actionable: { critical: 0, high: 1 },
          },
        },
      },
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockedClientsApi.getStats).toHaveBeenCalledTimes(1)
      expect(mockedClientsApi.getMetricsSummary).toHaveBeenCalledTimes(1)
      expect(mockedClientsApi.getAttestationSummary).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText(/Mission Gate/)).toBeInTheDocument()
    expect(screen.getByText(/NODES TAB/)).toBeInTheDocument()
    expect(screen.getByText(/LOGS TAB/)).toBeInTheDocument()
    expect(screen.getAllByText(/ATTESTATION TAB/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/METRICS TAB/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/OPERATIONS TAB/).length).toBeGreaterThan(0)
  })

  it('still renders cards when values are zero', async () => {
    mockedClientsApi.getStats.mockResolvedValue({
      data: {
        total_clients: 0,
        active_clients: 0,
        connected_clients: 0,
      },
    })
    mockedClientsApi.getMetricsSummary.mockResolvedValue({
      data: {
        runtime: {
          backend: { error_rate_percent: 0, p95_latency_ms: 0 },
          wireguard: { is_up: false },
        },
        source_probes: [],
      },
    })
    mockedClientsApi.getAttestationSummary.mockResolvedValue({
      data: {
        security: {
          remediation: {
            actionable: { critical: 0, high: 0 },
          },
        },
      },
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(await screen.findByText(/NODES TAB/)).toBeInTheDocument()
  })
})
