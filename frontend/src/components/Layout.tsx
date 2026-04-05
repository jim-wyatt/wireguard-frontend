import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import PolicyIcon from '@mui/icons-material/Policy'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import TerminalIcon from '@mui/icons-material/Terminal'
import BugReportIcon from '@mui/icons-material/BugReport'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import LogoutIcon from '@mui/icons-material/Logout'
import LoginIcon from '@mui/icons-material/Login'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'

interface NavItem {
  text: string
  icon: React.ReactNode
  path: string
}

function Layout() {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [dockVisible, setDockVisible] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, logout } = useAuth()
  const { matrixMode, toggleMatrixMode } = useUi()

  const navItems: NavItem[] = [
    { text: 'Dash', icon: <DashboardIcon fontSize="small" />, path: '/dashboard' },
    { text: 'Nodes', icon: <PeopleIcon fontSize="small" />, path: '/nodes' },
    { text: 'Logs', icon: <ReceiptLongIcon fontSize="small" />, path: '/logs' },
    { text: 'Trust', icon: <PolicyIcon fontSize="small" />, path: '/attestation' },
    { text: 'Metrics', icon: <QueryStatsIcon fontSize="small" />, path: '/metrics' },
    { text: 'Ops', icon: <TerminalIcon fontSize="small" />, path: '/operations' },
    { text: 'Debug', icon: <BugReportIcon fontSize="small" />, path: '/debug' },
  ]

  useEffect(() => {
    const navHotkeys: Record<string, string> = {
      '1': '/dashboard',
      '2': '/nodes',
      '3': '/logs',
      '4': '/attestation',
      '5': '/metrics',
      '6': '/operations',
      '7': '/debug',
    }

    const onKeydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

      const path = navHotkeys[event.key]
      if (path) {
        event.preventDefault()
        navigate(path)
      }
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [navigate])

  useEffect(() => {
    let lastY = window.scrollY

    const onScroll = () => {
      const currentY = window.scrollY
      const delta = currentY - lastY

      if (currentY < 48) {
        setDockVisible(true)
      } else if (delta > 6) {
        setDockVisible(false)
      } else if (delta < -6) {
        setDockVisible(true)
      }

      lastY = currentY
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <Box sx={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'clip' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(1120px, calc(100% - 16px))',
          borderRadius: 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          border: '1px solid rgba(49, 242, 125, 0.24)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: '42px !important' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexGrow: 1 }}>
            <VpnKeyIcon sx={{ fontSize: 18 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 1 }}>NEXUS</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>// TRUSTED NODE EXCHANGE HUB</Typography>
            <Typography variant="caption" color="text.secondary">| 1-7</Typography>
            <Typography variant="caption" color="text.secondary">| {location.pathname}</Typography>
          </Stack>

          <Tooltip title={matrixMode ? 'switch light mode' : 'switch matrix mode'}>
            <IconButton size="small" color="inherit" onClick={toggleMatrixMode}>
              {matrixMode ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          <IconButton color="inherit" size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <Avatar sx={{ width: 26, height: 26, bgcolor: 'secondary.main', fontSize: 12 }}>A</Avatar>
          </IconButton>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            {isAuthenticated ? (
              <MenuItem onClick={() => {
                setMenuAnchor(null)
                logout()
                navigate('/login')
              }}>
                <LogoutIcon sx={{ mr: 1 }} fontSize="small" />
                Logout
              </MenuItem>
            ) : (
              <MenuItem onClick={() => {
                setMenuAnchor(null)
                navigate('/login')
              }}>
                <LoginIcon sx={{ mr: 1 }} fontSize="small" />
                Login
              </MenuItem>
            )}
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ px: { xs: 1, sm: 1.5 }, pt: 7.5, pb: 9.5, width: '100%', maxWidth: '100%', overflowX: 'clip' }}>
        <Outlet />
      </Box>

      <Paper
        sx={{
          position: 'fixed',
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(840px, calc(100% - 24px))',
          p: 0.7,
          zIndex: (theme) => theme.zIndex.appBar + 1,
          borderRadius: 1,
          bgcolor: 'background.paper',
          border: '1px solid rgba(49, 242, 125, 0.28)',
          overflowX: 'hidden',
          opacity: dockVisible ? 1 : 0,
          pointerEvents: dockVisible ? 'auto' : 'none',
          transition: 'opacity 160ms ease',
        }}
      >
        <Stack direction="row" spacing={0.25} justifyContent="space-between" useFlexGap sx={{ minWidth: 0 }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path
            return (
              <Tooltip key={item.path} title={`${item.text} (${navItems.indexOf(item) + 1})`}>
                <IconButton
                  size="small"
                  onClick={() => navigate(item.path)}
                  sx={{
                    px: { xs: 0.5, sm: 1.15 },
                    py: 0.45,
                    borderRadius: 1,
                    minWidth: 0,
                    border: active ? '1px solid rgba(49,242,125,0.45)' : '1px solid transparent',
                    bgcolor: active ? 'rgba(49,242,125,0.12)' : 'transparent',
                  }}
                >
                  <Stack direction="row" spacing={0.35} alignItems="center" sx={{ minWidth: 0 }}>
                    {item.icon}
                    <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>{item.text}</Typography>
                  </Stack>
                </IconButton>
              </Tooltip>
            )
          })}
        </Stack>
      </Paper>
    </Box>
  )
}

export default Layout
