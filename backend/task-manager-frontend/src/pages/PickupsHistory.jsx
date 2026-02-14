import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  TextField,
  Typography
} from '@mui/material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const PAGE_SIZE = 30;
const safeText = (value) => String(value || '').trim();

const STATUS_LABELS = {
  pendente: 'Pendente',
  concluida: 'Concluída',
  cancelada: 'Cancelada'
};

const STATUS_COLORS = {
  pendente: 'warning',
  concluida: 'success',
  cancelada: 'error'
};

const normalizeStatus = (value) => {
  const normalized = safeText(value).toLowerCase();
  if (normalized === 'concluida' || normalized === 'cancelada' || normalized === 'pendente') {
    return normalized;
  }
  return 'pendente';
};

const PickupsHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadOrders = useCallback(async ({ reset = false, currentOffset = 0, query = '' }) => {
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

      const response = await api.get('/pickup-catalog/orders', { params });
      const loadedOrders = Array.isArray(response.data) ? response.data : [];

      setOrders((prev) => (reset ? loadedOrders : [...prev, ...loadedOrders]));
      setOffset(currentOffset + loadedOrders.length);
      setHasMore(loadedOrders.length === PAGE_SIZE);
      setError('');
    } catch (err) {
      setError('Erro ao carregar o histórico de ordens de retirada.');
      if (reset) {
        setOrders([]);
        setOffset(0);
        setHasMore(false);
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
    loadOrders({ reset: true, currentOffset: 0, query: searchDebounced });
  }, [loadOrders, searchDebounced]);

  const formattedOrders = useMemo(
    () => orders.map((item) => {
      const createdAt = item?.created_at ? dayjs(item.created_at) : null;
      return {
        id: item?.id,
        orderNumber: safeText(item?.order_number),
        clientCode: safeText(item?.client_code),
        fantasyName: safeText(item?.nome_fantasia),
        status: normalizeStatus(item?.status),
        summaryLine: safeText(item?.summary_line),
        createdAtLabel: createdAt && createdAt.isValid() ? createdAt.format('DD/MM/YYYY HH:mm') : '-'
      };
    }),
    [orders]
  );

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">Histórico de ordens</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => navigate('/pickups/withdrawals-history')}>
            Histórico de retiradas
          </Button>
          <Button variant="contained" onClick={() => navigate('/pickups/create')}>
            Nova ordem de retirada
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label="Pesquisar por número da ordem, código ou nome fantasia"
        placeholder="Ex.: RET-20260214-000010, 10099 ou Nome Fantasia"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        size="small"
        fullWidth
      />

      {loading ? (
        <Typography color="text.secondary">Carregando ordens de retirada...</Typography>
      ) : formattedOrders.length === 0 ? (
        <Typography color="text.secondary">
          {searchDebounced
            ? 'Nenhuma ordem de retirada encontrada para essa pesquisa.'
            : 'Nenhuma ordem de retirada registrada.'}
        </Typography>
      ) : (
        <>
          {formattedOrders.map((item, index) => (
            <Card
              key={item.id}
              className="stagger-item"
              style={{ '--stagger-delay': `${index * 40}ms` }}
              sx={{
                border: '1px solid var(--stroke)',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              <CardContent sx={{ display: 'grid', gap: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Ordem: {item.orderNumber || `RET-${item.id}`}
                  </Typography>
                  <Chip
                    size="small"
                    color={STATUS_COLORS[item.status] || STATUS_COLORS.pendente}
                    label={STATUS_LABELS[item.status] || STATUS_LABELS.pendente}
                  />
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
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Gerado em: {item.createdAtLabel}
                </Typography>
              </CardContent>
            </Card>
          ))}

          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 0.5 }}>
              <Button
                variant="outlined"
                onClick={() => loadOrders({ reset: false, currentOffset: offset, query: searchDebounced })}
                disabled={loadingMore}
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

export default PickupsHistory;
