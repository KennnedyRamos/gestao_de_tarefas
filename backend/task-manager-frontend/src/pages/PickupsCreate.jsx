import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';

const CLIENT_FIELDS = [
  'client_code',
  'nome_fantasia',
  'razao_social',
  'cnpj_cpf',
  'setor',
  'telefone',
  'endereco',
  'bairro',
  'cidade',
  'cep',
  'inscricao_estadual',
  'responsavel_cliente',
  'responsavel_retirada',
  'responsavel_conferencia',
];

const MANUAL_ONLY_CLIENT_FIELDS = [
  'telefone',
  'responsavel_cliente',
  'responsavel_retirada',
  'responsavel_conferencia',
];

const ITEM_TYPE_LABELS = {
  refrigerador: 'Refrigerador',
  garrafeira: 'Garrafeira',
  vasilhame_caixa: 'Vasilhame (Caixa)',
  vasilhame_garrafa: 'Vasilhame (Garrafa)',
  outro: 'Outro',
};

const BOTTLES_PER_CRATE = {
  '300ml': 24,
  '600ml': 24,
  '1l': 12,
};

const createEmptyClient = () => ({
  client_code: '',
  nome_fantasia: '',
  razao_social: '',
  cnpj_cpf: '',
  setor: '',
  telefone: '',
  endereco: '',
  bairro: '',
  cidade: '',
  cep: '',
  inscricao_estadual: '',
  responsavel_cliente: '',
  responsavel_retirada: '',
  responsavel_conferencia: '',
});

const clearManualClientFields = (clientData) => {
  const next = { ...(clientData || createEmptyClient()) };
  MANUAL_ONLY_CLIENT_FIELDS.forEach((field) => {
    next[field] = '';
  });
  return next;
};

const createManualItem = () => ({
  description: '',
  quantity: '0',
  item_type: 'outro',
  rg: '',
  volume_key: '',
});

