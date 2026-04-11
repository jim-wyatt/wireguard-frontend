import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Peers from '../pages/Peers'
import { peersApi } from '../services/api'

vi.mock('../services/api', () => ({
  peersApi: {
    getPeers: vi.fn(),
    deletePeer: vi.fn(),
    togglePeerStatus: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

vi.mock('../components/CreatePeerDialog', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-client-dialog">Create Dialog</div> : null,
}))

vi.mock('../components/PeerConfigDialog', () => ({
  default: ({ open, peerEmail }: { open: boolean; peerEmail?: string }) =>
    open ? <div data-testid="client-config-dialog">Config Dialog {peerEmail}</div> : null,
}))

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, columns, loading }: { rows: Record<string, unknown>[]; columns: { field: string; renderCell?: (p: { row: unknown }) => unknown }[]; loading: boolean }) => {
    if (loading) return <div>Loading grid...</div>

    const emailColumn = columns.find((col) => col.field === 'email')!
    const actionsColumn = columns.find((col) => col.field === 'actions')!

    return (
      <div>
        <div>Rows: {rows.length}</div>
        {rows.map((row) => (
          <div key={String(row.id)} data-testid={`row-${row.id}`}>
            <span>{String(row[emailColumn.field])}</span>
            <div>{actionsColumn.renderCell?.({ row }) as React.ReactNode}</div>
          </div>
        ))}
      </div>
    )
  },
}))

const mockedPeersApi = peersApi as unknown as {
  getPeers: ReturnType<typeof vi.fn>
  deletePeer: ReturnType<typeof vi.fn>
  togglePeerStatus: ReturnType<typeof vi.fn>
}

describe('Peers page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('loads peers on mount and renders row data', async () => {
    mockedPeersApi.getPeers.mockResolvedValue({
      data: [
        {
          id: 1,
          email: 'alice@example.com',
          name: 'Alice',
          ip_address: '10.0.0.2',
          is_active: true,
          created_at: '2026-04-04T10:00:00Z',
          config_downloaded: false,
        },
      ],
    })

    render(<Peers />)

    await waitFor(() => {
      expect(mockedPeersApi.getPeers).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Rows: 1')).toBeInTheDocument()
  })

  it('deletes a peer and shows success message', async () => {
    mockedPeersApi.getPeers.mockResolvedValue({
      data: [
        {
          id: 1,
          email: 'alice@example.com',
          name: 'Alice',
          ip_address: '10.0.0.2',
          is_active: true,
          created_at: '2026-04-04T10:00:00Z',
          config_downloaded: false,
        },
      ],
    })
    mockedPeersApi.deletePeer.mockResolvedValue({})

    render(<Peers />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByTitle('Delete'))

    await waitFor(() => {
      expect(mockedPeersApi.deletePeer).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('Peer deleted successfully')).toBeInTheDocument()
  })

  it('toggles a peer and shows status message', async () => {
    mockedPeersApi.getPeers.mockResolvedValue({
      data: [
        {
          id: 1,
          email: 'alice@example.com',
          name: 'Alice',
          ip_address: '10.0.0.2',
          is_active: true,
          created_at: '2026-04-04T10:00:00Z',
          config_downloaded: false,
        },
      ],
    })
    mockedPeersApi.togglePeerStatus.mockResolvedValue({})

    render(<Peers />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByTitle('Deactivate'))

    await waitFor(() => {
      expect(mockedPeersApi.togglePeerStatus).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('Peer status updated')).toBeInTheDocument()
  })

  it('opens create and config dialogs', async () => {
    mockedPeersApi.getPeers.mockResolvedValue({
      data: [
        {
          id: 1,
          email: 'alice@example.com',
          name: 'Alice',
          ip_address: '10.0.0.2',
          is_active: true,
          created_at: '2026-04-04T10:00:00Z',
          config_downloaded: false,
        },
      ],
    })

    render(<Peers />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByText('Create Peer'))
    expect(screen.getByTestId('create-client-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Download Peer Config'))
    expect(screen.getByTestId('client-config-dialog')).toHaveTextContent('alice@example.com')
  })
})
