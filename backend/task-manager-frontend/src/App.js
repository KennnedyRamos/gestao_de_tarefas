import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { getToken, hasAnyPermission, hasPermission, isAdmin } from './utils/auth';
import './App.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateTask = lazy(() => import('./pages/CreateTask'));
const EditTask = lazy(() => import('./pages/EditTask'));
const Assignments = lazy(() => import('./pages/Assignments'));
const ProductivityHub = lazy(() => import('./pages/ProductivityHub'));
const Login = lazy(() => import('./pages/Login'));
const Users = lazy(() => import('./pages/Users'));
const Routines = lazy(() => import('./pages/Routines'));
const ComodatosDashboard = lazy(() => import('./pages/ComodatosDashboard'));
const DeliveriesCreate = lazy(() => import('./pages/DeliveriesCreate'));
const DeliveriesHistory = lazy(() => import('./pages/DeliveriesHistory'));
const PickupsCreate = lazy(() => import('./pages/PickupsCreate'));
const PickupsDataUpload = lazy(() => import('./pages/PickupsDataUpload'));
const PickupsCenter = lazy(() => import('./pages/PickupsCenter'));
const OperationsHub = lazy(() => import('./pages/OperationsHub'));
const Equipments = lazy(() => import('./pages/Equipments'));
const Requests = lazy(() => import('./pages/Requests'));

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
  return '/dashboard';
};

const defaultProductivityRoute = () => {
  return '/produtividade/tarefas';
};

function App() {
  return (
    <Router>
      <Suspense fallback={<div style={{ padding: 24 }}>Carregando...</div>}>
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
            path="base-retiradas"
            element={<RequirePermission permission="pickups.import_base"><PickupsDataUpload /></RequirePermission>}
          />

          <Route
            path="operacoes"
            element={(
              <RequireAnyPermission
                permissions={[
                  'deliveries.manage',
                  'pickups.create_order',
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
              element={<Navigate to="/base-retiradas" replace />}
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
          <Route path="pickups/import" element={<Navigate to="/base-retiradas" replace />} />
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
                  'pickups.withdrawals_history',
                  'pickups.create_order',
                  'equipments.view',
                  'equipments.manage'
                ]}
              >
                <Requests />
              </RequireAnyPermission>
            )}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;


