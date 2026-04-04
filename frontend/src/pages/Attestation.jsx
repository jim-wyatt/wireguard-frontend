import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import SecurityIcon from '@mui/icons-material/Security'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import BuildCircleIcon from '@mui/icons-material/BuildCircle'
import CloudQueueIcon from '@mui/icons-material/CloudQueue'
import MemoryIcon from '@mui/icons-material/Memory'
import DnsIcon from '@mui/icons-material/Dns'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import VpnLockIcon from '@mui/icons-material/VpnLock'
import { clientsApi } from '../services/api'

function scoreFromTotals(totals) {
  const high = totals?.high || 0
  const critical = totals?.critical || 0
  const penalty = Math.min(95, critical * 20 + high * 5)
  return Math.max(0, 100 - penalty)
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '-'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** index)
  return `${Math.round(value * 100) / 100} ${units[index]}`
}

function postureColor(posture) {
  if (posture === 'critical') return 'error'
  if (posture === 'warning') return 'warning'
  if (posture === 'healthy') return 'success'
  return 'default'
}

function Attestation() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await clientsApi.getAttestationSummary()
        if (isMounted) setData(response.data)
      } catch (err) {
        if (isMounted) {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load attestation data')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [])

  const totals = data?.security?.totals || {}
  const score = scoreFromTotals(totals)
  const evidence = data?.evidence || {}
  const assetRows = data?.security?.assets || []
  const cloudProvider = data?.cloud?.provider || 'local'

  const assetColumns = [
    {
      field: 'name',
      headerName: 'Asset',
      flex: 1,
      minWidth: 140,
      renderCell: (params) => <Chip label={params.value} size="small" variant="outlined" />,
    },
    {
      field: 'posture',
      headerName: 'Posture',
      flex: 0.8,
      minWidth: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={postureColor(params.value)}
          size="small"
        />
      ),
    },
    { field: 'vulnerabilities', headerName: 'Vulns', type: 'number', flex: 0.6, minWidth: 90 },
    { field: 'high', headerName: 'High', type: 'number', flex: 0.6, minWidth: 90 },
    { field: 'critical', headerName: 'Critical', type: 'number', flex: 0.7, minWidth: 100 },
    { field: 'sbom_components', headerName: 'SBOM Components', type: 'number', flex: 0.9, minWidth: 150 },
    {
      field: 'evidence',
      headerName: 'Evidence',
      flex: 1,
      minWidth: 170,
      sortable: false,
      renderCell: (params) => {
        const value = (params.row.scan_present ? 50 : 0) + (params.row.sbom_present ? 50 : 0)
        return (
          <Box sx={{ width: '100%' }}>
            <LinearProgress variant="determinate" value={value} sx={{ mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              {value === 100 ? 'scan + sbom' : value === 50 ? 'partial' : 'missing'}
            </Typography>
          </Box>
        )
      },
    },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Attestation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Live operational narrative across the application, container supply chain, host runtime, and cloud context.
      </Typography>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <SecurityIcon color="primary" />
                <Typography variant="subtitle2">Security Score</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress variant="determinate" value={score} />
                <Typography variant="h5">{score}</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <FactCheckIcon color="success" />
                <Typography variant="subtitle2">Evidence Coverage</Typography>
              </Stack>
              <Typography variant="h5">{evidence?.combined?.percent || 0}%</Typography>
              <Typography variant="body2" color="text.secondary">
                {evidence?.combined?.available || 0}/{evidence?.combined?.total || 0} artifacts present
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Inventory2Icon color="info" />
                <Typography variant="subtitle2">Assets Tracked</Typography>
              </Stack>
              <Typography variant="h5">{assetRows.length}</Typography>
              <Typography variant="body2" color="text.secondary">
                backend, caddy, postgres evidence correlated
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <VpnLockIcon color="primary" />
                <Typography variant="subtitle2">WireGuard Peers</Typography>
              </Stack>
              <Typography variant="h5">{data?.wireguard?.connected_peers || 0}</Typography>
              <Typography variant="body2" color="text.secondary">
                {data?.wireguard?.configured_peers || 0} configured on {data?.wireguard?.interface || 'wg'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Inventory2Icon color="primary" />
              <Typography variant="h6">Asset Inventory</Typography>
            </Stack>
            <DataGrid
              autoHeight
              rows={assetRows}
              columns={assetColumns}
              disableRowSelectionOnClick
              hideFooter={assetRows.length <= 5}
              pageSizeOptions={[5, 10]}
              initialState={{
                pagination: { paginationModel: { pageSize: 5, page: 0 } },
              }}
              sx={{ border: 0 }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Narrative Signals</Typography>
            <Stack spacing={1.2}>
              {(data?.insights || []).map((insight) => (
                <Alert
                  key={insight}
                  severity={insight.toLowerCase().includes('critical') ? 'warning' : 'info'}
                  variant="outlined"
                >
                  {insight}
                </Alert>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <BuildCircleIcon color="primary" />
              <Typography variant="h6">Application</Typography>
            </Stack>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Service</Typography><Chip label={data?.service?.name || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Version</Typography><Chip label={data?.service?.version || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Commit</Typography><Chip label={data?.service?.git_commit || 'unknown'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">FastAPI</Typography><Chip label={data?.service?.fastapi_version || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">SQLAlchemy</Typography><Chip label={data?.service?.sqlalchemy_version || '-'} size="small" /></Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <MemoryIcon color="primary" />
              <Typography variant="h6">Runtime</Typography>
            </Stack>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Hostname</Typography><Chip label={data?.runtime?.hostname || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Python</Typography><Chip label={data?.runtime?.python_version || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">CPU</Typography><Chip label={String(data?.runtime?.cpu_count || '-')} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Memory</Typography><Chip label={data?.runtime?.memory_total_mb ? `${data.runtime.memory_total_mb} MB` : '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Uptime</Typography><Chip label={formatDuration(data?.runtime?.uptime_seconds)} size="small" /></Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <DnsIcon color="primary" />
              <Typography variant="h6">OS and Container</Typography>
            </Stack>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">OS</Typography><Chip label={data?.runtime?.os?.pretty_name || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Kernel</Typography><Chip label={data?.runtime?.kernel || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Arch</Typography><Chip label={data?.runtime?.architecture || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Containerized</Typography><Chip label={data?.runtime?.containerized ? 'yes' : 'no'} color={data?.runtime?.containerized ? 'success' : 'default'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Runtime</Typography><Chip label={data?.runtime?.container_runtime || 'host'} size="small" /></Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <VpnLockIcon color="primary" />
              <Typography variant="h6">WireGuard</Typography>
            </Stack>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Interface</Typography><Chip label={data?.wireguard?.interface || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">State</Typography><Chip label={data?.wireguard?.is_up ? 'up' : 'down'} color={data?.wireguard?.is_up ? 'success' : 'default'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Listen Port</Typography><Chip label={data?.wireguard?.listen_port || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Network</Typography><Chip label={data?.wireguard?.network || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Endpoint</Typography><Chip label={data?.wireguard?.server_endpoint || '-'} size="small" /></Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <CloudQueueIcon color="primary" />
              <Typography variant="h6">Cloud and Controls</Typography>
            </Stack>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Provider</Typography><Chip label={cloudProvider} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Region</Typography><Chip label={data?.cloud?.region || '-'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Instance</Typography><Chip label={data?.cloud?.instance_type || '-'} size="small" /></Stack>
              <Divider />
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Token Grants</Typography><Chip label={data?.auth?.token_grants_configured ? 'enabled' : 'disabled'} color={data?.auth?.token_grants_configured ? 'success' : 'default'} size="small" /></Stack>
              <Stack direction="row" justifyContent="space-between"><Typography variant="body2">Legacy Token</Typography><Chip label={data?.auth?.legacy_token_enabled ? 'enabled' : 'disabled'} color={data?.auth?.legacy_token_enabled ? 'warning' : 'default'} size="small" /></Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Trivy Coverage</Typography>
                <LinearProgress variant="determinate" value={evidence?.trivy?.percent || 0} sx={{ mb: 0.5 }} />
                <Typography variant="caption" color="text.secondary">
                  {evidence?.trivy?.available || 0}/{evidence?.trivy?.total || 0} scan reports available
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>SBOM Coverage</Typography>
                <LinearProgress variant="determinate" value={evidence?.sbom?.percent || 0} sx={{ mb: 0.5 }} />
                <Typography variant="caption" color="text.secondary">
                  {evidence?.sbom?.available || 0}/{evidence?.sbom?.total || 0} SBOMs available
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Log Visibility</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {Object.entries(data?.log_sources || {}).map(([name, available]) => (
                    <Chip
                      key={name}
                      label={`${name} ${available ? 'online' : 'missing'}`}
                      color={available ? 'success' : 'default'}
                      size="small"
                    />
                  ))}
                </Stack>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>WireGuard Traffic</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={`RX ${formatBytes(data?.wireguard?.transfer_rx || 0)}`} size="small" color="info" />
                  <Chip label={`TX ${formatBytes(data?.wireguard?.transfer_tx || 0)}`} size="small" color="success" />
                  <Chip label={`Peers ${data?.wireguard?.connected_peers || 0}/${data?.wireguard?.configured_peers || 0}`} size="small" />
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Attestation
