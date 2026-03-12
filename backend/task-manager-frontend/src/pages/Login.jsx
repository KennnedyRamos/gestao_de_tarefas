// src/pages/Login.jsx
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useNavigate } from 'react-router-dom';

import api, { warmupApi } from '../services/api';
import { consumeSessionExpired, setToken } from '../utils/auth';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWarmingBackend, setIsWarmingBackend] = useState(true);

  const resolveLoginError = (error) => {
    if (!error?.response) {
      return 'Nao foi possivel conectar ao servidor. Tente novamente.';
    }

    const statusCode = error?.response?.status;
    const detail = error?.response?.data?.detail;

    if (statusCode === 401) {
      return 'Email ou senha incorretos.';
    }
    if (statusCode === 429) {
      return 'Muitas tentativas de login. Aguarde 1 minuto e tente novamente.';
    }
    if (statusCode === 422) {
      return 'Preencha email e senha validos.';
    }
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    return 'Erro ao logar. Verifique suas credenciais e tente novamente.';
  };

  useEffect(() => {
    if (consumeSessionExpired()) {
      setStatus({
        severity: 'warning',
        text: 'Sua sessao expirou. Faca login novamente para continuar.'
      });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    warmupApi().finally(() => {
      if (isMounted) {
        setIsWarmingBackend(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      setToken(response.data.access_token);
      navigate('/');
    } catch (error) {
      setStatus({
        severity: 'error',
        text: resolveLoginError(error)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 4
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 420,
          p: 4,
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--stroke)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <Typography variant="h5" sx={{ mb: 3, fontFamily: 'var(--font-display)' }}>
          Login
        </Typography>
        {status && (
          <Alert severity={status.severity} sx={{ mb: 2 }}>
            {status.text}
          </Alert>
        )}
        <form onSubmit={handleLogin}>
          <TextField
            label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            fullWidth
            required
            disabled={isSubmitting}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            fullWidth
            required
            disabled={isSubmitting}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={isSubmitting}
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
          {isWarmingBackend && !isSubmitting && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'var(--muted)' }}>
              Conectando ao servidor...
            </Typography>
          )}
        </form>
      </Box>
    </Box>
  );
};

export default Login;
