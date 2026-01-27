import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  TextField,
  Typography
} from '@mui/material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const PickupsCreate = () => {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [pickupDate, setPickupDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState('1');
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
      setError('Informe uma quantidade válida.');
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
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao registrar a retirada.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h5">Nova retirada de comodato</Typography>
        <Button variant="outlined" onClick={() => navigate('/pickups/history')}>
          Ver histórico
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} sx={panelSx}>
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
            disabled={submitting}
            onClick={() => {
              setDescription('');
              setPickupDate(dayjs().format('YYYY-MM-DD'));
              setMaterial('');
              setQuantity('1');
              setError('');
              setSuccess('');
            }}
          >
            Limpar
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default PickupsCreate;

