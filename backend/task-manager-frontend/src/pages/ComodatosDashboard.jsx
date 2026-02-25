import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  Typography
} from '@mui/material';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { useNavigate } from 'react-router-dom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import api from '../services/api';

dayjs.extend(customParseFormat);

const panelSx = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--stroke)',
  borderRadius: 'var(--radius-lg)',
  p: 2,
  boxShadow: 'var(--shadow-md)'
};

const parseMaterialItems = (value, fallbackQuantity) => {
  if (value && typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const items = parsed
            .map((item) => ({
              material: String(item?.material || '').trim(),
              quantity: Number(item?.quantity)
            }))
            .filter((item) => item.material && Number.isFinite(item.quantity) && item.quantity > 0);
          if (items.length > 0) {
            return items;
          }
        }
      } catch (err) {
        return [];
      }
    }
    if (trimmed) {
      const quantity = Number.isFinite(Number(fallbackQuantity)) ? Number(fallbackQuantity) : 0;
      const safeQuantity = quantity > 0 ? quantity : 1;
      return [{ material: trimmed, quantity: safeQuantity }];
    }
  }
  return [];
};

const parseClientInfo = (description) => {
  const raw = String(description || '');
  const codeMatch = raw.match(/c[oó]digo do cliente:\s*([^|]+)/i);
  const fantasyMatch = raw.match(/fantasia:\s*([^|]+)/i);
  return {
    clientCode: codeMatch ? codeMatch[1].trim() : '',
    fantasyName: fantasyMatch ? fantasyMatch[1].trim() : ''
  };
};

const parseDateValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return dayjs('');
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const parsed = dayjs(raw, 'DD/MM/YYYY', true);
    if (parsed.isValid()) {
      return parsed;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = dayjs(raw, 'YYYY-MM-DD', true);
    if (parsed.isValid()) {
      return parsed;
    }
  }
  return dayjs(raw);
};

const normalizeOrderStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'concluida') {
    return 'concluida';
  }
  if (raw === 'pendente') {
    return 'pendente';
  }
  if (raw === 'cancelada') {
    return 'cancelada';
  }
  return 'pendente';
};

const withinPeriod = (value, start, end) => {
  if (!value || !value.isValid()) {
    return false;
  }
  return !value.isBefore(start, 'day') && !value.isAfter(end, 'day');
};

const formatPeriodRange = (start, end) => {
  if (!start || !end || !start.isValid() || !end.isValid()) {
    return '';
  }
  if (start.isSame(end, 'day')) {
    return start.format('DD/MM/YYYY');
  }
  if (start.isSame(end, 'month')) {
    return `${start.format('DD')} a ${end.format('DD/MM/YYYY')}`;
  }
  return `${start.format('DD/MM/YYYY')} a ${end.format('DD/MM/YYYY')}`;
};

const getMonthWeekMeta = (baseDate) => {
  const safeBase = baseDate && typeof baseDate.isValid === 'function' && baseDate.isValid()
    ? baseDate
    : dayjs();
  const today = dayjs();
  const monthStart = safeBase.startOf('month');
  const daysInMonth = monthStart.daysInMonth();
  const isCurrentMonth = monthStart.isSame(today, 'month');
  const dayLimit = isCurrentMonth ? Math.min(today.date(), daysInMonth) : daysInMonth;
  const displayEnd = monthStart.date(dayLimit).endOf('day');
  const weekCount = Math.max(1, Math.ceil(dayLimit / 7));
  const currentWeekIndex = isCurrentMonth
    ? Math.min(weekCount, Math.max(1, Math.ceil(today.date() / 7)))
    : 1;
  return {
    monthStart,
    daysInMonth,
    isCurrentMonth,
    dayLimit,
    displayEnd,
    weekCount,
    currentWeekIndex,
    monthKey: monthStart.format('YYYY-MM')
  };
};

const buildMaterialSummary = (items) => {
  if (!items || items.length === 0) {
    return 'Sem materiais informados';
  }
  const preview = items.slice(0, 2).map((item) => `${item.material} (${item.quantity})`);
  const remaining = items.length - preview.length;
  return remaining > 0 ? `${preview.join(', ')} +${remaining}` : preview.join(', ');
};

