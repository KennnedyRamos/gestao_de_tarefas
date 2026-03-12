const TOKEN_KEY = 'token';
const SESSION_EXPIRED_KEY = 'session_expired';
const EXP_LEEWAY_SECONDS = 30;

const readSessionValue = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch (err) {
    return null;
  }
};

const writeSessionValue = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch (err) {
    // Ignore storage write failures.
  }
};

const removeSessionValue = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch (err) {
    // Ignore storage removal failures.
  }
};

const readLocalValue = (key) => {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
};

const removeLocalValue = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // Ignore storage removal failures.
  }
};

const getStoredToken = () => {
  const sessionToken = readSessionValue(TOKEN_KEY);
  if (sessionToken) {
    return sessionToken;
  }

  const legacyToken = readLocalValue(TOKEN_KEY);
  if (!legacyToken) {
    return null;
  }

  writeSessionValue(TOKEN_KEY, legacyToken);
  removeLocalValue(TOKEN_KEY);
  return legacyToken;
};

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
  writeSessionValue(SESSION_EXPIRED_KEY, '1');
};

export const clearSessionExpired = () => {
  removeSessionValue(SESSION_EXPIRED_KEY);
};

export const consumeSessionExpired = () => {
  const value = readSessionValue(SESSION_EXPIRED_KEY);
  if (value) {
    clearSessionExpired();
    return true;
  }
  return false;
};

export const setToken = (token) => {
  const normalized = String(token || '').trim();
  if (!normalized) {
    removeSessionValue(TOKEN_KEY);
    removeLocalValue(TOKEN_KEY);
    return;
  }
  writeSessionValue(TOKEN_KEY, normalized);
  removeLocalValue(TOKEN_KEY);
  clearSessionExpired();
};

export const clearAuth = () => {
  removeSessionValue(TOKEN_KEY);
  removeLocalValue(TOKEN_KEY);
  clearSessionExpired();
};

export const clearAuthForExpiry = () => {
  removeSessionValue(TOKEN_KEY);
  removeLocalValue(TOKEN_KEY);
  markSessionExpired();
};

export const getTokenPayload = () => {
  const token = getStoredToken();
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
  const token = getStoredToken();
  return token && getTokenPayload() ? token : null;
};

export const isAdmin = () => {
  const payload = getTokenPayload();
  return payload?.role === 'admin';
};

export const getPermissions = () => {
  const payload = getTokenPayload();
  if (!payload) {
    return [];
  }
  const rawPermissions = payload.permissions;
  const source = Array.isArray(rawPermissions) ? rawPermissions : [];
  const unique = new Set();
  source.forEach((item) => {
    const permission = String(item || '').trim();
    if (!permission) {
      return;
    }
    unique.add(permission);
  });
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
};

export const hasPermission = (permission) => {
  const expected = String(permission || '').trim();
  if (!expected) {
    return false;
  }
  if (isAdmin()) {
    return true;
  }
  return getPermissions().includes(expected);
};

export const hasAnyPermission = (permissions) => {
  const list = Array.isArray(permissions) ? permissions : [];
  if (isAdmin()) {
    return true;
  }
  const userPermissions = new Set(getPermissions());
  return list.some((item) => userPermissions.has(String(item || '').trim()));
};

export const isPersonalAdmin = () => {
  return hasPermission('routines.manage');
};
