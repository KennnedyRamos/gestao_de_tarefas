import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreateTask from './pages/CreateTask';
import EditTask from './pages/EditTask';
import Assignments from './pages/Assignments';
import ProductivityHub from './pages/ProductivityHub';
import Login from './pages/Login';
import Users from './pages/Users';
import Routines from './pages/Routines';
import ComodatosDashboard from './pages/ComodatosDashboard';
import DeliveriesCreate from './pages/DeliveriesCreate';
import DeliveriesHistory from './pages/DeliveriesHistory';
import PickupsCreate from './pages/PickupsCreate';
import PickupsDataUpload from './pages/PickupsDataUpload';
import PickupsCenter from './pages/PickupsCenter';
import OperationsHub from './pages/OperationsHub';
import Equipments from './pages/Equipments';
import Requests from './pages/Requests';
import Layout from './components/Layout';
import { getToken, hasAnyPermission, hasPermission, isAdmin } from './utils/auth';
import './App.css';

const RequireAuth = ({ children }) => {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
};

const RequireAdmin = ({ children }) => {
  return isAdmin() ? children : <Navigate to="/dashboard" replace />;
};

const RequirePermission = ({ permission, children }) => {
  return hasPermission(permission) ? children : <Navigate to="/dashboard" replace />;
};

const RequireAnyPermission = ({ permissions, children }) => {
  return hasAnyPermission(permissions) ? children : <Navigate to="/dashboard" replace />;
};

const defaultOperationsRoute = () => {
  if (hasPermission('deliveries.manage')) {
    return '/operacoes/entregas/historico';
  }
  if (hasAnyPermission(['pickups.orders_history', 'pickups.withdrawals_history'])) {
    return '/operacoes/ordens/central';
  }
  if (hasPermission('pickups.create_order')) {
    return '/operacoes/ordens/nova';
  }
  if (hasPermission('pickups.import_base')) {
    return '/operacoes/ordens/base';
  }
  return '/dashboard';
};

const defaultProductivityRoute = () => {
  return '/produtividade/tarefas';
};

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />

          <Route path="produtividade" element={<ProductivityHub />}>
            <Route index element={<Navigate to={defaultProductivityRoute()} replace />} />
            <Route path="tarefas" element={<Assignments />} />
            <Route path="tarefas/nova" element={<RequirePermission permission="tasks.manage"><CreateTask /></RequirePermission>} />
            <Route path="rotinas" element={<RequirePermission permission="routines.manage"><Routines /></RequirePermission>} />
          </Route>

          <Route path="create-task" element={<Navigate to="/produtividade/tarefas/nova" replace />} />
          <Route path="edit-task/:id" element={<RequirePermission permission="tasks.manage"><EditTask /></RequirePermission>} />
          <Route path="assignments" element={<Navigate to="/produtividade/tarefas" replace />} />
          <Route path="routines" element={<Navigate to="/produtividade/rotinas" replace />} />

          <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="comodatos" element={<RequirePermission permission="comodatos.view"><ComodatosDashboard /></RequirePermission>} />

          <Route
            path="operacoes"
            element={(
              <RequireAnyPermission
                permissions={[
                  'deliveries.manage',
                  'pickups.create_order',
                  'pickups.import_base',
                  'pickups.orders_history',
                  'pickups.withdrawals_history'
                ]}
              >
                <OperationsHub />
              </RequireAnyPermission>
            )}
          >
            <Route index element={<Navigate to={defaultOperationsRoute()} replace />} />
            <Route
              path="entregas/nova"
              element={<RequirePermission permission="deliveries.manage"><DeliveriesCreate /></RequirePermission>}
            />
            <Route
              path="entregas/historico"
              element={<RequirePermission permission="deliveries.manage"><DeliveriesHistory /></RequirePermission>}
            />
            <Route
              path="ordens/nova"
              element={<RequirePermission permission="pickups.create_order"><PickupsCreate /></RequirePermission>}
            />
            <Route
              path="ordens/base"
              element={<RequirePermission permission="pickups.import_base"><PickupsDataUpload /></RequirePermission>}
            />
            <Route
              path="ordens/central"
              element={(
                <RequireAnyPermission permissions={['pickups.orders_history', 'pickups.withdrawals_history']}>
                  <PickupsCenter />
                </RequireAnyPermission>
              )}
            />
          </Route>

          <Route path="deliveries" element={<Navigate to={defaultOperationsRoute()} replace />} />
          <Route path="deliveries/create" element={<Navigate to="/operacoes/entregas/nova" replace />} />
          <Route path="deliveries/history" element={<Navigate to="/operacoes/entregas/historico" replace />} />
          <Route path="pickups" element={<Navigate to={defaultOperationsRoute()} replace />} />
          <Route path="pickups/create" element={<Navigate to="/operacoes/ordens/nova" replace />} />
          <Route path="pickups/import" element={<Navigate to="/operacoes/ordens/base" replace />} />
          <Route path="pickups/center" element={<Navigate to="/operacoes/ordens/central" replace />} />
          <Route path="pickups/history" element={<Navigate to="/operacoes/ordens/central?view=orders" replace />} />
          <Route path="pickups/withdrawals-history" element={<Navigate to="/operacoes/ordens/central?view=withdrawals" replace />} />

          <Route
            path="equipments"
            element={(
              <RequireAnyPermission permissions={['equipments.view', 'equipments.manage']}>
                <Equipments />
              </RequireAnyPermission>
            )}
          />
          <Route
            path="requests"
            element={(
              <RequireAnyPermission
                permissions={[
                  'deliveries.manage',
                  'pickups.create_order',
                  'pickups.import_base',
                  'pickups.orders_history',
                  'pickups.withdrawals_history',
                  'equipments.view',
                  'equipments.manage'
                ]}
              >
                <Requests />
              </RequireAnyPermission>
            )}
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;


