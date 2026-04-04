import axios from 'axios';

const normalizeApiBaseUrl = (value) => {
  if (!value) return '/api';
  const trimmed = value.trim();
  if (!trimmed) return '/api';
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed;
  return `${trimmed.replace(/\/$/, '')}/api`;
};

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

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
  getStats: () => api.get('/clients/stats'),
  
  // Get connected clients
  getConnectedClients: () => api.get('/clients/connected'),
  
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
};

export default api;
