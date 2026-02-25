import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  TextField,
  Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const PAGE_SIZE = 4;
const STATUS_LABELS = {
  pending: 'Pendente',
  pendente: 'Pendente',
  completed: 'Concluída',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  canceled: 'Cancelada',
};

const toText = (value) => String(value ?? '').trim();

const parseDescriptionDetails = (value) => {
  const raw = toText(value);
  const parsed = {
    clientCode: '',
    fantasyName: '',
    descriptionLabel: raw,
  };

  if (!raw.includes('|')) {
    return parsed;
  }

  raw.split('|').forEach((chunk) => {
    const part = toText(chunk);
    const normalized = part.toLowerCase();
    if (normalized.startsWith('código do cliente:') || normalized.startsWith('codigo do cliente:') || normalized.startsWith('código:') || normalized.startsWith('codigo:')) {
      parsed.clientCode = toText(part.split(':').slice(1).join(':'));
      return;
    }
    if (normalized.startsWith('fantasia:') || normalized.startsWith('nome fantasia:')) {
      parsed.fantasyName = toText(part.split(':').slice(1).join(':'));
      return;
    }
    if (normalized.startsWith('descrição:') || normalized.startsWith('descricao:')) {
      parsed.descriptionLabel = toText(part.split(':').slice(1).join(':'));
    }
  });

  return parsed;
};

const parseDeliveryStatus = (value) => {
  const normalized = toText(value).toLowerCase();
  if (!normalized) {
    return 'Registrada';
  }
  return STATUS_LABELS[normalized] || toText(value);
};

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
      const payload = response?.data;
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
      setDeliveries(list);
      setPage(1);
      setError('');
    } catch (err) {
      setError('Erro ao carregar o histórico de entregas.');
      setDeliveries([]);
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

  const formattedDeliveries = deliveries.map((item, index) => {
    const source = item && typeof item === 'object' ? item : {};
    const fallbackDescription = toText(source.description || source.descricao || source.summary_line || source.summary);
    const parsedDescription = parseDescriptionDetails(fallbackDescription);
    const deliveryDate = source.delivery_date || source.data_entrega || source.date || source.created_at;
    const parsedDate = deliveryDate ? dayjs(deliveryDate) : null;
    const dateLabel = parsedDate && parsedDate.isValid() ? parsedDate.format('DD/MM/YYYY') : '-';
    const rawTime = source.delivery_time || source.horario_entrega || source.time || '';
    const timeLabel = rawTime ? toText(rawTime).slice(0, 5) : 'Sem horário';
    const idValue = source.id ?? source.delivery_id ?? source.code ?? source.codigo_entrega ?? '';
    const idLabel = toText(idValue) ? `Entrega #${toText(idValue)}` : `Entrega ${index + 1}`;
    const clientCode = toText(source.client_code || source.codigo_cliente || source.codigo || parsedDescription.clientCode);
    const fantasyName = toText(source.nome_fantasia || source.fantasy_name || source.fantasia || parsedDescription.fantasyName);
    const descriptionLabel = toText(source.delivery_description || parsedDescription.descriptionLabel || fallbackDescription);
    const statusLabel = parseDeliveryStatus(source.status || source.delivery_status);
    const itemKey = toText(idValue) ? String(idValue) : `delivery-${index}`;

    return {
      ...source,
      itemKey,
      idLabel,
      clientCode,
      fantasyName,
      descriptionLabel,
      statusLabel,
      dateLabel,
      timeLabel,
      pdfOneHref: toAbsoluteUrl(source.pdf_one_url || source.pdfOneUrl),
      pdfTwoHref: toAbsoluteUrl(source.pdf_two_url || source.pdfTwoUrl)
    };
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredDeliveries = formattedDeliveries.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }
    const searchable = [
      item.idLabel,
      item.clientCode,
      item.fantasyName,
      item.descriptionLabel,
      item.statusLabel,
    ]
      .join(' ')
      .toLowerCase();
    return searchable.includes(normalizedSearch);
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
            ? 'Nenhum registro encontrado.'
            : 'Nenhum registro encontrado para essa pesquisa.'}
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
            }}
          >
            {pagedDeliveries.map((item) => (
              <Card
                key={item.itemKey}
                sx={{
                  border: '1px solid var(--stroke)',
                  boxShadow: 'var(--shadow-md)',
                  backgroundColor: 'var(--surface)',
                  position: 'relative',
                  zIndex: 1,
                  overflow: 'visible',
                }}
              >
                <CardContent sx={{ display: 'grid', gap: 1, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere', color: 'text.primary', fontWeight: 600 }}>
                      {item.idLabel}
                    </Typography>
                    <Chip size="small" label={item.statusLabel} color="default" />
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.primary', overflowWrap: 'anywhere' }}>
                    Código: {item.clientCode || '-'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.primary', overflowWrap: 'anywhere' }}>
                    Fantasia: {item.fantasyName || '-'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    Descrição: {item.descriptionLabel || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Data: {item.dateLabel} - {item.timeLabel}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        href={item.pdfOneHref || undefined}
                        target="_blank"
                        rel="noreferrer"
                        disabled={!item.pdfOneHref}
                      >
                        Abrir NF
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        href={item.pdfTwoHref || undefined}
                        target="_blank"
                        rel="noreferrer"
                        disabled={!item.pdfTwoHref}
                      >
                        Abrir contrato
                      </Button>
                    </Box>
                    <IconButton
                      aria-label="Excluir entrega"
                      onClick={() => handleDelete(item.id)}
                      disabled={!item.id}
                      color="default"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
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
