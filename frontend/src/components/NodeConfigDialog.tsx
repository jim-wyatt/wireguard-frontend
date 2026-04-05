import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  Alert,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import { clientsApi } from '../services/api'

interface NodeConfigDialogProps {
  open: boolean
  onClose: () => void
  nodeId?: number | string
  nodeEmail?: string
}

function NodeConfigDialog({ open, onClose, nodeId, nodeEmail }: NodeConfigDialogProps) {
  const [config, setConfig] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadConfig = useCallback(async () => {
    if (!nodeId) return
    setLoading(true)
    setError(null)
    try {
      const response = await clientsApi.getClientConfig(nodeId)
      setConfig(response.data.config as string)
      setQrCode(response.data.qr_code as string)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr.response?.data?.detail || 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    if (open && nodeId) {
      loadConfig()
    }
  }, [open, nodeId, loadConfig])

  const handleCopy = () => {
    if (!config) return
    navigator.clipboard.writeText(config)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!config) return
    const blob = new Blob([config], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nodeEmail || 'node'}.conf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Node Configuration</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {copied && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Configuration copied to clipboard!
          </Alert>
        )}
        {loading ? (
          <Typography>Loading configuration...</Typography>
        ) : (
          <>
            {qrCode && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <img src={qrCode} alt="QR Code" style={{ maxWidth: '300px' }} />
              </Box>
            )}
            <Box sx={{ position: 'relative' }}>
              <TextField
                multiline
                fullWidth
                rows={12}
                value={config || ''}
                slotProps={{
                  input: {
                    readOnly: true,
                    sx: { fontFamily: 'monospace', fontSize: '0.9rem' },
                  },
                }}
              />
              <IconButton
                onClick={handleCopy}
                sx={{ position: 'absolute', top: 8, right: 8 }}
                size="small"
              >
                <ContentCopyIcon />
              </IconButton>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDownload} startIcon={<DownloadIcon />}>
          Download
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default NodeConfigDialog
