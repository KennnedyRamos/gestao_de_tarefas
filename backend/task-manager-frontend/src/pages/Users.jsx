import React, { useEffect, useState } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Typography,
  TextField,
  Button,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Select,
  MenuItem
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import api from '../services/api';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('assistente');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
      setError('');
    } catch (err) {
      setError('Acesso negado ou erro ao carregar usuários.');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', { name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('assistente');
      setSuccess('Usuário criado com sucesso.');
      setError('');
      loadUsers();
    } catch (err) {
      setSuccess('');
      setError('Erro ao criar usuário.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este usuário?')) {
      return;
    }
    try {
      await api.delete(`/users/${id}`);
      loadUsers();
    } catch (err) {
      setError('Erro ao excluir usuário.');
    }
  };

  const handleOpenReset = (user) => {
    setResetUser(user);
    setResetPassword('');
    setShowResetPassword(false);
    setError('');
    setSuccess('');
  };

  const handleCloseReset = () => {
    setResetUser(null);
    setResetPassword('');
    setShowResetPassword(false);
  };

  const handleResetPassword = async () => {
    if (!resetUser) {
      return;
    }
    if (!resetPassword) {
      setError('Informe a nova senha.');
      return;
    }
    try {
      await api.put(`/users/${resetUser.id}/password`, { password: resetPassword });
      setSuccess('Senha redefinida com sucesso.');
      handleCloseReset();
    } catch (err) {
      setError('Erro ao redefinir senha.');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Usuarios</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box
        component="form"
        onSubmit={handleCreate}
        sx={{
          mb: 3,
          display: 'grid',
          gap: 2,
          p: 3,
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--stroke)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)'
        }}
      >
        <TextField
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <MenuItem value="assistente">Assistente</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
        </Select>
        <Button type="submit" variant="contained">Criar usuario</Button>
      </Box>

      <Box
        sx={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--stroke)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden'
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell align="right">Acoes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => handleOpenReset(user)}>
                    Redefinir senha
                  </Button>
                  <IconButton aria-label="Excluir usuário" onClick={() => handleDelete(user.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>Nenhum usuario encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={Boolean(resetUser)} onClose={handleCloseReset}>
        <DialogTitle>Redefinir senha</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Usuario: {resetUser?.name || '-'}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Nova senha"
            type={showResetPassword ? 'text' : 'password'}
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label={showResetPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowResetPassword((prev) => !prev)}
                  >
                    {showResetPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseReset}>Cancelar</Button>
          <Button variant="contained" onClick={handleResetPassword}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
