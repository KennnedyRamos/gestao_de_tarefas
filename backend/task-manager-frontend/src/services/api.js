import axios from 'axios';
import { clearAuthForExpiry, getToken } from '../utils/auth';

const DEFAULT_LOCAL_API_URL = 'http://localhost:8000';
const DEFAULT_PRODUCTION_API_URL = 'https://gestao-de-tarefas-backend.onrender.com';

const inferBaseUrl = () => {
  const fromEnv = String(process.env.REACT_APP_API_URL || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof window !== 'undefined') {
    const host = String(window.location.hostname || '').toLowerCase();
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return DEFAULT_LOCAL_API_URL;
    }
  }
  return DEFAULT_PRODUCTION_API_URL;
};

const baseURL = inferBaseUrl();

const api = axios.create({
  baseURL
});

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

export default api;
