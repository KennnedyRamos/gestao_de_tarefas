import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Box, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { clearAuth } from '../utils/auth';

const Header = () => {
  const [username, setUsername] = useState('Usuário');
  const navigate = useNavigate();
  const logoSrc = `${process.env.PUBLIC_URL}/logo192.png`;

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => setUsername(res.data.name || 'Usuário'))
      .catch(() => setUsername('Usuário'));
  }, []);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        backgroundImage: 'linear-gradient(110deg, var(--accent) 0%, #cf7a4b 45%, var(--accent-cool) 100%)',
        color: '#fff',
        zIndex: 5
      }}
    >
      <Toolbar
        variant="dense"
        sx={{
          minHeight: { xs: 'var(--header-height-xs)', md: 'var(--header-height-md)' },
          px: { xs: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="img"
            src={logoSrc}
            alt="Logo"
            sx={{
              height: 28,
              width: 'auto',
              maxWidth: { xs: 110, md: 140 },
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25))'
            }}
          />
          <Typography
            variant="h6"
            sx={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              letterSpacing: '-0.01em'
            }}
          >
            Olá, {username}!
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={handleLogout}
          sx={{
            color: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.6)',
            '&:hover': {
              borderColor: '#fff',
              backgroundColor: 'rgba(255, 255, 255, 0.12)'
            }
          }}
        >
          Sair
        </Button>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
