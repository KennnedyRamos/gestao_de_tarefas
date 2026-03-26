import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import { hasPermission } from '../utils/auth';

const MAX_CSV_UPLOAD_MB = 200;
const MAX_CSV_UPLOAD_BYTES = MAX_CSV_UPLOAD_MB * 1024 * 1024;
const ACCEPTED_UPLOAD_EXTENSIONS = ['.csv', '.txt'];

const formatFileSize = (bytes) => {
  const normalized = Number(bytes || 0);
  if (!normalized) {
    return '0 B';
  }
  if (normalized >= 1024 * 1024) {
    return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (normalized >= 1024) {
    return `${(normalized / 1024).toFixed(1)} KB`;
  }
  return `${normalized} B`;
};

const validateUploadFile = (file, label) => {
  if (!file) {
    return '';
  }

  const normalizedName = String(file.name || '').trim().toLowerCase();
  if (!ACCEPTED_UPLOAD_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))) {
    return `${label} deve estar em formato CSV ou TXT.`;
  }

  if ((Number(file.size) || 0) > MAX_CSV_UPLOAD_BYTES) {
    return `${label} excede o limite de ${MAX_CSV_UPLOAD_MB} MB.`;
  }

  return '';
};

const PickupsDataUpload = () => {
  const navigate = useNavigate();
  const canCreatePickupOrder = hasPermission('pickups.create_order');
  const clientsFileInputRef = useRef(null);
  const inventoryFileInputRef = useRef(null);
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

  const clearSelectedFiles = () => {
    setClientsFile(null);
    setInventoryFile(null);
    if (clientsFileInputRef.current) {
      clientsFileInputRef.current.value = '';
    }
    if (inventoryFileInputRef.current) {
      inventoryFileInputRef.current.value = '';
    }
  };

  const handleFileSelection = (setter, label) => (event) => {
    const file = event.target.files?.[0] || null;
    setError('');
    setSuccess('');

    if (!file) {
      setter(null);
      return;
    }

    const validationError = validateUploadFile(file, label);
    if (validationError) {
      setter(null);
      setError(validationError);
      event.target.value = '';
      return;
    }

    setter(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!clientsFile && !inventoryFile) {
      setError('Envie pelo menos um CSV: 01.20.11 ou 02.02.20.');
      return;
    }

    const clientsValidationError = validateUploadFile(clientsFile, 'CSV 01.20.11');
    if (clientsValidationError) {
      setError(clientsValidationError);
      return;
    }

    const inventoryValidationError = validateUploadFile(inventoryFile, 'CSV 02.02.20');
    if (inventoryValidationError) {
      setError(inventoryValidationError);
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
      clearSelectedFiles();
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
        {canCreatePickupOrder && (
          <Button variant="outlined" onClick={() => navigate('/operacoes/ordens/nova')}>
            Ir para retiradas
          </Button>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Carga diária de CSV</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Envie 01.20.11 (clientes), 02.02.20 (itens emprestados) ou ambos no mesmo envio.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Limite por arquivo: {MAX_CSV_UPLOAD_MB} MB. Formatos aceitos: .csv e .txt.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">CSV 01.20.11</Typography>
            <input
              ref={clientsFileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileSelection(setClientsFile, 'CSV 01.20.11')}
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
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              {clientsFile ? `Selecionado: ${clientsFile.name} (${formatFileSize(clientsFile.size)})` : 'Nenhum arquivo selecionado.'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">CSV 02.02.20</Typography>
            <input
              ref={inventoryFileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileSelection(setInventoryFile, 'CSV 02.02.20')}
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
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              {inventoryFile ? `Selecionado: ${inventoryFile.name} (${formatFileSize(inventoryFile.size)})` : 'Nenhum arquivo selecionado.'}
            </Typography>
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
