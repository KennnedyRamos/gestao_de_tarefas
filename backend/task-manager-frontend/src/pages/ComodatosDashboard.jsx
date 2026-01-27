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
import isoWeek from 'dayjs/plugin/isoWeek';
import { useNavigate } from 'react-router-dom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import api from '../services/api';

dayjs.extend(isoWeek);

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

const withinPeriod = (value, start, end) => {
  if (!value || !value.isValid()) {
    return false;
  }
  return !value.isBefore(start, 'day') && !value.isAfter(end, 'day');
};

const formatPeriodRange = (start, end) => {
  return `${start.format('DD/MM/YYYY')} - ${end.format('DD/MM/YYYY')}`;
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
  const [periodDate, setPeriodDate] = useState(dayjs());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoveredDayKey, setHoveredDayKey] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [deliveriesResponse, pickupsResponse] = await Promise.all([
          api.get('/deliveries'),
          api.get('/pickups')
        ]);
        setDeliveries(deliveriesResponse.data || []);
        setPickups(pickupsResponse.data || []);
        setError('');
      } catch (err) {
        setError('Não foi possível carregar os dados de comodatos.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const base = periodDate.isValid() ? periodDate : dayjs();
    const start = base.startOf('month');
    const end = base.endOf('month');
    return { periodStart: start, periodEnd: end, periodLabel: `Mês ${base.format('MM/YYYY')}` };
  }, [periodDate]);

  const deliveriesMapped = deliveries.map((item) => {
    const dateValue = dayjs(item.delivery_date);
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
    const dateValue = dayjs(item.pickup_date);
    const clientInfo = parseClientInfo(item.description);
    const materialItems = parseMaterialItems(item.material, item.quantity);
    return {
      ...item,
      ...clientInfo,
      dateValue,
      materialItems,
      hasPhoto: Boolean(item.photo_url)
    };
  });

  const deliveriesInPeriod = deliveriesMapped.filter((item) => withinPeriod(item.dateValue, periodStart, periodEnd));
  const pickupsInPeriod = pickupsMapped.filter((item) => withinPeriod(item.dateValue, periodStart, periodEnd));

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

  const topMaterials = materialTotals.slice(0, 8);
  const maxMaterialQuantity = topMaterials.reduce((max, item) => Math.max(max, item.quantity), 0) || 1;

  const periodDays = useMemo(() => {
    const days = [];
    let cursor = periodStart.startOf('day');
    const end = periodEnd.startOf('day');
    while (!cursor.isAfter(end, 'day')) {
      days.push(cursor);
      cursor = cursor.add(1, 'day');
    }
    return days;
  }, [periodStart, periodEnd]);

  const activityByDay = useMemo(() => {
    const deliveryCounts = new Map();
    const pickupCounts = new Map();
    deliveriesInPeriod.forEach((item) => {
      const key = item.dateValue.format('YYYY-MM-DD');
      deliveryCounts.set(key, (deliveryCounts.get(key) || 0) + 1);
    });
    pickupsInPeriod.forEach((item) => {
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
  }, [deliveriesInPeriod, pickupsInPeriod, periodDays]);

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
    const weeklyMap = new Map();

    const ensureWeek = (weekStartValue) => {
      const weekStart = weekStartValue.startOf('isoWeek');
      const weekKey = weekStart.format('YYYY-[W]WW');
      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          key: weekKey,
          weekStart,
          weekEnd: weekStart.endOf('isoWeek'),
          deliveries: 0,
          pickups: 0,
          total: 0
        });
      }
      return weeklyMap.get(weekKey);
    };

    periodDays.forEach((day) => {
      ensureWeek(day);
    });

    deliveriesInPeriod.forEach((item) => {
      const entry = ensureWeek(item.dateValue);
      entry.deliveries += 1;
      entry.total += 1;
    });

    pickupsInPeriod.forEach((item) => {
      const entry = ensureWeek(item.dateValue);
      entry.pickups += 1;
      entry.total += 1;
    });

    return Array.from(weeklyMap.values())
      .map((entry) => {
        const boundedStart = entry.weekStart.isBefore(periodStart, 'day')
          ? periodStart.startOf('day')
          : entry.weekStart.startOf('day');
        const boundedEnd = entry.weekEnd.isAfter(periodEnd, 'day')
          ? periodEnd.startOf('day')
          : entry.weekEnd.startOf('day');
        return {
          ...entry,
          boundedStart,
          boundedEnd,
          label: `${boundedStart.format('DD/MM')} - ${boundedEnd.format('DD/MM')}`
        };
      })
      .sort((a, b) => a.weekStart.valueOf() - b.weekStart.valueOf());
  }, [deliveriesInPeriod, pickupsInPeriod, periodDays, periodStart, periodEnd]);

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
      id: `pickup-${item.id}`,
      type: 'Retirada',
      dateValue: item.dateValue,
      dateLabel: item.dateValue.format('DD/MM/YYYY'),
      timeLabel: '',
      clientLabel: item.fantasyName ? `${item.fantasyName} (${item.clientCode || 'Sem código'})` : (item.clientCode || 'Cliente'),
      detail: buildMaterialSummary(item.materialItems)
    }));
    return [...deliveryActivities, ...pickupActivities]
      .sort((a, b) => b.dateValue.valueOf() - a.dateValue.valueOf())
      .slice(0, 12);
  }, [deliveriesInPeriod, pickupsInPeriod]);

  const periodInputType = 'month';
  const periodInputValue = periodDate.format('YYYY-MM');

  const handlePeriodDateChange = (value) => {
    if (!value) {
      return;
    }
    setPeriodDate(dayjs(`${value}-01`));
  };

  const monthLabel = useMemo(() => {
    const base = periodDate && typeof periodDate.isValid === 'function' && periodDate.isValid()
      ? periodDate
      : dayjs();
    return base.startOf('month').format('MM/YYYY');
  }, [periodDate]);

  const shiftMonth = (direction) => {
    setHoveredDayKey('');
    setPeriodDate((prev) => {
      const base = prev && typeof prev.isValid === 'function' && prev.isValid()
        ? prev
        : dayjs();
      return base.startOf('month').add(direction, 'month');
    });
  };

  const handlePrevMonth = () => shiftMonth(-1);
  const handleNextMonth = () => shiftMonth(1);

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
          <Button variant="outlined" onClick={() => navigate('/pickups/history')}>
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
              {periodLabel} · {formatPeriodRange(periodStart, periodEnd)}
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
          <Typography variant="caption" color="text.secondary">Retiradas</Typography>
          <Typography variant="h4">{pickupsInPeriod.length}</Typography>
          <Typography variant="body2" color="text.secondary">
            Total de retiradas no mês selecionado
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
                            top: '50%',
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
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Typography variant="caption" color="text.secondary">
                      Totais por semana
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {monthLabel}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 0.35 }}>
                    {weekSummaries.map((week) => (
                      <Box
                        key={week.key}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          borderBottom: '1px dashed var(--stroke)',
                          pb: 0.25
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {week.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          {week.total}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
              <Divider />
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

