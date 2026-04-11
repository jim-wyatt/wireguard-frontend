import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login'
import PublicDashboard from '../pages/PublicDashboard'
import { peersApi } from '../services/api'

const navigateMock = vi.fn()
const loginMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: { from: '/peers' } }),
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: loginMock, isAuthenticated: false }),
}))

vi.mock('../services/api', () => ({
  peersApi: {
    getStats: vi.fn(),
  },
}))

const mockedPeersApi = peersApi as unknown as {
  getStats: ReturnType<typeof vi.fn>
}

describe('Login and public dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('authenticates against the peers endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/API Token/i), { target: { value: 'secret-token' } })
    fireEvent.click(screen.getByRole('button', { name: /Authenticate/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/peers?limit=1', {
        headers: {
          Authorization: 'Bearer secret-token',
        },
      })
      expect(loginMock).toHaveBeenCalledWith('secret-token')
      expect(navigateMock).toHaveBeenCalledWith('/peers', { replace: true })
    })
  })

  it('renders public peer stats', async () => {
    mockedPeersApi.getStats.mockResolvedValue({
      data: {
        total_clients: 10,
        active_clients: 8,
        connected_clients: 6,
        last_updated: '2026-04-11T12:00:00Z',
      },
    })

    render(
      <MemoryRouter>
        <PublicDashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/TOTAL PEERS/)).toBeInTheDocument()
    expect(screen.getByText(/ACTIVE PEERS/)).toBeInTheDocument()
    expect(screen.getByText(/CONNECTED NOW/)).toBeInTheDocument()
  })
})