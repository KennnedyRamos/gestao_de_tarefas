import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { hasPermission } from '../utils/auth';

const PAGE_SIZE = 25;
const safeText = (value) => String(value || '').trim();
const ORDERS_SCROLL_SX = {
  display: 'grid',
  gap: 1.25,
  maxHeight: { xs: '60vh', md: '68vh' },
  overflowY: 'auto',
  pr: { xs: 0, sm: 0.25 },
};

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente', color: 'warning' },
  { value: 'concluida', label: 'Conclu\u00EDda', color: 'success' },
  { value: 'cancelada', label: 'Cancelada', color: 'error' }
];

const REFRIGERATOR_CONDITION_OPTIONS = [
  { value: 'boa', label: 'Boa (disponível)' },
  { value: 'recap', label: 'Recap (reforma)' },
  { value: 'sucata', label: 'Sucata (descarte)' }
];

const STATUS_BY_VALUE = STATUS_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option;
  return acc;
}, {});

const normalizeStatus = (value) => {
  const normalized = safeText(value).toLowerCase();
  return STATUS_BY_VALUE[normalized] ? normalized : 'pendente';
};

const statusLabel = (value) => STATUS_BY_VALUE[normalizeStatus(value)]?.label || 'Pendente';
const statusColor = (value) => STATUS_BY_VALUE[normalizeStatus(value)]?.color || 'warning';

const resolveView = (initialView, availableViews) => {
  const normalized = safeText(initialView).toLowerCase();
  if (availableViews.some((item) => item.value === normalized)) {
    return normalized;
  }
  return availableViews[0]?.value || 'orders';
};

