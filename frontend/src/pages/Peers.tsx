import { useState, useEffect, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Snackbar,
  Typography,
} from '@mui/material'
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import ToggleOffIcon from '@mui/icons-material/ToggleOff'
import ToggleOnIcon from '@mui/icons-material/ToggleOn'
import CreatePeerDialog from '../components/CreatePeerDialog'
import PeerConfigDialog from '../components/PeerConfigDialog'
import { peersApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

interface Peer {
  id: number
  email: string
  name?: string
  ip_address: string
  is_active: boolean
  created_at?: string
  config_downloaded: boolean
}

interface CardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance: string
}

interface SnackbarState {
  open: boolean
  message: string
  severity: 'success' | 'error' | 'warning' | 'info'
}

function Peers() {
  const { isAuthenticated } = useAuth()
  const [peers, setPeers] = useState<Peer[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null)
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' })

  const loadPeers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await peersApi.getPeers()
      setPeers(response.data as Peer[])
    } catch {
      showSnackbar('Failed to load peers', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPeers()
  }, [loadPeers])

  const showSnackbar = (message: string, severity: SnackbarState['severity'] = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCreateSuccess = () => {
    loadPeers()
    showSnackbar('Peer created successfully')
  }

  const handleDelete = async (id: number) => {
    if (!isAuthenticated) {
      showSnackbar('Login required for peer management actions', 'warning')
      return
    }
    if (!confirm('Are you sure you want to delete this peer?')) return

    try {
      await peersApi.deletePeer(id)
      loadPeers()
      showSnackbar('Peer deleted successfully')
    } catch {
      showSnackbar('Failed to delete peer', 'error')
    }
  }

  const handleToggle = async (id: number) => {
    if (!isAuthenticated) {
      showSnackbar('Login required for peer management actions', 'warning')
      return
    }
    try {
      await peersApi.togglePeerStatus(id)
      loadPeers()
      showSnackbar('Peer status updated')
    } catch {
      showSnackbar('Failed to update peer status', 'error')
    }
  }

  const handleShowConfig = (peer: Peer) => {
    if (!isAuthenticated) {
      showSnackbar('Login required to download peer configuration', 'warning')
      return
    }
    setSelectedPeer(peer)
    setConfigDialogOpen(true)
  }

  const columns: GridColDef<Peer>[] = [
    {
      field: 'email',
      headerName: 'Email',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'name',
      headerName: 'Name',
      flex: 0.7,
      minWidth: 150,
      renderCell: (params: GridRenderCellParams<Peer>) => params.row?.name || '-',
    },
    {
      field: 'ip_address',
      headerName: 'IP Address',
      flex: 0.6,
      minWidth: 130,
      renderCell: (params: GridRenderCellParams<Peer>) => (
        <Chip label={params.value as string} size="small" />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      flex: 0.5,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams<Peer>) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Created',
      flex: 0.7,
      minWidth: 180,
      renderCell: (params: GridRenderCellParams<Peer>) => {
        const createdAt = params.row?.created_at
        if (!createdAt) return '-'
        const parsed = new Date(createdAt)
        return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString()
      },
    },
    {
      field: 'config_downloaded',
      headerName: 'Config Downloaded',
      flex: 0.5,
      minWidth: 110,
      renderCell: (params: GridRenderCellParams<Peer>) => (
        <Chip
          label={params.value ? 'Yes' : 'No'}
          color={params.value ? 'info' : 'default'}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 0.7,
      minWidth: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams<Peer>) => (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            size="small"
            onClick={() => handleShowConfig(params.row)}
            title="Download Peer Config"
            disabled={!isAuthenticated}
          >
            <DownloadIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleToggle(params.row.id)}
            title={params.row.is_active ? 'Deactivate' : 'Activate'}
            disabled={!isAuthenticated}
          >
            {params.row.is_active ? <ToggleOnIcon color="success" /> : <ToggleOffIcon />}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleDelete(params.row.id)}
            title="Delete"
            color="error"
            disabled={!isAuthenticated}
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ),
    },
  ]

  const totalPeers = peers.length
  const activePeers = peers.filter((peer) => peer.is_active).length
  const downloadedCount = peers.filter((peer) => peer.config_downloaded).length
  const inactivePeers = Math.max(totalPeers - activePeers, 0)
  const undownloadedCount = Math.max(totalPeers - downloadedCount, 0)
  const namedCount = peers.filter((peer) => Boolean(peer.name)).length
  const recent24hCount = peers.filter((peer) => {
    const created = new Date(peer.created_at || '')
    if (Number.isNaN(created.getTime())) return false
    return Date.now() - created.getTime() <= 24 * 60 * 60 * 1000
  }).length
  const activeRatio = totalPeers > 0 ? (activePeers / totalPeers) * 100 : 0
  const adoptionRatio = totalPeers > 0 ? (downloadedCount / totalPeers) * 100 : 0

  const summaryCards: CardItem[] = [
    {
      key: 'total',
      title: 'TOTAL RECORDS',
      value: String(totalPeers),
      hint: `active ${activePeers} | inactive ${inactivePeers}`,
      status: 'green',
      importance: 'Defines current peer inventory and management footprint.',
    },
    {
      key: 'active-ratio',
      title: 'ACTIVE RATIO',
      value: `${activeRatio.toFixed(0)}%`,
      hint: `${activePeers}/${totalPeers || 1} active`,
      status: activeRatio >= 75 ? 'green' : activeRatio >= 50 ? 'amber' : 'red',
      importance: 'Shows how much of the registry is currently enabled for secure exchange.',
    },
    {
      key: 'downloaded',
      title: 'CONFIG ADOPTION',
      value: `${downloadedCount}/${totalPeers || 1}`,
      hint: 'peer configs downloaded at least once',
      status: totalPeers === 0 ? 'amber' : downloadedCount === totalPeers ? 'green' : 'amber',
      importance: 'Adoption indicates whether provisioned peers are likely usable by operators.',
    },
    {
      key: 'adoption-ratio',
      title: 'ADOPTION RATIO',
      value: `${adoptionRatio.toFixed(0)}%`,
      hint: `${undownloadedCount} not yet downloaded`,
      status: adoptionRatio >= 80 ? 'green' : adoptionRatio >= 50 ? 'amber' : 'red',
      importance: 'Highlights deployment lag between provisioning and real user onboarding.',
    },
    {
      key: 'named',
      title: 'NAMED PROFILES',
      value: `${namedCount}/${totalPeers || 1}`,
      hint: `${Math.max(totalPeers - namedCount, 0)} unnamed records`,
      status: namedCount === totalPeers ? 'green' : 'amber',
      importance: 'Readable identity labels reduce operator mistakes during incident response.',
    },
    {
      key: 'recent',
      title: 'NEW IN 24H',
      value: String(recent24hCount),
      hint: 'recent provisioning velocity',
      status: recent24hCount > 0 ? 'green' : 'amber',
      importance: 'Recent growth hints at onboarding waves and support load.',
    },
    {
      key: 'mode',
      title: 'CONTROL MODE',
      value: isAuthenticated ? 'WRITER ENABLED' : 'READ-ONLY',
      hint: isAuthenticated ? 'create / toggle / delete unlocked' : 'login required for management actions',
      status: isAuthenticated ? 'green' : 'amber',
      importance: 'Explicit privilege display prevents accidental operator confusion.',
    },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Peers Grid :: [identity control] (o_o)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Dense peer registry | one source of truth for provisioning and lifecycle actions
      </Typography>

      {!isAuthenticated && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Read-only mode is active. Login to create, modify, or download peer configurations.
        </Alert>
      )}

      <DenseGrid>
        <DenseSection title="Registry Vitals" subtitle="expanded card telemetry without duplicating table rows" colSpan={3} rowSpan={1}>
          <DenseCards>
            {summaryCards.map((card) => (
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

        <DenseSection title="Actions" subtitle="operator controls" colSpan={3} rowSpan={1}>
          <Stack spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!isAuthenticated}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Peer
            </Button>
            <Typography variant="caption" color="text.secondary">
              Use row action icons to download config, toggle status, or delete a peer.
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip size="small" label={`records:${totalPeers}`} color="default" />
              <Chip size="small" label={`active:${activePeers}`} color="success" />
              <Chip size="small" label={`downloaded:${downloadedCount}`} color="info" />
            </Stack>
          </Stack>
        </DenseSection>

        <DenseSection title="Peer Registry" subtitle="dense operator table" colSpan={3} rowSpan={1}>
          <DataGrid
            autoHeight
            rows={peers}
            columns={columns}
            loading={loading}
            initialState={{
              pagination: { paginationModel: { pageSize: 10, page: 0 } },
            }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            density="compact"
            sx={{
              border: 0,
              '& .MuiDataGrid-cell:focus': {
                outline: 'none',
              },
            }}
          />
        </DenseSection>
      </DenseGrid>

      <CreatePeerDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <PeerConfigDialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        peerId={selectedPeer?.id}
        peerEmail={selectedPeer?.email}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default Peers
