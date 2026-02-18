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
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const PAGE_SIZE = 25;

const DeliveriesHistory = () => {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const apiBaseUrl = api?.defaults?.baseURL
    || process.env.REACT_APP_API_URL
    || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');

  const toAbsoluteUrl = (url) => {
    if (!url) {
      return '';
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    try {
      return new URL(url, apiBaseUrl).toString();
    } catch (err) {
      return String(url);
    }
  };

  const loadDeliveries = async () => {
    try {
      setLoading(true);
      const response = await api.get('/deliveries');
      setDeliveries(response.data || []);
      setPage(1);
      setError('');
    } catch (err) {
      setError('Erro ao carregar o histórico de entregas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  const handleDelete = async (deliveryId) => {
    if (!window.confirm('Deseja excluir esta entrega?')) {
      return;
    }
    try {
      await api.delete(`/deliveries/${deliveryId}`);
      loadDeliveries();
    } catch (err) {
      setError('Erro ao excluir a entrega.');
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
  const totalPages = Math.max(1, Math.ceil(filteredDeliveries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedDeliveries = filteredDeliveries.slice(pageStart, pageStart + PAGE_SIZE);
  const pageFrom = filteredDeliveries.length === 0 ? 0 : pageStart + 1;
  const pageTo = Math.min(pageStart + PAGE_SIZE, filteredDeliveries.length);

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h5">Histórico de entregas</Typography>
        <Button variant="contained" onClick={() => navigate('/operacoes/entregas/nova')}>
          Nova entrega
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
        <Typography color="text.secondary">Carregando entregas...</Typography>
      ) : filteredDeliveries.length === 0 ? (
        <Typography color="text.secondary">
          {formattedDeliveries.length === 0
            ? 'Nenhuma entrega registrada.'
            : 'Nenhuma entrega encontrada para essa pesquisa.'}
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              maxHeight: { xs: '60vh', md: '68vh' },
              overflowY: 'auto',
              pr: { xs: 0, sm: 0.25 },
            }}
          >
            {pagedDeliveries.map((item, index) => (
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
                      Abrir NF
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      href={item.pdfTwoHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir contrato
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'stretch', sm: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {`Mostrando ${pageFrom}-${pageTo} de ${filteredDeliveries.length} | Página ${currentPage} de ${totalPages}`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={currentPage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outlined"
                size="small"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Próximo
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};

export default DeliveriesHistory;
