import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import { hasPermission } from '../utils/auth';

const MAX_CSV_UPLOAD_MB = 200;
const MAX_CSV_UPLOAD_BYTES = MAX_CSV_UPLOAD_MB * 1024 * 1024;
const MAX_GIRO_SALES_UPLOAD_MB = 500;
const ACCEPTED_UPLOAD_EXTENSIONS = ['.csv', '.txt'];
const GIRO_DATASETS = [
  { key: 'sales', label: 'Vendas · 03.02.37 - 3 M', hint: 'O tipo de cesta é identificado pelo código do produto; no relatório 03.02.37 - 3 M, use a coluna Produto (coluna P). Não precisa incluir a cesta no arquivo.', maxBytes: MAX_GIRO_SALES_UPLOAD_MB * 1024 * 1024 },
  { key: 'targets', label: 'Metas · METAS', hint: 'Indicador, Ano (opcional), Jan a Dez, com linhas GIRO VISA e GIRO SOPI.', maxBytes: 20 * 1024 * 1024 }
];
const GIRO_TARGETS_TEMPLATE = [
  'Indicador;Ano;Jan;Fev;Mar;Abr;Mai;Jun;Jul;Ago;Set;Out;Nov;Dez',
  'GIRO VISA;;9%;8,5%;7,5%;;;;;;;;;',
  'GIRO SOPI;;9%;8,5%;7,5%;;;;;;;;;',
].join('\r\n');

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

const validateUploadFile = (file, label, maximumBytes = MAX_CSV_UPLOAD_BYTES) => {
  if (!file) {
    return '';
  }

  const normalizedName = String(file.name || '').trim().toLowerCase();
  if (!ACCEPTED_UPLOAD_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))) {
    return `${label} deve estar em formato CSV ou TXT.`;
  }

  if ((Number(file.size) || 0) > maximumBytes) {
    return `${label} excede o limite de ${Math.floor(maximumBytes / (1024 * 1024))} MB.`;
  }

  return '';
};

