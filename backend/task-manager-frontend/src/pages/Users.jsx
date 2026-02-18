import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableContainer,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SettingsIcon from '@mui/icons-material/Settings';

import api from '../services/api';
import { PERMISSION_OPTIONS, permissionLabel } from '../constants/permissions';

const togglePermission = (currentPermissions, permissionCode) => {
  if (currentPermissions.includes(permissionCode)) {
    return currentPermissions.filter((item) => item !== permissionCode);
  }
  return [...currentPermissions, permissionCode].sort((a, b) => a.localeCompare(b));
};
const USERS_PAGE_SIZE = 25;

const Users = () => {
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('assistente');
  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  const [accessUser, setAccessUser] = useState(null);
  const [accessRole, setAccessRole] = useState('assistente');
  const [accessPermissions, setAccessPermissions] = useState([]);

  const permissionsByCode = useMemo(() => {
    const map = {};
    PERMISSION_OPTIONS.forEach((item) => {
      map[item.code] = item.label;
    });
    return map;
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(Array.isArray(response.data) ? response.data : []);
      setUsersPage(1);
      setError('');
    } catch (err) {
      setError('Acesso negado ou erro ao carregar usuários.');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      await api.post('/users', {
        name,
        email,
        password,
        role,
        permissions: role === 'admin' ? [] : permissions,
      });
      setName('');
      setEmail('');
      setPassword('');
      setRole('assistente');
      setPermissions([]);
      setSuccess('Usuário criado com sucesso.');
      setError('');
      loadUsers();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setSuccess('');
      setError(typeof detail === 'string' ? detail : 'Erro ao criar usuário.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este usuário?')) {
      return;
    }
    try {
      await api.delete(`/users/${id}`);
      setSuccess('Usuário excluído com sucesso.');
      setError('');
      loadUsers();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao excluir usuário.');
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
      setError('');
      handleCloseReset();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao redefinir senha.');
    }
  };

  const handleOpenAccess = (user) => {
    setAccessUser(user);
    setAccessRole(user?.role || 'assistente');
    setAccessPermissions(Array.isArray(user?.permissions) ? user.permissions : []);
    setError('');
    setSuccess('');
  };

  const handleCloseAccess = () => {
    setAccessUser(null);
    setAccessRole('assistente');
    setAccessPermissions([]);
  };

  const handleSaveAccess = async () => {
    if (!accessUser) {
      return;
    }
    try {
      await api.put(`/users/${accessUser.id}/access`, {
        role: accessRole,
        permissions: accessRole === 'admin' ? [] : accessPermissions,
      });
      setSuccess('Acessos atualizados com sucesso.');
      setError('');
      handleCloseAccess();
      loadUsers();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao atualizar acessos.');
    }
  };

  const renderAccessSummary = (user) => {
    if (user.role === 'admin') {
      return 'Todos os acessos';
    }

    const list = Array.isArray(user.permissions) ? user.permissions : [];
    if (list.length === 0) {
      return 'Sem acessos adicionais';
    }
    return list.map((code) => permissionsByCode[code] || permissionLabel(code)).join(', ');
  };

  const totalUsers = users.length;
  const totalUserPages = Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE));
  const currentUsersPage = Math.min(usersPage, totalUserPages);
  const usersStart = (currentUsersPage - 1) * USERS_PAGE_SIZE;
  const usersEnd = usersStart + USERS_PAGE_SIZE;
  const pagedUsers = useMemo(
    () => users.slice(usersStart, usersEnd),
    [users, usersEnd, usersStart]
  );
  const usersFrom = totalUsers === 0 ? 0 : usersStart + 1;
  const usersTo = Math.min(usersEnd, totalUsers);

  useEffect(() => {
    if (usersPage > totalUserPages) {
      setUsersPage(totalUserPages);
    }
  }, [usersPage, totalUserPages]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant='h5' sx={{ mb: 2 }}>Usuários</Typography>
      {error && <Alert severity='error' sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity='success' sx={{ mb: 2 }}>{success}</Alert>}

      <Box
        component='form'
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
          label='Nome'
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <TextField
          label='Email'
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          label='Senha'
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          InputProps={{
            endAdornment: (
              <InputAdornment position='end'>
                <IconButton
                  edge='end'
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <Select value={role} onChange={(event) => setRole(event.target.value)}>
          <MenuItem value='assistente'>Assistente</MenuItem>
          <MenuItem value='admin'>Admin</MenuItem>
        </Select>

        {role !== 'admin' && (
          <Box sx={{ border: '1px solid var(--stroke)', borderRadius: 1.5, p: 1.5 }}>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>Acessos deste usuário</Typography>
            <FormGroup>
              {PERMISSION_OPTIONS.map((item) => (
                <FormControlLabel
                  key={item.code}
                  control={
                    <Checkbox
                      checked={permissions.includes(item.code)}
                      onChange={() => setPermissions((prev) => togglePermission(prev, item.code))}
                    />
                  }
                  label={item.label}
                />
              ))}
            </FormGroup>
          </Box>
        )}

        <Button type='submit' variant='contained'>Criar usuário</Button>
      </Box>

      <Box
        sx={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--stroke)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
          display: 'grid',
          gap: 1,
          p: 1.5
        }}
      >
        <TableContainer sx={{ maxHeight: { xs: '60vh', md: 560 }, overflowY: 'auto', borderRadius: 1 }}>
          <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Acessos</TableCell>
              <TableCell align='right'>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{renderAccessSummary(user)}</TableCell>
                <TableCell align='right'>
                  <Button size='small' onClick={() => handleOpenAccess(user)} startIcon={<SettingsIcon fontSize='small' />}>
                    Acessos
                  </Button>
                  <Button size='small' onClick={() => handleOpenReset(user)}>
                    Redefinir senha
                  </Button>
                  <IconButton aria-label='Excluir usuário' onClick={() => handleDelete(user.id)}>
                    <DeleteIcon fontSize='small' />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>Nenhum usuário encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </TableContainer>
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1
          }}
        >
          <Typography variant='caption' color='text.secondary'>
            {`Mostrando ${usersFrom}-${usersTo} de ${totalUsers} | Página ${currentUsersPage} de ${totalUserPages}`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant='outlined'
              size='small'
              disabled={currentUsersPage <= 1}
              onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </Button>
            <Button
              variant='outlined'
              size='small'
              disabled={currentUsersPage >= totalUserPages}
              onClick={() => setUsersPage((prev) => Math.min(totalUserPages, prev + 1))}
            >
              Próximo
            </Button>
          </Box>
        </Box>
      </Box>

      <Dialog open={Boolean(accessUser)} onClose={handleCloseAccess} maxWidth='sm' fullWidth>
        <DialogTitle>Editar acessos</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant='body2' sx={{ mb: 2 }}>
            Usuário: {accessUser?.name || '-'}
          </Typography>

          <Select
            fullWidth
            value={accessRole}
            onChange={(event) => setAccessRole(event.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value='assistente'>Assistente</MenuItem>
            <MenuItem value='admin'>Admin</MenuItem>
          </Select>

          {accessRole !== 'admin' && (
            <FormGroup>
              {PERMISSION_OPTIONS.map((item) => (
                <FormControlLabel
                  key={item.code}
                  control={
                    <Checkbox
                      checked={accessPermissions.includes(item.code)}
                      onChange={() => setAccessPermissions((prev) => togglePermission(prev, item.code))}
                    />
                  }
                  label={item.label}
                />
              ))}
            </FormGroup>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAccess}>Cancelar</Button>
          <Button variant='contained' onClick={handleSaveAccess}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(resetUser)} onClose={handleCloseReset}>
        <DialogTitle>Redefinir senha</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant='body2' sx={{ mb: 2 }}>
            Usuário: {resetUser?.name || '-'}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label='Nova senha'
            type={showResetPassword ? 'text' : 'password'}
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position='end'>
                  <IconButton
                    edge='end'
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
          <Button variant='contained' onClick={handleResetPassword}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