const intValue = (value) => {
  const parsed = parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const quantityText = (itemType, volumeKey, quantity) => {
  if (itemType !== 'vasilhame_caixa') {
    return String(quantity);
  }
  const factor = BOTTLES_PER_CRATE[String(volumeKey || '').toLowerCase()];
  if (!factor) {
    return `${quantity} caixas`;
  }
  return `${quantity} caixas - ${factor * quantity} garrafas`;
};

const parseFilenameFromDisposition = (contentDispositionValue) => {
  if (!contentDispositionValue) {
    return '';
  }
  const utfMatch = contentDispositionValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch (err) {
      return utfMatch[1];
    }
  }
  const simpleMatch = contentDispositionValue.match(/filename="?([^";]+)"?/i);
  return simpleMatch && simpleMatch[1] ? simpleMatch[1] : '';
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const PickupsCreate = () => {
  const navigate = useNavigate();

  const [statusInfo, setStatusInfo] = useState(null);
  const [searchCode, setSearchCode] = useState('');
  const [matchedCode, setMatchedCode] = useState('');
  const [client, setClient] = useState(createEmptyClient());
  const [items, setItems] = useState([]);
  const [selectedMap, setSelectedMap] = useState({});
  const [manualItems, setManualItems] = useState([]);

  const [companyName, setCompanyName] = useState('Ribeira Beer');
  const [withdrawalDate, setWithdrawalDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [withdrawalTime, setWithdrawalTime] = useState('');
  const [extraObservation, setExtraObservation] = useState('');

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [searching, setSearching] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
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
      setError('Erro ao carregar status da base de retiradas.');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const datasetReady = Boolean(statusInfo?.dataset_ready);

  const handleSearch = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const code = String(searchCode || '').trim();
    if (!code) {
      setError('Informe o código do cliente.');
      return;
    }

    try {
      setSearching(true);
      const response = await api.get(`/pickup-catalog/client/${encodeURIComponent(code)}`);
      const data = response.data || {};

      setMatchedCode(data.matched_code || code);
      setClient(clearManualClientFields(data.client || createEmptyClient()));
      setItems(Array.isArray(data.items) ? data.items : []);
      setSelectedMap({});
      setManualItems([]);
      setExtraObservation('');

      if (!data.found_anything) {
        setError('Cliente não encontrado na base atual. Você pode completar os dados manualmente.');
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao buscar cliente.');
    } finally {
      setSearching(false);
    }
  };

  const handleClientChange = (field, value) => {
    if (!CLIENT_FIELDS.includes(field)) {
      return;
    }
    setClient((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleItem = (itemId, checked) => {
    setSelectedMap((prev) => {
      const prevRow = prev[itemId] || { checked: false, quantity: 0 };
      const nextQuantity = checked ? Math.max(1, intValue(prevRow.quantity)) : 0;
      return {
        ...prev,
        [itemId]: {
          checked,
          quantity: nextQuantity,
        },
      };
    });
  };

  const handleQtyChange = (itemId, openQuantity, rawValue) => {
    const parsed = intValue(rawValue);
    const quantity = clamp(parsed, 0, intValue(openQuantity));
    setSelectedMap((prev) => ({
      ...prev,
      [itemId]: {
        checked: quantity > 0,
        quantity,
      },
    }));
  };

  const handleAddManualItem = () => {
    setManualItems((prev) => [...prev, createManualItem()]);
  };

  const handleManualChange = (index, field, value) => {
    setManualItems((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }
      const next = { ...row, [field]: value };
      if (field === 'item_type' && value !== 'refrigerador') {
        next.rg = '';
      }
      if (field === 'item_type' && value !== 'vasilhame_caixa') {
        next.volume_key = '';
      }
      return next;
    }));
  };

  const handleRemoveManual = (index) => {
    setManualItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const selectedInventoryLines = useMemo(() => {
    return items
      .map((item) => {
        const row = selectedMap[item.id] || { checked: false, quantity: 0 };
        const openQuantity = intValue(item.open_quantity);
        let quantity = intValue(row.quantity);
        if (row.checked && quantity <= 0) {
          quantity = 1;
        }
        quantity = clamp(quantity, 0, openQuantity);
        if (quantity <= 0 || !row.checked) {
          return null;
        }

        const itemType = item.item_type || 'outro';
        return {
          item_id: item.id,
          description: item.description || '',
          item_type: itemType,
          quantity,
          quantity_text: quantityText(itemType, item.volume_key, quantity),
          rg: item.rg || '',
          volume_key: item.volume_key || '',
          source: 'inventory',
        };
      })
      .filter(Boolean);
  }, [items, selectedMap]);

  const manualLines = useMemo(() => {
    return manualItems
      .map((item) => {
        const description = String(item.description || '').trim();
        const quantity = intValue(item.quantity);
        if (!description || quantity <= 0) {
          return null;
        }
        const itemType = String(item.item_type || 'outro').trim() || 'outro';
        const rg = String(item.rg || '').trim();
        const volumeKey = String(item.volume_key || '').trim();
        return {
          description,
          item_type: itemType,
          quantity,
          quantity_text: quantityText(itemType, volumeKey, quantity),
          rg,
          volume_key: volumeKey,
          source: 'manual',
        };
      })
      .filter(Boolean);
  }, [manualItems]);

  const allLines = useMemo(() => {
    return [...selectedInventoryLines, ...manualLines];
  }, [selectedInventoryLines, manualLines]);

  const autoSummary = useMemo(() => {
    return allLines
      .map((line) => {
        if (line.item_type === 'refrigerador' && line.rg) {
          return `${line.description} (RG ${line.rg}) - ${line.quantity_text}`;
        }
        return `${line.description} - ${line.quantity_text}`;
      })
      .join('; ');
  }, [allLines]);

  const equipmentPreview = useMemo(() => {
    const selectedTypes = new Set(
      allLines
        .map((line) => line.item_type)
        .filter((itemType) => itemType && itemType !== 'outro')
    );

    if (selectedTypes.size === 0) {
      return [];
    }

    const grouped = {};
    items.forEach((item) => {
      const itemType = item.item_type || 'outro';
      const description = item.description || '';
      if (!grouped[itemType]) {
        grouped[itemType] = {};
      }
      if (!grouped[itemType][description]) {
        grouped[itemType][description] = {
          description,
          quantity: 0,
          rgs: [],
        };
      }
      grouped[itemType][description].quantity += intValue(item.open_quantity);
      if (itemType === 'refrigerador' && item.rg) {
        grouped[itemType][description].rgs.push(String(item.rg));
      }
    });

    return Array.from(selectedTypes).map((itemType) => {
      const rows = Object.values(grouped[itemType] || {});
      return {
        itemType,
        label: ITEM_TYPE_LABELS[itemType] || itemType,
        rows,
      };
    }).filter((group) => group.rows.length > 0);
  }, [allLines, items]);

  const handleGeneratePdf = async () => {
    setError('');
    setSuccess('');

    if (allLines.length === 0) {
      setError('Selecione pelo menos um item para retirada.');
      return;
    }

    const selectedInventory = selectedInventoryLines.map((line) => ({
      item_id: line.item_id,
      quantity: line.quantity,
    }));

    const normalizedManual = manualLines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      item_type: line.item_type,
      rg: line.rg,
      volume_key: line.volume_key,
    }));

    const payload = {
      lookup_code: matchedCode || searchCode,
      company_name: companyName,
      data_retirada: withdrawalDate,
      hora_retirada: withdrawalTime,
      auto_summary: autoSummary,
      observacao_extra: extraObservation,
      client,
      selected_inventory: selectedInventory,
      manual_items: normalizedManual,
    };

    try {
      setGeneratingPdf(true);
      const response = await api.post('/pickup-catalog/orders/pdf', payload, {
        responseType: 'blob',
      });

      const contentDisposition = response.headers['content-disposition'] || '';
      const filenameFromHeader = parseFilenameFromDisposition(contentDisposition);
      const fallbackCode = client.client_code || matchedCode || 'sem_codigo';
      const fallbackName = `ordem_retirada_${fallbackCode}_${dayjs().format('YYYYMMDD_HHmm')}.pdf`;
      const filename = filenameFromHeader || fallbackName;

      const blob = new Blob([response.data], { type: 'application/pdf' });
      downloadBlob(blob, filename);
      setSuccess('PDF gerado com sucesso.');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Erro ao gerar PDF da retirada.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">Retiradas de comodato (ordem automática)</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => navigate('/base-retiradas')}>
            Atualizar base
          </Button>
          <Button variant="outlined" onClick={() => navigate('/operacoes/ordens/central')}>
            Central de retiradas
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Status da base</Typography>
        {loadingStatus ? (
          <Typography color="text.secondary">Carregando status...</Typography>
        ) : !statusInfo ? (
          <Typography color="text.secondary">Sem informações de status.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography variant="body2">Base carregada: <strong>{datasetReady ? 'Sim' : 'Não'}</strong></Typography>
            <Typography variant="body2">Clientes: <strong>{statusInfo.stats?.clients_count || 0}</strong></Typography>
            <Typography variant="body2">Clientes com itens: <strong>{statusInfo.stats?.inventory_clients || 0}</strong></Typography>
            <Typography variant="body2">Itens em aberto: <strong>{statusInfo.stats?.open_items || 0}</strong></Typography>
          </Box>
        )}
      </Box>

      {!datasetReady && !loadingStatus && (
        <Box sx={panelSx}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            A base de retiradas ainda não foi carregada.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/base-retiradas')}>
            Ir para tela de carga dos CSVs
          </Button>
        </Box>
      )}

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Buscar cliente por código</Typography>
        <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            label="Código do cliente"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <Button type="submit" variant="contained" disabled={searching || !datasetReady}>
            {searching ? 'Buscando...' : 'Buscar'}
          </Button>
        </Box>
      </Box>

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Dados da retirada</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
          <TextField label="Empresa" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <TextField label="Código do cliente" value={client.client_code || ''} onChange={(e) => handleClientChange('client_code', e.target.value)} />
          <TextField label="Setor" value={client.setor || ''} onChange={(e) => handleClientChange('setor', e.target.value)} />

          <TextField label="Nome fantasia" value={client.nome_fantasia || ''} onChange={(e) => handleClientChange('nome_fantasia', e.target.value)} />
          <TextField label="Razão social" value={client.razao_social || ''} onChange={(e) => handleClientChange('razao_social', e.target.value)} />
          <TextField label="CNPJ/CPF" value={client.cnpj_cpf || ''} onChange={(e) => handleClientChange('cnpj_cpf', e.target.value)} />

          <TextField label="Endereço" value={client.endereco || ''} onChange={(e) => handleClientChange('endereco', e.target.value)} />
          <TextField label="Bairro" value={client.bairro || ''} onChange={(e) => handleClientChange('bairro', e.target.value)} />
          <TextField label="Cidade" value={client.cidade || ''} onChange={(e) => handleClientChange('cidade', e.target.value)} />

          <TextField label="CEP" value={client.cep || ''} onChange={(e) => handleClientChange('cep', e.target.value)} />
          <TextField label="Inscrição estadual" value={client.inscricao_estadual || ''} onChange={(e) => handleClientChange('inscricao_estadual', e.target.value)} />
          <TextField label="Telefone" value={client.telefone || ''} onChange={(e) => handleClientChange('telefone', e.target.value)} />

          <TextField label="Responsável cliente" value={client.responsavel_cliente || ''} onChange={(e) => handleClientChange('responsavel_cliente', e.target.value)} />
          <TextField label="Responsável retirada" value={client.responsavel_retirada || ''} onChange={(e) => handleClientChange('responsavel_retirada', e.target.value)} />
          <TextField label="Responsável conferência" value={client.responsavel_conferencia || ''} onChange={(e) => handleClientChange('responsavel_conferencia', e.target.value)} />

          <TextField
            label="Data da retirada"
            type="date"
            value={withdrawalDate}
            onChange={(e) => setWithdrawalDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Horário da retirada"
            type="time"
            value={withdrawalTime}
            onChange={(e) => setWithdrawalTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </Box>

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Itens em aberto (02.02.20)</Typography>
        {items.length === 0 ? (
          <Typography color="text.secondary">Busque um cliente para listar itens em aberto.</Typography>
        ) : (
          <TableContainer sx={{ border: '1px solid var(--stroke)', borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Sel.</TableCell>
                  <TableCell>Descrição</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>RG</TableCell>
                  <TableCell>Nº comodato</TableCell>
                  <TableCell>Data emissão</TableCell>
                  <TableCell>Em aberto</TableCell>
                  <TableCell>Retirar</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => {
                  const selected = selectedMap[item.id] || { checked: false, quantity: 0 };
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selected.checked)}
                          onChange={(e) => handleToggleItem(item.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.type_label || ITEM_TYPE_LABELS[item.item_type] || item.item_type}</TableCell>
                      <TableCell>{item.rg || '-'}</TableCell>
                      <TableCell>{item.comodato_number || '-'}</TableCell>
                      <TableCell>{item.data_emissao || '-'}</TableCell>
                      <TableCell>{item.open_quantity}</TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={selected.quantity || 0}
                          onChange={(e) => handleQtyChange(item.id, item.open_quantity, e.target.value)}
                          inputProps={{ min: 0, max: item.open_quantity, step: 1 }}
                          sx={{ width: 100 }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Itens manuais</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Use quando o item estiver em outro cliente ou sem cadastro.
        </Typography>

        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {manualItems.map((row, index) => (
            <Box
              key={`manual-${index}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '2fr 110px 1fr 140px 130px auto' },
                gap: 1,
                alignItems: 'center',
              }}
            >
              <TextField
                label="Descrição"
                value={row.description}
                onChange={(e) => handleManualChange(index, 'description', e.target.value)}
              />
              <TextField
                label="Quantidade"
                type="number"
                value={row.quantity}
                onChange={(e) => handleManualChange(index, 'quantity', e.target.value)}
                inputProps={{ min: 0, step: 1 }}
              />
              <FormControl>
                <InputLabel>Tipo</InputLabel>
                <Select
                  label="Tipo"
                  value={row.item_type}
                  onChange={(e) => handleManualChange(index, 'item_type', e.target.value)}
                >
                  <MenuItem value="outro">Outro</MenuItem>
                  <MenuItem value="refrigerador">Refrigerador</MenuItem>
                  <MenuItem value="garrafeira">Garrafeira</MenuItem>
                  <MenuItem value="vasilhame_caixa">Vasilhame caixa</MenuItem>
                  <MenuItem value="vasilhame_garrafa">Vasilhame garrafa</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="RG"
                value={row.rg}
                onChange={(e) => handleManualChange(index, 'rg', e.target.value)}
                disabled={row.item_type !== 'refrigerador'}
              />
              <FormControl>
                <InputLabel>Volume</InputLabel>
                <Select
                  label="Volume"
                  value={row.volume_key}
                  onChange={(e) => handleManualChange(index, 'volume_key', e.target.value)}
                  disabled={row.item_type !== 'vasilhame_caixa'}
                >
                  <MenuItem value="">-</MenuItem>
                  <MenuItem value="300ml">300ml</MenuItem>
                  <MenuItem value="600ml">600ml</MenuItem>
                  <MenuItem value="1l">1L</MenuItem>
                </Select>
              </FormControl>
              <Button color="error" variant="outlined" onClick={() => handleRemoveManual(index)}>
                Remover
              </Button>
            </Box>
          ))}

          <Box>
            <Button variant="outlined" onClick={handleAddManualItem}>Adicionar item manual</Button>
          </Box>
        </Box>
      </Box>

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Equipamentos em aberto (mesmo tipo selecionado)</Typography>
        {equipmentPreview.length === 0 ? (
          <Typography color="text.secondary">
            Selecione itens para retirada para exibir o resumo dos equipamentos em aberto.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {equipmentPreview.map((group) => (
              <Box key={group.itemType}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{group.label}</Typography>
                {group.rows.map((row) => (
                  <Typography key={`${group.itemType}-${row.description}`} variant="body2" color="text.secondary">
                    {group.itemType === 'refrigerador' && row.rgs.length > 0
                      ? `${row.description} - ${row.quantity} un. | RGs: ${row.rgs.join(', ')}`
                      : `${row.description} - ${row.quantity}`}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Box sx={panelSx}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Observação</Typography>
        <TextField
          label="Resumo automático"
          value={autoSummary || 'Nenhum item selecionado.'}
          InputProps={{ readOnly: true }}
          multiline
          rows={4}
          fullWidth
          sx={{ mb: 1.5 }}
        />
        <TextField
          label="Observação adicional"
          value={extraObservation}
          onChange={(e) => setExtraObservation(e.target.value)}
          multiline
          rows={3}
          fullWidth
        />

        <Box sx={{ mt: 1.5 }}>
          <Button variant="contained" onClick={handleGeneratePdf} disabled={generatingPdf}>
            {generatingPdf ? 'Gerando PDF...' : 'Gerar PDF (2 vias)'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default PickupsCreate;

