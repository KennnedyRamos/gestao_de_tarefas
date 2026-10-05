import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate } from 'react-router-dom';
import { clearAuth, getTokenPayload } from '../utils/auth';

const Header = ({ onMenuClick }) => {
  const [username, setUsername] = useState(() => getTokenPayload()?.name || 'Usuário');
  const navigate = useNavigate();
  const logoSrc = '/logo192.png';

  useEffect(() => {
    setUsername(getTokenPayload()?.name || 'Usuário');
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
          px: { xs: 1, sm: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, minWidth: 0 }}>
          <IconButton
            aria-label="Abrir menu"
            onClick={onMenuClick}
            sx={{ display: { xs: 'inline-flex', md: 'none' }, color: 'inherit', flexShrink: 0 }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src={logoSrc}
            alt="Logo"
            sx={{
              height: 28,
              width: 'auto',
              maxWidth: { xs: 64, sm: 110, md: 140 },
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25))'
            }}
          />
          <Typography
            variant="h6"
            sx={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              fontSize: { xs: '0.95rem', sm: '1.25rem' },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
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
            flexShrink: 0,
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