const ComodatosDashboard = () => {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [pickupOrders, setPickupOrders] = useState([]);
  const [periodDate, setPeriodDate] = useState(dayjs());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(() => {
    const meta = getMonthWeekMeta(dayjs());
    return meta.currentWeekIndex;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoveredDayKey, setHoveredDayKey] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const loadOrdersByStatus = async (statusValue) => {
        const limit = 200;
        let offset = 0;
        const merged = [];
        while (true) {
          const response = await api.get('/pickup-catalog/orders', {
            params: {
              status: statusValue,
              limit,
              offset
            }
          });
          const payload = response?.data;
          const rows = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
              ? payload.items
              : [];
          merged.push(...rows);
          if (rows.length < limit) {
            break;
          }
          offset += limit;
        }
        return merged;
      };

      try {
        setLoading(true);
        const [deliveriesResponse, pickupsResponse, pickupOrdersResponse] = await Promise.all([
          api.get('/deliveries'),
          api.get('/pickups'),
          Promise.all([
            loadOrdersByStatus('concluida'),
            loadOrdersByStatus('pendente')
          ])
            .then(([concludedOrders, pendingOrders]) => {
              const byId = new Map();
              [...concludedOrders, ...pendingOrders].forEach((order) => {
                const key = Number(order?.id || 0);
                if (key > 0) {
                  byId.set(key, order);
                }
              });
              return Array.from(byId.values());
            })
            .catch(() => [])
        ]);
        const deliveriesPayload = deliveriesResponse?.data;
        const pickupsPayload = pickupsResponse?.data;
        setDeliveries(
          Array.isArray(deliveriesPayload)
            ? deliveriesPayload
            : Array.isArray(deliveriesPayload?.items)
              ? deliveriesPayload.items
              : []
        );
        setPickups(
          Array.isArray(pickupsPayload)
            ? pickupsPayload
            : Array.isArray(pickupsPayload?.items)
              ? pickupsPayload.items
              : []
        );
        setPickupOrders(Array.isArray(pickupOrdersResponse) ? pickupOrdersResponse : []);
        setError('');
      } catch (err) {
        setError('Não foi possível carregar os dados de comodatos.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const monthMeta = useMemo(() => getMonthWeekMeta(periodDate), [periodDate]);
  const { monthFullStart, monthFullEnd } = useMemo(() => ({
    monthFullStart: monthMeta.monthStart.startOf('day'),
    monthFullEnd: monthMeta.monthStart.endOf('month')
  }), [monthMeta.monthStart]);

  useEffect(() => {
    setSelectedWeekIndex((prev) => {
      const safePrev = prev || 1;
      return Math.min(monthMeta.weekCount, Math.max(1, safePrev));
    });
  }, [monthMeta.weekCount]);

  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const weekIndex = Math.min(monthMeta.weekCount, Math.max(1, selectedWeekIndex || 1));
    const startDay = (weekIndex - 1) * 7 + 1;
    const endDay = Math.min(weekIndex * 7, monthMeta.dayLimit);
    const start = monthMeta.monthStart.date(startDay).startOf('day');
    const end = monthMeta.monthStart.date(endDay).endOf('day');
    const rangeLabel = formatPeriodRange(start, end);
    return {
      periodStart: start,
      periodEnd: end,
      periodLabel: rangeLabel
        ? `Semana ${weekIndex} (${rangeLabel})`
        : `Semana ${weekIndex}`
    };
  }, [monthMeta, selectedWeekIndex]);

  const deliveriesMapped = deliveries.map((item) => {
    const dateValue = parseDateValue(item.delivery_date || item.deliveryDate);
    const clientInfo = parseClientInfo(item.description);
    return {
      ...item,
      ...clientInfo,
      dateValue,
      hasDocs: Boolean(item.pdf_one_url) && Boolean(item.pdf_two_url),
      timeLabel: item.delivery_time ? String(item.delivery_time).slice(0, 5) : ''
    };
  });

  const pickupsMapped = pickups.map((item) => {
    const dateValue = parseDateValue(item.pickup_date || item.pickupDate);
    const clientInfo = parseClientInfo(item.description);
    const materialItems = parseMaterialItems(item.material, item.quantity);
    return {
      ...item,
      recordKey: `pickup-${item.id}`,
      ...clientInfo,
      dateValue,
      materialItems,
      hasPhoto: Boolean(item.photo_url)
    };
  });

  const pickupOrdersMapped = pickupOrders.map((item) => {
    const fallbackDescription = String(item.summary_line || '').trim();
    const clientInfoFromSummary = parseClientInfo(fallbackDescription);
    const materialItems = fallbackDescription && !/^sem itens informados\.?$/i.test(fallbackDescription)
      ? parseMaterialItems(fallbackDescription, 1)
      : [];
    const parsedQuantity = materialItems.reduce((sum, materialItem) => sum + (Number(materialItem.quantity) || 0), 0);
    return {
      ...item,
      recordKey: `order-${item.id}`,
      dateValue: parseDateValue(item.withdrawal_date || item.status_updated_at || item.created_at),
      orderStatus: normalizeOrderStatus(item.status),
      clientCode: String(item.client_code || clientInfoFromSummary.clientCode || '').trim(),
      fantasyName: String(item.nome_fantasia || clientInfoFromSummary.fantasyName || '').trim(),
      materialItems,
      quantity: parsedQuantity,
      hasPhoto: false
    };
  });

  const pickupsAllMapped = [...pickupsMapped, ...pickupOrdersMapped];

  const deliveriesInMonthFull = deliveriesMapped.filter((item) =>
    withinPeriod(item.dateValue, monthFullStart, monthFullEnd)
  );
  const pickupsInMonthFull = pickupsAllMapped.filter((item) =>
    withinPeriod(item.dateValue, monthFullStart, monthFullEnd)
  );

  const deliveriesInMonth = deliveriesMapped.filter((item) =>
    withinPeriod(item.dateValue, monthMeta.monthStart, monthMeta.displayEnd)
  );
  const pickupsInMonth = pickupsAllMapped.filter((item) =>
    withinPeriod(item.dateValue, monthMeta.monthStart, monthMeta.displayEnd)
  );
  const pickupOrdersInMonth = pickupOrdersMapped.filter((item) =>
    withinPeriod(item.dateValue, monthMeta.monthStart, monthMeta.displayEnd)
  );

  const deliveriesInPeriod = deliveriesInMonth.filter((item) => withinPeriod(item.dateValue, periodStart, periodEnd));
  const pickupsInPeriod = pickupsInMonth.filter((item) => withinPeriod(item.dateValue, periodStart, periodEnd));
  const pickupOrdersInPeriod = pickupOrdersInMonth.filter((item) => withinPeriod(item.dateValue, periodStart, periodEnd));
  const pickupOrdersConcludedInPeriod = pickupOrdersInPeriod.filter((item) => item.orderStatus === 'concluida');
  const pickupOrdersPendingInPeriod = pickupOrdersInPeriod.filter((item) => item.orderStatus === 'pendente');

  const deliveryDocsComplete = deliveriesInPeriod.filter((item) => item.hasDocs).length;
  const deliveryDocsRate = deliveriesInPeriod.length === 0
    ? 0
    : Math.round((deliveryDocsComplete / deliveriesInPeriod.length) * 100);

  const pickupsWithPhoto = pickupsInPeriod.filter((item) => item.hasPhoto).length;
  const pickupPhotoRate = pickupsInPeriod.length === 0
    ? 0
    : Math.round((pickupsWithPhoto / pickupsInPeriod.length) * 100);

  const totalPickupQuantity = pickupsInPeriod.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalMaterialItems = pickupsInPeriod.reduce((sum, item) => sum + item.materialItems.length, 0);

  const uniqueClients = useMemo(() => {
    const set = new Set();
    [...deliveriesInPeriod, ...pickupsInPeriod].forEach((item) => {
      const code = item.clientCode || '';
      const fantasy = item.fantasyName || '';
      const key = `${code}::${fantasy}`;
      if (code || fantasy) {
        set.add(key);
      }
    });
    return set.size;
  }, [deliveriesInPeriod, pickupsInPeriod]);

  const materialTotals = useMemo(() => {
    const totals = new Map();
    pickupsInPeriod.forEach((pickup) => {
      pickup.materialItems.forEach((materialItem) => {
        const key = materialItem.material;
        totals.set(key, (totals.get(key) || 0) + materialItem.quantity);
      });
    });
    return Array.from(totals.entries())
      .map(([material, quantity]) => ({ material, quantity }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [pickupsInPeriod]);

  const topMaterials = materialTotals.slice(0, 3);
  const maxMaterialQuantity = topMaterials.reduce((max, item) => Math.max(max, item.quantity), 0) || 1;

  const periodDays = useMemo(() => {
    const days = [];
    let cursor = monthFullStart.startOf('day');
    const end = monthFullEnd.startOf('day');
    while (!cursor.isAfter(end, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }
    return days;
  }, [monthFullStart, monthFullEnd]);

  const activityByDay = useMemo(() => {
    const deliveryCounts = new Map();
    const pickupCounts = new Map();
    deliveriesInMonthFull.forEach((item) => {
      const key = item.dateValue.format('YYYY-MM-DD');
      deliveryCounts.set(key, (deliveryCounts.get(key) || 0) + 1);
    });
    pickupsInMonthFull.forEach((item) => {
      const key = item.dateValue.format('YYYY-MM-DD');
      pickupCounts.set(key, (pickupCounts.get(key) || 0) + 1);
    });
    return periodDays.map((day) => {
      const key = day.format('YYYY-MM-DD');
      const deliveriesCount = deliveryCounts.get(key) || 0;
      const pickupsCount = pickupCounts.get(key) || 0;
      return {
        key,
        label: day.format('D'),
        deliveriesCount,
        pickupsCount,
        total: deliveriesCount + pickupsCount
      };
    });
  }, [deliveriesInMonthFull, pickupsInMonthFull, periodDays]);

  const maxActivityTotal = activityByDay.reduce((max, item) => Math.max(max, item.total), 0) || 1;

  const maxActivityDayKey = useMemo(() => {
    const maxItem = activityByDay.reduce((best, item) => {
      if (!best || item.total > best.total) {
        return item;
      }
      return best;
    }, null);
    return maxItem?.key || '';
  }, [activityByDay]);

  const maxActivityDay = useMemo(() => {
    if (!maxActivityDayKey) {
      return null;
    }
    return activityByDay.find((item) => item.key === maxActivityDayKey) || null;
  }, [activityByDay, maxActivityDayKey]);

  const hoveredDayItem = useMemo(() => {
    if (!hoveredDayKey) {
      return null;
    }
    return activityByDay.find((item) => item.key === hoveredDayKey) || null;
  }, [activityByDay, hoveredDayKey]);

  const weekSummaries = useMemo(() => {
    const { monthStart, dayLimit, displayEnd, weekCount, isCurrentMonth, currentWeekIndex } = monthMeta;

    const summaries = Array.from({ length: weekCount }, (_, index) => {
      const weekIndex = index + 1;
      const startDay = index * 7 + 1;
      const endDay = Math.min((index + 1) * 7, dayLimit);
      const weekStart = monthStart.date(startDay).startOf('day');
      const weekEnd = monthStart.date(endDay).endOf('day');
      return {
        key: `${monthStart.format('YYYY-MM')}-S${weekIndex}`,
        weekIndex,
        weekLabel: `Semana ${weekIndex}`,
        weekStart,
        weekEnd,
        label: `${weekStart.format('DD/MM')} - ${weekEnd.format('DD/MM')}`,
        isCurrentWeek: isCurrentMonth && weekIndex === currentWeekIndex,
        isSelectedWeek: weekIndex === selectedWeekIndex,
        deliveries: 0,
        pickups: 0,
        total: 0
      };
    });

    const addToWeek = (dateValue, type) => {
      if (!dateValue || !dateValue.isValid() || dateValue.isAfter(displayEnd, 'day')) {
        return;
      }
      const computedIndex = Math.ceil(dateValue.date() / 7);
      const boundedIndex = Math.min(weekCount, Math.max(1, computedIndex));
      const entry = summaries[boundedIndex - 1];
      if (!entry) {
        return;
      }
      if (type === 'delivery') {
        entry.deliveries += 1;
      } else {
        entry.pickups += 1;
      }
      entry.total += 1;
    };

    deliveriesInMonth.forEach((item) => addToWeek(item.dateValue, 'delivery'));
    pickupsInMonth.forEach((item) => addToWeek(item.dateValue, 'pickup'));

    return summaries;
  }, [deliveriesInMonth, pickupsInMonth, monthMeta, selectedWeekIndex]);

  const selectedWeekSummary = useMemo(() => {
    if (!weekSummaries || weekSummaries.length === 0) {
      return null;
    }
    return weekSummaries.find((week) => week.weekIndex === selectedWeekIndex) || weekSummaries[0];
  }, [weekSummaries, selectedWeekIndex]);

  useEffect(() => {
    if (!hoveredDayKey) {
      return;
    }
    const stillExists = activityByDay.some((item) => item.key === hoveredDayKey);
    if (!stillExists) {
      setHoveredDayKey('');
    }
  }, [activityByDay, hoveredDayKey]);

  const recentActivities = useMemo(() => {
    const deliveryActivities = deliveriesInPeriod.map((item) => ({
      id: `delivery-${item.id}`,
      type: 'Entrega',
      dateValue: item.dateValue,
      dateLabel: item.dateValue.format('DD/MM/YYYY'),
      timeLabel: item.timeLabel,
      clientLabel: item.fantasyName ? `${item.fantasyName} (${item.clientCode || 'Sem código'})` : (item.clientCode || 'Cliente'),
      detail: item.hasDocs ? 'Documentação completa (NF e contrato)' : 'Documentação pendente'
    }));
    const pickupActivities = pickupsInPeriod.map((item) => ({
      id: `pickup-${item.recordKey || item.id}`,
      type: 'Retirada',
      dateValue: item.dateValue,
      dateLabel: item.dateValue.format('DD/MM/YYYY'),
      timeLabel: '',
      clientLabel: item.fantasyName ? `${item.fantasyName} (${item.clientCode || 'Sem código'})` : (item.clientCode || 'Cliente'),
      detail: buildMaterialSummary(item.materialItems)
    }));
    return [...deliveryActivities, ...pickupActivities]
      .sort((a, b) => b.dateValue.valueOf() - a.dateValue.valueOf())
      .slice(0, 3);
  }, [deliveriesInPeriod, pickupsInPeriod]);

  const periodInputType = 'month';
  const periodInputValue = periodDate.format('YYYY-MM');

  const setMonthDate = (nextDate, preferredWeekIndex) => {
    const meta = getMonthWeekMeta(nextDate);
    const defaultWeekIndex = meta.isCurrentMonth ? meta.currentWeekIndex : 1;
    const targetWeekIndex = preferredWeekIndex ?? defaultWeekIndex;
    const clampedWeekIndex = Math.min(meta.weekCount, Math.max(1, targetWeekIndex));
    setPeriodDate(meta.monthStart);
    setSelectedWeekIndex(clampedWeekIndex);
  };

  const handlePeriodDateChange = (value) => {
    if (!value) {
      return;
    }
    setHoveredDayKey('');
    setMonthDate(dayjs(`${value}-01`));
  };

  const monthLabel = monthMeta.monthStart.format('MM/YYYY');

  const shiftMonth = (direction) => {
    const base = periodDate && typeof periodDate.isValid === 'function' && periodDate.isValid()
      ? periodDate
      : dayjs();
    const nextDate = base.startOf('month').add(direction, 'month');
    setHoveredDayKey('');
    setMonthDate(nextDate);
  };

  const handlePrevMonth = () => shiftMonth(-1);
  const handleNextMonth = () => shiftMonth(1);

  const handlePrevWeek = () => {
    setHoveredDayKey('');
    if (selectedWeekIndex > 1) {
      setSelectedWeekIndex(selectedWeekIndex - 1);
      return;
    }
    const prevMonth = monthMeta.monthStart.subtract(1, 'month');
    const prevMeta = getMonthWeekMeta(prevMonth);
    setMonthDate(prevMonth, prevMeta.weekCount);
  };

  const handleNextWeek = () => {
    setHoveredDayKey('');
    if (selectedWeekIndex < monthMeta.weekCount) {
      setSelectedWeekIndex(selectedWeekIndex + 1);
      return;
    }
    const nextMonth = monthMeta.monthStart.add(1, 'month');
    const nextMeta = getMonthWeekMeta(nextMonth);
    const nextWeekIndex = nextMeta.isCurrentMonth ? nextMeta.currentWeekIndex : 1;
    setMonthDate(nextMonth, nextWeekIndex);
  };

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Dashboard de comodatos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visão executiva de entregas e retiradas por período.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => navigate('/deliveries/history')}>
            Entregas
          </Button>
          <Button variant="outlined" onClick={() => navigate('/pickups/center?view=withdrawals')}>
            Retiradas
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ ...panelSx, display: 'grid', gap: 1.5 }}>
        <Typography variant="subtitle1">Filtros</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Box sx={{ display: 'grid', gap: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              Data de referência
            </Typography>
            <input
              type={periodInputType}
              value={periodInputValue}
              onChange={(e) => handlePeriodDateChange(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 10,
                border: '1px solid var(--stroke)',
                fontFamily: 'var(--font-sans)'
              }}
            />
          </Box>
          <Box sx={{ ml: { xs: 0, md: 1 }, display: 'grid', gap: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              Período selecionado
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {periodLabel}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: 2
        }}
      >
        <Box sx={panelSx}>
          <Typography variant="caption" color="text.secondary">Entregas</Typography>
          <Typography variant="h4">{deliveriesInPeriod.length}</Typography>
          <Typography variant="body2" color="text.secondary">
            Total de entregas no mês selecionado
          </Typography>
        </Box>
        <Box sx={panelSx}>
          <Typography variant="caption" color="text.secondary">Ordens de retirada</Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h5">{pickupOrdersConcludedInPeriod.length}</Typography>
              <Typography variant="caption" color="text.secondary">
                Concluídas
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5">{pickupOrdersPendingInPeriod.length}</Typography>
              <Typography variant="caption" color="text.secondary">
                Pendentes
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Totais por status no mês selecionado
          </Typography>
        </Box>
        <Box sx={panelSx}>
          <Typography variant="caption" color="text.secondary">Materiais</Typography>
          <Typography variant="h4">{totalMaterialItems}</Typography>
          <Typography variant="body2" color="text.secondary">
            {totalPickupQuantity} itens retirados no período
          </Typography>
        </Box>
        <Box sx={panelSx}>
          <Typography variant="caption" color="text.secondary">Clientes únicos</Typography>
          <Typography variant="h4">{uniqueClients}</Typography>
          <Typography variant="body2" color="text.secondary">
            Entregas e retiradas combinadas
          </Typography>
        </Box>
      </Box>

      {loading ? (
        <Box sx={panelSx}>
          <Typography color="text.secondary">Carregando dados do dashboard...</Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.1fr) minmax(0, 0.9fr)' },
            gap: 2
          }}
        >
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ ...panelSx, display: 'grid', gap: 1 }}>
              <Typography variant="subtitle1">Ritmo diário</Typography>
              <Typography variant="body2" color="text.secondary">
                Volume de entregas e retiradas por dia no período selecionado.
              </Typography>
              <Divider />
              <Box sx={{ display: 'grid', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      border: '1px solid var(--stroke)',
                      borderRadius: 999,
                      px: 0.5,
                      py: 0.25,
                      backgroundColor: 'var(--surface)'
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={handlePrevMonth}
                      aria-label="Mês anterior"
                    >
                      <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                    <Typography
                      variant="subtitle2"
                      sx={{ minWidth: 78, textAlign: 'center', fontWeight: 700 }}
                    >
                      {monthLabel}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={handleNextMonth}
                      aria-label="Próximo mês"
                    >
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: 1,
                        backgroundColor: 'rgba(208, 106, 58, 0.8)'
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Entregas
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: 1,
                        backgroundColor: 'rgba(47, 107, 143, 0.85)'
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Retiradas
                    </Typography>
                  </Box>
                </Box>

                {maxActivityDay && maxActivityDay.total > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Maior volume: {dayjs(maxActivityDay.key).format('DD/MM/YYYY')} · {maxActivityDay.total} ações
                  </Typography>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                  <Box sx={{ width: '100%', maxWidth: 980, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        position: 'relative',
                        gap: 0.25,
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        minHeight: 210,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        px: 1,
                        pt: 5,
                        pb: 0.75,
                        borderBottom: '1px solid var(--stroke)',
                        backgroundImage:
                          'repeating-linear-gradient(to top, rgba(15, 23, 42, 0.06) 0, rgba(15, 23, 42, 0.06) 1px, transparent 1px, transparent 36px)'
                      }}
                    >
                      {hoveredDayItem && (
                        <Box
                          sx={{
                            position: 'absolute',
                            left: '50%',
                            top: '43%',
                            transform: 'translate(-50%, -50%)',
                            minWidth: 220,
                            maxWidth: 280,
                            px: 1.75,
                            py: 1.25,
                            borderRadius: 2,
                            border: '1px solid var(--stroke)',
                            backgroundColor: 'var(--surface)',
                            boxShadow: 'var(--shadow-md)',
                            zIndex: 4,
                            display: 'grid',
                            gap: 0.4,
                            textAlign: 'center',
                            pointerEvents: 'none'
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                            {dayjs(hoveredDayItem.key).format('DD/MM/YYYY')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Entregas: {hoveredDayItem.deliveriesCount}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Retiradas: {hoveredDayItem.pickupsCount}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            Total: {hoveredDayItem.total}
                          </Typography>
                        </Box>
                      )}

                      {activityByDay.map((item) => {
                        const safeTotal = item.total || 0;
                        const totalHeight = safeTotal === 0
                          ? 8
                          : Math.max(24, Math.round((safeTotal / maxActivityTotal) * 150));
                        const deliveriesHeight = safeTotal === 0
                          ? 0
                          : Math.round((item.deliveriesCount / safeTotal) * totalHeight);
                        const pickupsHeight = safeTotal === 0
                          ? 0
                          : Math.max(0, totalHeight - deliveriesHeight);
                        const isMaxDay = item.key === maxActivityDayKey && safeTotal > 0;
                        const isHovered = hoveredDayKey === item.key;

                        return (
                          <Box
                            key={item.key}
                            sx={{
                              flex: '1 1 0',
                              minWidth: 0,
                              maxWidth: 34,
                              display: 'grid',
                              gap: 0.35,
                              justifyItems: 'center',
                              position: 'relative'
                            }}
                          >
                            <Typography
                              variant="caption"
                              color={isMaxDay ? 'text.primary' : 'text.secondary'}
                              sx={{ fontWeight: isMaxDay ? 700 : 500 }}
                            >
                              {safeTotal}
                            </Typography>

                            <Box
                              onMouseEnter={() => setHoveredDayKey(item.key)}
                              onMouseLeave={() => setHoveredDayKey('')}
                              onFocus={() => setHoveredDayKey(item.key)}
                              onBlur={() => setHoveredDayKey('')}
                              role="img"
                              aria-label={`Dia ${item.label} com ${safeTotal} ações`}
                              tabIndex={0}
                              sx={{
                                width: 22,
                                height: totalHeight,
                                borderRadius: 1.75,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column-reverse',
                                border: isMaxDay ? '2px solid rgba(208, 106, 58, 0.9)' : '1px solid var(--stroke)',
                                backgroundColor: 'rgba(15, 23, 42, 0.05)',
                                boxShadow: isMaxDay
                                  ? '0 0 0 3px rgba(208, 106, 58, 0.18)'
                                  : 'none',
                                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                                transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                                cursor: safeTotal > 0 ? 'pointer' : 'default',
                                outline: isHovered ? '2px solid rgba(47, 107, 143, 0.35)' : 'none',
                                outlineOffset: 2
                              }}
                            >
                              <Box
                                sx={{
                                  height: pickupsHeight,
                                  backgroundColor: 'rgba(47, 107, 143, 0.9)'
                                }}
                              />
                              <Box
                                sx={{
                                  height: deliveriesHeight,
                                  backgroundColor: 'rgba(208, 106, 58, 0.85)'
                                }}
                              />
                            </Box>

                            <Typography
                              variant="caption"
                              color={isMaxDay ? 'text.primary' : 'text.secondary'}
                              sx={{ fontWeight: isMaxDay ? 700 : 500 }}
                            >
                              {item.label}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Box sx={{ ...panelSx, display: 'grid', gap: 1 }}>
              <Typography variant="subtitle1">Materiais mais retirados</Typography>
              <Typography variant="body2" color="text.secondary">
                Top materiais por quantidade retirada no período.
              </Typography>
              <Divider />
              {topMaterials.length === 0 ? (
                <Typography color="text.secondary">Nenhum material retirado neste período.</Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {topMaterials.map((item) => {
                    const width = Math.max(8, Math.round((item.quantity / maxMaterialQuantity) * 100));
                    return (
                      <Box key={item.material} sx={{ display: 'grid', gap: 0.25 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {item.material}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.quantity}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            height: 10,
                            borderRadius: 999,
                            backgroundColor: 'rgba(208, 106, 58, 0.18)',
                            width: `${width}%`
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ ...panelSx, display: 'grid', gap: 1 }}>
              <Typography variant="subtitle1">Linha do tempo</Typography>
              <Typography variant="body2" color="text.secondary">
                Últimas movimentações de comodatos no período.
              </Typography>
              <Divider />
              <Box sx={{ display: 'grid', gap: 0.75 }}>
                {maxActivityDay && maxActivityDay.total > 0 ? (
                  <Box
                    sx={{
                      border: '1px solid var(--stroke)',
                      borderRadius: 'var(--radius-md)',
                      p: 1,
                      display: 'grid',
                      gap: 0.25,
                      backgroundColor: 'rgba(208, 106, 58, 0.06)'
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Dia com maior volume
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      {dayjs(maxActivityDay.key).format('DD/MM/YYYY')} · {maxActivityDay.total} ações
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Entregas: {maxActivityDay.deliveriesCount} · Retiradas: {maxActivityDay.pickupsCount}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    Nenhuma movimentação registrada neste mês.
                  </Typography>
                )}

                <Box
                  sx={{
                    border: '1px solid var(--stroke)',
                    borderRadius: 'var(--radius-md)',
                    p: 1,
                    display: 'grid',
                    gap: 0.5,
                    backgroundColor: 'rgba(47, 107, 143, 0.05)'
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap'
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Totais por semana
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <IconButton size="small" onClick={handlePrevWeek} aria-label="Semana anterior">
                        <ChevronLeftIcon fontSize="small" />
                      </IconButton>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 700, minWidth: 86, textAlign: 'center' }}
                      >
                        Semana {selectedWeekIndex}
                      </Typography>
                      <IconButton size="small" onClick={handleNextWeek} aria-label="Próxima semana">
                        <ChevronRightIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        {monthLabel}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                    {selectedWeekSummary ? (
                      <Box
                        sx={{
                          border: selectedWeekSummary.isCurrentWeek
                            ? '1px solid rgba(47, 107, 143, 0.7)'
                            : '1px solid var(--stroke)',
                          borderRadius: 'var(--radius-md)',
                          p: 1.25,
                          display: 'grid',
                          gap: 0.25,
                          backgroundColor: selectedWeekSummary.isCurrentWeek
                            ? 'rgba(47, 107, 143, 0.10)'
                            : 'var(--surface)',
                          boxShadow: selectedWeekSummary.isCurrentWeek
                            ? '0 0 0 2px rgba(47, 107, 143, 0.18)'
                            : 'none'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {selectedWeekSummary.weekLabel}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {monthLabel}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {selectedWeekSummary.label}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1.25,
                            flexWrap: 'wrap'
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Entregas: {selectedWeekSummary.deliveries}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Retiradas: {selectedWeekSummary.pickups}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ fontWeight: 800, textAlign: 'right' }}>
                          Total: {selectedWeekSummary.total}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Nenhuma semana disponível para este mês.
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Últimas Retiradas/Entregas
              </Typography>
              {recentActivities.length === 0 ? (
                <Typography color="text.secondary">Nenhuma movimentação no período selecionado.</Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {recentActivities.map((activity) => (
                    <Box
                      key={activity.id}
                      sx={{
                        border: '1px solid var(--stroke)',
                        borderRadius: 'var(--radius-md)',
                        p: 1.25,
                        display: 'grid',
                        gap: 0.25,
                        backgroundColor: 'var(--surface)'
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="subtitle2">
                          {activity.type}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {activity.dateLabel}{activity.timeLabel ? ` · ${activity.timeLabel}` : ''}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {activity.clientLabel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {activity.detail}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Box sx={{ ...panelSx, display: 'grid', gap: 1 }}>
              <Typography variant="subtitle1">Indicadores de qualidade</Typography>
              <Typography variant="body2" color="text.secondary">
                Nível de evidências registradas no período.
              </Typography>
              <Divider />
              <Box sx={{ display: 'grid', gap: 1 }}>
                <Box sx={{ display: 'grid', gap: 0.25 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Entregas com NF e contrato
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {deliveryDocsRate}%
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: 'rgba(208, 106, 58, 0.18)',
                      width: `${Math.max(6, deliveryDocsRate)}%`
                    }}
                  />
                </Box>
                <Box sx={{ display: 'grid', gap: 0.25 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Retiradas com foto
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {pickupPhotoRate}%
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: 'rgba(47, 107, 143, 0.22)',
                      width: `${Math.max(6, pickupPhotoRate)}%`
                    }}
                  />
                </Box>
              </Box>
              <Divider />
              <Box sx={{ display: 'grid', gap: 0.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Destaque do período
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {deliveriesInPeriod.length + pickupsInPeriod.length} movimentações registradas
                  com {uniqueClients} clientes impactados.
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ComodatosDashboard;


