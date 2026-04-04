import { render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../pages/Dashboard'
import { clientsApi } from '../services/api'

vi.mock('../services/api', () => ({
  clientsApi: {
    getStats: vi.fn(),
    getConnectedClients: vi.fn(),
  },
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders stats and connected clients', async () => {
    clientsApi.getStats.mockResolvedValue({
      data: {
        total_clients: 8,
        active_clients: 5,
        connected_clients: 2,
      },
    })

    clientsApi.getConnectedClients.mockResolvedValue({
      data: [
        {
          id: 1,
          email: 'alice@example.com',
          name: 'Alice',
          ip_address: '10.0.0.2',
          last_handshake: '2026-04-04T10:00:00Z',
          transfer_rx: 2048,
          transfer_tx: 4096,
        },
      ],
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(clientsApi.getStats).toHaveBeenCalledTimes(1)
      expect(clientsApi.getConnectedClients).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByText('4 KB')).toBeInTheDocument()
  })

  it('shows empty-state message when no clients are connected', async () => {
    clientsApi.getStats.mockResolvedValue({
      data: {
        total_clients: 0,
        active_clients: 0,
        connected_clients: 0,
      },
    })
    clientsApi.getConnectedClients.mockResolvedValue({ data: [] })

    render(<Dashboard />)

    expect(await screen.findByText('No clients currently connected')).toBeInTheDocument()
  })
})
