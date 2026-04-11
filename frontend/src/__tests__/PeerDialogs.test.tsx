import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CreatePeerDialog from '../components/CreatePeerDialog'
import PeerConfigDialog from '../components/PeerConfigDialog'
import { peersApi } from '../services/api'

vi.mock('../services/api', () => ({
  peersApi: {
    createPeer: vi.fn(),
    getPeerConfig: vi.fn(),
  },
}))

const mockedPeersApi = peersApi as unknown as {
  createPeer: ReturnType<typeof vi.fn>
  getPeerConfig: ReturnType<typeof vi.fn>
}

describe('Peer dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn(),
      },
    })
  })

  it('creates a peer successfully', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    mockedPeersApi.createPeer.mockResolvedValue({})

    render(<CreatePeerDialog open onClose={onClose} onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'peer@example.com' } })
    fireEvent.change(screen.getByLabelText(/Name \(Optional\)/i), { target: { value: 'Peer One' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Peer/i }))

    await waitFor(() => {
      expect(mockedPeersApi.createPeer).toHaveBeenCalledWith({ email: 'peer@example.com', name: 'Peer One' })
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('loads peer config and supports copy', async () => {
    mockedPeersApi.getPeerConfig.mockResolvedValue({
      data: {
        config: '[Interface]\nAddress = 10.0.0.2/32',
        qr_code: 'data:image/png;base64,abc123',
      },
    })

    render(<PeerConfigDialog open onClose={vi.fn()} peerId={7} peerEmail="peer@example.com" />)

    expect(await screen.findByDisplayValue(/Address = 10.0.0.2\/32/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[Interface]\nAddress = 10.0.0.2/32')
    })
  })
})