import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

import api from '../services/api';

const TAB_CONFIG = {
  baixa: {
    label: 'Solicitação de baixa',
    subject: 'Solicitação de baixa de materiais retirados',
  },
  de_para: {
    label: 'Solicitação de DE-PARA',
    subject: 'Solicitação de DE-PARA',
  },
  comodato: {
    label: 'Solicitação de comodato',
    subject: 'Solicitação de comodato',
  },
};

const MATERIAL_KIND_OPTIONS = [
  { value: 'refrigerador', label: 'Refrigerador' },
  { value: 'outro', label: 'Outros materiais' },
];

const COMODATO_AVAILABLE_STATUS_LABELS = {
  novo: 'Novo',
  disponivel: 'Boa',
};
const COMODATO_VISIBLE_ROWS = 25;
const BAIXA_PREVIEW_VISIBLE_ROWS = 3;

const MENTION_OPTIONS = [
  { key: 'arlei', name: 'Arlei Pereira', role: 'Gerente de Vendas' },
  { key: 'fernando', name: 'Fernando Bon', role: 'Gerente de Vendas' },
  { key: 'janio', name: 'Janio do Carmo', role: 'Gerente de Vendas' },
  { key: 'reginaldo', name: 'Reginaldo Paulino', role: 'Gerente do Comercial' },
  { key: 'daniel', name: 'Daniel Cavalheiro', role: 'Supervisor de Vendas' },
];
const SAVED_RECIPIENTS_STORAGE_KEY = 'requests.savedRecipients.v1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const newId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const safeText = (value) => String(value || '').trim();
const normalizeRecipientEmail = (value) => safeText(value).toLowerCase();
const isValidRecipientEmail = (value) => EMAIL_REGEX.test(normalizeRecipientEmail(value));
const parseRecipientList = (value) => String(value || '')
  .split(/[;, \n\t]+/)
  .map(normalizeRecipientEmail)
  .filter(Boolean);
const normalizeLookupCode = (value) => safeText(value).replace(/\s+/g, '').toUpperCase();

const createMaterialItem = () => ({
  id: newId(),
  kind: 'refrigerador',
  material: '',
  rg: '',
  etiqueta: '',
  nota: '',
  quantidade: '1',
  condition: 'boa',
});

const normalizeInventoryItem = (item) => ({
  id: Number(item.id || 0),
  description: safeText(item.description),
  itemType: safeText(item.item_type).toLowerCase() || 'outro',
  typeLabel: safeText(item.type_label),
  openQuantity: Number(item.open_quantity || 0) || 0,
  rg: safeText(item.rg),
  comodatoNumber: safeText(item.comodato_number),
  dataEmissao: safeText(item.data_emissao),
});

const materialSignature = (item) => {
  const kind = item.kind === 'refrigerador' ? 'refrigerador' : 'outro';
  const material = safeText(item.material).toLowerCase();
  const rg = safeText(item.rg).toLowerCase();
  const etiqueta = safeText(item.etiqueta).toLowerCase();
  const nota = safeText(item.nota).toLowerCase();
  const quantidade = safeText(item.quantidade);
  return [kind, material, rg, etiqueta, nota, quantidade].join('|');
};

const mapAvailableRefrigeratorToMaterial = (equipment) => ({
  kind: 'refrigerador',
  material: safeText(equipment.model_name),
  rg: safeText(equipment.rg_code),
  etiqueta: safeText(equipment.tag_code),
  nota: '',
  quantidade: '1',
  condition: 'boa',
});

const resolveComodatoTarget = (blocks = []) => {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) {
    return { targetIndex: -1, targetRequestNumber: 0, targetBlock: null };
  }
  let targetIndex = list.findIndex((block) => Boolean(block.selected));
  if (targetIndex < 0) {
    targetIndex = 0;
  }
  return {
    targetIndex,
    targetRequestNumber: targetIndex + 1,
    targetBlock: list[targetIndex],
  };
};

const createRequestBlock = () => ({
  id: newId(),
  selected: true,
  sourceOrderId: null,
  sourceOrderNumber: '',
  clientCode: '',
  fantasyName: '',
  document: '',
  fromClientCode: '',
  fromFantasyName: '',
  fromDocument: '',
  toClientCode: '',
  toFantasyName: '',
  toDocument: '',
  fromInventoryItems: [],
  selectedFromInventoryItemIds: [],
  fromInventoryLoading: false,
  fromInventoryError: '',
  materials: [createMaterialItem()],
});

const buildGreeting = () => {
  const currentHour = new Date().getHours();
  return currentHour < 12 ? 'Bom dia' : 'Boa tarde';
};

const formatIdentity = ({ code, fantasy, document }) => {
  const resolvedCode = safeText(code) || '-';
  const resolvedFantasy = safeText(fantasy) || '-';
  const resolvedDocument = safeText(document) || '-';
  return `${resolvedCode} - ${resolvedFantasy} (${resolvedDocument})`;
};

const buildMaterialsLines = (materials = [], options = {}) => {
  const includeNote = options.includeNote !== false;
  const showEmptyMessage = options.showEmptyMessage !== false;
  const normalized = materials
    .map((item) => ({
      kind: item.kind === 'refrigerador' ? 'refrigerador' : 'outro',
      material: safeText(item.material),
      rg: safeText(item.rg),
      etiqueta: safeText(item.etiqueta),
      nota: safeText(item.nota),
      quantidade: safeText(item.quantidade) || '1',
      condition: safeText(item.condition).toLowerCase() || 'boa',
    }))
    .filter((item) => item.material);

  const refrigerators = normalized.filter((item) => item.kind === 'refrigerador');
  const others = normalized.filter((item) => item.kind !== 'refrigerador');

  if (!refrigerators.length && !others.length) {
    return showEmptyMessage ? ['Nenhum material informado.'] : [];
  }

  const lines = [];
  if (refrigerators.length) {
    refrigerators.forEach((item) => {
      lines.push(`Material: ${item.material}`);
      lines.push(`RG: ${item.rg || '-'}`);
      lines.push(`Etiqueta: ${item.etiqueta || '-'}`);
      if (includeNote) {
        lines.push(`Nota: ${item.nota || '-'}`);
      }
      lines.push('');
    });
  }
  if (others.length) {
    others.forEach((item) => {
      lines.push(`Material: ${item.material}`);
      lines.push(`Quantidade: ${item.quantidade || '1'}`);
      if (includeNote) {
        lines.push(`Nota: ${item.nota || '-'}`);
      }
      lines.push('');
    });
  }
  while (lines.length && !lines[lines.length - 1]) {
    lines.pop();
  }
  return lines;
};

const buildBaixaBlock = (block) => {
  const materialLines = buildMaterialsLines(block.materials, { showEmptyMessage: false });
  if (!materialLines.length) {
    return '';
  }
  const lines = [
    `${formatIdentity({
      code: block.clientCode,
      fantasy: block.fantasyName,
      document: block.document,
    })}:`,
    '',
    ...materialLines,
  ];
  return lines.join('\n').trim();
};

const buildGroupedBaixaBlocks = (blocks = []) => {
  const groups = [];
  const groupIndexByClient = new Map();

  blocks.forEach((block) => {
    const codeKey = normalizeLookupCode(block.clientCode);
    const fantasyKey = safeText(block.fantasyName).toLowerCase();
    const documentKey = safeText(block.document).replace(/\D+/g, '');
    const hasIdentity = Boolean(codeKey || fantasyKey || documentKey);
    const groupKey = hasIdentity
      ? `${codeKey}|${fantasyKey}|${documentKey}`
      : `block:${safeText(block.id) || newId()}`;

    if (!groupIndexByClient.has(groupKey)) {
      groupIndexByClient.set(groupKey, groups.length);
      groups.push({
        clientCode: safeText(block.clientCode),
        fantasyName: safeText(block.fantasyName),
        document: safeText(block.document),
        materials: Array.isArray(block.materials) ? [...block.materials] : [],
      });
      return;
    }

    const index = groupIndexByClient.get(groupKey);
    if (index === undefined) {
      return;
    }

    groups[index].materials = [
      ...groups[index].materials,
      ...(Array.isArray(block.materials) ? block.materials : []),
    ];
  });

  return groups
    .map((group) => buildBaixaBlock({
      clientCode: group.clientCode,
      fantasyName: group.fantasyName,
      document: group.document,
      materials: group.materials,
    }))
    .filter(Boolean);
};

const buildDeParaBlock = (block) => {
  const lines = [
    `PDV origem: ${formatIdentity({
      code: block.fromClientCode,
      fantasy: block.fromFantasyName,
      document: block.fromDocument,
    })}`,
    `PDV destino: ${formatIdentity({
      code: block.toClientCode,
      fantasy: block.toFantasyName,
      document: block.toDocument,
    })}`,
    '',
    ...buildMaterialsLines(block.materials),
  ];
  return lines.join('\n').trim();
};

const buildComodatoBlock = (block) => {
  const lines = [
    `PDV ${formatIdentity({
      code: block.clientCode,
      fantasy: block.fantasyName,
      document: block.document,
    })}:`,
    '',
    ...buildMaterialsLines(block.materials, { includeNote: false }),
  ];
  return lines.join('\n').trim();
};

const joinMassBlocks = (blocks) => {
  const validBlocks = blocks
    .map((block) => safeText(block))
    .filter(Boolean);
  return validBlocks.join('\n\n\n');
};

const withClosing = (body, closingLine = 'Atenciosamente') => {
  const resolvedClosing = safeText(closingLine) || 'Atenciosamente';
  const normalized = safeText(body);
  if (!normalized) {
    return resolvedClosing;
  }
  return `${normalized}\n\n${resolvedClosing}`;
};

