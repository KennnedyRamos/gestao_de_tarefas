import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreateTask from './pages/CreateTask';
import EditTask from './pages/EditTask';
import Assignments from './pages/Assignments';
import Login from './pages/Login';
import Users from './pages/Users';
import Routines from './pages/Routines';
import ComodatosDashboard from './pages/ComodatosDashboard';
import DeliveriesCreate from './pages/DeliveriesCreate';
import DeliveriesHistory from './pages/DeliveriesHistory';
import PickupsCreate from './pages/PickupsCreate';
import PickupsDataUpload from './pages/PickupsDataUpload';
import PickupsHistory from './pages/PickupsHistory';
import PickupsWithdrawalsHistory from './pages/PickupsWithdrawalsHistory';
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

const defaultPickupsRoute = () => {
  if (hasPermission('pickups.create_order')) {
    return '/pickups/create';
  }
  if (hasPermission('pickups.orders_history')) {
    return '/pickups/history';
  }
  if (hasPermission('pickups.withdrawals_history')) {
    return '/pickups/withdrawals-history';
  }
  if (hasPermission('pickups.import_base')) {
    return '/pickups/import';
  }
  return '/dashboard';
};

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="create-task" element={<RequirePermission permission="tasks.manage"><CreateTask /></RequirePermission>} />
          <Route path="edit-task/:id" element={<RequirePermission permission="tasks.manage"><EditTask /></RequirePermission>} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="routines" element={<RequirePermission permission="routines.manage"><Routines /></RequirePermission>} />
          <Route path="comodatos" element={<RequirePermission permission="comodatos.view"><ComodatosDashboard /></RequirePermission>} />
          <Route
            path="deliveries"
            element={<RequirePermission permission="deliveries.manage"><Navigate to="/deliveries/history" replace /></RequirePermission>}
          />
          <Route path="deliveries/create" element={<RequirePermission permission="deliveries.manage"><DeliveriesCreate /></RequirePermission>} />
          <Route path="deliveries/history" element={<RequirePermission permission="deliveries.manage"><DeliveriesHistory /></RequirePermission>} />
          <Route
            path="pickups"
            element={
              <RequireAnyPermission
                permissions={[
                  'pickups.create_order',
                  'pickups.import_base',
                  'pickups.orders_history',
                  'pickups.withdrawals_history'
                ]}
              >
                <Navigate to={defaultPickupsRoute()} replace />
              </RequireAnyPermission>
            }
          />
          <Route path="pickups/create" element={<RequirePermission permission="pickups.create_order"><PickupsCreate /></RequirePermission>} />
          <Route path="pickups/import" element={<RequirePermission permission="pickups.import_base"><PickupsDataUpload /></RequirePermission>} />
          <Route path="pickups/history" element={<RequirePermission permission="pickups.orders_history"><PickupsHistory /></RequirePermission>} />
          <Route path="pickups/withdrawals-history" element={<RequirePermission permission="pickups.withdrawals_history"><PickupsWithdrawalsHistory /></RequirePermission>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;


