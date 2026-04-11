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
import CreateNodeDialog from '../components/CreateNodeDialog'
import NodeConfigDialog from '../components/NodeConfigDialog'
import { clientsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

interface Node {
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

function Nodes() {
  const { isAuthenticated } = useAuth()
  const [clients, setClients] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' })

  const loadClients = useCallback(async () => {
    setLoading(true)
    try {
      const response = await clientsApi.getClients()
      setClients(response.data as Node[])
    } catch {
      showSnackbar('Failed to load nodes', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const showSnackbar = (message: string, severity: SnackbarState['severity'] = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCreateSuccess = () => {
    loadClients()
    showSnackbar('Node created successfully')
  }

  const handleDelete = async (id: number) => {
    if (!isAuthenticated) {
      showSnackbar('Login required for node management actions', 'warning')
      return
    }
    if (!confirm('Are you sure you want to delete this node?')) return

    try {
      await clientsApi.deleteClient(id)
      loadClients()
      showSnackbar('Node deleted successfully')
    } catch {
      showSnackbar('Failed to delete node', 'error')
    }
  }

  const handleToggle = async (id: number) => {
    if (!isAuthenticated) {
      showSnackbar('Login required for node management actions', 'warning')
      return
    }
    try {
      await clientsApi.toggleClientStatus(id)
      loadClients()
      showSnackbar('Node status updated')
    } catch {
      showSnackbar('Failed to update node status', 'error')
    }
  }

  const handleShowConfig = (node: Node) => {
    if (!isAuthenticated) {
      showSnackbar('Login required to download node configuration', 'warning')
      return
    }
    setSelectedNode(node)
    setConfigDialogOpen(true)
  }

  const columns: GridColDef<Node>[] = [
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
      renderCell: (params: GridRenderCellParams<Node>) => params.row?.name || '-',
    },
    {
      field: 'ip_address',
      headerName: 'IP Address',
      flex: 0.6,
      minWidth: 130,
      renderCell: (params: GridRenderCellParams<Node>) => (
        <Chip label={params.value as string} size="small" />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      flex: 0.5,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams<Node>) => (
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
      renderCell: (params: GridRenderCellParams<Node>) => {
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
      renderCell: (params: GridRenderCellParams<Node>) => (
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
      renderCell: (params: GridRenderCellParams<Node>) => (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            size="small"
            onClick={() => handleShowConfig(params.row)}
            title="Download Node Config"
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

  const totalNodes = clients.length
  const activeNodes = clients.filter((node) => node.is_active).length
  const downloadedCount = clients.filter((node) => node.config_downloaded).length
  const inactiveNodes = Math.max(totalNodes - activeNodes, 0)
  const undownloadedCount = Math.max(totalNodes - downloadedCount, 0)
  const namedCount = clients.filter((node) => Boolean(node.name)).length
  const recent24hCount = clients.filter((node) => {
    const created = new Date(node.created_at || '')
    if (Number.isNaN(created.getTime())) return false
    return Date.now() - created.getTime() <= 24 * 60 * 60 * 1000
  }).length
  const activeRatio = totalNodes > 0 ? (activeNodes / totalNodes) * 100 : 0
  const adoptionRatio = totalNodes > 0 ? (downloadedCount / totalNodes) * 100 : 0

  const summaryCards: CardItem[] = [
    {
      key: 'total',
      title: 'TOTAL RECORDS',
      value: String(totalNodes),
      hint: `active ${activeNodes} | inactive ${inactiveNodes}`,
      status: 'green',
      importance: 'Defines current node inventory and management footprint.',
    },
    {
      key: 'active-ratio',
      title: 'ACTIVE RATIO',
      value: `${activeRatio.toFixed(0)}%`,
      hint: `${activeNodes}/${totalNodes || 1} active`,
      status: activeRatio >= 75 ? 'green' : activeRatio >= 50 ? 'amber' : 'red',
      importance: 'Shows how much of the registry is currently enabled for secure exchange.',
    },
    {
      key: 'downloaded',
      title: 'CONFIG ADOPTION',
      value: `${downloadedCount}/${totalNodes || 1}`,
      hint: 'node configs downloaded at least once',
      status: totalNodes === 0 ? 'amber' : downloadedCount === totalNodes ? 'green' : 'amber',
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
      value: `${namedCount}/${totalNodes || 1}`,
      hint: `${Math.max(totalNodes - namedCount, 0)} unnamed records`,
      status: namedCount === totalNodes ? 'green' : 'amber',
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
      <Typography variant="h4" gutterBottom>Nodes Grid :: [identity control] (o_o)</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Dense node registry | one source of truth for provisioning and lifecycle actions
      </Typography>

      {!isAuthenticated && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Read-only mode is active. Login to create, modify, or download node configurations.
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
              Create Node
            </Button>
            <Typography variant="caption" color="text.secondary">
              Use row action icons to download config, toggle status, or delete a node.
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip size="small" label={`records:${totalNodes}`} color="default" />
              <Chip size="small" label={`active:${activeNodes}`} color="success" />
              <Chip size="small" label={`downloaded:${downloadedCount}`} color="info" />
            </Stack>
          </Stack>
        </DenseSection>

        <DenseSection title="Node Registry" subtitle="dense operator table" colSpan={3} rowSpan={1}>
          <DataGrid
            autoHeight
            rows={clients}
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

      <CreateNodeDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <NodeConfigDialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        nodeId={selectedNode?.id}
        nodeEmail={selectedNode?.email}
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

export default Nodes
