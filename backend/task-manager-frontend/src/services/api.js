import axios from 'axios';
import { clearAuthForExpiry, getToken } from '../utils/auth';

const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
