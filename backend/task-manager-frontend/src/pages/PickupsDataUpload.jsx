import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const PickupsDataUpload = () => {
  const navigate = useNavigate();
  const [statusInfo, setStatusInfo] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [clientsFile, setClientsFile] = useState(null);
  const [inventoryFile, setInventoryFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const panelSx = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--stroke)',
    borderRadius: 'var(--radius-lg)',
    p: 3,
    boxShadow: 'var(--shadow-md)',
  };

  const loadStatus = async () => {
    try {
      setLoadingStatus(true);
      const response = await api.get('/pickup-catalog/status');
      setStatusInfo(response.data || null);
      setError('');
    } catch (err) {
      setError('Erro ao carregar o status da base de retiradas.');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!clientsFile && !inventoryFile) {
      setError('Envie pelo menos um CSV: 01.20.11 ou 02.02.20.');
      return;
    }

    const formData = new FormData();
    if (clientsFile) {
      formData.append('clients_csv', clientsFile);
    }
    if (inventoryFile) {
      formData.append('inventory_csv', inventoryFile);
    }

    try {
      setUploading(true);
      const response = await api.post('/pickup-catalog/upload-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const stats = response?.data?.stats || {};
      const baseMessage = String(response?.data?.message || 'Base atualizada.').trim();
      const message = `${baseMessage} Clientes: ${stats.clients_count || 0}, clientes com itens: ${stats.inventory_clients || 0}, itens em aberto: ${stats.open_items || 0}.`;
      setSuccess(message);
      setClientsFile(null);
      setInventoryFile(null);
      await loadStatus();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao atualizar a base de retiradas.');
    } finally {
      setUploading(false);
    }
  };

  const loadedAt = statusInfo?.loaded_at
    ? new Date(statusInfo.loaded_at).toLocaleString('pt-BR')
    : '-';

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h5">Atualizar base de retiradas</Typography>
        <Button variant="outlined" onClick={() => navigate('/operacoes/ordens/nova')}>
          Ir para retiradas
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Carga diária de CSV</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Envie 01.20.11 (clientes), 02.02.20 (itens emprestados) ou ambos no mesmo envio.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">CSV 01.20.11</Typography>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setClientsFile(e.target.files?.[0] || null)}
              style={{
                width: '100%',
                marginTop: 6,
                padding: 10,
                borderRadius: 12,
                border: '1px solid var(--stroke)',
                background: 'var(--surface)',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">CSV 02.02.20</Typography>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setInventoryFile(e.target.files?.[0] || null)}
              style={{
                width: '100%',
                marginTop: 6,
                padding: 10,
                borderRadius: 12,
                border: '1px solid var(--stroke)',
                background: 'var(--surface)',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button type="submit" variant="contained" disabled={uploading}>
              {uploading ? 'Atualizando...' : 'Atualizar base'}
            </Button>
            <Button type="button" variant="outlined" disabled={uploading} onClick={loadStatus}>
              Atualizar status
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Status atual</Typography>
        {loadingStatus ? (
          <Typography color="text.secondary">Carregando status...</Typography>
        ) : !statusInfo ? (
          <Typography color="text.secondary">Sem dados de status.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="body2">Base carregada: <strong>{statusInfo.dataset_ready ? 'Sim' : 'Não'}</strong></Typography>
            <Typography variant="body2">Clientes: <strong>{statusInfo.stats?.clients_count || 0}</strong></Typography>
            <Typography variant="body2">Clientes com itens: <strong>{statusInfo.stats?.inventory_clients || 0}</strong></Typography>
            <Typography variant="body2">Itens em aberto: <strong>{statusInfo.stats?.open_items || 0}</strong></Typography>
            <Typography variant="body2">Última carga: <strong>{loadedAt}</strong></Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default PickupsDataUpload;
