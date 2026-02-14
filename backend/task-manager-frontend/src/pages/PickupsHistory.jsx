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

const parseMaterialItems = (value) => {
  if (!value || typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        material: String(item?.material || '').trim(),
        quantity: Number(item?.quantity)
      }))
      .filter((item) => item.material && Number.isFinite(item.quantity) && item.quantity > 0);
  } catch (err) {
    return [];
  }
};

const PickupsHistory = () => {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  const formattedPickups = pickups.map((item) => {
    const materialItems = parseMaterialItems(item.material);
    const materialSearchText = materialItems.map((materialItem) => materialItem.material).join(' ');
    return {
      ...item,
      materialItems,
      materialSearchText,
      photoHref: item.photo_url ? toAbsoluteUrl(item.photo_url) : '',
      dateLabel: item.pickup_date ? dayjs(item.pickup_date).format('DD/MM/YYYY') : '-'
    };
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPickups = formattedPickups.filter((item) => {
    if (!normalizedSearch) {
      return true;
    }
    const descriptionValue = (item.description || '').toLowerCase();
    const materialValue = (item.material || '').toLowerCase();
    const materialItemsValue = (item.materialSearchText || '').toLowerCase();
    return (
      descriptionValue.includes(normalizedSearch)
      || materialValue.includes(normalizedSearch)
      || materialItemsValue.includes(normalizedSearch)
    );
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
              {item.materialItems.length > 0 ? (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Materiais:
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 0.25 }}>
                    {item.materialItems.map((materialItem, materialIndex) => (
                      <Typography
                        key={`${item.id}-material-${materialIndex}`}
                        variant="caption"
                        color="text.secondary"
                      >
                        {materialItem.material} - {materialItem.quantity}
                      </Typography>
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Quantidade total: {item.quantity}
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Material: {item.material}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Quantidade: {item.quantity}
                  </Typography>
                </>
              )}
              {item.photoHref && (
                <Box sx={{ display: 'grid', gap: 0.5, mt: 0.5 }}>
                  <Box
                    component="a"
                    href={item.photoHref}
                    target="_blank"
                    rel="noreferrer"
                    sx={{ display: 'inline-block', width: 180 }}
                  >
                    <Box
                      component="img"
                      src={item.photoHref}
                      alt={`Foto da retirada ${item.id}`}
                      sx={{
                        width: '100%',
                        height: 120,
                        objectFit: 'cover',
                        borderRadius: 1,
                        border: '1px solid var(--stroke)',
                        boxShadow: 'var(--shadow-md)'
                      }}
                    />
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    href={item.photoHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir foto
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
};

export default PickupsHistory;
