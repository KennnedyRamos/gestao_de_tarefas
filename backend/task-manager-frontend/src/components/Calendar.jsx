import React, { useMemo, useState } from 'react';
import { Box, Typography, IconButton, Button, ButtonBase } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import dayjs from 'dayjs';

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const Calendar = ({ selectedDate, onSelectDate, onClearDate }) => {
  const today = dayjs();
  const selection = selectedDate ? dayjs(selectedDate) : null;
  const [currentMonth, setCurrentMonth] = useState(
    (selection || today).startOf('month')
  );

  const monthLabel = `${MONTHS[currentMonth.month()]} ${currentMonth.year()}`;

  const days = useMemo(() => {
    const start = currentMonth.startOf('month').startOf('week');
    return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'));
  }, [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => prev.subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => prev.add(1, 'month'));
  };

  const handleToday = () => {
    const current = today.startOf('month');
    setCurrentMonth(current);
    if (onSelectDate) {
      onSelectDate(today);
    }
  };

  const handleSelectDate = (date) => {
    if (!date.isSame(currentMonth, 'month')) {
      setCurrentMonth(date.startOf('month'));
    }
    if (onSelectDate) {
      onSelectDate(date);
    }
  };

  return (
    <Box
      sx={{
        p: 2,
        border: '1px solid var(--stroke)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--surface)',
        boxShadow: 'var(--shadow-md)'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontFamily: 'var(--font-display)' }}>Calendário</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            onClick={handleToday}
            sx={{ textTransform: 'none', fontWeight: 600, color: 'var(--accent)' }}
          >
            Hoje
          </Button>
          {onClearDate && (
            <Button
              size="small"
              onClick={onClearDate}
              sx={{ textTransform: 'none', fontWeight: 600, color: 'var(--accent-cool)' }}
            >
              Limpar
            </Button>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <IconButton
          aria-label="Mês anterior"
          onClick={handlePrevMonth}
          size="small"
          sx={{ border: '1px solid var(--stroke)', backgroundColor: 'var(--surface)' }}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {monthLabel}
        </Typography>
        <IconButton
          aria-label="Próximo mês"
          onClick={handleNextMonth}
          size="small"
          sx={{ border: '1px solid var(--stroke)', backgroundColor: 'var(--surface)' }}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
        {WEEK_DAYS.map((day) => (
          <Typography key={day} variant="caption" color="text.secondary" align="center">
            {day}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {days.map((date) => {
          const isToday = date.isSame(today, 'day');
          const isSelected = selection ? date.isSame(selection, 'day') : false;
          const isCurrentMonth = date.isSame(currentMonth, 'month');
          return (
            <ButtonBase
              key={date.format('YYYY-MM-DD')}
              onClick={() => handleSelectDate(date)}
              sx={{
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                color: isSelected
                  ? '#fff'
                  : isCurrentMonth
                    ? 'text.primary'
                    : 'text.disabled',
                border: isToday && !isSelected ? '1px solid' : '1px solid transparent',
                borderColor: isToday && !isSelected ? 'var(--accent)' : 'transparent'
              }}
            >
              <Typography variant="body2">{date.date()}</Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
};

export default Calendar;