const downloadGiroTargetsTemplate = () => {
  const blob = new Blob([`\uFEFF${GIRO_TARGETS_TEMPLATE}\r\n`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo_metas_giro.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

const PickupsDataUpload = () => {
  const navigate = useNavigate();
  const canCreatePickupOrder = hasPermission('pickups.create_order');
  const canImportPickupBase = hasPermission('pickups.import_base');
  const canManageGiro = hasPermission('giro.manage');
  const canImportSharedBase = canImportPickupBase || canManageGiro;
  const clientsFileInputRef = useRef(null);
  const inventoryFileInputRef = useRef(null);
  const giroFileInputRefs = useRef({});
  const [statusInfo, setStatusInfo] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [clientsFile, setClientsFile] = useState(null);
  const [inventoryFile, setInventoryFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [giroImports, setGiroImports] = useState([]);
  const [loadingGiroImports, setLoadingGiroImports] = useState(false);
  const [giroFiles, setGiroFiles] = useState({});
  const [importingGiroDataset, setImportingGiroDataset] = useState('');
  const [giroSuccess, setGiroSuccess] = useState('');
  const [giroError, setGiroError] = useState('');

  const panelSx = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--stroke)',
    borderRadius: 'var(--radius-lg)',
    p: 3,
    boxShadow: 'var(--shadow-md)',
  };

  const loadStatus = useCallback(async () => {
    if (!canImportSharedBase) {
      setLoadingStatus(false);
      return;
    }
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
  }, [canImportSharedBase]);

  const loadGiroImports = useCallback(async () => {
    if (!canManageGiro) {
      setLoadingGiroImports(false);
      return;
    }
    try {
      setLoadingGiroImports(true);
      const response = await api.get('/giro/imports');
      setGiroImports(response.data.imports || []);
      setGiroError('');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setGiroError(typeof detail === 'string' ? detail : 'Erro ao carregar o status das bases de Giro.');
    } finally {
      setLoadingGiroImports(false);
    }
  }, [canManageGiro]);

  useEffect(() => {
    loadStatus();
    loadGiroImports();
  }, [loadGiroImports, loadStatus]);

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
  const giroImportsByDataset = Object.fromEntries(giroImports.map((item) => [item.dataset, item]));

  const handleGiroFileSelection = (dataset) => (event) => {
    const file = event.target.files?.[0] || null;
    setGiroError('');
    setGiroSuccess('');

    if (!file) {
      setGiroFiles((current) => ({ ...current, [dataset.key]: null }));
      return;
    }

    const fileError = validateUploadFile(file, dataset.label, dataset.maxBytes);
    if (fileError) {
      setGiroFiles((current) => ({ ...current, [dataset.key]: null }));
      setGiroError(fileError);
      event.target.value = '';
      return;
    }

    setGiroFiles((current) => ({ ...current, [dataset.key]: file }));
  };

  const handleGiroImport = async (dataset) => {
    const file = giroFiles[dataset.key];
    if (!file) {
      setGiroError(`Selecione o CSV de ${dataset.label} antes de importar.`);
      return;
    }
    const fileError = validateUploadFile(file, dataset.label, dataset.maxBytes);
    if (fileError) {
      setGiroError(fileError);
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    setImportingGiroDataset(dataset.key);
    setGiroError('');
    setGiroSuccess('');
    try {
      const response = await api.post(`/giro/imports/${dataset.key}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setGiroSuccess(
        `${dataset.label}: ${Number(response.data.rows_imported || 0).toLocaleString('pt-BR')} registros importados; `
        + `${Number(response.data.rows_ignored || 0).toLocaleString('pt-BR')} ignorados.`
      );
      setGiroFiles((current) => ({ ...current, [dataset.key]: null }));
      if (giroFileInputRefs.current[dataset.key]) {
        giroFileInputRefs.current[dataset.key].value = '';
      }
      await loadGiroImports();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setGiroError(typeof detail === 'string' ? detail : `Erro ao importar ${dataset.label}.`);
    } finally {
      setImportingGiroDataset('');
    }
  };

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h5">Atualizar bases</Typography>
        {canCreatePickupOrder && (
          <Button variant="outlined" onClick={() => navigate('/operacoes/ordens/nova')}>
            Ir para retiradas
          </Button>
        )}
      </Box>

      {canImportSharedBase && error && <Alert severity="error">{error}</Alert>}
      {canImportSharedBase && success && <Alert severity="success">{success}</Alert>}

      {canImportSharedBase && <Box sx={panelSx}>
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
      </Box>}

      {canImportSharedBase && <Box sx={panelSx}>
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
      </Box>}

      {canImportSharedBase && canManageGiro && <Divider />}

      {canManageGiro && (
        <Box sx={panelSx}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Bases de Giro</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Clientes (01.20.11) e equipamentos (02.02.20) usam as bases compartilhadas acima. Aqui, envie somente vendas (03.02.37 - 3 M) e metas.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Formatos aceitos: .csv e .txt. Limites: vendas 500 MB; metas 20 MB. O modelo de metas contém percentuais ilustrativos: substitua-os pelos valores oficiais antes de enviar.
          </Typography>
          {giroError && <Alert severity="error" sx={{ mb: 2 }}>{giroError}</Alert>}
          {giroSuccess && <Alert severity="success" sx={{ mb: 2 }}>{giroSuccess}</Alert>}
          {loadingGiroImports && <CircularProgress size={24} sx={{ mb: 2 }} />}
          <Stack spacing={2}>
            {GIRO_DATASETS.map((dataset) => {
              const imported = giroImportsByDataset[dataset.key];
              const file = giroFiles[dataset.key];
              return (
                <Paper key={dataset.key} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1.25}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{dataset.label}</Typography>
                      <Typography variant="body2" color="text.secondary">{dataset.hint}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {imported
                          ? `Última carga: ${imported.file_name || 'arquivo compartilhado'} · ${imported.imported_at ? new Date(imported.imported_at).toLocaleString('pt-BR') : 'data indisponível'} · ${Number(imported.rows_imported || 0).toLocaleString('pt-BR')} registros importados · ${Number(imported.rows_ignored || 0).toLocaleString('pt-BR')} ignorados`
                          : 'Ainda não há carga registrada.'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Arquivo CSV</Typography>
                      <input
                        ref={(element) => { giroFileInputRefs.current[dataset.key] = element; }}
                        type="file"
                        accept=".csv,.txt,text/csv,text/plain"
                        onChange={handleGiroFileSelection(dataset)}
                        disabled={Boolean(importingGiroDataset)}
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
                        {file ? `Selecionado: ${file.name} (${formatFileSize(file.size)})` : 'Nenhum arquivo selecionado.'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button
                        variant="contained"
                        disabled={Boolean(importingGiroDataset) || !file}
                        onClick={() => handleGiroImport(dataset)}
                      >
                        {importingGiroDataset === dataset.key ? 'Atualizando...' : 'Atualizar base'}
                      </Button>
                      <Button
                        variant="outlined"
                        disabled={loadingGiroImports || Boolean(importingGiroDataset)}
                        onClick={loadGiroImports}
                      >
                        Atualizar status
                      </Button>
                      {dataset.key === 'targets' && (
                        <Button
                          variant="outlined"
                          disabled={Boolean(importingGiroDataset)}
                          onClick={downloadGiroTargetsTemplate}
                        >
                          Baixar modelo de metas
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default PickupsDataUpload;
