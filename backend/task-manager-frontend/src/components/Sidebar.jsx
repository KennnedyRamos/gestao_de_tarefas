import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useLocation, useNavigate } from 'react-router-dom';

import api from '../services/api';
import { hasAnyPermission, hasPermission, isAdmin } from '../utils/auth';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const showAdmin = isAdmin();
  const canManageDeliveries = hasPermission('deliveries.manage');
  const canViewComodatos = hasPermission('comodatos.view');
  const canAccessEquipments = hasAnyPermission(['equipments.view', 'equipments.manage']);
  const canImportPickupBase = hasPermission('pickups.import_base');
  const hasPickupAreaAccess = hasAnyPermission([
    'pickups.create_order',
    'pickups.orders_history',
    'pickups.withdrawals_history',
  ]);
  const canAccessRequests = hasAnyPermission([
    'deliveries.manage',
    'pickups.create_order',
    'pickups.import_base',
    'pickups.orders_history',
    'pickups.withdrawals_history',
    'equipments.view',
    'equipments.manage',
  ]);
  const canAccessProductivity = true;
  const canAccessOperations = canManageDeliveries || hasPickupAreaAccess;
  const defaultProductivityRoute = '/produtividade/tarefas';
  const defaultOperationsRoute = (() => {
    if (canManageDeliveries) {
      return '/operacoes/entregas/historico';
    }
    if (hasAnyPermission(['pickups.orders_history', 'pickups.withdrawals_history'])) {
      return '/operacoes/ordens/central';
    }
    if (hasPermission('pickups.create_order')) {
      return '/operacoes/ordens/nova';
    }
    return '/dashboard';
  })();

  const [users, setUsers] = useState([]);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [userMenuLocked, setUserMenuLocked] = useState(false);
  const menuCloseTimeoutRef = useRef(null);

  useEffect(() => {
    if (!showAdmin) {
      setUsers([]);
      return;
    }
    api.get('/users')
      .then((res) => setUsers(res.data || []))
      .catch(() => setUsers([]));
  }, [showAdmin]);

  useEffect(() => () => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
    }
  }, []);

  const selectedUserId = location.pathname === '/dashboard'
    ? new URLSearchParams(location.search).get('user')
    : null;
  const isActive = (path) => location.pathname === path;
  const isProductivityActive = (
    location.pathname.startsWith('/produtividade')
    || location.pathname === '/assignments'
    || location.pathname === '/create-task'
    || location.pathname === '/routines'
    || location.pathname.startsWith('/edit-task/')
  );
  const isOperationsActive = (
    location.pathname.startsWith('/operacoes')
    || location.pathname.startsWith('/deliveries')
    || location.pathname.startsWith('/pickups')
  );
  const userMenuOpen = Boolean(userMenuAnchor);

  const navItemSx = {
    borderRadius: 2,
    mb: 0.5,
    px: 2,
    '&.Mui-selected': {
      backgroundColor: 'var(--accent-soft)',
      color: 'var(--ink)'
    },
    '&.Mui-selected:hover': {
      backgroundColor: 'var(--accent-soft)'
    },
    '&:hover': {
      backgroundColor: 'rgba(208, 106, 58, 0.12)'
    }
  };

  const clearMenuCloseTimeout = () => {
    if (menuCloseTimeoutRef.current) {
      clearTimeout(menuCloseTimeoutRef.current);
      menuCloseTimeoutRef.current = null;
    }
  };

  const handleUserMenuHoverOpen = (event) => {
    if (userMenuLocked) {
      return;
    }
    clearMenuCloseTimeout();
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuHoverClose = () => {
    if (userMenuLocked) {
      return;
    }
    clearMenuCloseTimeout();
    menuCloseTimeoutRef.current = setTimeout(() => {
      setUserMenuAnchor(null);
    }, 260);
  };

  const handleUserMenuClick = (event) => {
    clearMenuCloseTimeout();
    if (userMenuOpen && userMenuLocked) {
      setUserMenuAnchor(null);
      setUserMenuLocked(false);
      return;
    }
    setUserMenuAnchor(event.currentTarget);
    setUserMenuLocked(true);
  };

  const handleUserMenuClose = () => {
    clearMenuCloseTimeout();
    setUserMenuAnchor(null);
    setUserMenuLocked(false);
  };

  const handleUserMenuSelect = (userId) => {
    navigate(`/dashboard?user=${userId}`);
    handleUserMenuClose();
  };

  return (
    <Box
      sx={{
        width: { xs: '100%', md: 240 },
        background: 'linear-gradient(180deg, #ffffff 0%, var(--surface-warm) 100%)',
        borderRight: '1px solid var(--stroke)',
        px: 1,
        py: 2,
        boxShadow: '12px 0 30px rgba(32, 27, 22, 0.08)',
        position: { xs: 'static', md: 'sticky' },
        top: 0,
        height: { xs: 'auto', md: '100vh' },
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <List sx={{ mb: 1 }}>
        <ListItemButton
          onClick={() => navigate('/dashboard')}
          selected={isActive('/dashboard')}
          sx={navItemSx}
        >
          <ListItemText primary='Dashboard' />
        </ListItemButton>

        {canViewComodatos && (
          <ListItemButton
            onClick={() => navigate('/comodatos')}
            selected={isActive('/comodatos')}
            sx={navItemSx}
          >
            <ListItemText primary='Dashboard de comodatos' />
          </ListItemButton>
        )}

        {canAccessProductivity && (
          <ListItemButton
            onClick={() => navigate(defaultProductivityRoute)}
            selected={isProductivityActive}
            sx={navItemSx}
          >
            <ListItemText primary='Tarefas e rotinas' />
          </ListItemButton>
        )}

        {canAccessOperations && (
          <ListItemButton
            onClick={() => navigate(defaultOperationsRoute)}
            selected={isOperationsActive}
            sx={navItemSx}
          >
            <ListItemText primary='Entregas e ordens' />
          </ListItemButton>
        )}

        {canAccessEquipments && (
          <ListItemButton
            onClick={() => navigate('/equipments')}
            selected={isActive('/equipments')}
            sx={navItemSx}
          >
            <ListItemText primary='Equipamentos' />
          </ListItemButton>
        )}

        {canAccessRequests && (
          <ListItemButton
            onClick={() => navigate('/requests')}
            selected={isActive('/requests')}
            sx={navItemSx}
          >
            <ListItemText primary='Solicitações' />
          </ListItemButton>
        )}
      </List>

            {(canImportPickupBase || showAdmin) && (
        <Box sx={{ mt: 'auto', px: 1, pb: 1, display: 'grid', gap: 1 }}>
          <Divider sx={{ my: 0.5 }} />
          {canImportPickupBase && (
            <ListItemButton
              onClick={() => navigate('/base-retiradas')}
              selected={isActive('/base-retiradas')}
              sx={navItemSx}
            >
              <ListItemText primary='Atualizar base' />
            </ListItemButton>
          )}

          {showAdmin && (
            <>
              <ListItemButton
                onClick={() => navigate('/users')}
                selected={isActive('/users')}
                sx={navItemSx}
              >
                <ListItemText primary='Usuários' />
              </ListItemButton>
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Button
                  variant='outlined'
                  startIcon={<MenuIcon />}
                  onMouseEnter={handleUserMenuHoverOpen}
                  onMouseLeave={handleUserMenuHoverClose}
                  onClick={handleUserMenuClick}
                  aria-haspopup='menu'
                  aria-expanded={userMenuOpen ? 'true' : undefined}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: '999px',
                    px: 2,
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--stroke)',
                    boxShadow: 'var(--shadow-md)'
                  }}
                >
                  {'Selecionar usuário'}
                </Button>
                <Menu
                  anchorEl={userMenuAnchor}
                  open={userMenuOpen}
                  onClose={handleUserMenuClose}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                  MenuListProps={{
                    dense: true,
                    onMouseEnter: clearMenuCloseTimeout,
                    onMouseLeave: handleUserMenuHoverClose
                  }}
                  PaperProps={{
                    sx: {
                      mb: 1,
                      minWidth: 220,
                      maxHeight: 320,
                      border: '1px solid var(--stroke)',
                      backgroundColor: 'var(--surface)',
                      boxShadow: 'var(--shadow-md)'
                    }
                  }}
                >
                  {users.length === 0 ? (
                    <MenuItem disabled>{'Nenhum usuário encontrado.'}</MenuItem>
                  ) : (
                    users.map((user) => (
                      <MenuItem
                        key={user.id}
                        selected={selectedUserId === String(user.id)}
                        onClick={() => handleUserMenuSelect(user.id)}
                      >
                        {user.name}
                      </MenuItem>
                    ))
                  )}
                </Menu>
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

export default Sidebar;

