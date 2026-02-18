import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  IconButton,
  Checkbox
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs from 'dayjs';
import api from '../services/api';
import Calendar from '../components/Calendar';

const AGENDA_PAGE_SIZE = 25;

const Routines = () => {
  const [routines, setRoutines] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [routineDate, setRoutineDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [routineTime, setRoutineTime] = useState('');
  const [agendaPage, setAgendaPage] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRoutines = async () => {
    try {
      const response = await api.get('/routines');
      setRoutines(response.data || []);
      setError('');
    } catch (err) {
      setError('Erro ao carregar rotinas.');
    }
  };

  const loadTasks = async () => {
    try {
      const response = await api.get('/tasks/');
      setTasks(response.data || []);
      setError('');
    } catch (err) {
      setError('Erro ao carregar agendamentos.');
    }
  };

  useEffect(() => {
    loadRoutines();
    loadTasks();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess('');
    if (!routineDate || !routineTime) {
      setError('Informe data e horário.');
      return;
    }
    try {
      await api.post('/routines', {
        title,
        description,
        routine_date: routineDate,
        routine_time: routineTime
      });
      setTitle('');
      setDescription('');
      setRoutineTime('');
      setSuccess('Rotina criada com sucesso.');
      setError('');
      loadRoutines();
    } catch (err) {
      setError('Erro ao criar rotina.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir esta rotina?')) {
      return;
    }
    try {
      await api.delete(`/routines/${id}`);
      loadRoutines();
    } catch (err) {
      setError('Erro ao excluir rotina.');
    }
  };

  const toggleComplete = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    try {
      await api.put(`/tasks/${id}`, {
        completed: !task.completed
      });
      loadTasks();
    } catch (err) {
      setError('Erro ao atualizar agendamento.');
    }
  };

  const handleDateSelect = (date) => {
    if (!date) {
      setRoutineDate('');
      setAgendaPage(1);
      return;
    }
    setRoutineDate(dayjs(date).format('YYYY-MM-DD'));
    setAgendaPage(1);
  };

  const formatDate = (value) => {
    if (!value) {
      return '-';
    }
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('DD/MM/YYYY') : value;
  };

  const formatTime = (value) => {
    if (!value) {
      return '-';
    }
    return value.slice(0, 5);
  };

  const parseTimeToMinutes = (value) => {
    if (!value) {
      return null;
    }
    const [hours, minutes] = value.split(':');
    const parsedHours = Number(hours);
    const parsedMinutes = Number(minutes);
    if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) {
      return null;
    }
    return parsedHours * 60 + parsedMinutes;
  };

  const selectedDate = routineDate ? dayjs(routineDate) : null;
  const selectedLabel = selectedDate ? selectedDate.format('DD/MM/YYYY') : null;
  const agendaTitle = selectedLabel ? `Agenda de ${selectedLabel}` : 'Agenda completa';
  const agendaEmptyText = routineDate
    ? 'Nenhuma rotina ou agendamento para este dia.'
    : 'Nenhuma rotina ou agendamento encontrado.';
  const matchesSelectedDate = (value) => {
    if (!routineDate || !value) {
      return false;
    }
    const parsed = dayjs(value);
    return parsed.isValid() && parsed.format('YYYY-MM-DD') === routineDate;
  };
  const filteredRoutines = routineDate
    ? routines.filter((routine) => matchesSelectedDate(routine.routine_date))
    : routines;
  const filteredTasks = routineDate
    ? tasks.filter((task) => matchesSelectedDate(task.due_date))
    : tasks;
  const agendaItems = [
    ...filteredRoutines.map((routine) => ({
      type: 'routine',
      id: routine.id,
      title: routine.title,
      description: routine.description,
      date: routine.routine_date,
      time: routine.routine_time
    })),
    ...filteredTasks.map((task) => ({
      type: 'task',
      id: task.id,
      title: task.title,
      description: task.description,
      date: task.due_date,
      completed: task.completed
    }))
  ].sort((a, b) => {
    const aDate = a.date ? dayjs(a.date) : null;
    const bDate = b.date ? dayjs(b.date) : null;
    const aBase = aDate && aDate.isValid() ? aDate.startOf('day').valueOf() : Number.POSITIVE_INFINITY;
    const bBase = bDate && bDate.isValid() ? bDate.startOf('day').valueOf() : Number.POSITIVE_INFINITY;
    if (aBase !== bBase) {
      return aBase - bBase;
    }
    const aOffset = a.type === 'routine'
      ? parseTimeToMinutes(a.time)
      : 24 * 60;
    const bOffset = b.type === 'routine'
      ? parseTimeToMinutes(b.time)
      : 24 * 60;
    const safeAOffset = aOffset === null ? 24 * 60 : aOffset;
    const safeBOffset = bOffset === null ? 24 * 60 : bOffset;
    if (safeAOffset !== safeBOffset) {
      return safeAOffset - safeBOffset;
    }
    if (a.type !== b.type) {
      return a.type === 'routine' ? -1 : 1;
    }
    return 0;
  });
  const totalAgendaPages = Math.max(1, Math.ceil(agendaItems.length / AGENDA_PAGE_SIZE));
  const currentAgendaPage = Math.min(agendaPage, totalAgendaPages);
  const agendaStart = (currentAgendaPage - 1) * AGENDA_PAGE_SIZE;
  const agendaEnd = agendaStart + AGENDA_PAGE_SIZE;
  const pagedAgendaItems = agendaItems.slice(agendaStart, agendaEnd);
  const agendaFrom = agendaItems.length === 0 ? 0 : agendaStart + 1;
  const agendaTo = Math.min(agendaEnd, agendaItems.length);

  useEffect(() => {
    if (agendaPage > totalAgendaPages) {
      setAgendaPage(totalAgendaPages);
    }
  }, [agendaPage, totalAgendaPages]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Rotinas pessoais</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 280px' },
          gap: 3,
          mb: 3
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
            label="Título"
            fullWidth
            sx={{ mb: 2 }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <TextField
            label="Descrição"
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 2 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            label="Data"
            type="date"
            fullWidth
            sx={{ mb: 2 }}
            value={routineDate}
            onChange={(e) => {
              setRoutineDate(e.target.value);
              setAgendaPage(1);
            }}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Horário"
            type="time"
            fullWidth
            sx={{ mb: 2 }}
            value={routineTime}
            onChange={(e) => setRoutineTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <Button type="submit" variant="contained">Adicionar rotina</Button>
        </Box>
        <Calendar
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          onClearDate={() => {
            setRoutineDate('');
            setAgendaPage(1);
          }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{agendaTitle}</Typography>
        {agendaItems.length === 0 ? (
          <Typography color="text.secondary">{agendaEmptyText}</Typography>
        ) : (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 1,
                maxHeight: { xs: '60vh', md: '68vh' },
                overflowY: 'auto',
                pr: { xs: 0, sm: 0.25 }
              }}
            >
              {pagedAgendaItems.map((item, index) => {
            const isRoutine = item.type === 'routine';
            const isCompleted = item.type === 'task' ? Boolean(item.completed) : false;
            const typeLabel = isRoutine ? 'Rotina' : 'Agendamento';
            const typeBg = isRoutine ? 'var(--accent-soft)' : 'rgba(47, 107, 143, 0.12)';
            const typeColor = isRoutine ? 'var(--accent)' : 'var(--accent-cool)';
            const dateLabel = isRoutine
              ? `${formatDate(item.date)} - ${formatTime(item.time)}`
              : `Vencimento: ${item.date ? formatDate(item.date) : 'Sem vencimento'}`;

            return (
              <Card
                key={`${item.type}-${item.id}`}
                className="stagger-item"
                style={{ '--stagger-delay': `${index * 60}ms` }}
                sx={{
                  mb: 2,
                  border: '1px solid var(--stroke)',
                  borderLeft: isRoutine ? '1px solid var(--stroke)' : '4px solid',
                  borderLeftColor: isRoutine ? 'var(--stroke)' : isCompleted ? 'var(--stroke)' : 'var(--accent)',
                  boxShadow: 'var(--shadow-md)',
                  backgroundColor: isCompleted ? 'var(--surface-warm)' : 'var(--surface)',
                  opacity: isCompleted ? 0.75 : 1
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1">{item.title}</Typography>
                      <Box
                        sx={{
                          px: 1,
                          py: 0.2,
                          borderRadius: '999px',
                          backgroundColor: typeBg,
                          color: typeColor,
                          fontSize: '0.7rem',
                          fontWeight: 600
                        }}
                      >
                        {typeLabel}
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {item.description || 'Sem descrição.'}
                    </Typography>
                    {!isRoutine && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Status: {isCompleted ? 'Concluída' : 'Pendente'}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {dateLabel}
                    </Typography>
                  </Box>
                  {isRoutine ? (
                    <IconButton aria-label="Excluir rotina" onClick={() => handleDelete(item.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <Checkbox
                      checked={isCompleted}
                      onChange={() => toggleComplete(item.id)}
                      inputProps={{ 'aria-label': 'Marcar agendamento como concluído' }}
                      sx={{
                        color: 'var(--accent)',
                        '&.Mui-checked': {
                          color: 'var(--accent)'
                        }
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            );
              })}
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {`Mostrando ${agendaFrom}-${agendaTo} de ${agendaItems.length} | Página ${currentAgendaPage} de ${totalAgendaPages}`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={currentAgendaPage <= 1}
                  onClick={() => setAgendaPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={currentAgendaPage >= totalAgendaPages}
                  onClick={() => setAgendaPage((prev) => Math.min(totalAgendaPages, prev + 1))}
                >
                  Próximo
                </Button>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Routines;
