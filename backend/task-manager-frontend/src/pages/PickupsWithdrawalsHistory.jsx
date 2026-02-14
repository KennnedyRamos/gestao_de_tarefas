import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
      return {
        id: item?.id,
        orderNumber: safeText(item?.order_number),
        clientCode: safeText(item?.client_code),
        fantasyName: safeText(item?.nome_fantasia),
        summaryLine: safeText(item?.summary_line),
        status: normalizeStatus(item?.status),
        createdAtLabel: createdAt && createdAt.isValid() ? createdAt.format('DD/MM/YYYY HH:mm') : '-'
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
        statusLabel(item.status)
      ]
        .join(' ')
        .toLowerCase();

      return searchBase.includes(normalizedSearch);
    }),
    [formattedOrders, normalizedSearch, statusFilter]
  );

  const handleUpdateStatus = async (orderId, nextStatus) => {
    const normalizedStatus = normalizeStatus(nextStatus);
    setUpdatingOrderId(orderId);
    setError('');
    setSuccess('');

    try {
      const response = await api.patch(`/pickup-catalog/orders/${orderId}/status`, {
        status: normalizedStatus
      });
      const updatedOrder = response?.data || {};
      const persistedStatus = normalizeStatus(updatedOrder.status || normalizedStatus);

      setOrders((prev) => prev.map((item) => (
        item.id === orderId
          ? {
            ...item,
            status: persistedStatus
          }
          : item
      )));

      const displayNumber = safeText(updatedOrder.order_number) || `RET-${orderId}`;
      setSuccess(`Status da ordem ${displayNumber} atualizado para ${statusLabel(persistedStatus)}.`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao atualizar o status da retirada.');
    } finally {
      setUpdatingOrderId(null);
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
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Ordem: {item.orderNumber || `RET-${item.id}`}
                </Typography>
                <Chip size="small" color={statusColor(item.status)} label={statusLabel(item.status)} />
              </Box>

              <Typography variant="body2" color="text.secondary">
                Código do cliente: {item.clientCode || '-'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Nome fantasia: {item.fantasyName || '-'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Resumo: {item.summaryLine || 'Sem itens informados.'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Gerado em: {item.createdAtLabel}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
                <TextField
                  select
                  label="Status da retirada"
                  value={item.status}
                  onChange={(event) => handleUpdateStatus(item.id, event.target.value)}
                  size="small"
                  sx={{ minWidth: 220 }}
                  disabled={updatingOrderId === item.id}
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