const buildComodatoIntroLine = (mentions = []) => {
  const list = Array.isArray(mentions) ? mentions : [];
  if (list.length === 0) {
    return 'Solicitação de materiais de marketing:';
  }
  if (list.length === 1) {
    const person = list[0];
    return `Solicitação de materiais de marketing feita pelo ${safeText(person.role)} ${safeText(person.name)}:`;
  }
  const mentionText = list
    .map((person) => `${safeText(person.role)} ${safeText(person.name)}`.trim())
    .filter(Boolean)
    .join(', ');
  return `Solicitação de materiais de marketing feita pelos responsáveis: ${mentionText}:`;
};

const isMaterialEmpty = (item) => {
  const quantity = safeText(item.quantidade);
  return (
    !safeText(item.material)
    && !safeText(item.rg)
    && !safeText(item.etiqueta)
    && !safeText(item.nota)
    && (!quantity || quantity === '1')
  );
};

const isBaixaRequestBlockEmpty = (block) => (
  !safeText(block.clientCode)
  && !safeText(block.fantasyName)
  && !safeText(block.document)
  && !Number(block.sourceOrderId || 0)
  && (!Array.isArray(block.materials) || block.materials.every((item) => isMaterialEmpty(item)))
);

const buildPendingLowEmailMaterialEntries = (payload) => {
  const refrigeradores = Array.isArray(payload.refrigeradores) ? payload.refrigeradores : [];
  const outros = Array.isArray(payload.outros) ? payload.outros : [];
  const entries = [];

  refrigeradores.forEach((item, index) => {
    const material = {
      kind: 'refrigerador',
      material: safeText(item.modelo),
      rg: safeText(item.rg),
      etiqueta: safeText(item.etiqueta),
      nota: safeText(item.nota),
      quantidade: '1',
      condition: 'boa',
    };
    entries.push({
      key: `ref:${index}:${material.material}|${material.rg}|${material.etiqueta}|${material.nota}`,
      label: `Refrigerador | ${material.material || '-'} | RG: ${material.rg || '-'} | Etiqueta: ${material.etiqueta || '-'}`,
      material,
    });
  });

  outros.forEach((item, index) => {
    const material = {
      kind: 'outro',
      material: safeText(item.modelo),
      rg: '',
      etiqueta: '',
      nota: safeText(item.nota),
      quantidade: String(Number(item.quantidade || 0) || 1),
      condition: 'boa',
    };
    entries.push({
      key: `out:${index}:${material.material}|${material.quantidade}|${material.nota}`,
      label: `Outro | ${material.material || '-'} | Quantidade: ${material.quantidade || '1'} | Nota: ${material.nota || '-'}`,
      material,
    });
  });

  return entries;
};

const mapEmailPayloadToBaixaRequestBlock = (payload, selectedEntryKeys = []) => {
  const allEntries = buildPendingLowEmailMaterialEntries(payload);
  const selectedSet = new Set(
    (Array.isArray(selectedEntryKeys) ? selectedEntryKeys : [])
      .map((value) => safeText(value))
      .filter(Boolean)
  );
  const filteredEntries = selectedSet.size
    ? allEntries.filter((entry) => selectedSet.has(entry.key))
    : allEntries;
  const materials = filteredEntries.map((entry) => ({
    ...entry.material,
    id: newId(),
  }));

  return {
    ...createRequestBlock(),
    sourceOrderId: Number(payload.order_id || 0) || null,
    sourceOrderNumber: safeText(payload.order_number),
    clientCode: safeText(payload.client_code),
    fantasyName: safeText(payload.nome_fantasia),
    document: safeText(payload.cnpj_cpf),
    materials: materials.length ? materials : [createMaterialItem()],
  };
};

