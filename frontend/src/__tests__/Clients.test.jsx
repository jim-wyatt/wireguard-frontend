import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Clients from '../pages/Clients'
import { clientsApi } from '../services/api'

vi.mock('../services/api', () => ({
  clientsApi: {
    getClients: vi.fn(),
    deleteClient: vi.fn(),
    toggleClientStatus: vi.fn(),
  },
}))

vi.mock('../components/CreateClientDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="create-client-dialog">Create Dialog</div> : null),
}))

vi.mock('../components/ClientConfigDialog', () => ({
  default: ({ open, clientEmail }) =>
    open ? <div data-testid="client-config-dialog">Config Dialog {clientEmail}</div> : null,
}))

vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, columns, loading }) => {
    if (loading) return <div>Loading grid...</div>

    const emailColumn = columns.find((col) => col.field === 'email')
    const actionsColumn = columns.find((col) => col.field === 'actions')

    return (
      <div>
        <div>Rows: {rows.length}</div>
        {rows.map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`}>
            <span>{row[emailColumn.field]}</span>
            <div>{actionsColumn.renderCell({ row })}</div>
          </div>
        ))}
      </div>
    )
  },
}))

describe('Clients page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('loads clients on mount and renders row data', async () => {
    clientsApi.getClients.mockResolvedValue({
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

    render(<Clients />)

    await waitFor(() => {
      expect(clientsApi.getClients).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Rows: 1')).toBeInTheDocument()
  })

  it('deletes a client and shows success message', async () => {
    clientsApi.getClients.mockResolvedValue({
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
    clientsApi.deleteClient.mockResolvedValue({})

    render(<Clients />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByTitle('Delete'))

    await waitFor(() => {
      expect(clientsApi.deleteClient).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('Client deleted successfully')).toBeInTheDocument()
  })

  it('toggles a client and shows status message', async () => {
    clientsApi.getClients.mockResolvedValue({
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
    clientsApi.toggleClientStatus.mockResolvedValue({})

    render(<Clients />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByTitle('Deactivate'))

    await waitFor(() => {
      expect(clientsApi.toggleClientStatus).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('Client status updated')).toBeInTheDocument()
  })

  it('opens create and config dialogs', async () => {
    clientsApi.getClients.mockResolvedValue({
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

    render(<Clients />)

    await screen.findByText('alice@example.com')

    fireEvent.click(screen.getByText('Create Client'))
    expect(screen.getByTestId('create-client-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Download Config'))
    expect(screen.getByTestId('client-config-dialog')).toHaveTextContent('alice@example.com')
  })
})
