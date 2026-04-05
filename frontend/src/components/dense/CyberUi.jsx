import { Children } from 'react'
import { Box, Chip, Paper, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'

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

function statusFace(status) {
  if (status === 'red') return '(x_x)'
  if (status === 'amber') return '(-_-)'
  return '(^_^)'
}

function asciiMeter(status) {
  if (status === 'red') return '[##########]'
  if (status === 'amber') return '[######----]'
  return '[###-------]'
}

function statusGlyph(status) {
  if (status === 'red') return '!!'
  if (status === 'amber') return '!~'
  return 'ok'
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

function asciiProgress(valuePercent) {
  if (!Number.isFinite(Number(valuePercent))) return '[----------]'
  const clamped = Math.max(0, Math.min(100, Number(valuePercent)))
  const filled = Math.round(clamped / 10)
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`
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

export function DenseCards({ children }) {
  const theme = useTheme()
  const isXl = useMediaQuery(theme.breakpoints.up('xl'))
  const isLg = useMediaQuery(theme.breakpoints.up('lg'))
  const isMd = useMediaQuery(theme.breakpoints.up('md'))

  const columns = isXl ? 4 : isLg ? 3 : isMd ? 2 : 1
  const cardItems = Children.toArray(children)
  const fillerCount = (columns - (cardItems.length % columns)) % columns

  return (
    <Box
      sx={{
        display: 'grid',
        // Keep cards strictly vertical on phones and small tablets.
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
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
  return (
    <Paper
      sx={{
        p: 0.9,
        minHeight: 152,
        height: '100%',
        width: '100%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        backgroundImage: 'linear-gradient(180deg, rgba(49,242,125,0.05), rgba(49,242,125,0.01))',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.35 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            letterSpacing: 0.6,
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            pr: 0.5,
          }}
        >
          {statusFace(status)} {title}
        </Typography>
        <Chip
          size="small"
          label={`${ragLabel(status)} ${statusGlyph(status)}`}
          color={ragColor(status)}
          sx={{ flexShrink: 0, maxWidth: '46%' }}
        />
      </Stack>
      <Typography
        variant="h6"
        sx={{
          lineHeight: 1.2,
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography>
      <Typography variant="caption" sx={{ mt: 0.25, fontFamily: 'monospace', opacity: 0.9 }}>
        {progressPercent === undefined ? asciiMeter(status) : asciiProgress(progressPercent)}
      </Typography>
      <Typography variant="caption" sx={{ mt: 0.2, fontFamily: 'monospace', opacity: 0.82 }}>
        {compactSparkline(trendValues)}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          mt: 0.45,
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {hint}
      </Typography>
      {importance ? (
        <Typography
          variant="caption"
          sx={{
            opacity: 0.82,
            mt: 0.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}
        >
          Why : {importance}
        </Typography>
      ) : null}
    </Paper>
  )
}
