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

const createEmptyMaterial = () => ({ material: '', quantity: '1' });

const PickupsCreate = () => {
  const navigate = useNavigate();
  const [clientCode, setClientCode] = useState('');
  const [fantasyName, setFantasyName] = useState('');
  const [pickupDate, setPickupDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [materials, setMaterials] = useState([createEmptyMaterial()]);
  const [pickupPhoto, setPickupPhoto] = useState(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
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

  const handleMaterialChange = (index, field, value) => {
    setMaterials((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }
      return { ...item, [field]: value };
    }));
  };

  const handleAddMaterial = () => {
    setMaterials((prev) => [...prev, createEmptyMaterial()]);
  };

  const handleRemoveMaterial = (index) => {
    setMaterials((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const resetForm = () => {
    setClientCode('');
    setFantasyName('');
    setPickupDate(dayjs().format('YYYY-MM-DD'));
    setMaterials([createEmptyMaterial()]);
    setPickupPhoto(null);
    setPhotoInputKey((prev) => prev + 1);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccess('');
    setError('');

    if (!clientCode.trim()) {
      setError('Informe o código do cliente.');
      return;
    }
    if (!fantasyName.trim()) {
      setError('Informe a fantasia do cliente.');
      return;
    }
    if (!pickupDate) {
      setError('Informe a data da retirada.');
      return;
    }

    const normalizedMaterials = materials.map((item) => ({
      material: (item.material || '').trim(),
      quantity: Number(item.quantity)
    }));

    const hasEmptyMaterial = normalizedMaterials.some((item) => !item.material);
    if (hasEmptyMaterial) {
      setError('Informe o nome de todos os materiais.');
      return;
    }

    const hasInvalidQuantity = normalizedMaterials.some(
      (item) => !Number.isInteger(item.quantity) || item.quantity <= 0
    );
    if (hasInvalidQuantity) {
      setError('Informe quantidades válidas para todos os materiais.');
      return;
    }

    const totalQuantity = normalizedMaterials.reduce((sum, item) => sum + item.quantity, 0);
    const descriptionPayload = `Código do cliente: ${clientCode.trim()} | Fantasia: ${fantasyName.trim()}`;
    const materialPayload = JSON.stringify(normalizedMaterials);

    const formData = new FormData();
    formData.append('description', descriptionPayload);
    formData.append('pickup_date', pickupDate);
    formData.append('material', materialPayload);
    formData.append('quantity', String(totalQuantity));
    if (pickupPhoto) {
      formData.append('photo', pickupPhoto);
    }

    try {
      setSubmitting(true);
      await api.post('/pickups', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      resetForm();
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
          Informe o código do cliente e a fantasia. Em seguida, adicione os materiais e as quantidades.
        </Typography>

        <TextField
          label="Código do cliente"
          fullWidth
          sx={{ mb: 2 }}
          value={clientCode}
          onChange={(e) => setClientCode(e.target.value)}
          required
        />
        <TextField
          label="Fantasia"
          fullWidth
          sx={{ mb: 2 }}
          value={fantasyName}
          onChange={(e) => setFantasyName(e.target.value)}
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

        <Box sx={{ display: 'grid', gap: 1.5, mb: 2 }}>
          <Typography variant="subtitle2">Materiais e quantidades</Typography>
          {materials.map((item, index) => (
            <Box
              key={`material-${index}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 140px auto' },
                gap: 1,
                alignItems: 'center'
              }}
            >
              <TextField
                label={`Material ${index + 1}`}
                value={item.material}
                onChange={(e) => handleMaterialChange(index, 'material', e.target.value)}
                fullWidth
                required
              />
              <TextField
                label="Quantidade"
                type="number"
                value={item.quantity}
                onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)}
                inputProps={{ min: 1, step: 1 }}
                required
              />
              <Button
                type="button"
                variant="outlined"
                color="error"
                onClick={() => handleRemoveMaterial(index)}
                disabled={materials.length === 1}
              >
                Remover
              </Button>
            </Box>
          ))}
          <Box>
            <Button type="button" variant="outlined" onClick={handleAddMaterial}>
              Adicionar material
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 0.5, mb: 2 }}>
          <Typography variant="subtitle2">Foto da retirada (opcional)</Typography>
          <input
            key={`pickup-photo-${photoInputKey}`}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setPickupPhoto(e.target.files?.[0] || null)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 12,
              border: '1px solid var(--stroke)',
              background: 'var(--surface)',
              fontFamily: 'var(--font-sans)'
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Registrar retirada'}
          </Button>
          <Button
            type="button"
            variant="outlined"
            disabled={submitting}
            onClick={resetForm}
          >
            Limpar
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default PickupsCreate;
