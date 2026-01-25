import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, Alert, MenuItem } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../services/api';
import Calendar from './Calendar';

const TaskForm = ({ taskId }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('media');
  const [labelsInput, setLabelsInput] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const selectedDate = dueDate ? dayjs(dueDate) : null;

  const normalizeLabels = (value) => {
    if (!value) {
      return [];
    }
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw.map((label) => label.trim()).filter(Boolean);
  };

  const labelsToInput = (value) => normalizeLabels(value).join(', ');

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => setIsAdmin(res.data.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    api.get('/users')
      .then((res) => setUsers(res.data))
      .catch(() => setUsers([]));
  }, [isAdmin]);

  useEffect(() => {
    if (taskId) {
      api.get(`/tasks/${taskId}`)
        .then(res => {
          setTitle(res.data.title);
          setDescription(res.data.description);
          setDueDate(res.data.due_date || '');
          setPriority(res.data.priority || 'media');
          setLabelsInput(labelsToInput(res.data.labels));
          setAssigneeId(res.data.assignee_id ? String(res.data.assignee_id) : '');
        })
        .catch(err => console.error(err));
    }
  }, [taskId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (taskId) {
        const payload = {
          title,
          description,
          due_date: dueDate,
          priority,
          labels: normalizeLabels(labelsInput)
        };
        if (isAdmin) {
          payload.assignee_id = assigneeId ? Number(assigneeId) : null;
        }
        await api.put(`/tasks/${taskId}`, payload);
      } else {
        const payload = {
          title,
          description,
          due_date: dueDate,
          priority,
          labels: normalizeLabels(labelsInput)
        };
        if (isAdmin) {
          payload.assignee_id = assigneeId ? Number(assigneeId) : null;
        }
        await api.post('/tasks/', payload);
      }
      navigate('/dashboard');
    } catch (err) {
      setError('Erro ao salvar a tarefa.');
      console.error(err);
    }
  };

  const handleDateSelect = (date) => {
    if (!date) {
      setDueDate('');
      return;
    }
    setDueDate(dayjs(date).format('YYYY-MM-DD'));
  };

  return (
    <Box sx={{ p: 3 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 280px' },
          gap: 3
        }}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--stroke)',
            borderRadius: 'var(--radius-lg)',
            p: 3,
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <TextField
            label="Titulo"
            fullWidth
            sx={{ mb: 2 }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <TextField
            label="Descricão"
            fullWidth
            multiline
            rows={4}
            sx={{ mb: 2 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            label="Vencimento"
            type="date"
            fullWidth
            sx={{ mb: 2 }}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            select
            label="Prioridade"
            fullWidth
            sx={{ mb: 2 }}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <MenuItem value="alta">Alta</MenuItem>
            <MenuItem value="media">Media</MenuItem>
            <MenuItem value="baixa">Baixa</MenuItem>
          </TextField>
          <TextField
            label="Etiquetas"
            fullWidth
            sx={{ mb: 2 }}
            value={labelsInput}
            onChange={(e) => setLabelsInput(e.target.value)}
            helperText="Separe por virgula. Ex: urgente, casa"
          />
          {isAdmin && (
            <TextField
              select
              label="Responsavel"
              fullWidth
              sx={{ mb: 2 }}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <MenuItem value="">Sem responsavel</MenuItem>
              {users.map((user) => (
                <MenuItem key={user.id} value={String(user.id)}>
                  {user.name} ({user.email})
                </MenuItem>
              ))}
            </TextField>
          )}
          <Button type="submit" variant="contained">{taskId ? 'Atualizar' : 'Criar'}</Button>
        </Box>
        <Calendar
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          onClearDate={() => setDueDate('')}
        />
      </Box>
    </Box>
  );
};

export default TaskForm;
