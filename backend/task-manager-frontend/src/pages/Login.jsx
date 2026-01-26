// src/pages/Login.jsx
import React, { useEffect, useState } from 'react';
import { Box, TextField, Button, Typography, InputAdornment, IconButton, Alert, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { clearSessionExpired, consumeSessionExpired } from '../utils/auth';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolveLoginError = (error) => {
    if (!error?.response) {
      return 'Não foi possível conectar ao servidor. Tente novamente.';
    }
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      if (detail.toLowerCase().includes('credenciais')) {
        return 'Email ou senha incorretos.';
      }
      return detail;
    }
    const statusCode = error?.response?.status;
    if (statusCode === 400) {
      return 'Email incorreto.';
    }
    if (statusCode === 401) {
      return 'Senha incorreta.';
    }
    if (statusCode === 404) {
      return 'Usuário não encontrado.';
    }
    if (statusCode === 422) {
      return 'Preencha email e senha válidos.';
    }
    return 'Erro ao logar. Verifique suas credenciais e tente novamente.';
  };

  useEffect(() => {
    if (consumeSessionExpired()) {
      setStatus({
        severity: 'warning',
        text: 'Sua sessão expirou. Faça login novamente para ver suas tarefas.'
      });
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', response.data.access_token);
      clearSessionExpired();
      navigate('/');
    } catch (error) {
      console.error(error);
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
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            required
            disabled={isSubmitting}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
        </form>
      </Box>
    </Box>
  );
};

export default Login;
