import React, { useEffect, useState } from 'react';
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

const Deliveries = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [deliveryTime, setDeliveryTime] = useState('');
  const [pdfOne, setPdfOne] = useState(null);
  const [pdfTwo, setPdfTwo] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
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

  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const toAbsoluteUrl = (url) => {
    if (!url) {
      return '';
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${apiBaseUrl}${url}`;
  };

  const loadDeliveries = async () => {
    try {
      const response = await api.get('/deliveries');
      setDeliveries(response.data || []);
      setError('');
    } catch (err) {
      setError('Erro ao carregar entregas.');
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

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
      loadDeliveries();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao registrar entrega.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (deliveryId) => {
    if (!window.confirm('Deseja excluir esta entrega?')) {
      return;
    }
    try {
      await api.delete(`/deliveries/${deliveryId}`);
      loadDeliveries();
    } catch (err) {
      setError('Erro ao excluir entrega.');
    }
  };

  const formattedDeliveries = deliveries.map((item) => {
    const dateLabel = item.delivery_date ? dayjs(item.delivery_date).format('DD/MM/YYYY') : '-';
    const timeLabel = item.delivery_time ? String(item.delivery_time).slice(0, 5) : 'Sem horário';
    return {
      ...item,
      dateLabel,
      timeLabel,
      pdfOneHref: toAbsoluteUrl(item.pdf_one_url),
      pdfTwoHref: toAbsoluteUrl(item.pdf_two_url)
    };
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredDeliveries = formattedDeliveries.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }
    const descriptionValue = (item.description || '').toLowerCase();
    return descriptionValue.includes(normalizedSearch);
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Entregas de comodato
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
            Nova entrega
          </Typography>
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
                disabled={submitting}
              >
                Limpar
              </Button>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Typography variant="h6">Histórico</Typography>
          <TextField
            label="Pesquisar por codigo ou fantasia"
            placeholder="Ex.: 12345 ou Nome Fantasia"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            fullWidth
          />
          {filteredDeliveries.length === 0 ? (
            <Typography color="text.secondary">
              {formattedDeliveries.length === 0
                ? 'Nenhuma entrega registrada.'
                : 'Nenhuma entrega encontrada para essa pesquisa.'}
            </Typography>
          ) : (
            filteredDeliveries.map((item, index) => (
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
                    <Typography variant="subtitle1">Entrega #{item.id}</Typography>
                    <IconButton aria-label="Excluir entrega" onClick={() => handleDelete(item.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {item.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Data: {item.dateLabel} - {item.timeLabel}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      href={item.pdfOneHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir PDF 1
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      href={item.pdfTwoHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir PDF 2
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Deliveries;
