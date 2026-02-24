import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [clientCode, setClientCode] = useState('');
  const [fantasyName, setFantasyName] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [deliveryTime, setDeliveryTime] = useState('');
  const [pdfOne, setPdfOne] = useState(null);
  const [pdfTwo, setPdfTwo] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lookupInfo, setLookupInfo] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupRequestRef = useRef(0);

  const panelSx = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--stroke)',
    borderRadius: 'var(--radius-lg)',
    p: 3,
    boxShadow: 'var(--shadow-md)'
  };

  const inputStyle = {
    width: '100%',
    marginTop: 6,
    padding: 10,
    borderRadius: 12,
    border: '1px solid var(--stroke)',
    fontFamily: 'var(--font-sans)',
    background: 'var(--surface)'
  };

  const lookupClientByCode = useCallback(async (code, requestId) => {
    setLookupLoading(true);
    try {
      const response = await api.get(`/deliveries/client/${encodeURIComponent(code)}`);
      if (requestId !== lookupRequestRef.current) {
        return;
      }

      const fantasyNameFromBase = String(response?.data?.nome_fantasia || '').trim();
      if (fantasyNameFromBase) {
        setFantasyName(fantasyNameFromBase);
        setLookupInfo('Nome fantasia preenchido automaticamente.');
      } else {
        setLookupInfo('C\u00f3digo n\u00e3o encontrado na base. Preencha a fantasia manualmente.');
      }
    } catch (err) {
      if (requestId !== lookupRequestRef.current) {
        return;
      }
      setLookupInfo('N\u00e3o foi poss\u00edvel consultar o c\u00f3digo neste momento.');
    } finally {
      if (requestId === lookupRequestRef.current) {
        setLookupLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const normalizedCode = clientCode.trim();
    if (!normalizedCode) {
      setLookupInfo('');
      setLookupLoading(false);
      return undefined;
    }

    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    const timerId = window.setTimeout(() => {
      lookupClientByCode(normalizedCode, requestId);
    }, 450);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [clientCode, lookupClientByCode]);

  const clearForm = () => {
    setClientCode('');
    setFantasyName('');
    setDescription('');
    setDeliveryDate(dayjs().format('YYYY-MM-DD'));
    setDeliveryTime('');
    setPdfOne(null);
    setPdfTwo(null);
    setFileInputKey((prev) => prev + 1);
    setLookupInfo('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccess('');
    setError('');

    if (!clientCode.trim()) {
      setError('Informe o c\u00f3digo do cliente.');
      return;
    }
    if (!fantasyName.trim()) {
      setError('Informe a fantasia do cliente.');
      return;
    }
    if (!description.trim()) {
      setError('Informe a descri\u00e7\u00e3o da entrega.');
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

    const descriptionPayload = `C\u00f3digo do cliente: ${clientCode.trim()} | Fantasia: ${fantasyName.trim()} | Descri\u00e7\u00e3o: ${description.trim()}`;

    const formData = new FormData();
    formData.append('description', descriptionPayload);
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
      clearForm();
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
        <Button variant="outlined" onClick={() => navigate('/operacoes/entregas/historico')}>
          Ver hist\u00f3rico
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} sx={panelSx}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Informe o c\u00f3digo do cliente. O nome fantasia ser\u00e1 preenchido automaticamente quando existir na base.
        </Typography>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                C\u00f3digo do cliente
              </Typography>
              <input
                type="text"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                style={inputStyle}
                required
              />
              {(lookupLoading || lookupInfo) && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.75,
                    color: lookupLoading
                      ? 'text.secondary'
                      : lookupInfo.includes('automaticamente')
                        ? 'success.main'
                        : lookupInfo.includes('n\u00e3o encontrado')
                          ? 'warning.main'
                          : 'error.main'
                  }}
                >
                  {lookupLoading ? 'Consultando c\u00f3digo do cliente...' : lookupInfo}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Fantasia
              </Typography>
              <input
                type="text"
                value={fantasyName}
                onChange={(e) => setFantasyName(e.target.value)}
                style={inputStyle}
                required
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">
              Descri\u00e7\u00e3o
            </Typography>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                padding: 12,
                fontSize: 14,
                resize: 'vertical'
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
                style={inputStyle}
                required
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Hor\u00e1rio
              </Typography>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                style={inputStyle}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                NF
              </Typography>
              <input
                key={`pdf-one-${fileInputKey}`}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfOne(e.target.files?.[0] || null)}
                style={inputStyle}
                required
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Contrato
              </Typography>
              <input
                key={`pdf-two-${fileInputKey}`}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfTwo(e.target.files?.[0] || null)}
                style={inputStyle}
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
                clearForm();
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


