import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Typography
} from '@mui/material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const DeliveriesCreate = () => {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [deliveryTime, setDeliveryTime] = useState('');
  const [pdfOne, setPdfOne] = useState(null);
  const [pdfTwo, setPdfTwo] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
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
      setError('Informe a descrição da entrega.');
      return;
    }
    if (!deliveryDate) {
      setError('Informe a data da entrega.');
      return;
    }
    if (!pdfOne || !pdfTwo) {
      setError('Envie os dois PDFs da entrega.');
      return;
    }

    const formData = new FormData();
    formData.append('description', description.trim());
    formData.append('delivery_date', deliveryDate);
    if (deliveryTime) {
      formData.append('delivery_time', deliveryTime);
    }
    formData.append('pdf_one', pdfOne);
    formData.append('pdf_two', pdfTwo);

    try {
      setSubmitting(true);
      await api.post('/deliveries', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDescription('');
      setDeliveryDate(dayjs().format('YYYY-MM-DD'));
      setDeliveryTime('');
      setPdfOne(null);
      setPdfTwo(null);
      setFileInputKey((prev) => prev + 1);
      setSuccess('Entrega registrada com sucesso.');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao registrar a entrega.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h5">Nova entrega de comodato</Typography>
        <Button variant="outlined" onClick={() => navigate('/deliveries/history')}>
          Ver histórico
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} sx={panelSx}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Na descrição, informe o código do cliente e o nome fantasia.
        </Typography>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Descrição
            </Typography>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                marginTop: 6,
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--stroke)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                resize: 'vertical',
                background: 'var(--surface)'
              }}
              required
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Data da entrega
              </Typography>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--stroke)',
                  fontFamily: 'var(--font-sans)'
                }}
                required
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Horário
              </Typography>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--stroke)',
                  fontFamily: 'var(--font-sans)'
                }}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                PDF 1
              </Typography>
              <input
                key={`pdf-one-${fileInputKey}`}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfOne(e.target.files?.[0] || null)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--stroke)',
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-sans)'
                }}
                required
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                PDF 2
              </Typography>
              <input
                key={`pdf-two-${fileInputKey}`}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfTwo(e.target.files?.[0] || null)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--stroke)',
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-sans)'
                }}
                required
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Registrar entrega'}
            </Button>
            <Button
              type="button"
              variant="outlined"
              disabled={submitting}
              onClick={() => {
                setDescription('');
                setDeliveryDate(dayjs().format('YYYY-MM-DD'));
                setDeliveryTime('');
                setPdfOne(null);
                setPdfTwo(null);
                setFileInputKey((prev) => prev + 1);
                setError('');
                setSuccess('');
              }}
            >
              Limpar
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default DeliveriesCreate;

