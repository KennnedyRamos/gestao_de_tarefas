import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreateTask from './pages/CreateTask';
import EditTask from './pages/EditTask';
import Assignments from './pages/Assignments';
import Login from './pages/Login';
import Users from './pages/Users';
import Routines from './pages/Routines';
import Deliveries from './pages/Deliveries';
import Pickups from './pages/Pickups';
import Layout from './components/Layout';
import { getToken, isAdmin, isPersonalAdmin } from './utils/auth';
import './App.css';

const RequireAuth = ({ children }) => {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
};

const RequireAdmin = ({ children }) => {
  return isAdmin() ? children : <Navigate to="/dashboard" replace />;
};

const RequirePersonalAdmin = ({ children }) => {
  return isPersonalAdmin() ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="create-task" element={<RequireAdmin><CreateTask /></RequireAdmin>} />
          <Route path="edit-task/:id" element={<RequireAdmin><EditTask /></RequireAdmin>} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="routines" element={<RequirePersonalAdmin><Routines /></RequirePersonalAdmin>} />
          <Route path="deliveries" element={<RequireAdmin><Deliveries /></RequireAdmin>} />
          <Route path="pickups" element={<RequireAdmin><Pickups /></RequireAdmin>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
