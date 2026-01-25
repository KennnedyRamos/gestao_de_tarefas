import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { Box } from '@mui/material';

const Layout = () => {
  return (
    <Box className="app-shell">
      <Sidebar />
      <Box className="app-content">
        <Header />
        <Box className="page-anim">
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;
