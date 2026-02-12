import React from 'react';
import { Card, CardContent, Typography, Checkbox, Box, IconButton, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs from 'dayjs';

const TaskCard = ({ task, toggleComplete, onEdit, onDelete, className, style }) => {
  const normalizeLabels = (value) => {
    if (!value) {
      return [];
    }
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw.map((label) => label.trim()).filter(Boolean);
  };

  const priority = task.priority || 'media';
  const priorityMeta = {
    alta: { label: 'Alta', color: 'var(--accent)', bg: 'var(--accent-soft)' },
    media: { label: 'Média', color: 'var(--accent-cool)', bg: 'rgba(47, 107, 143, 0.12)' },
    baixa: { label: 'Baixa', color: 'var(--muted)', bg: 'rgba(111, 103, 95, 0.12)' }
  };
  const priorityStyle = priorityMeta[priority] || priorityMeta.media;
  const labels = normalizeLabels(task.labels);

  return (
    <Card
      className={className}
      style={style}
      sx={{
        mb: 2,
        backgroundColor: task.completed ? 'var(--surface-warm)' : 'var(--surface)',
        border: '1px solid var(--stroke)',
        borderLeft: '4px solid',
        borderLeftColor: task.completed ? 'var(--stroke)' : 'var(--accent)',
        boxShadow: 'var(--shadow-md)',
        opacity: task.completed ? 0.75 : 1
      }}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box onClick={() => onEdit && onEdit(task.id)} sx={{ cursor: onEdit ? 'pointer' : 'default' }}>
          <Typography variant="h6">{task.title}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
            <Box
              sx={{
                px: 1,
                py: 0.2,
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontWeight: 600,
                backgroundColor: priorityStyle.bg,
                color: priorityStyle.color
              }}
            >
              Prioridade {priorityStyle.label}
            </Box>
            {labels.map((label) => (
              <Box
                key={label}
                sx={{
                  px: 1,
                  py: 0.2,
                  borderRadius: '999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(208, 106, 58, 0.12)',
                  color: 'var(--accent)'
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {task.description || 'Sem descrição.'}
          </Typography>
          {task.assignee_name && (
            <Typography variant="caption" color="text.secondary">
              Responsável: {task.assignee_name}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Status: {task.completed ? 'Concluída' : 'Pendente'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Vencimento: {task.due_date && dayjs(task.due_date).isValid()
              ? dayjs(task.due_date).format('DD/MM/YYYY')
              : 'Sem vencimento'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Checkbox
            checked={Boolean(task.completed)}
            onChange={() => toggleComplete(task.id)}
            sx={{
              color: 'var(--accent)',
              '&.Mui-checked': {
                color: 'var(--accent)'
              }
            }}
          />
          {onDelete && (
            <Tooltip title="Excluir">
              <IconButton aria-label="Excluir tarefa" onClick={() => onDelete(task.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default TaskCard;
