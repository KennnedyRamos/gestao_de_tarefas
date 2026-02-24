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
    const port = String(window.location.port || '').trim();
    const protocol = window.location.protocol || 'http:';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return DEFAULT_LOCAL_API_URL;
    }
    // Em ambiente de desenvolvimento na rede local (ex.: celular), usa o mesmo host na porta 8000.
    if (port === '3000') {
      return `${protocol}//${host}:8000`;
    }
  }
  return DEFAULT_PRODUCTION_API_URL;
};

const baseURL = inferBaseUrl();

const api = axios.create({
  baseURL
});

const UNICODE_ESCAPE_PATTERN = /\\u([0-9a-fA-F]{4})/g;

const decodeEscapedUnicode = (value) => {
  const text = String(value ?? '');
  if (!text.includes('\\u')) {
    return text;
  }
  return text.replace(UNICODE_ESCAPE_PATTERN, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
};

const normalizeResponseData = (payload) => {
  if (typeof payload === 'string') {
    return decodeEscapedUnicode(payload);
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeResponseData(item));
  }
  if (payload && typeof payload === 'object') {
    const normalized = {};
    Object.keys(payload).forEach((key) => {
      normalized[key] = normalizeResponseData(payload[key]);
    });
    return normalized;
  }
  return payload;
};

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
  (response) => {
    response.data = normalizeResponseData(response.data);
    return response;
  },
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
