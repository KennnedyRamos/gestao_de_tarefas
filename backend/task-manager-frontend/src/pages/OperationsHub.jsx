import React, { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Tab,
  Tabs,
  Typography
} from '@mui/material';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { hasAnyPermission, hasPermission } from '../utils/auth';

const OperationsHub = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const canManageDeliveries = hasPermission('deliveries.manage');
  const canCreatePickupOrder = hasPermission('pickups.create_order');
  const canImportPickupBase = hasPermission('pickups.import_base');
  const canPickupCenter = hasAnyPermission(['pickups.orders_history', 'pickups.withdrawals_history']);

  const tabs = useMemo(
    () => ([
      {
        value: 'entregas_nova',
        label: 'Nova entrega',
        path: '/operacoes/entregas/nova',
        visible: canManageDeliveries
      },
      {
        value: 'entregas_historico',
        label: 'Histórico de entregas',
        path: '/operacoes/entregas/historico',
        visible: canManageDeliveries
      },
      {
        value: 'ordens_nova',
        label: 'Nova ordem',
        path: '/operacoes/ordens/nova',
        visible: canCreatePickupOrder
      },
      {
        value: 'ordens_central',
        label: 'Central de retiradas',
        path: '/operacoes/ordens/central',
        visible: canPickupCenter
      },
      {
        value: 'ordens_base',
        label: 'Atualizar base',
        path: '/operacoes/ordens/base',
        visible: canImportPickupBase
      }
    ]).filter((item) => item.visible),
    [canCreatePickupOrder, canImportPickupBase, canManageDeliveries, canPickupCenter]
  );

  if (tabs.length === 0) {
    return <Navigate to="/dashboard" replace />;
  }

  const activeTab = (
    tabs
      .filter((item) => location.pathname.startsWith(item.path))
      .sort((a, b) => b.path.length - a.path.length)[0]
      ?.value
  ) || tabs[0].value;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5">Entregas e ordens</Typography>
        <Typography variant="body2" color="text.secondary">
          Centralize as operações em uma única tela e navegue pelas funcionalidades.
        </Typography>
      </Box>

      <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
        <CardContent sx={{ py: 0.5 }}>
          <Tabs
            value={activeTab}
            onChange={(_, value) => {
              const nextTab = tabs.find((item) => item.value === value);
              if (nextTab) {
                navigate(nextTab.path);
              }
            }}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            {tabs.map((item) => (
              <Tab key={item.value} value={item.value} label={item.label} />
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Outlet />
    </Box>
  );
};

export default OperationsHub;

