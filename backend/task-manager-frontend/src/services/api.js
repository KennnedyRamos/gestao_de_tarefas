import axios from 'axios';
import { clearAuthForExpiry, getToken } from '../utils/auth';

const DEFAULT_LOCAL_API_URL = 'http://localhost:8000';

const inferBaseUrl = () => {
  const fromEnv = String(
    import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL || ''
  ).trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_LOCAL_API_URL;
  }

  const host = String(window.location.hostname || '').toLowerCase();
  const port = String(window.location.port || '').trim();
  const protocol = window.location.protocol || 'http:';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return DEFAULT_LOCAL_API_URL;
  }
  // Em desenvolvimento na rede local (ex.: celular), usa o mesmo host na porta 8000.
  if (port === '3000') {
    return `${protocol}//${host}:8000`;
  }
  return window.location.origin;
};

const baseURL = inferBaseUrl();

const api = axios.create({
  baseURL
});

let warmupRequest = null;

const isAuthLoginRequest = (config) => {
  const url = config?.url || '';
  return url.includes('/auth/login');
};

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && !isAuthLoginRequest(error?.config)) {
      clearAuthForExpiry();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const warmupApi = () => {
  if (warmupRequest) {
    return warmupRequest;
  }

  warmupRequest = api
    .get('/health/db', { timeout: 15000 })
    .catch(() => null)
    .finally(() => {
      warmupRequest = null;
    });

  return warmupRequest;
};

export default api;