const PickupsCenter = ({ initialView = 'orders' }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const canOrdersHistory = hasPermission('pickups.orders_history');
  const canWithdrawalsHistory = hasPermission('pickups.withdrawals_history');
  const canCreatePickupOrder = hasPermission('pickups.create_order');
  const canImportPickupBase = hasPermission('pickups.import_base');
  const requestedView = safeText(searchParams.get('view')).toLowerCase();
  const initialViewRequest = requestedView || safeText(initialView).toLowerCase() || 'orders';

  const availableViews = useMemo(() => {
    const views = [];
    if (canOrdersHistory) {
      views.push({
        value: 'orders',
        label: 'Vis\u00E3o de ordens',
        helper: 'Lista consolidada das ordens geradas'
      });
    }
    if (canWithdrawalsHistory) {
      views.push({
        value: 'withdrawals',
        label: 'Gest\u00E3o de retiradas',
        helper: 'Atualiza\u00E7\u00E3o de status individual e em lote'
      });
    }
    return views;
  }, [canOrdersHistory, canWithdrawalsHistory]);

  const [activeView, setActiveView] = useState(() => resolveView(initialViewRequest, availableViews));
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('concluida');
  const [bulkStatusNote, setBulkStatusNote] = useState('');
  const [bulkRefrigeratorCondition, setBulkRefrigeratorCondition] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [statusConditionByOrder, setStatusConditionByOrder] = useState({});

  useEffect(() => {
    setActiveView((prev) => {
      if (requestedView) {
        return resolveView(requestedView, availableViews);
      }
      return resolveView(prev || initialViewRequest, availableViews);
    });
  }, [availableViews, initialViewRequest, requestedView]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchDebounced(searchQuery.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedOrderIds([]);
    setSuccess('');
    setError('');
  }, [activeView]);

  const effectiveStatusFilter = activeView === 'withdrawals' ? statusFilter : 'todos';

  const loadOrders = useCallback(async ({ reset = false, currentOffset = 0, query = '', status = 'todos' }) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = {
        limit: PAGE_SIZE,
        offset: currentOffset,
      };

      if (query) {
        params.q = query;
      }
      if (status !== 'todos') {
        params.status = status;
      }

      const response = await api.get('/pickup-catalog/orders', { params });
      const loadedOrders = Array.isArray(response.data) ? response.data : [];

      setOrders((prev) => (reset ? loadedOrders : [...prev, ...loadedOrders]));
      setOffset(currentOffset + loadedOrders.length);
      setHasMore(loadedOrders.length === PAGE_SIZE);
      if (reset) {
        setSelectedOrderIds([]);
      }
      setError('');
    } catch (err) {
      setError('Erro ao carregar a central de retiradas.');
      if (reset) {
        setOrders([]);
        setOffset(0);
        setHasMore(false);
        setSelectedOrderIds([]);
      }
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOrders({
      reset: true,
      currentOffset: 0,
      query: searchDebounced,
      status: effectiveStatusFilter,
    });
  }, [loadOrders, searchDebounced, effectiveStatusFilter]);

  const formattedOrders = useMemo(
    () => orders.map((item) => {
      const createdAt = item?.created_at ? dayjs(item.created_at) : null;
      const statusUpdatedAt = item?.status_updated_at ? dayjs(item.status_updated_at) : null;
      const summaryLine = safeText(item?.summary_line);
      const summaryHint = summaryLine.toLowerCase();
      const hasRefrigeratorHint = (
        summaryHint.includes('(rg')
        || summaryHint.includes(' rg ')
        || summaryHint.includes('refrigerador')
        || summaryHint.includes('visa cooler')
      );

      return {
        id: item?.id,
        orderNumber: safeText(item?.order_number),
        clientCode: safeText(item?.client_code),
        fantasyName: safeText(item?.nome_fantasia),
        summaryLine,
        withdrawalDate: safeText(item?.withdrawal_date),
        status: normalizeStatus(item?.status),
        hasRefrigerator: Boolean(item?.has_refrigerator) || hasRefrigeratorHint,
        statusNote: safeText(item?.status_note),
        statusUpdatedBy: safeText(item?.status_updated_by),
        createdAtLabel: createdAt && createdAt.isValid() ? createdAt.format('DD/MM/YYYY HH:mm') : '-',
        statusUpdatedAtLabel:
          statusUpdatedAt && statusUpdatedAt.isValid() ? statusUpdatedAt.format('DD/MM/YYYY HH:mm') : ''
      };
    }),
    [orders]
  );

  const summary = useMemo(() => {
    const total = formattedOrders.length;
    let pendente = 0;
    let concluida = 0;
    let cancelada = 0;
    formattedOrders.forEach((item) => {
      if (item.status === 'concluida') {
        concluida += 1;
      } else if (item.status === 'cancelada') {
        cancelada += 1;
      } else {
        pendente += 1;
      }
    });
    return { total, pendente, concluida, cancelada };
  }, [formattedOrders]);

  useEffect(() => {
    setStatusConditionByOrder((prev) => {
      const next = {};
      formattedOrders.forEach((item) => {
        if (!item?.hasRefrigerator) {
          return;
        }
        next[item.id] = safeText(prev[item.id]).toLowerCase();
      });
      return next;
    });
  }, [formattedOrders]);

  const selectedIdSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const allSelected = formattedOrders.length > 0 && formattedOrders.every((item) => selectedIdSet.has(item.id));
  const partiallySelected = selectedOrderIds.length > 0 && !allSelected;
  const selectionHasRefrigerator = useMemo(
    () => formattedOrders.some((item) => selectedIdSet.has(item.id) && Boolean(item?.hasRefrigerator)),
    [formattedOrders, selectedIdSet]
  );

  const handleToggleOrder = (orderId) => {
    setSelectedOrderIds((prev) => (
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    ));
  };

  const handleToggleAll = (checked) => {
    if (checked) {
      setSelectedOrderIds(formattedOrders.map((item) => item.id));
      return;
    }
    setSelectedOrderIds([]);
  };

  const mergeUpdatedOrders = (updatedOrders) => {
    const byId = new Map((updatedOrders || []).map((item) => [item.id, item]));
    setOrders((prev) => prev.map((item) => (byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item)));
  };

  const handleUpdateStatus = async (orderId, nextStatus) => {
    const normalizedStatus = normalizeStatus(nextStatus);
    const targetOrder = formattedOrders.find((item) => item.id === orderId);
    const hasRefrigerator = Boolean(targetOrder?.hasRefrigerator);
    const refrigeratorCondition = safeText(statusConditionByOrder[orderId]).toLowerCase();

    if (
      normalizedStatus === 'concluida'
      && hasRefrigerator
      && !REFRIGERATOR_CONDITION_OPTIONS.some((option) => option.value === refrigeratorCondition)
    ) {
      setError('Selecione a condição do refrigerador (Boa, Recap ou Sucata) antes de concluir.');
      return;
    }

    setUpdatingOrderId(orderId);
    setError('');
    setSuccess('');

    try {
      const response = await api.patch(`/pickup-catalog/orders/${orderId}/status`, {
        status: normalizedStatus,
        status_note: '',
        refrigerator_condition: normalizedStatus === 'concluida' && hasRefrigerator
          ? refrigeratorCondition
          : undefined,
      });
      const updatedOrder = response?.data || {};
      mergeUpdatedOrders([updatedOrder]);

      const persistedStatus = normalizeStatus(updatedOrder.status || normalizedStatus);
      const displayNumber = safeText(updatedOrder.order_number) || `RET-${orderId}`;
      setSuccess(`Status da ordem ${displayNumber} atualizado para ${statusLabel(persistedStatus)}.`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao atualizar o status da retirada.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleBulkUpdateStatus = async () => {
    if (selectedOrderIds.length === 0) {
      setError('Selecione pelo menos uma ordem para atualizar em lote.');
      return;
    }
    const normalizedBulkStatus = normalizeStatus(bulkStatus);
    const selectedOrders = formattedOrders.filter((item) => selectedOrderIds.includes(item.id));
    const hasRefrigeratorInSelection = selectedOrders.some((item) => Boolean(item?.hasRefrigerator));
    const normalizedBulkCondition = safeText(bulkRefrigeratorCondition).toLowerCase();
    if (
      normalizedBulkStatus === 'concluida'
      && hasRefrigeratorInSelection
      && !REFRIGERATOR_CONDITION_OPTIONS.some((option) => option.value === normalizedBulkCondition)
    ) {
      setError('Selecione a condição do refrigerador (Boa, Recap ou Sucata) para concluir em lote.');
      return;
    }

    setBulkUpdating(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.patch('/pickup-catalog/orders/status/bulk', {
        order_ids: selectedOrderIds,
        status: normalizedBulkStatus,
        status_note: safeText(bulkStatusNote),
        refrigerator_condition: normalizedBulkStatus === 'concluida' && hasRefrigeratorInSelection
          ? normalizedBulkCondition
          : undefined,
      });

      const updatedCount = Number(response?.data?.updated_count || 0);
      const updatedOrders = Array.isArray(response?.data?.orders) ? response.data.orders : [];
      mergeUpdatedOrders(updatedOrders);
      setSelectedOrderIds([]);
      setBulkRefrigeratorCondition('');

      setSuccess(`${updatedCount} ordem(ns) atualizada(s) para ${statusLabel(bulkStatus)}.`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao atualizar status em lote.');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    if (!window.confirm('Deseja excluir esta ordem cancelada? Esta a\u00E7\u00E3o n\u00E3o pode ser desfeita.')) {
      return;
    }

    setDeletingOrderId(orderId);
    setError('');
    setSuccess('');

    try {
      await api.delete(`/pickup-catalog/orders/${orderId}`);
      setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
      await loadOrders({
        reset: true,
        currentOffset: 0,
        query: searchDebounced,
        status: effectiveStatusFilter,
      });
      setSuccess(`Ordem ${safeText(orderNumber) || `RET-${orderId}`} exclu\u00EDda com sucesso.`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao excluir ordem cancelada.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const helperText = availableViews.find((item) => item.value === activeView)?.helper || '';

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5">Central de retiradas</Typography>
          <Typography variant="body2" color="text.secondary">{helperText}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          {canImportPickupBase && (
            <Button variant="outlined" onClick={() => navigate('/operacoes/ordens/base')} fullWidth={isMobile}>
              Atualizar base
            </Button>
          )}
          {canCreatePickupOrder && (
            <Button variant="contained" onClick={() => navigate('/operacoes/ordens/nova')} fullWidth={isMobile}>
              Nova ordem de retirada
            </Button>
          )}
        </Stack>
      </Box>

      {availableViews.length > 1 && (
        <Tabs
          value={activeView}
          onChange={(_, value) => setActiveView(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {availableViews.map((item) => (
            <Tab key={item.value} value={item.value} label={item.label} />
          ))}
        </Tabs>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: activeView === 'withdrawals' ? '2fr 1fr' : '1fr' }, gap: 1 }}>
        <TextField
          label="Pesquisar por n\u00FAmero da ordem, c\u00F3digo ou nome fantasia"
          placeholder="Ex.: RET-20260214-000010, 10099 ou Nome Fantasia"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          size="small"
          fullWidth
        />
        {activeView === 'withdrawals' && (
          <TextField
            select
            label="Filtrar por status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            size="small"
            fullWidth
          >
            <MenuItem value="todos">Todos</MenuItem>
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip label={`Carregadas: ${summary.total}`} />
        <Chip color="warning" label={`Pendentes: ${summary.pendente}`} />
        <Chip color="success" label={`Conclu\u00EDdas: ${summary.concluida}`} />
        <Chip color="error" label={`Canceladas: ${summary.cancelada}`} />
      </Box>

      {activeView === 'withdrawals' && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'auto minmax(180px, 220px) minmax(220px, 1fr) minmax(200px, 240px) auto' },
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox
              checked={allSelected}
              indeterminate={partiallySelected}
              onChange={(event) => handleToggleAll(event.target.checked)}
              disabled={formattedOrders.length === 0 || bulkUpdating}
            />
            <Typography variant="body2" color="text.secondary">
              {selectedOrderIds.length} selecionada(s)
            </Typography>
          </Box>

          <TextField
            select
            label="Status em lote"
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value)}
            size="small"
            fullWidth
            disabled={bulkUpdating}
          >
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Observa\u00E7\u00E3o do status (opcional)"
            value={bulkStatusNote}
            onChange={(event) => setBulkStatusNote(event.target.value)}
            size="small"
            fullWidth
            disabled={bulkUpdating}
          />

          <TextField
            select
            label="Condi\u00E7\u00E3o do refrigerador"
            value={bulkRefrigeratorCondition}
            onChange={(event) => setBulkRefrigeratorCondition(event.target.value)}
            size="small"
            fullWidth
            disabled={bulkUpdating || bulkStatus !== 'concluida'}
            helperText={
              bulkStatus !== 'concluida'
                ? 'Defina status Conclu\\u00EDda para aplicar.'
                : selectionHasRefrigerator
                  ? 'Obrigatória para ordens com refrigerador.'
                  : 'Selecione ao menos uma ordem com refrigerador.'
            }
          >
            <MenuItem value="">Selecione</MenuItem>
            {REFRIGERATOR_CONDITION_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>

          <Button
            variant="contained"
            onClick={handleBulkUpdateStatus}
            disabled={bulkUpdating || selectedOrderIds.length === 0}
            fullWidth={isMobile}
          >
            {bulkUpdating ? 'Atualizando...' : 'Aplicar em lote'}
          </Button>
        </Box>
      )}

      {loading ? (
        <Typography color="text.secondary">Carregando central de retiradas...</Typography>
      ) : formattedOrders.length === 0 ? (
        <Typography color="text.secondary">
          {searchDebounced
            ? 'Nenhuma ordem encontrada para os filtros selecionados.'
            : 'Nenhuma ordem registrada.'}
        </Typography>
      ) : (
        <>
          <Box sx={ORDERS_SCROLL_SX}>
            {formattedOrders.map((item, index) => (
            <Card
              key={item.id}
              className="stagger-item"
              style={{ '--stagger-delay': `${index * 40}ms` }}
              sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}
            >
              <CardContent sx={{ display: 'grid', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {activeView === 'withdrawals' && (
                      <Checkbox
                        size="small"
                        checked={selectedIdSet.has(item.id)}
                        onChange={() => handleToggleOrder(item.id)}
                        disabled={bulkUpdating}
                      />
                    )}
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Ordem: {item.orderNumber || `RET-${item.id}`}
                    </Typography>
                  </Box>
                  <Chip size="small" color={statusColor(item.status)} label={statusLabel(item.status)} />
                </Box>

                <Typography variant="body2" color="text.secondary">
                  C\u00F3digo do cliente: {item.clientCode || '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Nome fantasia: {item.fantasyName || '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Data da retirada: {item.withdrawalDate || '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Resumo: {item.summaryLine || 'Sem itens informados.'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Gerado em: {item.createdAtLabel}
                </Typography>

                {activeView === 'withdrawals' && (
                  <>
                    {(item.statusUpdatedAtLabel || item.statusUpdatedBy) && (
                      <Typography variant="caption" color="text.secondary">
                        \u00DAltima atualiza\u00E7\u00E3o: {item.statusUpdatedAtLabel || '-'}
                        {item.statusUpdatedBy ? ` por ${item.statusUpdatedBy}` : ''}
                      </Typography>
                    )}

                    {item.statusNote && (
                      <Typography variant="caption" color="text.secondary">
                        Observa\u00E7\u00E3o do status: {item.statusNote}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
                      <TextField
                        select
                        label="Status da retirada"
                        value={item.status}
                        onChange={(event) => handleUpdateStatus(item.id, event.target.value)}
                        size="small"
                        sx={{ width: { xs: '100%', sm: 240 }, maxWidth: '100%' }}
                        disabled={updatingOrderId === item.id || bulkUpdating}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      {item.hasRefrigerator && (
                        <TextField
                          select
                          label="Condi\u00E7\u00E3o do refrigerador"
                          value={statusConditionByOrder[item.id] || ''}
                          onChange={(event) => setStatusConditionByOrder((prev) => ({
                            ...prev,
                            [item.id]: safeText(event.target.value).toLowerCase(),
                          }))}
                          size="small"
                          sx={{ width: { xs: '100%', sm: 260 }, maxWidth: '100%' }}
                          disabled={updatingOrderId === item.id || bulkUpdating}
                          helperText="Selecione antes de marcar a retirada como Conclu\u00EDda."
                        >
                          <MenuItem value="">Selecione</MenuItem>
                          {REFRIGERATOR_CONDITION_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      {item.status === 'cancelada' && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => handleDeleteOrder(item.id, item.orderNumber)}
                          disabled={updatingOrderId === item.id || bulkUpdating || deletingOrderId === item.id}
                          sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                          {deletingOrderId === item.id ? 'Excluindo...' : 'Excluir ordem'}
                        </Button>
                      )}
                      {updatingOrderId === item.id && (
                        <Typography variant="caption" color="text.secondary">
                          Atualizando status...
                        </Typography>
                      )}
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
            ))}
          </Box>

          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 0.5 }}>
              <Button
                variant="outlined"
                onClick={() => loadOrders({
                  reset: false,
                  currentOffset: offset,
                  query: searchDebounced,
                  status: effectiveStatusFilter,
                })}
                disabled={loadingMore || bulkUpdating || Boolean(deletingOrderId)}
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default PickupsCenter;


