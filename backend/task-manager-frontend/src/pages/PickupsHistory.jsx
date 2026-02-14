import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography
} from '@mui/material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const safeText = (value) => String(value || '').trim();

const PickupsHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        const response = await api.get('/pickup-catalog/orders');
        setOrders(Array.isArray(response.data) ? response.data : []);
        setError('');
      } catch (err) {
        setError('Erro ao carregar o histórico de ordens de retirada.');
      } finally {
        setLoading(false);
      }
    };

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
        createdAtLabel: createdAt && createdAt.isValid() ? createdAt.format('DD/MM/YYYY HH:mm') : '-'
      };
    }),
    [orders]
  );

  const filteredOrders = useMemo(
    () => formattedOrders.filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      const idValue = String(item.id || '');
      const searchBase = [
        idValue,
        item.orderNumber,
        item.clientCode,
        item.fantasyName,
        item.summaryLine
      ]
        .join(' ')
        .toLowerCase();

      return searchBase.includes(normalizedSearch);
    }),
    [formattedOrders, normalizedSearch]
  );

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">Histórico de retiradas</Typography>
        <Button variant="contained" onClick={() => navigate('/pickups/create')}>
          Nova ordem de retirada
        </Button>
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
      ) : filteredOrders.length === 0 ? (
        <Typography color="text.secondary">
          {formattedOrders.length === 0
            ? 'Nenhuma ordem de retirada registrada.'
            : 'Nenhuma ordem de retirada encontrada para essa pesquisa.'}
        </Typography>
      ) : (
        filteredOrders.map((item, index) => (
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
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Ordem: {item.orderNumber || `RET-${item.id}`}
              </Typography>
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
        ))
      )}
    </Box>
  );
};

export default PickupsHistory;
