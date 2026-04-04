import { Box, Chip, Paper, Stack, Typography } from '@mui/material'

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
        '--dense-row-h': '188px',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
        gridAutoRows: { xs: 'auto', md: 'var(--dense-row-h)' },
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  )
}

export function DenseSection({ title, subtitle, colSpan = 1, rowSpan = 1, children }) {
  return (
    <Paper
      sx={{
        p: 1,
        minHeight: { xs: 120, md: `calc(var(--dense-row-h) * ${rowSpan})` },
        gridColumn: { xs: 'span 1', md: `span ${colSpan}` },
        gridRow: { xs: 'span 1', md: `span ${rowSpan}` },
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
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
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.8, lineHeight: 1.2 }}>
          {subtitle}
        </Typography>
      ) : null}
      <Box sx={{ minHeight: 0, flex: 1, overflow: 'auto', pr: 0.3 }}>{children}</Box>
    </Paper>
  )
}

export function DenseCards({ children }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
        gridAutoRows: '1fr',
        gap: 1,
      }}
    >
      {children}
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
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundImage: 'linear-gradient(180deg, rgba(49,242,125,0.05), rgba(49,242,125,0.01))',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.35 }}>
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
          {statusFace(status)} {title}
        </Typography>
        <Chip size="small" label={`${ragLabel(status)} ${statusGlyph(status)}`} color={ragColor(status)} />
      </Stack>
      <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" sx={{ mt: 0.25, fontFamily: 'monospace', opacity: 0.9 }}>
        {progressPercent === undefined ? asciiMeter(status) : asciiProgress(progressPercent)}
      </Typography>
      <Typography variant="caption" sx={{ mt: 0.2, fontFamily: 'monospace', opacity: 0.82 }}>
        {compactSparkline(trendValues)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45 }}>
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
