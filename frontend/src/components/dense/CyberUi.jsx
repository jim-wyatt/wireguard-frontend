import { Children } from 'react'
import { Box, Paper, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'

// Status-driven visual tokens — colored border + subtle tint + glowing dot
const RAG_TOKENS = {
  red:   { border: 'rgba(229,57,53,0.85)',  bg: 'rgba(229,57,53,0.07)',   dot: '#ef5350' },
  amber: { border: 'rgba(255,152,0,0.85)',  bg: 'rgba(255,152,0,0.055)',  dot: '#ff9800' },
  green: { border: 'rgba(0,200,83,0.6)',    bg: 'rgba(0,200,83,0.035)',   dot: '#00c853' },
}

function normalizeSpan(span) {
  const n = Number(span) || 1
  return Math.max(1, Math.min(3, n))
}

export function ragColor(status) {
  if (status === 'red') return 'error'
  if (status === 'amber') return 'warning'
  return 'success'
}

export function ragLabel(status) {
  if (status === 'red') return 'RED'
  if (status === 'amber') return 'AMBER'
  return 'GREEN'
}

function compactSparkline(values) {
  const blocks = ['_', '.', ':', '-', '=', '+', '*', '#']
  const numbers = (values || []).filter((v) => Number.isFinite(v)).slice(-18)
  if (numbers.length < 2) return '........'
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const spread = max - min || 1
  return numbers
    .map((v) => {
      const idx = Math.max(0, Math.min(blocks.length - 1, Math.floor(((v - min) / spread) * (blocks.length - 1))))
      return blocks[idx]
    })
    .join('')
}



export function DenseGrid({ children }) {
  return (
    <Box
      sx={{
        '--dense-grid-gap': '10px',
        '--dense-vp-h': 'calc(100vh - 150px)',
        '--dense-row-h': 'calc((var(--dense-vp-h) - (2 * var(--dense-grid-gap))) / 3)',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
        gridTemplateRows: { xs: 'none', lg: 'repeat(3, minmax(var(--dense-row-h), auto))' },
        gridAutoRows: { xs: 'minmax(140px, auto)', lg: 'minmax(var(--dense-row-h), auto)' },
        gap: 'var(--dense-grid-gap)',
        minHeight: { xs: 'auto', lg: 'calc(100vh - 150px)' },
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'clip',
      }}
    >
      {children}
    </Box>
  )
}

export function DenseSection({ title, subtitle, colSpan = 1, rowSpan = 1, children }) {
  const normalizedColSpan = normalizeSpan(colSpan)
  const normalizedRowSpan = normalizeSpan(rowSpan)

  return (
    <Paper
      sx={{
        p: 1,
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        minHeight: { xs: 130, lg: 0 },
        height: 'auto',
        gridColumn: { xs: 'span 1', lg: `span ${normalizedColSpan}` },
        gridRow: { xs: 'span 1', lg: `span ${normalizedRowSpan}` },
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'clip',
        borderTop: '2px solid rgba(49,242,125,0.18)',
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontFamily: 'monospace',
          letterSpacing: 0.7,
          opacity: 0.95,
          mb: 0.8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        +--[{title}]-------------------------------------------------------------+
      </Typography>
      {subtitle ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mb: 0.8, lineHeight: 1.2, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {subtitle}
        </Typography>
      ) : null}
      <Box sx={{ minHeight: 0, flex: 1, minWidth: 0, maxWidth: '100%', overflowX: 'clip', pr: 0 }}>{children}</Box>
    </Paper>
  )
}

export function DenseCards({ children, cols }) {
  const theme = useTheme()
  const isXl = useMediaQuery(theme.breakpoints.up('xl'))
  const isLg = useMediaQuery(theme.breakpoints.up('lg'))
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const autoColumns = isXl ? 4 : isLg ? 3 : isMd ? 2 : 1
  const columns = cols || autoColumns
  const cardItems = Children.toArray(children)
  const fillerCount = (columns - (cardItems.length % columns)) % columns

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: cols
          ? `repeat(${cols}, minmax(0, 1fr))`
          : { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
        gridAutoRows: '1fr',
        gap: 1,
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'clip',
      }}
    >
      {cardItems}
      {Array.from({ length: fillerCount }).map((_, index) => (
        <Paper
          // Hidden fillers preserve strict grid symmetry on the final row.
          key={`dense-filler-${index}`}
          aria-hidden
          sx={{
            minHeight: 152,
            visibility: 'hidden',
            pointerEvents: 'none',
            border: 0,
            boxShadow: 'none',
            background: 'transparent',
          }}
        />
      ))}
    </Box>
  )
}

export function DenseMetricCard({ title, value, hint, status = 'green', importance, trendValues, progressPercent }) {
  const tok = RAG_TOKENS[status] || RAG_TOKENS.green
  const sparkline = compactSparkline(trendValues)
  return (
    <Paper
      sx={{
        p: 1,
        minHeight: 140,
        height: '100%',
        width: '100%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        borderLeft: `4px solid ${tok.border}`,
        bgcolor: tok.bg,
        backgroundImage: 'none',
        transition: 'background-color 0.25s ease',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.4 }}>
        <Typography
          variant="caption"
          sx={{
            letterSpacing: 0.7,
            fontWeight: 600,
            fontSize: '0.67rem',
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            pr: 0.5,
            color: 'text.secondary',
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: tok.dot,
            mt: 0.25,
            flexShrink: 0,
            boxShadow: `0 0 5px ${tok.dot}88`,
          }}
        />
      </Stack>
      <Typography
        variant="h6"
        sx={{ lineHeight: 1.2, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', fontWeight: 700 }}
      >
        {value}
      </Typography>
      {sparkline ? (
        <Typography variant="caption" sx={{ fontFamily: 'monospace', opacity: 0.7, letterSpacing: 0.5, mt: 0.2 }}>
          {sparkline}
        </Typography>
      ) : null}
      {progressPercent !== undefined ? (
        <Box sx={{ mt: 0.4, height: 3, borderRadius: 1, bgcolor: 'action.disabledBackground', overflow: 'hidden' }}>
          <Box
            sx={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, Number(progressPercent) || 0))}%`,
              bgcolor: tok.dot,
              transition: 'width 0.4s ease',
            }}
          />
        </Box>
      ) : null}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.45, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.4 }}
      >
        {hint}
      </Typography>
      {importance ? (
        <Typography
          variant="caption"
          sx={{
            opacity: 0.5,
            display: 'block',
            mt: 0.3,
            lineHeight: 1.25,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            fontSize: '0.6rem',
          }}
        >
          {importance}
        </Typography>
      ) : null}
    </Paper>
  )
}
