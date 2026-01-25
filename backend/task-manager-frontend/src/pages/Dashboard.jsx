import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  Button
} from '@mui/material';
import api from '../services/api';
import TaskList from '../components/TaskList';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Calendar from '../components/Calendar';
import dayjs from 'dayjs';
import { isAdmin } from '../utils/auth';
import EmailIcon from '@mui/icons-material/Email';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

const Dashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [reminderChannels, setReminderChannels] = useState(() => {
    const saved = localStorage.getItem('reminderChannels');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        return { inApp: true, email: false, whatsapp: false };
      }
    }
    return { inApp: true, email: false, whatsapp: false };
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showAdmin = isAdmin();
  const selectedUserId = searchParams.get('user');

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks/');
      setTasks(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchRoutines = async () => {
    try {
      const response = await api.get('/routines');
      setRoutines(response.data || []);
    } catch (error) {
      setRoutines([]);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchRoutines();
  }, []);

  useEffect(() => {
    localStorage.setItem('reminderChannels', JSON.stringify(reminderChannels));
  }, [reminderChannels]);

  const toggleComplete = async (id) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      return;
    }
    try {
      await api.put(`/tasks/${id}`, {
        completed: !task.completed
      });
      fetchTasks();
    } catch (err) { console.error(err); }
  };

  const deleteTask = async (id) => {
    if (!window.confirm('Deseja excluir esta tarefa?')) {
      return;
    }
    try {
      await api.delete(`/tasks/${id}`);
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDateSelect = (date) => {
    if (!date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(dayjs(date).format('YYYY-MM-DD'));
  };

  const clearDateFilter = () => {
    setSelectedDate(null);
  };

  const normalizeLabels = (value) => {
    if (!value) {
      return [];
    }
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw.map((label) => label.trim()).filter(Boolean);
  };

  const labelOptions = useMemo(() => {
    const unique = new Set();
    tasks.forEach((task) => {
      normalizeLabels(task.labels).forEach((label) => unique.add(label));
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const toTime = (value) => {
    if (!value) {
      return null;
    }
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  };

  const today = dayjs();
  const todayKey = today.format('YYYY-MM-DD');

  const filteredTasks = tasks.filter((task) => {
    const matchesFilter = filter === 'all' || (filter === 'completed' ? task.completed : !task.completed);
    const matchesSearch = (task.title || '').toLowerCase().includes(search.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || (task.priority || 'media') === priorityFilter;
    const matchesLabels = labelFilter === 'all' || normalizeLabels(task.labels).includes(labelFilter);
    const matchesDate = !selectedDate
      || (task.due_date && dayjs(task.due_date).isValid()
        && dayjs(task.due_date).format('YYYY-MM-DD') === selectedDate);
    const matchesUser = !selectedUserId || String(task.assignee_id) === selectedUserId;
    return matchesFilter && matchesSearch && matchesPriority && matchesLabels && matchesDate && matchesUser;
  }).sort((a, b) => {
    const aTime = toTime(a.due_date);
    const bTime = toTime(b.due_date);
    if (aTime === null && bTime === null) {
      return 0;
    }
    if (aTime === null) {
      return 1;
    }
    if (bTime === null) {
      return -1;
    }
    return aTime - bTime;
  });

  const tasksToday = tasks.filter((task) => task.due_date && dayjs(task.due_date).isValid()
    && dayjs(task.due_date).format('YYYY-MM-DD') === todayKey);
  const tasksTodayCompleted = tasksToday.filter((task) => task.completed);
  const routinesToday = routines.filter((routine) => routine.routine_date
    && dayjs(routine.routine_date).isValid()
    && dayjs(routine.routine_date).format('YYYY-MM-DD') === todayKey);
  const todayTotal = tasksToday.length + routinesToday.length;
  const todayProgress = tasksToday.length === 0
    ? 0
    : Math.round((tasksTodayCompleted.length / tasksToday.length) * 100);

  const reminderWindowMinutes = 180;
  const reminderWindow = today.add(reminderWindowMinutes, 'minute');
  const routineReminders = routines
    .map((routine) => {
      const dateTime = dayjs(`${routine.routine_date}T${routine.routine_time}`);
      return {
        id: routine.id,
        type: 'routine',
        title: routine.title,
        description: routine.description,
        dateTime
      };
    })
    .filter((item) => item.dateTime.isValid()
      && item.dateTime.isAfter(today)
      && item.dateTime.isBefore(reminderWindow));
  const taskReminders = tasks
    .filter((task) => !task.completed && task.due_date
      && dayjs(task.due_date).isValid()
      && dayjs(task.due_date).format('YYYY-MM-DD') === todayKey)
    .map((task) => ({
      id: task.id,
      type: 'task',
      title: task.title,
      description: task.description
    }));
  const overdueTasks = tasks
    .filter((task) => !task.completed && task.due_date
      && dayjs(task.due_date).isValid()
      && dayjs(task.due_date).isBefore(today, 'day'))
    .map((task) => ({
      id: task.id,
      type: 'task',
      title: task.title,
      description: task.description,
      overdue: true
    }));
  const reminderItems = [...overdueTasks, ...routineReminders, ...taskReminders].sort((a, b) => {
    if (a.type === 'task' && a.overdue && !(b.type === 'task' && b.overdue)) {
      return -1;
    }
    if (b.type === 'task' && b.overdue && !(a.type === 'task' && a.overdue)) {
      return 1;
    }
    if (!a.dateTime && b.dateTime) {
      return 1;
    }
    if (a.dateTime && !b.dateTime) {
      return -1;
    }
    if (a.dateTime && b.dateTime) {
      return a.dateTime.valueOf() - b.dateTime.valueOf();
    }
    return 0;
  });

  const handleReminderChannelChange = (channel) => (event) => {
    setReminderChannels((prev) => ({ ...prev, [channel]: event.target.checked }));
  };

  const buildReminderMessage = (item) => {
    if (item.type === 'routine') {
      const timeLabel = item.dateTime ? item.dateTime.format('HH:mm') : '';
      return `Lembrete de rotina: ${item.title} (${timeLabel})`;
    }
    if (item.overdue) {
      return `Tarefa atrasada: ${item.title}`;
    }
    return `Lembrete de tarefa para hoje: ${item.title}`;
  };

  const handleSendEmail = (item) => {
    const subject = 'Lembrete de tarefa';
    const body = buildReminderMessage(item);
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleSendWhatsApp = (item) => {
    const text = buildReminderMessage(item);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const panelSx = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--stroke)',
    borderRadius: 'var(--radius-lg)',
    p: 2,
    boxShadow: 'var(--shadow-md)'
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 280px' },
          gap: 3
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ mb: 2 }}>Dashboard de Tarefas</Typography>
          <Box sx={{ ...panelSx, mb: 2 }}>
            <Typography variant="subtitle1">Resumo de hoje</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, mt: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Tarefas hoje</Typography>
                <Typography variant="h6">{tasksToday.length}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Concluidas</Typography>
                <Typography variant="h6">{tasksTodayCompleted.length}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Rotinas hoje</Typography>
                <Typography variant="h6">{routinesToday.length}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Total hoje</Typography>
                <Typography variant="h6">{todayTotal}</Typography>
              </Box>
            </Box>
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Progresso diario</Typography>
                <Typography variant="caption" color="text.secondary">{todayProgress}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={todayProgress}
                sx={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(47, 107, 143, 0.12)' }}
              />
            </Box>
          </Box>
          <TextField
            label="Buscar tarefas"
            variant="outlined"
            fullWidth
            sx={{ mb: 2 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Filtros rapidos
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              {[
                { value: 'all', label: 'Todas', color: 'var(--ink)', bg: 'transparent' },
                { value: 'alta', label: 'Alta', color: '#fff', bg: 'var(--accent)' },
                { value: 'media', label: 'Media', color: '#fff', bg: 'var(--accent-cool)' },
                { value: 'baixa', label: 'Baixa', color: 'var(--ink)', bg: 'var(--accent-soft)' }
              ].map((option) => {
                const active = priorityFilter === option.value;
                return (
                  <Chip
                    key={option.value}
                    label={option.label}
                    size="small"
                    onClick={() => setPriorityFilter(option.value)}
                    sx={{
                      borderRadius: '999px',
                      fontWeight: 600,
                      borderColor: active ? option.bg : 'var(--stroke)',
                      backgroundColor: active ? option.bg : 'transparent',
                      color: active ? option.color : 'text.primary'
                    }}
                    variant={active ? 'filled' : 'outlined'}
                  />
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip
                label="Todas etiquetas"
                size="small"
                onClick={() => setLabelFilter('all')}
                sx={{
                  borderRadius: '999px',
                  fontWeight: 600,
                  borderColor: labelFilter === 'all' ? 'var(--accent)' : 'var(--stroke)',
                  backgroundColor: labelFilter === 'all' ? 'var(--accent-soft)' : 'transparent'
                }}
                variant={labelFilter === 'all' ? 'filled' : 'outlined'}
              />
              {labelOptions.map((label) => {
                const active = labelFilter === label;
                return (
                  <Chip
                    key={label}
                    label={label}
                    size="small"
                    onClick={() => setLabelFilter(label)}
                    sx={{
                      borderRadius: '999px',
                      fontWeight: 600,
                      borderColor: active ? 'var(--accent)' : 'var(--stroke)',
                      backgroundColor: active ? 'var(--accent-soft)' : 'transparent'
                    }}
                    variant={active ? 'filled' : 'outlined'}
                  />
                );
              })}
            </Box>
          </Box>
          <Tabs value={filter} onChange={(e, newValue) => setFilter(newValue)} sx={{ mb: 2 }}>
            <Tab label="Todas" value="all" />
            <Tab label="Pendentes" value="pending" />
            <Tab label="Concluidas" value="completed" />
          </Tabs>
          <TaskList
            tasks={filteredTasks}
            toggleComplete={toggleComplete}
            onEdit={showAdmin ? (id) => navigate(`/edit-task/${id}`) : undefined}
            onDelete={showAdmin ? deleteTask : undefined}
          />
        </Box>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={panelSx}>
            <Typography variant="subtitle1">Lembretes proximos</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={Boolean(reminderChannels.inApp)}
                    onChange={handleReminderChannelChange('inApp')}
                  />
                }
                label="In-app"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={Boolean(reminderChannels.email)}
                    onChange={handleReminderChannelChange('email')}
                  />
                }
                label="Email"
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={Boolean(reminderChannels.whatsapp)}
                    onChange={handleReminderChannelChange('whatsapp')}
                  />
                }
                label="WhatsApp"
              />
            </Box>
            <Divider sx={{ my: 1.5 }} />
            {!reminderChannels.inApp ? (
              <Typography variant="body2" color="text.secondary">
                Ative os lembretes in-app para ver os proximos compromissos.
              </Typography>
            ) : reminderItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nenhum lembrete nas proximas {reminderWindowMinutes} minutos.
              </Typography>
            ) : (
              reminderItems.map((item) => {
                const isRoutine = item.type === 'routine';
                const titlePrefix = isRoutine ? 'Rotina' : 'Tarefa';
                const timeLabel = isRoutine && item.dateTime
                  ? item.dateTime.format('HH:mm')
                  : item.overdue
                    ? 'Atrasada'
                    : 'Hoje';

                return (
                  <Box
                    key={`${item.type}-${item.id}`}
                    sx={{
                      display: 'grid',
                      gap: 0.5,
                      pb: 1.5,
                      mb: 1.5,
                      borderBottom: '1px solid var(--stroke)'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="subtitle2">
                        {titlePrefix}: {item.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {timeLabel}
                      </Typography>
                    </Box>
                    {item.description && (
                      <Typography variant="caption" color="text.secondary">
                        {item.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {reminderChannels.email && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EmailIcon fontSize="small" />}
                          onClick={() => handleSendEmail(item)}
                        >
                          Email
                        </Button>
                      )}
                      {reminderChannels.whatsapp && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<WhatsAppIcon fontSize="small" />}
                          onClick={() => handleSendWhatsApp(item)}
                        >
                          WhatsApp
                        </Button>
                      )}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
          <Calendar
            selectedDate={selectedDate ? dayjs(selectedDate) : null}
            onSelectDate={handleDateSelect}
            onClearDate={clearDateFilter}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
