export const getTokenPayload = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
};

export const isAdmin = () => {
  const payload = getTokenPayload();
  return payload?.role === 'admin';
};

const PERSONAL_ADMIN_NAME = 'Kennedy';
const PERSONAL_ADMIN_EMAIL = 'auxiliar.vendas@ribeirabeer.com.br';

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
