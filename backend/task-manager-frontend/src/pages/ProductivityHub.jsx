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

import { hasPermission } from '../utils/auth';

const ProductivityHub = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const canManageTasks = hasPermission('tasks.manage');
  const canManageRoutines = hasPermission('routines.manage');

  const tabs = useMemo(
    () => ([
      {
        value: 'tarefas',
        label: 'Tarefas',
        path: '/produtividade/tarefas',
        visible: true
      },
      {
        value: 'tarefas_nova',
        label: 'Nova tarefa',
        path: '/produtividade/tarefas/nova',
        visible: canManageTasks
      },
      {
        value: 'rotinas',
        label: 'Rotinas',
        path: '/produtividade/rotinas',
        visible: canManageRoutines
      }
    ]).filter((item) => item.visible),
    [canManageRoutines, canManageTasks]
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
        <Typography variant="h5">Tarefas e rotinas</Typography>
        <Typography variant="body2" color="text.secondary">
          Acompanhe as tarefas do time e organize rotinas no mesmo ambiente.
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

export default ProductivityHub;
