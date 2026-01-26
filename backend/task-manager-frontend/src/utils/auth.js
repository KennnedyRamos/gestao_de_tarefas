const TOKEN_KEY = 'token';
const SESSION_EXPIRED_KEY = 'session_expired';
const EXP_LEEWAY_SECONDS = 30;

const decodeBase64Url = (value) => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    return atob(`${normalized}${padding}`);
  } catch (err) {
    return null;
  }
};

const isTokenExpired = (payload) => {
  if (!payload || typeof payload.exp !== 'number') {
    return true;
  }
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + EXP_LEEWAY_SECONDS;
};

export const markSessionExpired = () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
};

export const clearSessionExpired = () => {
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
};

export const consumeSessionExpired = () => {
  const value = sessionStorage.getItem(SESSION_EXPIRED_KEY);
  if (value) {
    clearSessionExpired();
    return true;
  }
  return false;
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  clearSessionExpired();
};

export const clearAuthForExpiry = () => {
  localStorage.removeItem(TOKEN_KEY);
  markSessionExpired();
};

export const getTokenPayload = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    clearAuth();
    return null;
  }
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) {
    clearAuth();
    return null;
  }
  try {
    const payload = JSON.parse(decoded);
    if (isTokenExpired(payload)) {
      clearAuthForExpiry();
      return null;
    }
    return payload;
  } catch (err) {
    clearAuth();
    return null;
  }
};

export const getToken = () => {
  return getTokenPayload() ? localStorage.getItem(TOKEN_KEY) : null;
};

export const isAdmin = () => {
  const payload = getTokenPayload();
  return payload?.role === 'admin';
};

const PERSONAL_ADMIN_NAME = 'Kennedy';
const PERSONAL_ADMIN_EMAIL = 'kennedyrafaelsilvaramos@gmail.com';

export const isPersonalAdmin = () => {
  const payload = getTokenPayload();
  if (!payload || payload.role !== 'admin') {
    return false;
  }
  if (payload.email && payload.email === PERSONAL_ADMIN_EMAIL) {
    return true;
  }
  return payload.name === PERSONAL_ADMIN_NAME;
};
