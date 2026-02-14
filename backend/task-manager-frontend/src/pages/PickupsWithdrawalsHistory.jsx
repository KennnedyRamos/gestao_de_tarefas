import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const safeText = (value) => String(value || '').trim();

const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente', color: 'warning' },
  { value: 'concluida', label: 'Concluída', color: 'success' },
  { value: 'cancelada', label: 'Cancelada', color: 'error' }
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

const PickupsWithdrawalsHistory = () => {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('concluida');
  const [bulkStatusNote, setBulkStatusNote] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get('/pickup-catalog/orders');
      setOrders(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (err) {
      setError('Erro ao carregar o histórico de retiradas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const formattedOrders = useMemo(
    () => orders.map((item) => {
      const createdAt = item?.created_at ? dayjs(item.created_at) : null;
      const statusUpdatedAt = item?.status_updated_at ? dayjs(item.status_updated_at) : null;

      return {
        id: item?.id,
        orderNumber: safeText(item?.order_number),
        clientCode: safeText(item?.client_code),
        fantasyName: safeText(item?.nome_fantasia),
        summaryLine: safeText(item?.summary_line),
        withdrawalDate: safeText(item?.withdrawal_date),
        status: normalizeStatus(item?.status),
        statusNote: safeText(item?.status_note),
        statusUpdatedBy: safeText(item?.status_updated_by),
        createdAtLabel: createdAt && createdAt.isValid() ? createdAt.format('DD/MM/YYYY HH:mm') : '-',
        statusUpdatedAtLabel:
          statusUpdatedAt && statusUpdatedAt.isValid() ? statusUpdatedAt.format('DD/MM/YYYY HH:mm') : ''
      };
    }),
    [orders]
  );

  const filteredOrders = useMemo(
    () => formattedOrders.filter((item) => {
      if (statusFilter !== 'todos' && item.status !== statusFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      const searchBase = [
        String(item.id || ''),
        item.orderNumber,
        item.clientCode,
        item.fantasyName,
        item.summaryLine,
        item.statusNote,
        statusLabel(item.status)
      ]
        .join(' ')
        .toLowerCase();

      return searchBase.includes(normalizedSearch);
    }),
    [formattedOrders, normalizedSearch, statusFilter]
  );

  useEffect(() => {
    const filteredIdSet = new Set(filteredOrders.map((item) => item.id));
    setSelectedOrderIds((prev) => prev.filter((id) => filteredIdSet.has(id)));
  }, [filteredOrders]);

  const selectedIdSet = useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every((item) => selectedIdSet.has(item.id));
  const partiallySelected = selectedOrderIds.length > 0 && !allFilteredSelected;

  const handleToggleOrder = (orderId) => {
    setSelectedOrderIds((prev) => (
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    ));
  };

  const handleToggleAllFiltered = (checked) => {
    if (checked) {
      setSelectedOrderIds(filteredOrders.map((item) => item.id));
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
    setUpdatingOrderId(orderId);
    setError('');
    setSuccess('');

    try {
      const response = await api.patch(`/pickup-catalog/orders/${orderId}/status`, {
        status: normalizedStatus,
        status_note: ''
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

    setBulkUpdating(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.patch('/pickup-catalog/orders/status/bulk', {
        order_ids: selectedOrderIds,
        status: normalizeStatus(bulkStatus),
        status_note: safeText(bulkStatusNote)
      });

      const updatedCount = Number(response?.data?.updated_count || 0);
      const updatedOrders = Array.isArray(response?.data?.orders) ? response.data.orders : [];
      mergeUpdatedOrders(updatedOrders);
      setSelectedOrderIds([]);

      setSuccess(`${updatedCount} ordem(ns) atualizada(s) para ${statusLabel(bulkStatus)}.`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao atualizar status em lote.');
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">Histórico de retiradas</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => navigate('/pickups/history')}>
            Histórico de ordens
          </Button>
          <Button variant="contained" onClick={() => navigate('/pickups/create')}>
            Nova ordem de retirada
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1 }}>
        <TextField
          label="Pesquisar por número da ordem, código ou nome fantasia"
          placeholder="Ex.: RET-20260214-000010, 10099 ou Nome Fantasia"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          size="small"
          fullWidth
        />
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
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'auto minmax(180px, 220px) minmax(220px, 1fr) auto' },
          gap: 1,
          alignItems: 'center'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Checkbox
            checked={allFilteredSelected}
            indeterminate={partiallySelected}
            onChange={(event) => handleToggleAllFiltered(event.target.checked)}
            disabled={filteredOrders.length === 0 || bulkUpdating}
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
          label="Observação do status (opcional)"
          value={bulkStatusNote}
          onChange={(event) => setBulkStatusNote(event.target.value)}
          size="small"
          fullWidth
          disabled={bulkUpdating}
        />

        <Button
          variant="contained"
          onClick={handleBulkUpdateStatus}
          disabled={bulkUpdating || selectedOrderIds.length === 0}
        >
          {bulkUpdating ? 'Atualizando...' : 'Aplicar em lote'}
        </Button>
      </Box>

      {loading ? (
        <Typography color="text.secondary">Carregando retiradas...</Typography>
      ) : filteredOrders.length === 0 ? (
        <Typography color="text.secondary">
          {formattedOrders.length === 0
            ? 'Nenhuma retirada registrada.'
            : 'Nenhuma retirada encontrada para os filtros selecionados.'}
        </Typography>
      ) : (
        filteredOrders.map((item, index) => (
          <Card
            key={item.id}
            className="stagger-item"
            style={{ '--stagger-delay': `${index * 40}ms` }}
            sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}
          >
            <CardContent sx={{ display: 'grid', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Checkbox
                    size="small"
                    checked={selectedIdSet.has(item.id)}
                    onChange={() => handleToggleOrder(item.id)}
                    disabled={bulkUpdating}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Ordem: {item.orderNumber || `RET-${item.id}`}
                  </Typography>
                </Box>
                <Chip size="small" color={statusColor(item.status)} label={statusLabel(item.status)} />
              </Box>

              <Typography variant="body2" color="text.secondary">
                Código do cliente: {item.clientCode || '-'}
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

              {(item.statusUpdatedAtLabel || item.statusUpdatedBy) && (
                <Typography variant="caption" color="text.secondary">
                  Última atualização: {item.statusUpdatedAtLabel || '-'}
                  {item.statusUpdatedBy ? ` por ${item.statusUpdatedBy}` : ''}
                </Typography>
              )}

              {item.statusNote && (
                <Typography variant="caption" color="text.secondary">
                  Observação do status: {item.statusNote}
                </Typography>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
                <TextField
                  select
                  label="Status da retirada"
                  value={item.status}
                  onChange={(event) => handleUpdateStatus(item.id, event.target.value)}
                  size="small"
                  sx={{ minWidth: 220 }}
                  disabled={updatingOrderId === item.id || bulkUpdating}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                {updatingOrderId === item.id && (
                  <Typography variant="caption" color="text.secondary">
                    Atualizando status...
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
};

export default PickupsWithdrawalsHistory;
