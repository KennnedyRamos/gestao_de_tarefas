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

import api from '../services/api';

const Pickups = () => {
  const [pickups, setPickups] = useState([]);
  const [description, setDescription] = useState('');
  const [pickupDate, setPickupDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const panelSx = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--stroke)',
    borderRadius: 'var(--radius-lg)',
    p: 3,
    boxShadow: 'var(--shadow-md)'
  };

  const loadPickups = async () => {
    try {
      const response = await api.get('/pickups');
      setPickups(response.data || []);
      setError('');
    } catch (err) {
      setError('Erro ao carregar retiradas.');
    }
  };

  useEffect(() => {
    loadPickups();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccess('');
    setError('');

    if (!description.trim()) {
      setError('Informe a descrição da retirada.');
      return;
    }
    if (!pickupDate) {
      setError('Informe a data da retirada.');
      return;
    }
    if (!material.trim()) {
      setError('Informe o material retirado.');
      return;
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError('Quantidade inválida.');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/pickups', {
        description: description.trim(),
        pickup_date: pickupDate,
        material: material.trim(),
        quantity: parsedQuantity
      });
      setDescription('');
      setPickupDate(dayjs().format('YYYY-MM-DD'));
      setMaterial('');
      setQuantity('1');
      setSuccess('Retirada registrada com sucesso.');
      loadPickups();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao registrar retirada.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pickupId) => {
    if (!window.confirm('Deseja excluir esta retirada?')) {
      return;
    }
    try {
      await api.delete(`/pickups/${pickupId}`);
      loadPickups();
    } catch (err) {
      setError('Erro ao excluir retirada.');
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
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Retiradas de comodato
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 380px' },
          gap: 3,
          alignItems: 'start'
        }}
      >
        <Box component="form" onSubmit={handleSubmit} sx={panelSx}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Nova retirada
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Na descrição, informe o código do cliente e o nome fantasia.
          </Typography>

          <TextField
            label="Descrição"
            fullWidth
            multiline
            rows={4}
            sx={{ mb: 2 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <TextField
            label="Data da retirada"
            type="date"
            fullWidth
            sx={{ mb: 2 }}
            value={pickupDate}
            onChange={(e) => setPickupDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Material retirado"
            fullWidth
            sx={{ mb: 2 }}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            required
          />
          <TextField
            label="Quantidade"
            type="number"
            fullWidth
            sx={{ mb: 2 }}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputProps={{ min: 1, step: 1 }}
            required
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Registrar retirada'}
            </Button>
            <Button
              type="button"
              variant="outlined"
              onClick={() => {
                setDescription('');
                setPickupDate(dayjs().format('YYYY-MM-DD'));
                setMaterial('');
                setQuantity('1');
                setError('');
                setSuccess('');
              }}
              disabled={submitting}
            >
              Limpar
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Typography variant="h6">Histórico</Typography>
          <TextField
            label="Pesquisar por código ou fantasia"
            placeholder="Ex.: 12345 ou Nome Fantasia"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            fullWidth
          />
          {filteredPickups.length === 0 ? (
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
      </Box>
    </Box>
  );
};

export default Pickups;

