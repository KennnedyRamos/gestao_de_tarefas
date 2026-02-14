import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import api from '../services/api';
import TaskList from '../components/TaskList';
import { hasPermission } from '../utils/auth';

const Assignments = () => {
  const [tasks, setTasks] = useState([]);
  const canManageTasks = hasPermission('tasks.manage');

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks/');
      setTasks(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

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

  const toTime = (value) => {
    if (!value) {
      return null;
    }
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  };

  const sortedTasks = [...tasks].sort((a, b) => {
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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Atribuições</Typography>
      <TaskList
        tasks={sortedTasks}
        toggleComplete={toggleComplete}
        onDelete={canManageTasks ? deleteTask : undefined}
      />
    </Box>
  );
};

export default Assignments;