const Requests = () => {
  const [activeTab, setActiveTab] = useState('baixa');
  const [recipients, setRecipients] = useState('');
  const [recipientName, setRecipientName] = useState('João');
  const [recipientDraftName, setRecipientDraftName] = useState('');
  const [recipientDraftEmail, setRecipientDraftEmail] = useState('');
  const [savedRecipients, setSavedRecipients] = useState([]);
  const [selectedSavedRecipientEmails, setSelectedSavedRecipientEmails] = useState([]);
  const [feedback, setFeedback] = useState({ error: '', success: '' });
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [requestsByType, setRequestsByType] = useState({
    baixa: [createRequestBlock()],
    de_para: [createRequestBlock()],
    comodato: [createRequestBlock()],
  });

  const [availableRefrigerators, setAvailableRefrigerators] = useState([]);
  const [loadingAvailableRefrigerators, setLoadingAvailableRefrigerators] = useState(false);
  const [availableRefrigeratorsError, setAvailableRefrigeratorsError] = useState('');
  const [availableRefrigeratorsQuery, setAvailableRefrigeratorsQuery] = useState('');
  const [pendingLowEmailOrders, setPendingLowEmailOrders] = useState([]);
  const [pendingLowEmailLoading, setPendingLowEmailLoading] = useState(false);
  const [pendingLowEmailError, setPendingLowEmailError] = useState('');
  const [pendingLowEmailPayloadByOrderId, setPendingLowEmailPayloadByOrderId] = useState({});
  const [pendingLowEmailEntriesByOrderId, setPendingLowEmailEntriesByOrderId] = useState({});
  const [pendingLowEmailEntrySelectionByOrderId, setPendingLowEmailEntrySelectionByOrderId] = useState({});
  const [pendingLowEmailEntriesLoadingByOrderId, setPendingLowEmailEntriesLoadingByOrderId] = useState({});
  const [pendingLowEmailEntriesErrorByOrderId, setPendingLowEmailEntriesErrorByOrderId] = useState({});
  const [selectedPendingLowEmailOrderIds, setSelectedPendingLowEmailOrderIds] = useState([]);
  const [sendingSinglePendingOrderId, setSendingSinglePendingOrderId] = useState(null);
  const [sendingBulkPendingOrders, setSendingBulkPendingOrders] = useState(false);
  const lookupTimersRef = useRef(new Map());
  const clientLookupCacheRef = useRef(new Map());

  useEffect(() => () => {
    lookupTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    lookupTimersRef.current.clear();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_RECIPIENTS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      const dedup = new Map();
      parsed.forEach((item) => {
        const email = normalizeRecipientEmail(item.email);
        if (!isValidRecipientEmail(email) || dedup.has(email)) {
          return;
        }
        dedup.set(email, {
          id: safeText(item.id) || newId(),
          name: safeText(item.name),
          email,
        });
      });
      setSavedRecipients(Array.from(dedup.values()));
    } catch (error) {
      // Ignore local storage parsing errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SAVED_RECIPIENTS_STORAGE_KEY,
        JSON.stringify(savedRecipients)
      );
    } catch (error) {
      // Ignore local storage write errors.
    }
  }, [savedRecipients]);

  const currentRequests = useMemo(
    () => requestsByType[activeTab] || [],
    [requestsByType, activeTab]
  );

  const loadPendingLowEmailOrders = useCallback(async () => {
    setPendingLowEmailLoading(true);
    setPendingLowEmailError('');
    try {
      const response = await api.get('/pickup-catalog/orders', {
        params: {
          status: 'concluida',
          email_request_status: 'pending',
          limit: 200,
          offset: 0,
        },
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      setPendingLowEmailOrders(rows.map((row) => ({
        id: Number(row.id || 0),
        orderNumber: safeText(row.order_number),
        clientCode: safeText(row.client_code),
        fantasyName: safeText(row.nome_fantasia),
        withdrawalDate: safeText(row.withdrawal_date),
        summaryLine: safeText(row.summary_line),
      })).filter((row) => row.id > 0));
      setPendingLowEmailPayloadByOrderId({});
      setPendingLowEmailEntriesByOrderId({});
      setPendingLowEmailEntrySelectionByOrderId({});
      setPendingLowEmailEntriesLoadingByOrderId({});
      setPendingLowEmailEntriesErrorByOrderId({});
      setSelectedPendingLowEmailOrderIds([]);
    } catch (error) {
      const detail = error.response.data.detail;
      setPendingLowEmailError(
        typeof detail === 'string' ? detail : 'Não foi possível carregar as baixas pendentes.'
      );
      setPendingLowEmailOrders([]);
      setPendingLowEmailPayloadByOrderId({});
      setPendingLowEmailEntriesByOrderId({});
      setPendingLowEmailEntrySelectionByOrderId({});
      setPendingLowEmailEntriesLoadingByOrderId({});
      setPendingLowEmailEntriesErrorByOrderId({});
      setSelectedPendingLowEmailOrderIds([]);
    } finally {
      setPendingLowEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'baixa') {
      return;
    }
    loadPendingLowEmailOrders();
  }, [activeTab, loadPendingLowEmailOrders]);

  const loadPendingLowEmailOrderEntries = useCallback(async (orderId, forceReload = false) => {
    const normalizedOrderId = Number(orderId || 0);
    if (!normalizedOrderId) {
      return null;
    }

    if (!forceReload && pendingLowEmailEntriesLoadingByOrderId[normalizedOrderId]) {
      return null;
    }

    if (!forceReload && pendingLowEmailPayloadByOrderId[normalizedOrderId]) {
      return {
        payload: pendingLowEmailPayloadByOrderId[normalizedOrderId],
        entries: pendingLowEmailEntriesByOrderId[normalizedOrderId] || [],
      };
    }

    setPendingLowEmailEntriesLoadingByOrderId((prev) => ({ ...prev, [normalizedOrderId]: true }));
    setPendingLowEmailEntriesErrorByOrderId((prev) => ({ ...prev, [normalizedOrderId]: '' }));

    try {
      const response = await api.get(`/pickup-catalog/orders/${normalizedOrderId}/email-request`);
      const payload = response.data || {};
      const entries = buildPendingLowEmailMaterialEntries(payload);
      setPendingLowEmailPayloadByOrderId((prev) => ({ ...prev, [normalizedOrderId]: payload }));
      setPendingLowEmailEntriesByOrderId((prev) => ({ ...prev, [normalizedOrderId]: entries }));
      setPendingLowEmailEntrySelectionByOrderId((prev) => {
        if (Array.isArray(prev[normalizedOrderId]) && prev[normalizedOrderId].length > 0) {
          return prev;
        }
        return {
          ...prev,
          [normalizedOrderId]: entries.map((entry) => entry.key),
        };
      });
      return { payload, entries };
    } catch (error) {
      const detail = error.response.data.detail;
      setPendingLowEmailEntriesByOrderId((prev) => ({ ...prev, [normalizedOrderId]: [] }));
      setPendingLowEmailEntrySelectionByOrderId((prev) => ({ ...prev, [normalizedOrderId]: [] }));
      setPendingLowEmailEntriesErrorByOrderId((prev) => ({
        ...prev,
        [normalizedOrderId]: typeof detail === 'string' ? detail : 'Não foi possível carregar os equipamentos desta ordem.',
      }));
      return null;
    } finally {
      setPendingLowEmailEntriesLoadingByOrderId((prev) => ({ ...prev, [normalizedOrderId]: false }));
    }
  }, [pendingLowEmailEntriesByOrderId, pendingLowEmailEntriesLoadingByOrderId, pendingLowEmailPayloadByOrderId]);

  useEffect(() => {
    if (activeTab !== 'baixa' || pendingLowEmailOrders.length === 0) {
      return;
    }
    pendingLowEmailOrders.forEach((order) => {
      loadPendingLowEmailOrderEntries(order.id);
    });
  }, [activeTab, loadPendingLowEmailOrderEntries, pendingLowEmailOrders]);

  useEffect(() => {
    let isMounted = true;
    if (activeTab !== 'comodato') {
      return () => {
        isMounted = false;
      };
    }

    const fetchAvailableRefrigerators = async () => {
      setLoadingAvailableRefrigerators(true);
      setAvailableRefrigeratorsError('');
      try {
        const response = await api.get('/equipments/refrigerators/available-for-comodato', {
          params: {
            limit: 600,
            offset: 0,
          },
        });
        if (!isMounted) {
          return;
        }
        const rows = Array.isArray(response.data) ? response.data : [];
        const uniqueById = new Map();
        rows.forEach((item) => {
          const id = Number(item.id || 0);
          if (!id || uniqueById.has(id)) {
            return;
          }
          uniqueById.set(id, item);
        });
        const sortedRows = Array.from(uniqueById.values()).sort((left, right) => {
          const leftStatus = safeText(left.status).toLowerCase();
          const rightStatus = safeText(right.status).toLowerCase();
          const statusWeight = {
            novo: 0,
            disponivel: 1,
          };
          const statusDiff = (statusWeight[leftStatus] ?? 9) - (statusWeight[rightStatus] ?? 9);
          if (statusDiff !== 0) {
            return statusDiff;
          }
          return safeText(left.model_name).localeCompare(safeText(right.model_name), 'pt-BR');
        });
        setAvailableRefrigerators(sortedRows);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setAvailableRefrigerators([]);
        setAvailableRefrigeratorsError('Não foi possível carregar os refrigeradores disponíveis agora.');
      } finally {
        if (isMounted) {
          setLoadingAvailableRefrigerators(false);
        }
      }
    };

    fetchAvailableRefrigerators();
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  const filteredAvailableRefrigerators = useMemo(() => {
    const search = safeText(availableRefrigeratorsQuery).toLowerCase();
    if (!search) {
      return availableRefrigerators;
    }
    return availableRefrigerators.filter((item) => {
      const statusValue = safeText(item.status).toLowerCase();
      const statusLabel = COMODATO_AVAILABLE_STATUS_LABELS[statusValue] || statusValue;
      const haystack = [
        safeText(item.model_name),
        safeText(item.brand),
        safeText(item.voltage),
        safeText(item.rg_code),
        safeText(item.tag_code),
        safeText(statusLabel),
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }, [availableRefrigerators, availableRefrigeratorsQuery]);

  const comodatoGroupedRefrigerators = useMemo(() => {
    const novos = [];
    const boa = [];
    filteredAvailableRefrigerators.forEach((item) => {
      const statusValue = safeText(item.status).toLowerCase();
      if (statusValue === 'novo') {
        novos.push(item);
        return;
      }
      if (statusValue === 'disponivel') {
        boa.push(item);
      }
    });
    return { novos, boa };
  }, [filteredAvailableRefrigerators]);

  const comodatoTargetInfo = useMemo(
    () => resolveComodatoTarget(requestsByType.comodato),
    [requestsByType.comodato]
  );

  const comodatoTargetMaterialSignatures = useMemo(() => {
    const targetMaterials = comodatoTargetInfo.targetBlock.materials;
    if (!Array.isArray(targetMaterials)) {
      return new Set();
    }
    return new Set(targetMaterials.map(materialSignature));
  }, [comodatoTargetInfo]);

  const setSuccess = (message) => setFeedback({ success: message, error: '' });
  const setError = (message) => setFeedback({ success: '', error: message });

  const updateRequestBlock = (type, blockId, updater) => {
    setRequestsByType((prev) => ({
      ...prev,
      [type]: (prev[type] || []).map((block) => (block.id === blockId ? updater(block) : block)),
    }));
  };

  const appendBaixaSuggestionBlocks = (incomingBlocks = []) => {
    setRequestsByType((prev) => {
      const baixaAtual = Array.isArray(prev.baixa) ? prev.baixa : [];
      const sourceIds = new Set(
        baixaAtual
          .map((block) => Number(block.sourceOrderId || 0))
          .filter((value) => value > 0)
      );

      const filteredIncoming = incomingBlocks.filter((block) => {
        const sourceId = Number(block.sourceOrderId || 0);
        if (!sourceId) {
          return true;
        }
        if (sourceIds.has(sourceId)) {
          return false;
        }
        sourceIds.add(sourceId);
        return true;
      });

      if (!filteredIncoming.length) {
        return prev;
      }

      const shouldReplaceBlank = baixaAtual.length === 1 && isBaixaRequestBlockEmpty(baixaAtual[0]);
      return {
        ...prev,
        baixa: shouldReplaceBlank ? filteredIncoming : [...baixaAtual, ...filteredIncoming],
      };
    });
  };

  const fetchClientProfile = async (clientCode) => {
    const normalizedCode = safeText(clientCode);
    const cacheKey = normalizeLookupCode(normalizedCode);
    if (!cacheKey) {
      return null;
    }

    if (clientLookupCacheRef.current.has(cacheKey)) {
      return clientLookupCacheRef.current.get(cacheKey);
    }

    let resolvedProfile = null;
    let pickupInventoryItems = [];
    try {
      const response = await api.get(`/pickup-catalog/client/${encodeURIComponent(normalizedCode)}`);
      const payload = response.data || {};
      const client = payload.client || {};
      const profile = {
        code: safeText(client.client_code) || normalizedCode,
        fantasy: safeText(client.nome_fantasia),
        document: safeText(client.cnpj_cpf),
        items: Array.isArray(payload.items) ? payload.items.map(normalizeInventoryItem).filter((item) => item.id > 0) : [],
      };
      pickupInventoryItems = profile.items;
      if (Boolean(payload.found_anything) || profile.fantasy || profile.document || profile.items.length > 0) {
        resolvedProfile = profile;
      }
    } catch (error) {
      resolvedProfile = null;
      pickupInventoryItems = [];
    }

    if (!resolvedProfile || (!resolvedProfile.fantasy && !resolvedProfile.document)) {
      try {
        const fallbackResponse = await api.get(`/deliveries/client/${encodeURIComponent(normalizedCode)}`);
        const payload = fallbackResponse.data || {};
        const fallbackProfile = {
          code: safeText(payload.client_code) || normalizedCode,
          fantasy: safeText(payload.nome_fantasia),
          document: '',
          items: pickupInventoryItems,
        };
        if (fallbackProfile.fantasy || fallbackProfile.items.length > 0 || resolvedProfile) {
          resolvedProfile = fallbackProfile;
        }
      } catch (error) {
        resolvedProfile = resolvedProfile
          ? { ...resolvedProfile, items: pickupInventoryItems }
          : null;
      }
    }

    if (resolvedProfile) {
      if (!Array.isArray(resolvedProfile.items)) {
        resolvedProfile.items = [];
      }
      clientLookupCacheRef.current.set(cacheKey, resolvedProfile);
    }
    return resolvedProfile;
  };

  const applyClientLookupResult = async ({
    type,
    blockId,
    sourceField,
    fantasyField,
    documentField,
    codeValue,
  }) => {
    const requestedCode = safeText(codeValue);
    const requestedKey = normalizeLookupCode(requestedCode);
    if (!requestedKey) {
      return;
    }

    const shouldLoadFromInventory = type === 'de_para' && sourceField === 'fromClientCode';
    if (shouldLoadFromInventory) {
      updateRequestBlock(type, blockId, (block) => {
        const currentKey = normalizeLookupCode(block[sourceField]);
        if (currentKey !== requestedKey) {
          return block;
        }
        return {
          ...block,
          fromInventoryLoading: true,
          fromInventoryError: '',
        };
      });
    }

    const profile = await fetchClientProfile(requestedCode);
    if (!profile) {
      if (shouldLoadFromInventory) {
        updateRequestBlock(type, blockId, (block) => {
          const currentKey = normalizeLookupCode(block[sourceField]);
          if (currentKey !== requestedKey) {
            return block;
          }
          return {
            ...block,
            fromInventoryItems: [],
            selectedFromInventoryItemIds: [],
            fromInventoryLoading: false,
            fromInventoryError: 'Não foi possível carregar os materiais deste cliente.',
          };
        });
      }
      return;
    }

    updateRequestBlock(type, blockId, (block) => {
      const currentKey = normalizeLookupCode(block[sourceField]);
      if (currentKey !== requestedKey) {
        return block;
      }
      const inventoryItems = shouldLoadFromInventory
        ? (Array.isArray(profile.items) ? profile.items : [])
        : block.fromInventoryItems;
      return {
        ...block,
        [sourceField]: safeText(profile.code) || block[sourceField],
        [fantasyField]: safeText(profile.fantasy) || block[fantasyField],
        [documentField]: safeText(profile.document) || block[documentField],
        fromInventoryItems: inventoryItems,
        selectedFromInventoryItemIds: shouldLoadFromInventory ? [] : block.selectedFromInventoryItemIds,
        fromInventoryLoading: shouldLoadFromInventory ? false : block.fromInventoryLoading,
        fromInventoryError: shouldLoadFromInventory ? '' : block.fromInventoryError,
      };
    });
  };

  const scheduleClientAutofill = (params) => {
    const timerKey = `${params.type}:${params.blockId}:${params.sourceField}`;
    const currentTimer = lookupTimersRef.current.get(timerKey);
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    const resolvedCode = safeText(params.codeValue);
    if (!resolvedCode) {
      lookupTimersRef.current.delete(timerKey);
      return;
    }

    const timerId = setTimeout(() => {
      lookupTimersRef.current.delete(timerKey);
      applyClientLookupResult(params);
    }, 450);
    lookupTimersRef.current.set(timerKey, timerId);
  };

  const triggerClientAutofillNow = (params) => {
    const timerKey = `${params.type}:${params.blockId}:${params.sourceField}`;
    const currentTimer = lookupTimersRef.current.get(timerKey);
    if (currentTimer) {
      clearTimeout(currentTimer);
      lookupTimersRef.current.delete(timerKey);
    }
    applyClientLookupResult(params);
  };

  const addRequestBlock = (type) => {
    setRequestsByType((prev) => ({
      ...prev,
      [type]: [...(prev[type] || []), createRequestBlock()],
    }));
  };

  const removeRequestBlock = (type, blockId) => {
    setRequestsByType((prev) => {
      const list = prev[type] || [];
      if (list.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        [type]: list.filter((block) => block.id !== blockId),
      };
    });
  };

  const updateMaterial = (type, blockId, materialId, field, value) => {
    updateRequestBlock(type, blockId, (block) => ({
      ...block,
      materials: block.materials.map((item) => {
        if (item.id !== materialId) {
          return item;
        }
        if (field === 'kind' && value !== 'refrigerador') {
          return {
            ...item,
            kind: 'outro',
            rg: '',
            etiqueta: '',
            condition: 'boa',
            [field]: value,
          };
        }
        return { ...item, [field]: value };
      }),
    }));
  };

  const addMaterial = (type, blockId) => {
    updateRequestBlock(type, blockId, (block) => ({
      ...block,
      materials: [...block.materials, createMaterialItem()],
    }));
  };

  const removeMaterial = (type, blockId, materialId) => {
    updateRequestBlock(type, blockId, (block) => {
      if (block.materials.length <= 1) {
        return block;
      }
      return {
        ...block,
        materials: block.materials.filter((item) => item.id !== materialId),
      };
    });
  };

  const isComodatoAvailableRefrigeratorChecked = useCallback((equipment) => {
    const signature = materialSignature(mapAvailableRefrigeratorToMaterial(equipment));
    return comodatoTargetMaterialSignatures.has(signature);
  }, [comodatoTargetMaterialSignatures]);

  const toggleComodatoAvailableRefrigerator = (equipment, checked) => {
    const materialFromEquipment = mapAvailableRefrigeratorToMaterial(equipment);
    const modelName = safeText(materialFromEquipment.material);
    const statusValue = safeText(equipment.status).toLowerCase();
    const statusLabel = COMODATO_AVAILABLE_STATUS_LABELS[statusValue] || safeText(equipment.status) || '-';
    const nextSignature = materialSignature(materialFromEquipment);

    if (!modelName) {
      setError('Não foi possível processar este refrigerador porque o modelo está vazio.');
      return;
    }

    let changed = false;
    let removed = false;
    let alreadyExists = false;
    let targetRequestNumber = 1;

    setRequestsByType((prev) => {
      const list = Array.isArray(prev.comodato) ? prev.comodato : [];
      if (!list.length) {
        return prev;
      }

      const targetInfo = resolveComodatoTarget(list);
      if (!targetInfo.targetBlock || targetInfo.targetIndex < 0) {
        return prev;
      }
      targetRequestNumber = targetInfo.targetRequestNumber;

      const targetBlock = targetInfo.targetBlock;
      const targetMaterials = Array.isArray(targetBlock.materials) ? targetBlock.materials : [];
      const hasSignature = targetMaterials.some((item) => materialSignature(item) === nextSignature);
      if (checked && hasSignature) {
        alreadyExists = true;
        return prev;
      }
      if (!checked && !hasSignature) {
        return prev;
      }

      const nextList = [...list];
      if (checked) {
        const baseMaterials = targetMaterials.length === 1 && isMaterialEmpty(targetMaterials[0])
          ? []
          : [...targetMaterials];
        nextList[targetInfo.targetIndex] = {
          ...targetBlock,
          selected: true,
          materials: [...baseMaterials, { ...materialFromEquipment, id: newId() }],
        };
      } else {
        const nextMaterials = targetMaterials.filter(
          (item) => materialSignature(item) !== nextSignature
        );
        nextList[targetInfo.targetIndex] = {
          ...targetBlock,
          selected: true,
          materials: nextMaterials.length ? nextMaterials : [createMaterialItem()],
        };
        removed = true;
      }
      changed = true;
      return {
        ...prev,
        comodato: nextList,
      };
    });

    if (alreadyExists) {
      setError(`Este refrigerador já está na solicitação ${targetRequestNumber}.`);
      return;
    }
    if (changed) {
      if (removed) {
        setSuccess(`Refrigerador ${modelName} (${statusLabel}) removido da solicitação ${targetRequestNumber}.`);
      } else {
        setSuccess(`Refrigerador ${modelName} (${statusLabel}) adicionado na solicitação ${targetRequestNumber}.`);
      }
    }
  };

  const toggleDeParaInventorySelection = (blockId, inventoryItemId, checked) => {
    updateRequestBlock('de_para', blockId, (block) => {
      const current = new Set(
        (Array.isArray(block.selectedFromInventoryItemIds) ? block.selectedFromInventoryItemIds : [])
          .map((itemId) => Number(itemId))
          .filter((itemId) => itemId > 0)
      );
      const normalizedItemId = Number(inventoryItemId || 0);
      if (!normalizedItemId) {
        return block;
      }
      if (checked) {
        current.add(normalizedItemId);
      } else {
        current.delete(normalizedItemId);
      }
      return {
        ...block,
        selectedFromInventoryItemIds: Array.from(current),
      };
    });
  };

  const toggleAllDeParaInventorySelection = (blockId, checked) => {
    updateRequestBlock('de_para', blockId, (block) => {
      const itemIds = (Array.isArray(block.fromInventoryItems) ? block.fromInventoryItems : [])
        .map((item) => Number(item.id || 0))
        .filter((itemId) => itemId > 0);
      return {
        ...block,
        selectedFromInventoryItemIds: checked ? itemIds : [],
      };
    });
  };

  const addSelectedDeParaInventoryMaterials = (blockId) => {
    updateRequestBlock('de_para', blockId, (block) => {
      const selectedIds = new Set(
        (Array.isArray(block.selectedFromInventoryItemIds) ? block.selectedFromInventoryItemIds : [])
          .map((itemId) => Number(itemId))
          .filter((itemId) => itemId > 0)
      );
      if (!selectedIds.size) {
        return block;
      }

      const fromInventoryItems = Array.isArray(block.fromInventoryItems) ? block.fromInventoryItems : [];
      const existingSignatures = new Set((block.materials || []).map(materialSignature));
      const baseMaterials = (block.materials || []).length === 1 && isMaterialEmpty(block.materials[0])
        ? []
        : [...(block.materials || [])];
      const incomingMaterials = [];

      fromInventoryItems.forEach((inventoryItem) => {
        const inventoryId = Number(inventoryItem.id || 0);
        if (!selectedIds.has(inventoryId)) {
          return;
        }

        const isRefrigerator = safeText(inventoryItem.itemType).toLowerCase() === 'refrigerador';
        const mappedMaterial = {
          id: newId(),
          kind: isRefrigerator ? 'refrigerador' : 'outro',
          material: safeText(inventoryItem.description),
          rg: isRefrigerator ? safeText(inventoryItem.rg) : '',
          etiqueta: '',
          nota: safeText(inventoryItem.comodatoNumber),
          quantidade: isRefrigerator
            ? '1'
            : String(Math.max(1, Number(inventoryItem.openQuantity || 0) || 1)),
          condition: 'boa',
        };

        const signature = materialSignature(mappedMaterial);
        if (existingSignatures.has(signature)) {
          return;
        }
        existingSignatures.add(signature);
        incomingMaterials.push(mappedMaterial);
      });

      if (!incomingMaterials.length) {
        return {
          ...block,
          selectedFromInventoryItemIds: [],
        };
      }

      return {
        ...block,
        materials: [...baseMaterials, ...incomingMaterials],
        selectedFromInventoryItemIds: [],
      };
    });
  };

  const selectedMentionPayload = useMemo(
    () => MENTION_OPTIONS.filter((option) => selectedMentions.includes(option.key)),
    [selectedMentions]
  );

  const emailSubject = TAB_CONFIG[activeTab].subject;
  const selectedCurrentRequests = useMemo(
    () => currentRequests.filter((requestBlock) => requestBlock.selected),
    [currentRequests]
  );
  const selectedPendingLowEmailSet = useMemo(
    () => new Set(selectedPendingLowEmailOrderIds),
    [selectedPendingLowEmailOrderIds]
  );
  const selectedSavedRecipientSet = useMemo(
    () => new Set(selectedSavedRecipientEmails.map(normalizeRecipientEmail)),
    [selectedSavedRecipientEmails]
  );
  const allPendingLowEmailSelected = pendingLowEmailOrders.length > 0
    && pendingLowEmailOrders.every((order) => selectedPendingLowEmailSet.has(order.id));
  const allSavedRecipientsSelected = savedRecipients.length > 0
    && savedRecipients.every((item) => selectedSavedRecipientSet.has(item.email));
  const mergedRecipients = useMemo(() => {
    const merged = new Set([
      ...selectedSavedRecipientEmails.map(normalizeRecipientEmail),
      ...parseRecipientList(recipients),
    ]);
    return Array.from(merged).join(',');
  }, [recipients, selectedSavedRecipientEmails]);

  const emailBody = useMemo(() => {
    const greetingTarget = safeText(recipientName) || 'João';
    const greeting = `${buildGreeting()}, ${greetingTarget}!`;
    const requestBlocks = selectedCurrentRequests || [];

    if (!requestBlocks.length) {
      return withClosing(`${greeting}\n\n`);
    }

    if (activeTab === 'baixa') {
      const details = buildGroupedBaixaBlocks(requestBlocks);
      return withClosing([
        greeting,
        '',
        'Solicitação de baixa dos seguintes materiais de marketing já retirados:',
        '',
        joinMassBlocks(details),
      ].join('\n').trim());
    }

    if (activeTab === 'de_para') {
      const details = requestBlocks.map(buildDeParaBlock);
      return withClosing([
        greeting,
        '',
        'Solicitação de DE-PARA entre os PDVs:',
        '',
        joinMassBlocks(details),
      ].join('\n').trim());
    }

    const details = requestBlocks.map(buildComodatoBlock);
    return withClosing([
      greeting,
      '',
      buildComodatoIntroLine(selectedMentionPayload),
      '',
      joinMassBlocks(details),
    ].filter((line, index, list) => (
      line || (index > 0 && list[index - 1] !== '')
    )).join('\n').trim(), 'Atenciosamente,');
  }, [activeTab, recipientName, selectedCurrentRequests, selectedMentionPayload]);

  const hasAtLeastOneMaterial = useMemo(
    () => selectedCurrentRequests.some((requestBlock) => (
      requestBlock.materials.some((item) => safeText(item.material))
    )),
    [selectedCurrentRequests]
  );

  const saveRecipientContact = () => {
    const email = normalizeRecipientEmail(recipientDraftEmail);
    const name = safeText(recipientDraftName);

    if (!isValidRecipientEmail(email)) {
      setError('Informe um e-mail válido para salvar o contato.');
      return;
    }

    const existing = savedRecipients.find((item) => item.email === email);
    if (existing) {
      if (name && name !== existing.name) {
        setSavedRecipients((prev) => prev.map((item) => (
          item.email === email ? { ...item, name } : item
        )));
        setSuccess('Contato atualizado com sucesso.');
      } else {
        setError('Este e-mail já está salvo.');
      }
      return;
    }

    setSavedRecipients((prev) => [
      ...prev,
      {
        id: newId(),
        name,
        email,
      },
    ]);
    setRecipientDraftEmail('');
    setRecipientDraftName('');
    setSuccess('E-mail salvo para uso futuro.');
  };

  const toggleSavedRecipientSelection = (email, checked) => {
    const normalized = normalizeRecipientEmail(email);
    setSelectedSavedRecipientEmails((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, normalized]));
      }
      return prev.filter((item) => item !== normalized);
    });
  };

  const toggleAllSavedRecipients = (checked) => {
    if (checked) {
      setSelectedSavedRecipientEmails(savedRecipients.map((item) => item.email));
      return;
    }
    setSelectedSavedRecipientEmails([]);
  };

  const removeSavedRecipient = (email) => {
    const normalized = normalizeRecipientEmail(email);
    setSavedRecipients((prev) => prev.filter((item) => item.email !== normalized));
    setSelectedSavedRecipientEmails((prev) => prev.filter((item) => item !== normalized));
  };

  const openMail = async () => {
    if (!hasAtLeastOneMaterial) {
      setError('Preencha ao menos um material antes de abrir o e-mail.');
      return;
    }
    if (!safeText(mergedRecipients)) {
      setError('Informe ao menos um destinatário para abrir o e-mail.');
      return;
    }

    const lowEmailOrderIds = activeTab === 'baixa'
      ? [...new Set(
          selectedCurrentRequests
            .map((requestBlock) => Number(requestBlock.sourceOrderId || 0))
            .filter((orderId) => orderId > 0)
        )]
      : [];

    if (lowEmailOrderIds.length > 0) {
      try {
        await api.patch('/pickup-catalog/orders/email-request/bulk', {
          order_ids: lowEmailOrderIds,
        });
        setPendingLowEmailOrders((prev) => prev.filter((order) => !lowEmailOrderIds.includes(order.id)));
        setSelectedPendingLowEmailOrderIds((prev) => prev.filter((orderId) => !lowEmailOrderIds.includes(orderId)));
      } catch (error) {
        const detail = error.response.data.detail;
        setError(
          typeof detail === 'string'
            ? detail
            : 'Não foi possível marcar as baixas sugeridas como solicitadas por e-mail.'
        );
        return;
      }
    }

    const encodedSubject = encodeURIComponent(safeText(emailSubject));
    const encodedBody = encodeURIComponent(safeText(emailBody));
    window.location.href = `mailto:${safeText(mergedRecipients)}?subject=${encodedSubject}&body=${encodedBody}`;
    setSuccess('E-mail preparado no aplicativo padrão.');
  };

  const copyBody = async () => {
    if (!hasAtLeastOneMaterial) {
      setError('Preencha ao menos um material antes de copiar o corpo.');
      return;
    }
    try {
      await navigator.clipboard.writeText(safeText(emailBody));
      setSuccess('Corpo do e-mail copiado para a área de transferência.');
    } catch (error) {
      setError('Não foi possível copiar automaticamente neste navegador.');
    }
  };

  const togglePendingLowEmailOrder = (orderId) => {
    setSelectedPendingLowEmailOrderIds((prev) => (
      prev.includes(orderId)
        ? prev.filter((item) => item !== orderId)
        : [...prev, orderId]
    ));
  };

  const toggleAllPendingLowEmailOrders = (checked) => {
    if (checked) {
      setSelectedPendingLowEmailOrderIds(pendingLowEmailOrders.map((order) => order.id));
      return;
    }
    setSelectedPendingLowEmailOrderIds([]);
  };

  const togglePendingLowEmailEntry = (orderId, entryKey, checked) => {
    const normalizedOrderId = Number(orderId || 0);
    const normalizedEntryKey = safeText(entryKey);
    if (!normalizedOrderId || !normalizedEntryKey) {
      return;
    }
    setPendingLowEmailEntrySelectionByOrderId((prev) => {
      const current = new Set(
        (Array.isArray(prev[normalizedOrderId]) ? prev[normalizedOrderId] : [])
          .map((value) => safeText(value))
          .filter(Boolean)
      );
      if (checked) {
        current.add(normalizedEntryKey);
      } else {
        current.delete(normalizedEntryKey);
      }
      return {
        ...prev,
        [normalizedOrderId]: Array.from(current),
      };
    });
  };

  const toggleAllPendingLowEmailEntries = (orderId, checked) => {
    const normalizedOrderId = Number(orderId || 0);
    if (!normalizedOrderId) {
      return;
    }
    const entries = Array.isArray(pendingLowEmailEntriesByOrderId[normalizedOrderId])
      ? pendingLowEmailEntriesByOrderId[normalizedOrderId]
      : [];
    setPendingLowEmailEntrySelectionByOrderId((prev) => ({
      ...prev,
      [normalizedOrderId]: checked ? entries.map((entry) => entry.key) : [],
    }));
  };

  const requestPendingLowEmailSingle = async (order) => {
    setSendingSinglePendingOrderId(order.id);
    setError('');
    setSuccess('');
    try {
      const loaded = await loadPendingLowEmailOrderEntries(order.id);
      const payload = loaded.payload || pendingLowEmailPayloadByOrderId[order.id] || null;
      if (!payload) {
        throw new Error('Nenhum dado encontrado para esta ordem.');
      }

      const selectedEntryKeys = Array.isArray(pendingLowEmailEntrySelectionByOrderId[order.id])
        ? pendingLowEmailEntrySelectionByOrderId[order.id]
        : [];
      if (!selectedEntryKeys.length) {
        setError('Selecione pelo menos um equipamento em aberto para usar a sugestão.');
        return;
      }

      const suggestionBlock = mapEmailPayloadToBaixaRequestBlock(payload, selectedEntryKeys);
      const hasMaterials = suggestionBlock.materials.some((item) => safeText(item.material));
      if (!hasMaterials) {
        setError('Nenhum equipamento selecionado para esta sugestão.');
        return;
      }
      appendBaixaSuggestionBlocks([suggestionBlock]);
      setActiveTab('baixa');
      setSuccess(`Sugestão da ordem ${order.orderNumber || `RET-${order.id}`} adicionada. Você pode incluir materiais manuais antes do envio.`);
    } catch (error) {
      const detail = error.response.data.detail;
      setError(typeof detail === 'string' ? detail : 'Não foi possível carregar a sugestão da baixa.');
    } finally {
      setSendingSinglePendingOrderId(null);
    }
  };

  const requestPendingLowEmailBulk = async () => {
    if (!selectedPendingLowEmailOrderIds.length) {
      setError('Selecione pelo menos uma baixa pendente para solicitar em massa.');
      return;
    }
    setSendingBulkPendingOrders(true);
    setError('');
    setSuccess('');
    try {
      const suggestionBlocks = [];
      for (const orderId of selectedPendingLowEmailOrderIds) {
        const loaded = await loadPendingLowEmailOrderEntries(orderId);
        const payload = loaded.payload || pendingLowEmailPayloadByOrderId[orderId] || null;
        if (!payload) {
          continue;
        }
        const selectedEntryKeys = Array.isArray(pendingLowEmailEntrySelectionByOrderId[orderId])
          ? pendingLowEmailEntrySelectionByOrderId[orderId]
          : [];
        if (!selectedEntryKeys.length) {
          continue;
        }
        const suggestionBlock = mapEmailPayloadToBaixaRequestBlock(payload, selectedEntryKeys);
        const hasMaterials = suggestionBlock.materials.some((item) => safeText(item.material));
        if (!hasMaterials) {
          continue;
        }
        suggestionBlocks.push(suggestionBlock);
      }
      if (!suggestionBlocks.length) {
        throw new Error('Selecione ao menos um equipamento em aberto nas ordens escolhidas.');
      }

      appendBaixaSuggestionBlocks(suggestionBlocks);
      setActiveTab('baixa');
      setSuccess(`${suggestionBlocks.length} sugestão(ões) adicionadas. Você pode revisar e incluir materiais manuais antes do envio.`);
    } catch (error) {
      const detail = error.response.data.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Não foi possível carregar as sugestões em massa das baixas pendentes.'
      );
    } finally {
      setSendingBulkPendingOrders(false);
    }
  };

  const resetCurrentType = () => {
    setRequestsByType((prev) => ({
      ...prev,
      [activeTab]: [createRequestBlock()],
    }));
    if (activeTab === 'comodato') {
      setSelectedMentions([]);
    }
    setFeedback({ success: '', error: '' });
  };

  const sectionCardSx = { border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="h5">Solicitações</Typography>
        <Typography variant="body2" color="text.secondary">
          Solicite baixa, DE-PARA e comodato com e-mail padronizado.
        </Typography>
      </Box>

      {feedback.error && <Alert severity="error">{feedback.error}</Alert>}
      {feedback.success && (
        <Alert severity="success" onClose={() => setFeedback({ success: '', error: '' })}>
          {feedback.success}
        </Alert>
      )}

      <Card sx={sectionCardSx}>
        <CardContent sx={{ py: 0.5 }}>
          <Tabs
            value={activeTab}
            onChange={(_, value) => setActiveTab(value)}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab value="baixa" label={TAB_CONFIG.baixa.label} />
            <Tab value="de_para" label={TAB_CONFIG.de_para.label} />
            <Tab value="comodato" label={TAB_CONFIG.comodato.label} />
          </Tabs>
        </CardContent>
      </Card>

      <Card sx={sectionCardSx}>
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: '1fr minmax(220px, 280px) auto' } }}>
            <TextField
              label="Destinatário(s) de e-mail"
              placeholder="ex.: joao@empresa.com.br; comercial@empresa.com.br"
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              fullWidth
            />
            <TextField
              label="Nome na saudação"
              placeholder="ex.: João"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              fullWidth
            />
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => addRequestBlock(activeTab)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Adicionar solicitação
            </Button>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gap: 1.25,
              gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 280px) 1fr auto' },
            }}
          >
            <TextField
              label="Nome do contato (opcional)"
              placeholder="ex.: João Silva"
              value={recipientDraftName}
              onChange={(event) => setRecipientDraftName(event.target.value)}
              fullWidth
            />
            <TextField
              label="E-mail para salvar"
              placeholder="ex.: joao@empresa.com.br"
              value={recipientDraftEmail}
              onChange={(event) => setRecipientDraftEmail(event.target.value)}
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={saveRecipientContact}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Salvar e-mail
            </Button>
          </Box>

          {savedRecipients.length > 0 && (
            <Box sx={{ border: '1px solid var(--stroke)', borderRadius: 1.5, p: 1.2, display: 'grid', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2">E-mails salvos</Typography>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={allSavedRecipientsSelected}
                      onChange={(event) => toggleAllSavedRecipients(event.target.checked)}
                    />
                  )}
                  label={`Selecionados: ${selectedSavedRecipientEmails.length}`}
                />
              </Box>
              <Box sx={{ display: 'grid', gap: 0.6, maxHeight: 180, overflowY: 'auto', pr: 0.25 }}>
                {savedRecipients.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      border: '1px solid var(--stroke)',
                      borderRadius: 1,
                      px: 0.9,
                      py: 0.45,
                    }}
                  >
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={selectedSavedRecipientSet.has(item.email)}
                          onChange={(event) => toggleSavedRecipientSelection(item.email, event.target.checked)}
                        />
                      )}
                      label={(
                        <Box sx={{ display: 'grid', lineHeight: 1.2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {safeText(item.name) || item.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.email}
                          </Typography>
                        </Box>
                      )}
                    />
                    <Button
                      size="small"
                      color="error"
                      onClick={() => removeSavedRecipient(item.email)}
                    >
                      Remover
                    </Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary">
            Destinatários ativos: {safeText(mergedRecipients) || 'nenhum selecionado'}.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Para envio em massa, adicione mais de uma solicitação neste mesmo tipo. A mensagem inicial aparece uma vez e os blocos seguintes são incluídos abaixo com espaçamento.
          </Typography>

          {activeTab === 'baixa' && (
            <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
              <CardContent sx={{ display: 'grid', gap: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">Baixas pendentes de solicitação por e-mail</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={loadPendingLowEmailOrders}
                    disabled={pendingLowEmailLoading || sendingBulkPendingOrders || Boolean(sendingSinglePendingOrderId)}
                  >
                    {pendingLowEmailLoading ? 'Atualizando...' : 'Atualizar pendentes'}
                  </Button>
                </Box>

                {pendingLowEmailError && (
                  <Alert severity="warning">{pendingLowEmailError}</Alert>
                )}

                <Typography variant="caption" color="text.secondary">
                  Ao usar a sugestão, os materiais da ordem são carregados no formulário de baixa para edição. Você pode adicionar materiais não previstos antes do envio.
                </Typography>

                {pendingLowEmailLoading ? (
                  <Typography variant="body2" color="text.secondary">
                    Carregando baixas pendentes...
                  </Typography>
                ) : pendingLowEmailOrders.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Não há baixas pendentes de solicitação por e-mail.
                  </Typography>
	                ) : (
	                  <>
	                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
	                      <Typography
	                        variant="caption"
	                        sx={{
	                          px: 1.1,
	                          py: 0.35,
	                          borderRadius: 10,
	                          border: '1px solid',
	                          borderColor: 'warning.main',
	                          bgcolor: 'rgba(255, 152, 0, 0.12)',
	                          color: 'warning.dark',
	                          fontWeight: 700,
	                        }}
	                      >
	                        Pendentes: {pendingLowEmailOrders.length}
	                      </Typography>
	                      <FormControlLabel
	                        control={(
	                          <Checkbox
	                            checked={allPendingLowEmailSelected}
	                            onChange={(event) => toggleAllPendingLowEmailOrders(event.target.checked)}
                            disabled={sendingBulkPendingOrders || Boolean(sendingSinglePendingOrderId)}
                          />
                        )}
                        label={`Selecionadas: ${selectedPendingLowEmailOrderIds.length}`}
                      />
                      <Button
                        variant="contained"
                        onClick={requestPendingLowEmailBulk}
                        disabled={!selectedPendingLowEmailOrderIds.length || sendingBulkPendingOrders || Boolean(sendingSinglePendingOrderId)}
                      >
                        {sendingBulkPendingOrders ? 'Carregando sugestões em massa...' : 'Usar sugestão em massa'}
                      </Button>
	                    </Box>
	
			                    <Box sx={{ display: 'grid', gap: 1, maxHeight: '75vh', overflowY: 'auto', pr: 0.5 }}>
				                    {pendingLowEmailOrders.map((order) => {
                            const orderEntries = Array.isArray(pendingLowEmailEntriesByOrderId[order.id])
                              ? pendingLowEmailEntriesByOrderId[order.id]
                              : [];
                            const selectedEntryKeys = Array.isArray(pendingLowEmailEntrySelectionByOrderId[order.id])
                              ? pendingLowEmailEntrySelectionByOrderId[order.id]
                              : [];
                            const selectedEntrySet = new Set(selectedEntryKeys);
                            const allOrderEntriesSelected = orderEntries.length > 0
                              && selectedEntryKeys.length === orderEntries.length;
                            const orderEntriesLoading = Boolean(pendingLowEmailEntriesLoadingByOrderId[order.id]);
                            const orderEntriesError = safeText(pendingLowEmailEntriesErrorByOrderId[order.id]);
                            const previewHeight = BAIXA_PREVIEW_VISIBLE_ROWS * 46;

                            return (
		                      <Card
		                        key={order.id}
		                        sx={{
		                          border: '1px solid',
		                          borderColor: selectedPendingLowEmailSet.has(order.id) ? 'warning.main' : 'rgba(255, 152, 0, 0.45)',
		                          backgroundColor: selectedPendingLowEmailSet.has(order.id) ? 'rgba(255, 152, 0, 0.14)' : 'rgba(255, 152, 0, 0.08)',
		                          boxShadow: 'none',
		                        }}
		                      >
		                        <CardContent sx={{ display: 'grid', gap: 0.75 }}>
		                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
		                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
		                              <FormControlLabel
		                                control={(
		                                  <Checkbox
		                                    checked={selectedPendingLowEmailSet.has(order.id)}
		                                    onChange={() => togglePendingLowEmailOrder(order.id)}
		                                    disabled={sendingBulkPendingOrders || Boolean(sendingSinglePendingOrderId)}
		                                  />
		                                )}
		                                label={`Ordem ${order.orderNumber || `RET-${order.id}`}`}
		                              />
		                              <Typography
		                                variant="caption"
		                                sx={{
		                                  px: 0.9,
		                                  py: 0.2,
		                                  borderRadius: 10,
		                                  bgcolor: 'warning.main',
		                                  color: '#fff',
		                                  fontWeight: 700,
		                                  letterSpacing: 0.25,
		                                }}
		                              >
		                                PENDENTE
		                              </Typography>
		                            </Box>
		                            <Button
		                              size="small"
		                              variant="outlined"
		                              onClick={() => requestPendingLowEmailSingle(order)}
                              disabled={
                                sendingBulkPendingOrders
                                || (sendingSinglePendingOrderId !== null && sendingSinglePendingOrderId !== order.id)
                                || orderEntriesLoading
                                || selectedEntryKeys.length === 0
                              }
                            >
                              {sendingSinglePendingOrderId === order.id ? 'Carregando sugestão...' : 'Usar itens selecionados'}
                            </Button>
		                          </Box>
		                          <Typography variant="body2" color="text.secondary">
		                            Código do cliente: {order.clientCode || '-'}
		                          </Typography>
		                          <Typography variant="body2" color="text.secondary">
		                            Nome fantasia: {order.fantasyName || '-'}
		                          </Typography>
		                          <Typography variant="body2" color="text.secondary">
		                            Data da retirada: {order.withdrawalDate || '-'}
		                          </Typography>
		                          <Typography variant="caption" color="text.secondary">
		                            Resumo: {order.summaryLine || 'Sem resumo.'}
		                          </Typography>
                              <Box
                                sx={{
                                  border: '1px dashed rgba(255, 152, 0, 0.5)',
                                  borderRadius: 1,
                                  p: 0.75,
                                  display: 'grid',
                                  gap: 0.5,
                                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                    Equipamentos em aberto
                                  </Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() => loadPendingLowEmailOrderEntries(order.id, true)}
                                      disabled={orderEntriesLoading || sendingBulkPendingOrders || Boolean(sendingSinglePendingOrderId)}
                                    >
                                      {orderEntriesLoading ? 'Atualizando...' : 'Atualizar itens'}
                                    </Button>
                                    <FormControlLabel
                                      control={(
                                        <Checkbox
                                          size="small"
                                          checked={allOrderEntriesSelected}
                                          onChange={(event) => toggleAllPendingLowEmailEntries(order.id, event.target.checked)}
                                          disabled={orderEntriesLoading || orderEntries.length === 0}
                                        />
                                      )}
                                      label={`Marcados: ${selectedEntryKeys.length}`}
                                    />
                                  </Box>
                                </Box>

                                {orderEntriesLoading ? (
                                  <Typography variant="caption" color="text.secondary">
                                    Carregando equipamentos...
                                  </Typography>
                                ) : orderEntriesError ? (
                                  <Typography variant="caption" color="error">
                                    {orderEntriesError}
                                  </Typography>
                                ) : orderEntries.length === 0 ? (
                                  <Typography variant="caption" color="text.secondary">
                                    Nenhum equipamento em aberto encontrado nesta ordem.
                                  </Typography>
                                ) : (
                                  <Box sx={{ display: 'grid', gap: 0.35, maxHeight: `${previewHeight}px`, overflowY: 'auto', pr: 0.25 }}>
                                    {orderEntries.map((entry) => (
                                      <FormControlLabel
                                        key={entry.key}
                                        control={(
                                          <Checkbox
                                            size="small"
                                            checked={selectedEntrySet.has(entry.key)}
                                            onChange={(event) => togglePendingLowEmailEntry(order.id, entry.key, event.target.checked)}
                                          />
                                        )}
                                        label={(
                                          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                                            {entry.label}
                                          </Typography>
                                        )}
                                      />
                                    ))}
                                  </Box>
                                )}
                              </Box>
		                        </CardContent>
		                      </Card>
                            );
                          })}
			                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'comodato' && (
            <Box sx={{ display: 'grid', gap: 1 }}>
              <Typography variant="subtitle2">Menções opcionais</Typography>
              <FormGroup row>
                {MENTION_OPTIONS.map((person) => (
                  <FormControlLabel
                    key={person.key}
                    control={(
                      <Checkbox
                        checked={selectedMentions.includes(person.key)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedMentions((prev) => (
                            checked
                              ? [...prev, person.key]
                              : prev.filter((item) => item !== person.key)
                          ));
                        }}
                      />
                    )}
                    label={person.name}
                  />
                ))}
              </FormGroup>
            </Box>
          )}

          {currentRequests.map((requestBlock, requestIndex) => (
            <Card key={requestBlock.id} sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
              <CardContent sx={{ display: 'grid', gap: 1.25 }}>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">
                    Solicitação {requestIndex + 1}
                  </Typography>
                  <FormControlLabel
                    control={(
                      <Checkbox
                        checked={Boolean(requestBlock.selected)}
                        onChange={(event) => updateRequestBlock(
                          activeTab,
                          requestBlock.id,
                          (block) => ({ ...block, selected: event.target.checked })
                        )}
                      />
                    )}
                    label="Incluir no e-mail"
                  />
                  <Button
                    variant="text"
                    color="error"
                    startIcon={<DeleteIcon />}
                    disabled={currentRequests.length <= 1}
                    onClick={() => removeRequestBlock(activeTab, requestBlock.id)}
                  >
                    Remover solicitação
                  </Button>
                </Box>

                {activeTab === 'baixa' && Number(requestBlock.sourceOrderId || 0) > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Sugestão importada da ordem {safeText(requestBlock.sourceOrderNumber) || `RET-${requestBlock.sourceOrderId}`}.
                  </Typography>
                )}

                {activeTab === 'de_para' ? (
                  <Box sx={{ display: 'grid', gap: 1.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      PDV de origem
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
                      <TextField
                        label="Código do cliente"
                        value={requestBlock.fromClientCode}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          const normalizedNextCode = normalizeLookupCode(nextValue);
                          updateRequestBlock(activeTab, requestBlock.id, (block) => ({
                            ...block,
                            fromClientCode: nextValue,
                            ...(normalizedNextCode
                              ? {
                                  fromInventoryItems: [],
                                  selectedFromInventoryItemIds: [],
                                  fromInventoryLoading: true,
                                  fromInventoryError: '',
                                }
                              : {
                                  fromFantasyName: '',
                                  fromDocument: '',
                                  fromInventoryItems: [],
                                  selectedFromInventoryItemIds: [],
                                  fromInventoryLoading: false,
                                  fromInventoryError: '',
                                }),
                          }));
                          scheduleClientAutofill({
                            type: activeTab,
                            blockId: requestBlock.id,
                            sourceField: 'fromClientCode',
                            fantasyField: 'fromFantasyName',
                            documentField: 'fromDocument',
                            codeValue: nextValue,
                          });
                        }}
                        onBlur={(event) => triggerClientAutofillNow({
                          type: activeTab,
                          blockId: requestBlock.id,
                          sourceField: 'fromClientCode',
                          fantasyField: 'fromFantasyName',
                          documentField: 'fromDocument',
                          codeValue: event.target.value,
                        })}
                      />
                      <TextField
                        label="Nome fantasia"
                        value={requestBlock.fromFantasyName}
                        onChange={(event) => updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, fromFantasyName: event.target.value }))}
                      />
                      <TextField
                        label="CNPJ/CPF"
                        value={requestBlock.fromDocument}
                        onChange={(event) => updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, fromDocument: event.target.value }))}
                      />
                    </Box>

                    <Box sx={{ display: 'grid', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Materiais do PDV de origem
                        </Typography>
                        {requestBlock.fromInventoryLoading && <CircularProgress size={16} />}
                      </Box>

                      {!safeText(requestBlock.fromClientCode) ? (
                        <Typography variant="body2" color="text.secondary">
                          Informe o código do cliente de origem para carregar os materiais.
                        </Typography>
                      ) : requestBlock.fromInventoryError ? (
                        <Alert severity="warning">{requestBlock.fromInventoryError}</Alert>
                      ) : (
                        <>
                          <Typography variant="caption" color="text.secondary">
                            Selecione os materiais que devem entrar nesta solicitação de DE-PARA.
                          </Typography>
                          {Array.isArray(requestBlock.fromInventoryItems) && requestBlock.fromInventoryItems.length > 0 ? (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={
                                        requestBlock.fromInventoryItems.length > 0
                                        && requestBlock.fromInventoryItems.every((inventoryItem) => (
                                          (requestBlock.selectedFromInventoryItemIds || []).includes(Number(inventoryItem.id || 0))
                                        ))
                                      }
                                      indeterminate={
                                        (requestBlock.selectedFromInventoryItemIds || []).length > 0
                                        && (requestBlock.selectedFromInventoryItemIds || []).length < requestBlock.fromInventoryItems.length
                                      }
                                      onChange={(event) => toggleAllDeParaInventorySelection(requestBlock.id, event.target.checked)}
                                    />
                                  )}
                                  label={`Selecionados: ${(requestBlock.selectedFromInventoryItemIds || []).length}`}
                                />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => addSelectedDeParaInventoryMaterials(requestBlock.id)}
                                  disabled={(requestBlock.selectedFromInventoryItemIds || []).length === 0}
                                >
                                  Adicionar selecionados
                                </Button>
                              </Box>

                              <Box sx={{ overflowX: 'auto' }}>
                                <Box
                                  component="table"
                                  sx={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    minWidth: 740,
                                    '& th, & td': {
                                      borderBottom: '1px solid var(--stroke)',
                                      px: 1,
                                      py: 0.75,
                                      textAlign: 'left',
                                      fontSize: '0.88rem',
                                      verticalAlign: 'top',
                                    },
                                  }}
                                >
                                  <thead>
                                    <tr>
                                      <th style={{ width: 56 }}>Sel.</th>
                                      <th>Tipo</th>
                                      <th>Material</th>
                                      <th style={{ width: 80 }}>Qtda.</th>
                                      <th style={{ width: 140 }}>RG</th>
                                      <th style={{ width: 140 }}>Comodato</th>
                                      <th style={{ width: 120 }}>Emissão</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {requestBlock.fromInventoryItems.map((inventoryItem) => {
                                      const inventoryId = Number(inventoryItem.id || 0);
                                      const isChecked = (requestBlock.selectedFromInventoryItemIds || []).includes(inventoryId);
                                      return (
                                        <tr key={inventoryId}>
                                          <td>
                                            <Checkbox
                                              size="small"
                                              checked={isChecked}
                                              onChange={(event) => (
                                                toggleDeParaInventorySelection(requestBlock.id, inventoryId, event.target.checked)
                                              )}
                                            />
                                          </td>
                                          <td>{safeText(inventoryItem.typeLabel) || '-'}</td>
                                          <td>{safeText(inventoryItem.description) || '-'}</td>
                                          <td>{Number(inventoryItem.openQuantity || 0) || 0}</td>
                                          <td>{safeText(inventoryItem.rg) || '-'}</td>
                                          <td>{safeText(inventoryItem.comodatoNumber) || '-'}</td>
                                          <td>{safeText(inventoryItem.dataEmissao) || '-'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </Box>
                              </Box>
                            </>
                          ) : !requestBlock.fromInventoryLoading ? (
                            <Typography variant="body2" color="text.secondary">
                              Nenhum material disponível encontrado para este cliente.
                            </Typography>
                          ) : null}
                        </>
                      )}
                    </Box>

                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      PDV de destino
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
                      <TextField
                        label="Código do cliente"
                        value={requestBlock.toClientCode}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, toClientCode: nextValue }));
                          scheduleClientAutofill({
                            type: activeTab,
                            blockId: requestBlock.id,
                            sourceField: 'toClientCode',
                            fantasyField: 'toFantasyName',
                            documentField: 'toDocument',
                            codeValue: nextValue,
                          });
                        }}
                        onBlur={(event) => triggerClientAutofillNow({
                          type: activeTab,
                          blockId: requestBlock.id,
                          sourceField: 'toClientCode',
                          fantasyField: 'toFantasyName',
                          documentField: 'toDocument',
                          codeValue: event.target.value,
                        })}
                      />
                      <TextField
                        label="Nome fantasia"
                        value={requestBlock.toFantasyName}
                        onChange={(event) => updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, toFantasyName: event.target.value }))}
                      />
                      <TextField
                        label="CNPJ/CPF"
                        value={requestBlock.toDocument}
                        onChange={(event) => updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, toDocument: event.target.value }))}
                      />
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
                    <TextField
                      label="Código do cliente"
                      value={requestBlock.clientCode}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, clientCode: nextValue }));
                        scheduleClientAutofill({
                          type: activeTab,
                          blockId: requestBlock.id,
                          sourceField: 'clientCode',
                          fantasyField: 'fantasyName',
                          documentField: 'document',
                          codeValue: nextValue,
                        });
                      }}
                      onBlur={(event) => triggerClientAutofillNow({
                        type: activeTab,
                        blockId: requestBlock.id,
                        sourceField: 'clientCode',
                        fantasyField: 'fantasyName',
                        documentField: 'document',
                        codeValue: event.target.value,
                      })}
                    />
                    <TextField
                      label="Nome fantasia"
                      value={requestBlock.fantasyName}
                      onChange={(event) => updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, fantasyName: event.target.value }))}
                    />
                    <TextField
                      label="CNPJ/CPF"
                      value={requestBlock.document}
                      onChange={(event) => updateRequestBlock(activeTab, requestBlock.id, (block) => ({ ...block, document: event.target.value }))}
                    />
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Materiais da solicitação
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => addMaterial(activeTab, requestBlock.id)}
                  >
                    Adicionar material
                  </Button>
                </Box>

                {requestBlock.materials.map((item) => (
                  <Card key={item.id} sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 1 }}>
                      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '180px 1fr auto' } }}>
                        <TextField
                          select
                          label="Tipo"
                          value={item.kind}
                          onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'kind', event.target.value)}
                        >
                          {MATERIAL_KIND_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Material"
                          value={item.material}
                          onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'material', event.target.value)}
                          fullWidth
                        />
                        <Button
                          variant="text"
                          color="error"
                          startIcon={<DeleteIcon />}
                          disabled={requestBlock.materials.length <= 1}
                          onClick={() => removeMaterial(activeTab, requestBlock.id, item.id)}
                        >
                          Remover
                        </Button>
                      </Box>

                      {item.kind === 'refrigerador' ? (
                        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
                          <TextField
                            label="RG"
                            value={item.rg}
                            onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'rg', event.target.value)}
                          />
                          <TextField
                            label="Etiqueta"
                            value={item.etiqueta}
                            onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'etiqueta', event.target.value)}
                          />
                          <TextField
                            label="Nota"
                            value={item.nota}
                            onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'nota', event.target.value)}
                            sx={{ gridColumn: { xs: '1 / -1', md: 'span 2' } }}
                          />
                        </Box>
                      ) : (
                        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '160px 1fr' } }}>
                          <TextField
                            label="Quantidade"
                            value={item.quantidade}
                            onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'quantidade', event.target.value)}
                          />
                          <TextField
                            label="Nota"
                            value={item.nota}
                            onChange={(event) => updateMaterial(activeTab, requestBlock.id, item.id, 'nota', event.target.value)}
                          />
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {activeTab === 'comodato' && (
        <Card sx={sectionCardSx}>
          <CardContent sx={{ display: 'grid', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2">Refrigeradores disponíveis</Typography>
              {loadingAvailableRefrigerators && <CircularProgress size={18} />}
            </Box>
            <TextField
              label="Buscar por modelo, marca, RG, etiqueta ou status"
              value={availableRefrigeratorsQuery}
              onChange={(event) => setAvailableRefrigeratorsQuery(event.target.value)}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              Marque a caixa de seleção para preencher automaticamente a solicitação de comodato selecionada.
            </Typography>
            {availableRefrigeratorsError ? (
              <Alert severity="warning">{availableRefrigeratorsError}</Alert>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {`Exibição por categoria: Novos e Boa. Cada lista mostra ${COMODATO_VISIBLE_ROWS} linhas por área visível; use o scroll para ver os demais.`}
                </Typography>

                {[
                  {
                    key: 'novos',
                    label: 'Novos',
                    rows: comodatoGroupedRefrigerators.novos,
                    emptyMessage: 'Nenhum refrigerador novo encontrado.',
                  },
                  {
                    key: 'boa',
                    label: 'Boa',
                    rows: comodatoGroupedRefrigerators.boa,
                    emptyMessage: 'Nenhum refrigerador em condição Boa encontrado.',
                  },
                ].map((categorySection) => (
                  <Box key={categorySection.key} sx={{ display: 'grid', gap: 0.75 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {categorySection.label} ({categorySection.rows.length})
                    </Typography>

                    <Box
                      sx={{
                        overflow: 'auto',
                        maxHeight: `${COMODATO_VISIBLE_ROWS * 44}px`,
                        border: '1px solid var(--stroke)',
                        borderRadius: 1,
                      }}
                    >
                      <Box
                        component="table"
                        sx={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          minWidth: 900,
                          '& th, & td': {
                            borderBottom: '1px solid var(--stroke)',
                            px: 1,
                            py: 0.75,
                            textAlign: 'left',
                            fontSize: '0.9rem',
                          },
                        }}
                      >
                        <thead>
                          <tr>
                            <th>Modelo</th>
                            <th>Status</th>
                            <th>Marca</th>
                            <th>Voltagem</th>
                            <th>RG</th>
                            <th>Etiqueta</th>
                            <th>Selecionar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categorySection.rows.map((item) => (
                            <tr key={`${categorySection.key}-${item.id}`}>
                              <td>{safeText(item.model_name) || '-'}</td>
                              <td>{COMODATO_AVAILABLE_STATUS_LABELS[safeText(item.status).toLowerCase()] || '-'}</td>
                              <td>{safeText(item.brand) || '-'}</td>
                              <td>{safeText(item.voltage) || '-'}</td>
                              <td>{safeText(item.rg_code) || '-'}</td>
                              <td>{safeText(item.tag_code) || '-'}</td>
                              <td>
                                <Checkbox
                                  size="small"
                                  checked={isComodatoAvailableRefrigeratorChecked(item)}
                                  onChange={(event) => toggleComodatoAvailableRefrigerator(item, event.target.checked)}
                                  inputProps={{
                                    'aria-label': `Selecionar ${safeText(item.model_name) || 'refrigerador'}`,
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                          {!loadingAvailableRefrigerators && categorySection.rows.length === 0 && (
                            <tr>
                              <td colSpan={7}>{categorySection.emptyMessage}</td>
                            </tr>
                          )}
                        </tbody>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      <Card sx={sectionCardSx}>
        <CardContent sx={{ display: 'grid', gap: 1.25 }}>
          <Typography variant="subtitle2">Pré-visualização</Typography>
          <TextField
            label="Assunto"
            value={emailSubject}
            InputProps={{ readOnly: true }}
            fullWidth
          />
          <TextField
            label="Corpo"
            multiline
            minRows={14}
            value={emailBody}
            InputProps={{ readOnly: true }}
            fullWidth
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={openMail}>
              Abrir e-mail
            </Button>
            <Button variant="outlined" onClick={copyBody}>
              Copiar corpo
            </Button>
            <Button variant="text" onClick={resetCurrentType}>
              Limpar este tipo
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Requests;


