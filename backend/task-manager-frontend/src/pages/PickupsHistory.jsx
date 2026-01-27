import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  TextField,
  Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const PickupsHistory = () => {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadPickups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/pickups');
      setPickups(response.data || []);
      setError('');
    } catch (err) {
      setError('Erro ao carregar o histórico de retiradas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPickups();
  }, []);

  const handleDelete = async (pickupId) => {
    if (!window.confirm('Deseja excluir esta retirada?')) {
      return;
    }
    try {
      await api.delete(`/pickups/${pickupId}`);
      loadPickups();
    } catch (err) {
      setError('Erro ao excluir a retirada.');
    }
  };

  const formattedPickups = useMemo(() => {
    return pickups.map((item) => ({
      ...item,
      dateLabel: item.pickup_date ? dayjs(item.pickup_date).format('DD/MM/YYYY') : '-'
    }));
  }, [pickups]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPickups = formattedPickups.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }
    const descriptionValue = (item.description || '').toLowerCase();
    const materialValue = (item.material || '').toLowerCase();
    return descriptionValue.includes(normalizedSearch) || materialValue.includes(normalizedSearch);
  });

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h5">Histórico de retiradas</Typography>
        <Button variant="contained" onClick={() => navigate('/pickups/create')}>
          Nova retirada
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label="Pesquisar por código ou fantasia"
        placeholder="Ex.: 12345 ou Nome Fantasia"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        fullWidth
      />

      {loading ? (
        <Typography color="text.secondary">Carregando retiradas...</Typography>
      ) : filteredPickups.length === 0 ? (
        <Typography color="text.secondary">
          {formattedPickups.length === 0
            ? 'Nenhuma retirada registrada.'
            : 'Nenhuma retirada encontrada para essa pesquisa.'}
        </Typography>
      ) : (
        filteredPickups.map((item, index) => (
          <Card
            key={item.id}
            className="stagger-item"
            style={{ '--stagger-delay': `${index * 40}ms` }}
            sx={{
              border: '1px solid var(--stroke)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <CardContent sx={{ display: 'grid', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="subtitle1">Retirada #{item.id}</Typography>
                <IconButton aria-label="Excluir retirada" onClick={() => handleDelete(item.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {item.description}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Data: {item.dateLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Material: {item.material}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Quantidade: {item.quantity}
              </Typography>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
};

export default PickupsHistory;

