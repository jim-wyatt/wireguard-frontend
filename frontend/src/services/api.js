import axios from 'axios';

const normalizeApiBaseUrl = (value) => {
  if (!value) return '/api';
  const trimmed = value.trim();
  if (!trimmed) return '/api';
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed;
  return `${trimmed.replace(/\/$/, '')}/api`;
};

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = (window.localStorage.getItem('apiToken') || '').trim();
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

export const clientsApi = {
  // Get all clients
  getClients: () => api.get('/clients'),
  
  // Get client stats
  getStats: () => api.get('/clients/stats', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),
  
  // Get connected clients
  getConnectedClients: () => api.get('/clients/connected', {
    params: { _ts: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }),
  
  // Get single client
  getClient: (id) => api.get(`/clients/${id}`),
  
  // Create new client
  createClient: (data) => api.post('/clients', data),
  
  // Get client config
  getClientConfig: (id) => api.get(`/clients/${id}/config`),
  
  // Delete client
  deleteClient: (id) => api.delete(`/clients/${id}`),
  
  // Toggle client status
  toggleClientStatus: (id) => api.patch(`/clients/${id}/toggle`),

  // Stream Caddy access log lines.
  streamCaddyAccessLog: async ({ signal, tail = 100, onLine }) => {
    const token = (window.localStorage.getItem('apiToken') || '').trim();
    const headers = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    const response = await fetch(`${API_BASE_URL}/logs/caddy/access/stream?tail=${tail}&_ts=${Date.now()}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Log stream failed (${response.status}) ${body}`.trim());
    }

    if (!response.body) {
      throw new Error('Readable stream is not available in this browser');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.length > 0) onLine(line);
      }
    }

    if (buffer.length > 0) onLine(buffer);
  },
};

export default api;
