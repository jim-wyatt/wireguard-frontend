import axios, { InternalAxiosRequestConfig } from 'axios'

const normalizeApiBaseUrl = (value: string | undefined): string => {
  if (!value) return '/api'
  const trimmed = value.trim()
  if (!trimmed) return '/api'
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed
  return `${trimmed.replace(/\/$/, '')}/api`
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = (window.localStorage.getItem('apiToken') || '').trim()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

export interface StreamLogsParams {
  signal: AbortSignal
  source?: string
  tail?: number
  follow?: boolean
  onLine: (line: string) => void
}

export const peersApi = {
  getPeers: () => api.get('/peers'),
  getStats: () => api.get('/peers/stats', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),
  getConnectedPeers: () => api.get('/peers/connected', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),
  getPeer: (id: number | string) => api.get(`/peers/${id}`),
  createPeer: (data: { email: string; name?: string }) => api.post('/peers', data),
  getPeerConfig: (id: number | string) => api.get(`/peers/${id}/config`),
  deletePeer: (id: number | string) => api.delete(`/peers/${id}`),
  togglePeerStatus: (id: number | string) => api.patch(`/peers/${id}/toggle`),

  streamLogs: async ({ signal, source = 'caddy', tail = 100, follow = true, onLine }: StreamLogsParams): Promise<void> => {
    const token = (window.localStorage.getItem('apiToken') || '').trim()
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {}

    const response = await fetch(
      `${API_BASE_URL}/logs/stream?source=${encodeURIComponent(source)}&tail=${tail}&follow=${follow ? 'true' : 'false'}&_ts=${Date.now()}`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal,
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Log stream failed (${response.status}) ${body}`.trim())
    }

    if (!response.body) {
      throw new Error('Readable stream is not available in this browser')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.length > 0) onLine(line)
      }
    }

    if (buffer.length > 0) onLine(buffer)
  },

  streamCaddyAccessLog: async ({ signal, tail = 100, onLine }: Omit<StreamLogsParams, 'source' | 'follow'>): Promise<void> =>
    peersApi.streamLogs({ signal, source: 'caddy', tail, onLine }),

  getAttestationSummary: () => api.get('/attestation/summary', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),

  getMetricsSummary: () => api.get('/metrics/summary', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),

  getBtopSnapshot: () => api.get('/debug/btop/snapshot', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),

  getTopSnapshot: () => api.get('/debug/top/snapshot', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),
}

export const clientsApi = peersApi

export default api
