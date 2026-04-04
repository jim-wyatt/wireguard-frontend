import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  Chip,
  Alert,
  Snackbar,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import ToggleOffIcon from '@mui/icons-material/ToggleOff'
import ToggleOnIcon from '@mui/icons-material/ToggleOn'
import CreateClientDialog from '../components/CreateClientDialog'
import ClientConfigDialog from '../components/ClientConfigDialog'
import { clientsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

function Clients() {
  const { isAuthenticated } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' })

  const loadClients = useCallback(async () => {
    setLoading(true)
    try {
      const response = await clientsApi.getClients()
      setClients(response.data)
    } catch {
      showSnackbar('Failed to load clients', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCreateSuccess = () => {
    loadClients()
    showSnackbar('Client created successfully')
  }

  const handleDelete = async (id) => {
    if (!isAuthenticated) {
      showSnackbar('Login required for client management actions', 'warning')
      return
    }
    if (!confirm('Are you sure you want to delete this client?')) return

    try {
      await clientsApi.deleteClient(id)
      loadClients()
      showSnackbar('Client deleted successfully')
    } catch {
      showSnackbar('Failed to delete client', 'error')
    }
  }

  const handleToggle = async (id) => {
    if (!isAuthenticated) {
      showSnackbar('Login required for client management actions', 'warning')
      return
    }
    try {
      await clientsApi.toggleClientStatus(id)
      loadClients()
      showSnackbar('Client status updated')
    } catch {
      showSnackbar('Failed to update client status', 'error')
    }
  }

  const handleShowConfig = (client) => {
    if (!isAuthenticated) {
      showSnackbar('Login required to download client configuration', 'warning')
      return
    }
    setSelectedClient(client)
    setConfigDialogOpen(true)
  }

  const columns = [
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
      renderCell: (params) => params.row?.name || '-',
    },
    {
      field: 'ip_address',
      headerName: 'IP Address',
      flex: 0.6,
      minWidth: 130,
      renderCell: (params) => (
        <Chip label={params.value} size="small" />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      flex: 0.5,
      minWidth: 100,
      renderCell: (params) => (
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
      renderCell: (params) => {
        const createdAt = params.row?.created_at
        if (!createdAt) return '-'
        const parsed = new Date(createdAt)
        return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString()
      },
    },
    {
      field: 'config_downloaded',
      headerName: 'Downloaded',
      flex: 0.5,
      minWidth: 110,
      renderCell: (params) => (
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
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={() => handleShowConfig(params.row)}
            title="Download Config"
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Clients
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!isAuthenticated}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Client
        </Button>
      </Box>

      {!isAuthenticated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Public mode: client identities are redacted. Login is required to create, modify, or download client configurations.
        </Alert>
      )}

      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={clients}
          columns={columns}
          loading={loading}
          initialState={{
            pagination: { paginationModel: { pageSize: 10, page: 0 } },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          sx={{
            border: 0,
            '& .MuiDataGrid-cell:focus': {
              outline: 'none',
            },
          }}
        />
      </Paper>

      <CreateClientDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <ClientConfigDialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        clientId={selectedClient?.id}
        clientEmail={selectedClient?.email}
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

export default Clients
