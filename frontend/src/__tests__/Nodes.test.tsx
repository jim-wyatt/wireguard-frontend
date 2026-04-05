import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Nodes from '../pages/Nodes'
import { clientsApi } from '../services/api'

vi.mock('../services/api', () => ({
  clientsApi: {
    getClients: vi.fn(),
    deleteClient: vi.fn(),
    toggleClientStatus: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

vi.mock('../components/CreateNodeDialog', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-client-dialog">Create Dialog</div> : null,
}))

vi.mock('../components/NodeConfigDialog', () => ({
  default: ({ open, nodeEmail }: { open: boolean; nodeEmail?: string }) =>
    open ? <div data-testid="client-config-dialog">Config Dialog {nodeEmail}</div> : null,
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

const mockedClientsApi = clientsApi as unknown as {
  getClients: ReturnType<typeof vi.fn>
  deleteClient: ReturnType<typeof vi.fn>
  toggleClientStatus: ReturnType<typeof vi.fn>
}

describe('Nodes page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('loads nodes on mount and renders row data', async () => {
    mockedClientsApi.getClients.mockResolvedValue({
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

    render(<Nodes />)

    await waitFor(() => {
      expect(mockedClientsApi.getClients).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Rows: 1')).toBeInTheDocument()
  })

  it('deletes a node and shows success message', async () => {
    mockedClientsApi.getClients.mockResolvedValue({
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
    mockedClientsApi.deleteClient.mockResolvedValue({})

    render(<Nodes />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByTitle('Delete'))

    await waitFor(() => {
      expect(mockedClientsApi.deleteClient).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('Node deleted successfully')).toBeInTheDocument()
  })

  it('toggles a node and shows status message', async () => {
    mockedClientsApi.getClients.mockResolvedValue({
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
    mockedClientsApi.toggleClientStatus.mockResolvedValue({})

    render(<Nodes />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByTitle('Deactivate'))

    await waitFor(() => {
      expect(mockedClientsApi.toggleClientStatus).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('Node status updated')).toBeInTheDocument()
  })

  it('opens create and config dialogs', async () => {
    mockedClientsApi.getClients.mockResolvedValue({
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

    render(<Nodes />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByText('Create Node'))
    expect(screen.getByTestId('create-client-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Download Node Config'))
    expect(screen.getByTestId('client-config-dialog')).toHaveTextContent('alice@example.com')
  })
})
