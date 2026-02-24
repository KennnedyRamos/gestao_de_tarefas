import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Popover,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import dayjs from 'dayjs';

import api from '../services/api';
import { hasPermission } from '../utils/auth';

const CATEGORY_OPTIONS = [
  { value: 'refrigerador', label: 'Refrigeradores' },
  { value: 'caixa_termica', label: 'Caixa térmica' },
  { value: 'jogo_mesa', label: 'Jogos de mesa' },
  { value: 'outro', label: 'Outros' }
];

const MATERIAL_TYPE_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'refrigerador', label: 'Refrigeradores' },
  { value: 'garrafeira', label: 'Garrafeiras' },
  { value: 'jogo_mesa', label: 'Jogos de mesa' },
  { value: 'caixa_termica', label: 'Caixa térmica' },
  { value: 'outro', label: 'Outros' },
];

const MONTH_PICKER_OPTIONS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' },
  { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dez' },
];

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'disponivel', label: 'Disponível' },
  { value: 'recap', label: 'Recap' }
];

const NON_ALLOCATED_STATUS_OPTIONS = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'disponivel', label: 'Disponível (inclui novos)' },
  { value: 'recap', label: 'Recap' },
  { value: 'sucata', label: 'Sucata' },
];

const VOLTAGE_OPTIONS = [
  { value: '', label: 'Selecione' },
  { value: '110v', label: '110V' },
  { value: '127v', label: '127V' },
  { value: '220v', label: '220V' },
  { value: 'bivolt', label: 'Bivolt' },
  { value: 'nao_informado', label: 'Não informado' }
];

const EMPTY_FORM = {
  category: 'refrigerador',
  model_name: '',
  brand: '',
  quantity: '1',
  voltage: '',
  rg_code: '',
  tag_code: '',
  status: 'novo',
  client_name: '',
  notes: ''
};

const TESSERACT_CDN_URL = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
const PAGE_SIZE = 25;
const SCANNER_AUTO_INTERVAL_MS = 900;
const BULK_IMPORT_TEMPLATE_CSV = [
  'Tipo,Modelo,Marca,Voltagem,RG,Etiqueta',
  'refrigerador,PORTA DE VIDRO,BRAHMA,220v,2253088657624-9,8657624',
].join('\n');

const SCANNER_AREAS = {
  rg: {
    top: 0.22,
    left: 0.1,
    width: 0.8,
    height: 0.24,
    borderColor: '#d32f2f',
    labelColor: '#d32f2f',
    labelTextColor: '#fff',
    label: 'RG'
  },
  tag: {
    top: 0.57,
    left: 0.1,
    width: 0.8,
    height: 0.2,
    borderColor: '#fbc02d',
    labelColor: '#fbc02d',
    labelTextColor: '#1f1f1f',
    label: 'Etiqueta'
  }
};

const TABLE_CONTAINER_SX = {
  border: '1px solid var(--stroke)',
  borderRadius: 2,
  width: '100%',
  overflowX: 'auto',
  overflowY: 'auto',
  maxHeight: { xs: '60vh', md: 560 },
};

const SCROLLABLE_CARD_LIST_SX = {
  display: 'grid',
  gap: 1,
  maxHeight: { xs: '60vh', md: 560 },
  overflowY: 'auto',
  pr: 0.25,
};

const COMPACT_MODEL_CELL_SX = {
  maxWidth: { xs: 110, sm: 140, md: 180 },
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: 1.25,
  fontSize: '0.82rem',
};

const normalizeCodeInput = (value) => String(value || '').trim().toUpperCase();
const normalizeTextInput = (value) => String(value || '').trim();
const normalizeNonAllocatedStatus = (value) => {
  const normalized = normalizeTextInput(value).toLowerCase();
  if (normalized === 'novo' || normalized === 'disponivel') {
    return 'disponivel';
  }
  return normalized;
};

const normalizeQuantityInput = (value) => {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) {
    return '';
  }
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return '1';
  }
  return String(parsed);
};

const normalizeOcrText = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r/g, '')
    .toUpperCase()
);

const sanitizeExtractedCode = (value) => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, '')
  .replace(/^-+/, '')
  .replace(/-+$/, '');

const replaceCommonOcrNumberNoise = (value) => (
  String(value || '')
    .toUpperCase()
    .replace(/[OQ]/g, '0')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
);

const extractNumericLikeTokens = (value) => {
  const normalized = replaceCommonOcrNumberNoise(value);
  return normalized.match(/[0-9][0-9-]{5,24}/g) || [];
};

const getLineCandidate = (line, nextLine, labelRegex, minLength = 6) => {
  if (!labelRegex.test(line)) {
    return '';
  }
  const sanitizedLine = replaceCommonOcrNumberNoise(line);
  const inlineMatch = sanitizedLine.match(/[0-9][0-9-]{5,24}/);
  if (inlineMatch?.[0]) {
    return sanitizeExtractedCode(inlineMatch[0]);
  }
  const sanitizedNextLine = replaceCommonOcrNumberNoise(nextLine || '');
  const nextMatch = sanitizedNextLine.match(/[0-9][0-9-]{5,24}/);
  const nextCandidate = sanitizeExtractedCode(nextMatch?.[0] || '');
  return nextCandidate.length >= minLength ? nextCandidate : '';
};

const extractCodesFromLabelText = (rawText) => {
  const normalized = normalizeOcrText(rawText);
  const lines = normalized
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  let rgCode = '';
  let tagCode = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    if (!tagCode) {
      const serialCandidate = getLineCandidate(
        line,
        nextLine,
        /(NUMERO\s+SERI[A1I]L|SERI[A1I]L|N[UU]MERO\s+SERI[A1I]L)/,
        5
      );
      if (serialCandidate) {
        tagCode = serialCandidate;
      }
    }

    if (!rgCode) {
      const rgCandidate = getLineCandidate(
        line,
        nextLine,
        /\bR\s*\.?\s*G\s*\.?\b/,
        8
      );
      if (rgCandidate) {
        rgCode = rgCandidate;
      }
    }
  }

  if (!tagCode) {
    const ativoMatch = replaceCommonOcrNumberNoise(normalized).match(/ATIVO\s+FIXO\s*\d*\s*([0-9]{5,24})/);
    tagCode = sanitizeExtractedCode(ativoMatch?.[1] || '');
  }

  const allTokens = extractNumericLikeTokens(normalized)
    .map((item) => sanitizeExtractedCode(item))
    .filter(Boolean);
  const uniqueTokens = Array.from(new Set(allTokens));

  if (!rgCode) {
    const rgFallback = uniqueTokens
      .filter((item) => item.replace(/\D/g, '').length >= 11)
      .sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0];
    rgCode = rgFallback || '';
  }

  if (!tagCode) {
    const rgDigits = rgCode.replace(/\D/g, '');
    const tagFallback = uniqueTokens.find((item) => {
      const digits = item.replace(/\D/g, '');
      if (digits.length < 6 || digits.length > 10) {
        return false;
      }
      if (rgDigits && rgDigits.includes(digits)) {
        return false;
      }
      return true;
    });
    tagCode = tagFallback || '';
  }

  if (!tagCode && rgCode) {
    const rgDigits = rgCode.replace(/\D/g, '');
    if (rgDigits.length >= 7) {
      tagCode = rgDigits.slice(-7);
    }
  }

  return { rgCode, tagCode };
};

const buildEnhancedCanvas = (sourceCanvas) => {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;

  const context = canvas.getContext('2d');
  if (!context) {
    return sourceCanvas;
  }
  context.drawImage(sourceCanvas, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grayscale = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
    const contrastBoost = grayscale > 150 ? 255 : 0;
    data[i] = contrastBoost;
    data[i + 1] = contrastBoost;
    data[i + 2] = contrastBoost;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
};

const buildScannerCropCanvas = (sourceCanvas, area) => {
  const left = Math.max(0, Math.min(1, Number(area?.left ?? 0)));
  const top = Math.max(0, Math.min(1, Number(area?.top ?? 0)));
  const widthFactor = Math.max(0.05, Math.min(1, Number(area?.width ?? 1)));
  const heightFactor = Math.max(0.05, Math.min(1, Number(area?.height ?? 1)));

  const sourceWidth = sourceCanvas.width || 1;
  const sourceHeight = sourceCanvas.height || 1;

  const cropX = Math.max(0, Math.floor(sourceWidth * left));
  const cropY = Math.max(0, Math.floor(sourceHeight * top));
  const cropWidth = Math.max(1, Math.min(sourceWidth - cropX, Math.floor(sourceWidth * widthFactor)));
  const cropHeight = Math.max(1, Math.min(sourceHeight - cropY, Math.floor(sourceHeight * heightFactor)));

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const ctx = croppedCanvas.getContext('2d');
  if (!ctx) {
    return sourceCanvas;
  }
  ctx.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return croppedCanvas;
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY HH:mm') : '-';
};

const PaginationFooter = ({
  offset,
  limit,
  total,
}) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  const start = total === 0 ? 0 : (offset + 1);
  const end = Math.min(offset + limit, total);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 1,
        alignItems: { xs: 'stretch', sm: 'center' },
        flexWrap: 'wrap',
        flexDirection: { xs: 'column', sm: 'row' },
        pt: 1
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {`Mostrando ${start}-${end} de ${total} | Página ${currentPage} de ${totalPages}`}
      </Typography>
    </Box>
  );
};

const EquipmentPage = () => {
  const canManageEquipments = hasPermission('equipments.manage');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [refrigeratorsOverview, setRefrigeratorsOverview] = useState(null);

  const [overviewSearch, setOverviewSearch] = useState('');
  const [overviewSearchDebounced, setOverviewSearchDebounced] = useState('');
  const [nonAllocatedStatusFilter, setNonAllocatedStatusFilter] = useState('todos');
  const [newRefrigerators, setNewRefrigerators] = useState([]);
  const [nonAllocatedDashboard, setNonAllocatedDashboard] = useState({
    total_nao_alocados: 0,
    novo: 0,
    disponivel: 0,
    recap: 0,
    sucata: 0,
  });
  const [newRefrigeratorsPage, setNewRefrigeratorsPage] = useState({
    offset: 0,
    limit: PAGE_SIZE,
    total: 0,
    has_next: false,
    has_previous: false
  });
  const [loadingNewRefrigerators, setLoadingNewRefrigerators] = useState(true);

  const [materialsFilters, setMaterialsFilters] = useState({
    q: '',
    year: '',
    month: '',
    item_type: '',
    sort: 'newest'
  });
  const [materialMonthOptions, setMaterialMonthOptions] = useState([]);
  const [materialYearOptions, setMaterialYearOptions] = useState([]);
  const [materialsSearchDebounced, setMaterialsSearchDebounced] = useState('');
  const [inventoryMaterials, setInventoryMaterials] = useState([]);
  const [inventoryPage, setInventoryPage] = useState({
    offset: 0,
    limit: PAGE_SIZE,
    total: 0,
    has_next: false,
    has_previous: false
  });
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [monthPickerAnchorEl, setMonthPickerAnchorEl] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingEquipmentId, setDeletingEquipmentId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerStep, setScannerStep] = useState('');
  const [scannerPhase, setScannerPhase] = useState('rg');
  const [scannerMode, setScannerMode] = useState('form');
  const [scannerDraft, setScannerDraft] = useState({ rg_code: '', tag_code: '' });
  const [scannerPending, setScannerPending] = useState({ rg_code: '', tag_code: '' });
  const [scannerAwaitingConfirmation, setScannerAwaitingConfirmation] = useState(false);
  const [scannerTagAttemptConsumed, setScannerTagAttemptConsumed] = useState(false);
  const [scannerPreview, setScannerPreview] = useState({ rg_code: '', tag_code: '', raw_text: '' });
  const [ocrBusy, setOcrBusy] = useState(false);
  const [scannerRealtimeLookup, setScannerRealtimeLookup] = useState(null);
  const [scannerRealtimeLookupLoading, setScannerRealtimeLookupLoading] = useState(false);
  const [allocationLookupResult, setAllocationLookupResult] = useState(null);
  const [allocationLookupLoading, setAllocationLookupLoading] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerLoopTimeoutRef = useRef(null);
  const scannerDraftRef = useRef({ rg_code: '', tag_code: '' });
  const ocrBusyRef = useRef(false);
  const scannerRealtimeLookupRequestRef = useRef(0);
  const scannerRealtimeLookupLastRgRef = useRef('');
  const tesseractLoaderRef = useRef(null);
  const bulkImportInputRef = useRef(null);
  const activeScannerArea = scannerPhase === 'tag' ? SCANNER_AREAS.tag : SCANNER_AREAS.rg;
  const scannerHasRequiredRg = Boolean(normalizeCodeInput(scannerDraft.rg_code || scannerPending.rg_code));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOverviewSearchDebounced(normalizeTextInput(overviewSearch));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [overviewSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMaterialsSearchDebounced(normalizeTextInput(materialsFilters.q));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [materialsFilters.q]);

  useEffect(() => {
    scannerDraftRef.current = scannerDraft;
  }, [scannerDraft]);

  useEffect(() => {
    if (!canManageEquipments && activeScreen === 'manage') {
      setActiveScreen('dashboard');
    }
  }, [activeScreen, canManageEquipments]);

  useEffect(() => {
    setNewRefrigeratorsPage((prev) => ({ ...prev, offset: 0 }));
  }, [nonAllocatedStatusFilter, overviewSearchDebounced, materialsFilters.sort]);

  useEffect(() => {
    setInventoryPage((prev) => ({ ...prev, offset: 0 }));
  }, [materialsFilters.item_type, materialsSearchDebounced, materialsFilters.month, materialsFilters.sort, materialsFilters.year]);

  const fetchRefrigeratorsOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const response = await api.get('/equipments/refrigerators/overview', {
        params: { novos_limit: 1, alocados_limit: 1 }
      });
      setRefrigeratorsOverview(response?.data || null);
      setError('');
    } catch (err) {
      setRefrigeratorsOverview(null);
      setError('Erro ao carregar o painel de refrigeradores.');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchNewRefrigerators = useCallback(async () => {
    setLoadingNewRefrigerators(true);
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: newRefrigeratorsPage.offset,
        sort: materialsFilters.sort,
        status: nonAllocatedStatusFilter,
      };
      if (overviewSearchDebounced) {
        params.q = overviewSearchDebounced;
      }
      const response = await api.get('/equipments/refrigerators/non-allocated', { params });
      const payload = response?.data || {};
      setNewRefrigerators(Array.isArray(payload.items) ? payload.items : []);
      setNonAllocatedDashboard({
        total_nao_alocados: Number(payload?.dashboard?.total_nao_alocados || 0),
        novo: Number(payload?.dashboard?.novo || 0),
        disponivel: Number(payload?.dashboard?.disponivel || 0),
        recap: Number(payload?.dashboard?.recap || 0),
        sucata: Number(payload?.dashboard?.sucata || 0),
      });
      setNewRefrigeratorsPage((prev) => ({
        ...prev,
        ...(payload.page || {}),
        limit: Number(payload?.page?.limit || PAGE_SIZE),
        offset: Number(payload?.page?.offset || prev.offset),
        total: Number(payload?.page?.total || 0),
        has_next: Boolean(payload?.page?.has_next),
        has_previous: Boolean(payload?.page?.has_previous),
      }));
      setError('');
    } catch (err) {
      setNewRefrigerators([]);
      setNonAllocatedDashboard({
        total_nao_alocados: 0,
        novo: 0,
        disponivel: 0,
        recap: 0,
        sucata: 0,
      });
      setNewRefrigeratorsPage((prev) => ({ ...prev, total: 0, has_next: false, has_previous: prev.offset > 0 }));
      setError('Erro ao carregar refrigeradores não alocados.');
    } finally {
      setLoadingNewRefrigerators(false);
    }
  }, [materialsFilters.sort, newRefrigeratorsPage.offset, nonAllocatedStatusFilter, overviewSearchDebounced]);

  const fetchInventoryMaterials = useCallback(async () => {
    setLoadingMaterials(true);

    try {
      const params = {
        group: 'todos',
        limit: PAGE_SIZE,
        offset: inventoryPage.offset,
        sort: materialsFilters.sort
      };
      if (materialsSearchDebounced) {
        params.q = materialsSearchDebounced;
      }
      if (materialsFilters.year) {
        params.year = materialsFilters.year;
      }
      if (materialsFilters.year && materialsFilters.month) {
        params.month = `${materialsFilters.year}-${materialsFilters.month}`;
      }
      if (materialsFilters.item_type) {
        params.item_type = materialsFilters.item_type;
      }

      const response = await api.get('/equipments/inventory-materials', { params });
      const payload = response?.data || {};

      setInventoryMaterials(Array.isArray(payload.items) ? payload.items : []);
      setInventoryPage((prev) => ({
        ...prev,
        ...(payload.page || {}),
        limit: Number(payload?.page?.limit || PAGE_SIZE),
        offset: Number(payload?.page?.offset || prev.offset),
        total: Number(payload?.page?.total || 0),
        has_next: Boolean(payload?.page?.has_next),
        has_previous: Boolean(payload?.page?.has_previous),
      }));
      setError('');
    } catch (err) {
      setInventoryMaterials([]);
      setInventoryPage((prev) => ({ ...prev, total: 0, has_next: false }));
      setError('Erro ao carregar materiais da base 02.02.20.');
    } finally {
      setLoadingMaterials(false);
    }
  }, [
    inventoryPage.offset,
    materialsFilters.item_type,
    materialsFilters.month,
    materialsFilters.sort,
    materialsFilters.year,
    materialsSearchDebounced,
  ]);

  const fetchMaterialYearOptions = useCallback(async () => {
    try {
      const response = await api.get('/equipments/inventory-materials/month-options');
      const rows = Array.isArray(response?.data) ? response.data : [];
      const validRows = rows
        .map((item) => String(item || '').trim())
        .filter((item) => /^\d{4}-\d{2}$/.test(item));
      const years = Array.from(new Set(validRows.map((item) => item.slice(0, 4))))
        .sort((a, b) => Number(b) - Number(a));
      setMaterialMonthOptions(validRows);
      setMaterialYearOptions(years);
    } catch (err) {
      setMaterialMonthOptions([]);
      setMaterialYearOptions([]);
    }
  }, []);

  useEffect(() => {
    fetchRefrigeratorsOverview();
  }, [fetchRefrigeratorsOverview]);

  useEffect(() => {
    fetchNewRefrigerators();
  }, [fetchNewRefrigerators]);

  useEffect(() => {
    fetchInventoryMaterials();
  }, [fetchInventoryMaterials]);

  useEffect(() => {
    fetchMaterialYearOptions();
  }, [fetchMaterialYearOptions]);

  const materialTypeByValue = useMemo(
    () => MATERIAL_TYPE_OPTIONS.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {}),
    []
  );
  const nonAllocatedStatusLabelByValue = useMemo(
    () => ({
      novo: 'Disponível',
      disponivel: 'Disponível',
      recap: 'Recap',
      sucata: 'Sucata',
    }),
    []
  );
  const nonAllocatedAvailableCount = Number(nonAllocatedDashboard.novo || 0) + Number(nonAllocatedDashboard.disponivel || 0);

  const monthPickerOpen = Boolean(monthPickerAnchorEl);
  const numericYears = useMemo(
    () => materialYearOptions.map((item) => Number(item)).filter((item) => Number.isFinite(item)),
    [materialYearOptions]
  );
  const minAvailableYear = numericYears.length ? Math.min(...numericYears) : null;
  const maxAvailableYear = numericYears.length ? Math.max(...numericYears) : null;

  const selectedMonthDate = useMemo(() => {
    if (!materialsFilters.year || !materialsFilters.month) {
      return null;
    }
    const parsed = dayjs(`${materialsFilters.year}-${materialsFilters.month}-01`);
    return parsed.isValid() ? parsed : null;
  }, [materialsFilters.month, materialsFilters.year]);

  useEffect(() => {
    if (selectedMonthDate) {
      return;
    }
    const sortedMonthOptions = materialMonthOptions
      .map((item) => String(item || '').trim())
      .filter((item) => /^\d{4}-\d{2}$/.test(item))
      .sort((a, b) => a.localeCompare(b));
    const fallback = sortedMonthOptions.length > 0
      ? dayjs(`${sortedMonthOptions[sortedMonthOptions.length - 1]}-01`)
      : dayjs().startOf('month');

    setMaterialsFilters((prev) => ({
      ...prev,
      year: fallback.format('YYYY'),
      month: fallback.format('MM'),
    }));
  }, [materialMonthOptions, selectedMonthDate]);

  const selectedYear = selectedMonthDate
    ? selectedMonthDate.format('YYYY')
    : String(materialsFilters.year || '').trim();

  const availableMonthValues = useMemo(() => {
    if (!selectedYear) {
      return [];
    }
    return Array.from(
      new Set(
        materialMonthOptions
          .filter((item) => item.startsWith(`${selectedYear}-`))
          .map((item) => item.slice(5, 7))
      )
    ).sort((a, b) => Number(a) - Number(b));
  }, [materialMonthOptions, selectedYear]);

  const availableMonthSet = useMemo(
    () => new Set(availableMonthValues),
    [availableMonthValues]
  );

  const applyMonthDate = (dateValue) => {
    if (!dateValue || !dateValue.isValid()) {
      return;
    }
    const year = dateValue.format('YYYY');
    const yearNumber = Number(year);
    if (
      (minAvailableYear !== null && yearNumber < minAvailableYear)
      || (maxAvailableYear !== null && yearNumber > maxAvailableYear)
    ) {
      return;
    }
    setMaterialsFilters((prev) => ({
      ...prev,
      year,
      month: dateValue.format('MM'),
    }));
  };

  const hasPreviousPeriod = useMemo(() => {
    if (!selectedMonthDate || minAvailableYear === null) {
      return false;
    }
    return selectedMonthDate.subtract(1, 'month').year() >= minAvailableYear;
  }, [minAvailableYear, selectedMonthDate]);

  const hasNextPeriod = useMemo(() => {
    if (!selectedMonthDate || maxAvailableYear === null) {
      return false;
    }
    return selectedMonthDate.add(1, 'month').year() <= maxAvailableYear;
  }, [maxAvailableYear, selectedMonthDate]);

  const handlePreviousPeriod = () => {
    if (!selectedMonthDate) {
      return;
    }
    applyMonthDate(selectedMonthDate.subtract(1, 'month'));
  };

  const handleNextPeriod = () => {
    if (!selectedMonthDate) {
      return;
    }
    applyMonthDate(selectedMonthDate.add(1, 'month'));
  };

  const openMonthPicker = (event) => {
    setMonthPickerAnchorEl(event.currentTarget);
  };

  const closeMonthPicker = () => {
    setMonthPickerAnchorEl(null);
  };

  const handleMonthSelect = (monthValue) => {
    const baseDate = selectedMonthDate || dayjs().startOf('month');
    const nextDate = baseDate.month(Number(monthValue) - 1);
    applyMonthDate(nextDate);
    closeMonthPicker();
  };

  const voltageByValue = useMemo(
    () => VOLTAGE_OPTIONS.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {}),
    []
  );

  const selectedMonthYearValue = useMemo(() => {
    return selectedMonthDate ? selectedMonthDate.format('MM/YYYY') : '';
  }, [selectedMonthDate]);

  const periodHeaderLabel = selectedMonthDate
    ? selectedMonthDate.format('YYYY')
    : '-';

  const monthPickerPanel = (
    <Box
      sx={{
        p: isMobile ? 0 : 1.5,
        width: isMobile ? '100%' : { xs: 284, sm: 320 },
        display: 'grid',
        gap: 1.25
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton size="small" onClick={handlePreviousPeriod} disabled={!hasPreviousPeriod}>
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontWeight: 700 }}>{periodHeaderLabel}</Typography>
        <IconButton size="small" onClick={handleNextPeriod} disabled={!hasNextPeriod}>
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75 }}>
        {MONTH_PICKER_OPTIONS.map((month) => {
          const isSelected = selectedMonthDate?.format('MM') === month.value;
          const isAvailable = availableMonthSet.has(month.value);
          return (
            <Button
              key={month.value}
              size="small"
              variant={isSelected ? 'contained' : 'text'}
              onClick={() => handleMonthSelect(month.value)}
              sx={{
                minWidth: 0,
                py: 0.7,
                textTransform: 'none',
                opacity: isAvailable ? 1 : 0.65
              }}
            >
              {month.label}
            </Button>
          );
        })}
      </Box>
      {selectedMonthDate && !availableMonthSet.has(selectedMonthDate.format('MM')) && (
        <Typography variant="caption" color="text.secondary">
          O período selecionado não possui registros na base.
        </Typography>
      )}
      {availableMonthValues.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Sem meses disponíveis para o ano selecionado.
        </Typography>
      )}
    </Box>
  );

  const dashboard = refrigeratorsOverview?.dashboard || {
    total_cadastrados: 0,
    novos_cadastrados: 0,
    disponiveis_cadastrados: 0,
    recap_cadastrados: 0,
    sucata_cadastrados: 0,
    alocados_cadastrados: 0,
    alocados_020220_linhas: 0,
    alocados_020220_unidades: 0,
    clientes_alocados_020220: 0
  };

  const screenOptions = [
    { value: 'dashboard', label: 'Painel' },
    { value: 'new-refrigerators', label: 'Não alocados' },
    { value: 'materials', label: 'Geral' },
    ...(canManageEquipments ? [{ value: 'manage', label: 'Cadastrar' }] : [])
  ];
  const isDashboardScreen = activeScreen === 'dashboard';
  const isNewRefrigeratorsScreen = activeScreen === 'new-refrigerators';
  const isMaterialsScreen = activeScreen === 'materials';
  const isManageScreen = activeScreen === 'manage';

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleDeleteNonAllocatedEquipment = useCallback(async (item) => {
    if (!canManageEquipments || !item?.id) {
      return;
    }

    const modelLabel = normalizeTextInput(item.model_name) || `ID ${item.id}`;
    const rgLabel = normalizeCodeInput(item.rg_code || '');
    const confirmationText = rgLabel
      ? `Deseja excluir o equipamento "${modelLabel}" (RG ${rgLabel})? Esta ação não pode ser desfeita.`
      : `Deseja excluir o equipamento "${modelLabel}"? Esta ação não pode ser desfeita.`;
    if (!window.confirm(confirmationText)) {
      return;
    }

    setDeletingEquipmentId(Number(item.id));
    setError('');
    setSuccess('');
    try {
      await api.delete(`/equipments/${item.id}`);
      setSuccess(`Equipamento "${modelLabel}" excluído com sucesso.`);
      await Promise.all([
        fetchNewRefrigerators(),
        fetchRefrigeratorsOverview(),
      ]);
    } catch (err) {
      const detail = normalizeTextInput(err?.response?.data?.detail);
      setError(detail || 'Não foi possível excluir o equipamento selecionado.');
    } finally {
      setDeletingEquipmentId(null);
    }
  }, [canManageEquipments, fetchNewRefrigerators, fetchRefrigeratorsOverview]);

  const syncRefrigeratorsAllocationStatus = useCallback(async () => {
    if (!canManageEquipments) {
      return null;
    }
    try {
      const response = await api.post('/equipments/refrigerators/sync-allocation-status');
      return response?.data || null;
    } catch (err) {
      const detail = normalizeTextInput(err?.response?.data?.detail);
      setError(detail || 'Não foi possível sincronizar alocações com a base 02.02.20.');
      return null;
    }
  }, [canManageEquipments]);

  const refreshData = useCallback(async ({ notifySync = false } = {}) => {
    const syncPayload = await syncRefrigeratorsAllocationStatus();
    await Promise.all([
      fetchRefrigeratorsOverview(),
      fetchMaterialYearOptions(),
      fetchNewRefrigerators(),
      fetchInventoryMaterials(),
    ]);
    if (notifySync && Number(syncPayload?.updated_count || 0) > 0) {
      setSuccess(
        `Atualização concluída. ${Number(syncPayload.updated_count)} equipamento(s) marcado(s) como alocado(s).`
      );
    }
  }, [
    syncRefrigeratorsAllocationStatus,
    fetchInventoryMaterials,
    fetchMaterialYearOptions,
    fetchNewRefrigerators,
    fetchRefrigeratorsOverview,
  ]);

  const clearBulkImportSelection = useCallback(() => {
    setBulkImportFile(null);
    if (bulkImportInputRef.current) {
      bulkImportInputRef.current.value = '';
    }
  }, []);

  const handleBulkImportFileChange = (event) => {
    const file = event?.target?.files?.[0] || null;
    setBulkImportFile(file);
    setBulkImportResult(null);
  };

  const downloadBulkImportTemplate = useCallback(() => {
    const blob = new Blob([BULK_IMPORT_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'modelo_importacao_refrigeradores.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }, []);

  const handleBulkImportSubmit = useCallback(async () => {
    if (!bulkImportFile) {
      setError('Selecione um arquivo CSV para importar.');
      return;
    }

    const formData = new FormData();
    formData.append('csv_file', bulkImportFile);

    setBulkImporting(true);
    try {
      const response = await api.post('/equipments/refrigerators/import-csv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const payload = response?.data || null;
      setBulkImportResult(payload);
      setSuccess(
        `Importação concluída. Importados: ${Number(payload?.imported_count || 0)} | `
        + `Duplicados por código (RG/Etiqueta): ${Number(payload?.duplicated_by_rg || 0)} | `
        + `Inválidos: ${Number(payload?.invalid_rows || 0)}`
      );
      setError('');
      clearBulkImportSelection();
      await refreshData();
      setActiveScreen('new-refrigerators');
    } catch (err) {
      const detail = normalizeTextInput(err?.response?.data?.detail);
      setError(detail || 'Não foi possível importar o CSV de refrigeradores.');
    } finally {
      setBulkImporting(false);
    }
  }, [bulkImportFile, clearBulkImportSelection, refreshData]);

  const fetchAllocationLookup = useCallback(async ({ rgCode, tagCode }) => {
    const normalizedRgCode = normalizeCodeInput(rgCode);
    const normalizedTagCode = normalizeCodeInput(tagCode);
    if (!normalizedRgCode && !normalizedTagCode) {
      setError('Informe RG ou etiqueta para consultar as alocações.');
      return;
    }

    setAllocationLookupLoading(true);
    try {
      const params = {};
      if (normalizedRgCode) {
        params.rg_code = normalizedRgCode;
      }
      if (normalizedTagCode) {
        params.tag_code = normalizedTagCode;
      }

      const response = await api.get('/equipments/allocations/lookup', { params });
      const payload = response?.data || {};
      const items = Array.isArray(payload?.items) ? payload.items : [];

      setAllocationLookupResult({
        rg_code: normalizeCodeInput(payload?.rg_code || normalizedRgCode),
        tag_code: normalizeCodeInput(payload?.tag_code || normalizedTagCode),
        total: Number(payload?.total || items.length || 0),
        items
      });
      setError('');
      setSuccess(
        items.length > 0
          ? `Consulta concluída. ${items.length} registro(s) alocado(s) encontrado(s).`
          : 'Equipamento não encontrado na base 02.02.20 para o RG informado.'
      );
    } catch (err) {
      const detail = normalizeTextInput(err?.response?.data?.detail);
      setAllocationLookupResult(null);
      setError(detail || 'Não foi possível consultar alocações por RG/Etiqueta.');
    } finally {
      setAllocationLookupLoading(false);
    }
  }, []);

  const fetchAllocationLookupRealtime = useCallback(async (rgCode) => {
    const normalizedRgCode = normalizeCodeInput(rgCode);
    if (!normalizedRgCode) {
      return;
    }
    if (scannerRealtimeLookupLastRgRef.current === normalizedRgCode) {
      return;
    }

    scannerRealtimeLookupLastRgRef.current = normalizedRgCode;
    const requestId = scannerRealtimeLookupRequestRef.current + 1;
    scannerRealtimeLookupRequestRef.current = requestId;
    setScannerRealtimeLookupLoading(true);

    try {
      const response = await api.get('/equipments/allocations/lookup', {
        params: { rg_code: normalizedRgCode }
      });
      if (requestId !== scannerRealtimeLookupRequestRef.current) {
        return;
      }

      const payload = response?.data || {};
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const realtimePayload = {
        rg_code: normalizeCodeInput(payload?.rg_code || normalizedRgCode),
        tag_code: normalizeCodeInput(payload?.tag_code || ''),
        total: Number(payload?.total || items.length || 0),
        items
      };

      setScannerRealtimeLookup(realtimePayload);
      setAllocationLookupResult(realtimePayload);
      setScannerError('');
      setScannerStep(
        items.length > 0
          ? `RG ${realtimePayload.rg_code} encontrado na base 02.02.20.`
          : `RG ${realtimePayload.rg_code} lido. Equipamento não encontrado na base 02.02.20.`
      );
      setScannerAwaitingConfirmation(true);
      if (scannerLoopTimeoutRef.current) {
        window.clearTimeout(scannerLoopTimeoutRef.current);
        scannerLoopTimeoutRef.current = null;
      }
    } catch (err) {
      if (requestId !== scannerRealtimeLookupRequestRef.current) {
        return;
      }
      const detail = normalizeTextInput(err?.response?.data?.detail);
      setScannerRealtimeLookup({
        rg_code: normalizedRgCode,
        tag_code: '',
        total: 0,
        items: []
      });
      setScannerError(detail || 'Não foi possível consultar a alocação em tempo real.');
      setScannerAwaitingConfirmation(true);
      if (scannerLoopTimeoutRef.current) {
        window.clearTimeout(scannerLoopTimeoutRef.current);
        scannerLoopTimeoutRef.current = null;
      }
    } finally {
      if (requestId === scannerRealtimeLookupRequestRef.current) {
        setScannerRealtimeLookupLoading(false);
      }
    }
  }, []);

  const loadTesseract = useCallback(async () => {
    if (typeof window === 'undefined') {
      throw new Error('Navegador sem suporte para OCR.');
    }
    if (window.Tesseract) {
      return window.Tesseract;
    }
    if (tesseractLoaderRef.current) {
      return tesseractLoaderRef.current;
    }

    tesseractLoaderRef.current = new Promise((resolve, reject) => {
      const scriptId = 'tesseract-cdn-loader';
      let script = document.getElementById(scriptId);

      const cleanup = () => {
        if (!script) {
          return;
        }
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
      };

      const handleLoad = () => {
        cleanup();
        if (window.Tesseract) {
          resolve(window.Tesseract);
          return;
        }
        tesseractLoaderRef.current = null;
        reject(new Error('Biblioteca OCR não carregada.'));
      };

      const handleError = () => {
        cleanup();
        tesseractLoaderRef.current = null;
        reject(new Error('Não foi possível carregar a biblioteca OCR.'));
      };

      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = TESSERACT_CDN_URL;
        script.async = true;
        document.head.appendChild(script);
      }

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      if (window.Tesseract) {
        handleLoad();
      }
    });

    return tesseractLoaderRef.current;
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canManageEquipments) {
      return;
    }

    const isRefrigerator = form.category === 'refrigerador';
    const normalizedQuantity = normalizeQuantityInput(form.quantity);
    const payload = {
      category: form.category,
      model_name: normalizeTextInput(form.model_name),
      brand: normalizeTextInput(form.brand),
      quantity: isRefrigerator ? 1 : Number(normalizedQuantity || 0),
      voltage: isRefrigerator ? normalizeTextInput(form.voltage) : '',
      rg_code: isRefrigerator ? (normalizeCodeInput(form.rg_code) || null) : null,
      tag_code: isRefrigerator ? (normalizeCodeInput(form.tag_code) || null) : null,
      status: isRefrigerator ? form.status : 'novo',
      client_name: isRefrigerator ? (normalizeTextInput(form.client_name) || null) : null,
      notes: isRefrigerator ? (normalizeTextInput(form.notes) || null) : null
    };

    if (!payload.model_name) {
      setError('Preencha o modelo para salvar.');
      return;
    }
    if (!payload.brand) {
      setError('Preencha a marca para salvar.');
      return;
    }
    if (isRefrigerator && !payload.rg_code) {
      setError('Preencha o RG para refrigeradores.');
      return;
    }
    if (isRefrigerator && !payload.voltage) {
      setError('Informe a voltagem para refrigeradores.');
      return;
    }
    if (!isRefrigerator && (!payload.quantity || payload.quantity < 1)) {
      setError('Informe uma quantidade válida para o material.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/equipments/${editingId}`, payload);
        setSuccess('Equipamento atualizado com sucesso.');
      } else {
        await api.post('/equipments', payload);
        setSuccess('Equipamento cadastrado com sucesso.');
      }
      setError('');
      resetForm();
      await refreshData();
      setActiveScreen('new-refrigerators');
    } catch (err) {
      const detail = normalizeTextInput(err?.response?.data?.detail);
      setError(detail || 'Não foi possível salvar o equipamento.');
    } finally {
      setSaving(false);
    }
  };

  const clearScannerLoop = useCallback(() => {
    if (scannerLoopTimeoutRef.current) {
      window.clearTimeout(scannerLoopTimeoutRef.current);
      scannerLoopTimeoutRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(() => {
    clearScannerLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [clearScannerLoop]);

  const closeScanner = useCallback(() => {
    setScannerOpen(false);
    setScannerError('');
    setScannerStep('');
    setScannerPhase('rg');
    setScannerMode('form');
    setScannerDraft({ rg_code: '', tag_code: '' });
    setScannerPending({ rg_code: '', tag_code: '' });
    setScannerAwaitingConfirmation(false);
    setScannerTagAttemptConsumed(false);
    scannerDraftRef.current = { rg_code: '', tag_code: '' };
    setScannerPreview({ rg_code: '', tag_code: '', raw_text: '' });
    setOcrBusy(false);
    setScannerRealtimeLookup(null);
    setScannerRealtimeLookupLoading(false);
    ocrBusyRef.current = false;
    scannerRealtimeLookupRequestRef.current += 1;
    scannerRealtimeLookupLastRgRef.current = '';
    stopScanner();
  }, [stopScanner]);

  const openFullLabelScanner = useCallback(() => {
    if (!canManageEquipments) {
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setError('Câmera indisponível neste dispositivo ou navegador.');
      return;
    }

    const initialDraft = {
      rg_code: normalizeCodeInput(form.rg_code),
      tag_code: normalizeCodeInput(form.tag_code)
    };

    setScannerMode('form');
    setScannerPhase('rg');
    setScannerDraft(initialDraft);
    setScannerPending({ rg_code: '', tag_code: '' });
    setScannerAwaitingConfirmation(false);
    setScannerTagAttemptConsumed(false);
    scannerDraftRef.current = initialDraft;
    setScannerPreview({ ...initialDraft, raw_text: '' });
    setScannerStep('Aponte a câmera para o RG. A leitura será automática.');
    setScannerError('');
    setScannerOpen(true);
    setSuccess('');
    setError('');
  }, [canManageEquipments, form.rg_code, form.tag_code]);

  const openAllocationLookupScanner = useCallback(() => {
    if (!canManageEquipments) {
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setError('Câmera indisponível neste dispositivo ou navegador.');
      return;
    }

    setScannerMode('allocation');
    setScannerPhase('rg');
    setScannerDraft({ rg_code: '', tag_code: '' });
    setScannerPending({ rg_code: '', tag_code: '' });
    setScannerAwaitingConfirmation(false);
    setScannerTagAttemptConsumed(false);
    scannerDraftRef.current = { rg_code: '', tag_code: '' };
    setScannerPreview({ rg_code: '', tag_code: '', raw_text: '' });
    setScannerRealtimeLookup(null);
    setScannerRealtimeLookupLoading(false);
    scannerRealtimeLookupRequestRef.current += 1;
    scannerRealtimeLookupLastRgRef.current = '';
    setScannerStep('Aponte a câmera para o RG. A leitura será automática.');
    setScannerError('');
    setScannerOpen(true);
    setSuccess('');
    setError('');
  }, [canManageEquipments]);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return undefined;
    }

    let active = true;
    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!videoRef.current) {
          throw new Error('Não foi possível iniciar a câmera.');
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (err) {
        const message = normalizeTextInput(err?.message);
        setScannerError(message || 'Não foi possível acessar a câmera.');
      }
    };

    run();

    return () => {
      active = false;
      stopScanner();
    };
  }, [scannerOpen, stopScanner]);

  const readScannerFrame = useCallback(async ({ phase = 'rg', quick = true, silent = true } = {}) => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      if (!silent) {
        setScannerError('A câmera ainda não está pronta. Aguarde e tente novamente.');
      }
      return null;
    }
    if (ocrBusyRef.current) {
      return null;
    }

    const area = phase === 'tag' ? SCANNER_AREAS.tag : SCANNER_AREAS.rg;
    const phaseLabel = phase === 'tag' ? 'etiqueta' : 'RG';

    try {
      ocrBusyRef.current = true;
      setOcrBusy(true);
      if (!silent) {
        setScannerStep(`Lendo ${phaseLabel}...`);
      }

      const video = videoRef.current;
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = video.videoWidth || 1280;
      fullCanvas.height = video.videoHeight || 720;
      const fullContext = fullCanvas.getContext('2d');
      if (!fullContext) {
        throw new Error('Não foi possível processar a imagem da câmera.');
      }
      fullContext.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);

      const cropCanvas = buildScannerCropCanvas(fullCanvas, area);
      const Tesseract = await loadTesseract();
      const firstPass = await Tesseract.recognize(cropCanvas, 'por+eng');
      let rawText = firstPass?.data?.text || '';
      let extracted = extractCodesFromLabelText(rawText);

      let rgCode = normalizeCodeInput(extracted.rgCode);
      let tagCode = normalizeCodeInput(extracted.tagCode);
      let code = phase === 'tag' ? tagCode : rgCode;

      if (!code && !quick) {
        const enhancedCanvas = buildEnhancedCanvas(cropCanvas);
        const secondPass = await Tesseract.recognize(enhancedCanvas, 'por+eng');
        rawText = secondPass?.data?.text || rawText;
        extracted = extractCodesFromLabelText(rawText);
        rgCode = normalizeCodeInput(extracted.rgCode);
        tagCode = normalizeCodeInput(extracted.tagCode);
        code = phase === 'tag' ? tagCode : rgCode;
      }

      const compactRawText = normalizeTextInput(rawText).replace(/\s+/g, ' ').slice(0, 140);
      if (compactRawText || rgCode || tagCode) {
        setScannerPreview((prev) => ({
          rg_code: rgCode || prev.rg_code,
          tag_code: tagCode || prev.tag_code,
          raw_text: compactRawText || prev.raw_text
        }));
      }

      return {
        phase,
        code,
        rgCode,
        tagCode
      };
    } catch (err) {
      if (!silent) {
        const message = normalizeTextInput(err?.message);
        setScannerError(message || 'Falha ao processar a leitura da câmera.');
      }
      return null;
    } finally {
      ocrBusyRef.current = false;
      setOcrBusy(false);
    }
  }, [loadTesseract]);

  const handleScannerDetectionResult = useCallback(({ phase, rgCode, tagCode }) => {
    const normalizedRg = normalizeCodeInput(rgCode);
    const normalizedTag = normalizeCodeInput(tagCode);

    if (phase === 'rg' && normalizedRg) {
      if (scannerMode === 'allocation') {
        const nextDraft = {
          ...(scannerDraftRef.current || { rg_code: '', tag_code: '' }),
          rg_code: normalizedRg
        };
        scannerDraftRef.current = nextDraft;
        setScannerDraft(nextDraft);
        setScannerPending((prev) => ({ ...prev, rg_code: normalizedRg }));
        setScannerAwaitingConfirmation(false);
        setScannerError('');
        setScannerStep(`RG identificado: ${normalizedRg}. Consultando em tempo real na base 02.02.20...`);
        fetchAllocationLookupRealtime(normalizedRg);
        return true;
      }

      setScannerPending((prev) => ({ ...prev, rg_code: normalizedRg }));
      setScannerAwaitingConfirmation(true);
      setScannerError('');
      setScannerStep(
        scannerMode === 'allocation'
          ? `RG identificado: ${normalizedRg}. Confirme para consultar na base 02.02.20 ou verifique novamente.`
          : `RG identificado: ${normalizedRg}. Confirme para preencher ou verifique novamente.`
      );
      return true;
    }

    if (phase === 'tag' && normalizedTag) {
      setScannerPending((prev) => ({ ...prev, tag_code: normalizedTag }));
      setScannerAwaitingConfirmation(true);
      setScannerError('');
      setScannerStep(`Etiqueta identificada: ${normalizedTag}. Confirme ou verifique novamente.`);
      return true;
    }

    return false;
  }, [fetchAllocationLookupRealtime, scannerMode]);

  useEffect(() => {
    if (!scannerOpen) {
      clearScannerLoop();
      return undefined;
    }

    let cancelled = false;
    const loop = async () => {
      if (cancelled) {
        return;
      }

      if (scannerAwaitingConfirmation) {
        return;
      }

      const phase = scannerPhase === 'tag' ? 'tag' : 'rg';

      if (scannerMode === 'form' && phase === 'tag') {
        if (scannerTagAttemptConsumed) {
          return;
        }

        setScannerTagAttemptConsumed(true);
        const tagResult = await readScannerFrame({
          phase: 'tag',
          quick: true,
          silent: true
        });
        if (tagResult?.code) {
          handleScannerDetectionResult({
            phase: 'tag',
            rgCode: tagResult.rgCode,
            tagCode: tagResult.tagCode
          });
          return;
        }

        if (!cancelled) {
          setScannerAwaitingConfirmation(true);
          setScannerError('Etiqueta não identificada nesta tentativa. Clique em "Tentar novamente" ou em "Próximo".');
          setScannerStep('Tentativa automática da etiqueta concluída.');
        }
        return;
      }

      const result = await readScannerFrame({
        phase,
        quick: true,
        silent: true
      });
      if (result) {
        handleScannerDetectionResult({
          phase,
          rgCode: result.rgCode,
          tagCode: result.tagCode
        });
      }

      if (!cancelled) {
        scannerLoopTimeoutRef.current = window.setTimeout(loop, SCANNER_AUTO_INTERVAL_MS);
      }
    };

    loop();

    return () => {
      cancelled = true;
      clearScannerLoop();
    };
  }, [
    clearScannerLoop,
    handleScannerDetectionResult,
    readScannerFrame,
    scannerAwaitingConfirmation,
    scannerMode,
    scannerOpen,
    scannerPhase,
    scannerTagAttemptConsumed,
  ]);

  const triggerScannerReadNow = useCallback(async () => {
    const phase = scannerPhase === 'tag' ? 'tag' : 'rg';
    const result = await readScannerFrame({
      phase,
      quick: false,
      silent: false
    });
    if (!result) {
      return;
    }

    if (!result.code) {
      setScannerError(
        phase === 'rg'
          ? 'Não foi possível identificar o RG nesta tentativa.'
          : 'Não foi possível identificar a etiqueta nesta tentativa.'
      );
      return;
    }

    handleScannerDetectionResult({
      phase,
      rgCode: result.rgCode,
      tagCode: result.tagCode
    });
  }, [handleScannerDetectionResult, readScannerFrame, scannerPhase]);

  const retryScannerDetection = useCallback(() => {
    setScannerError('');
    setScannerAwaitingConfirmation(false);
    setScannerTagAttemptConsumed(false);
    if (scannerMode === 'allocation') {
      scannerRealtimeLookupLastRgRef.current = '';
      scannerRealtimeLookupRequestRef.current += 1;
      setScannerRealtimeLookup(null);
      setScannerRealtimeLookupLoading(false);
    }
    if (scannerPhase === 'tag') {
      setScannerPending((prev) => ({ ...prev, tag_code: '' }));
      setScannerStep('Aponte a câmera para a etiqueta. A leitura será automática.');
      return;
    }
    setScannerPending((prev) => ({ ...prev, rg_code: '' }));
    setScannerStep('Aponte a câmera para o RG. A leitura será automática.');
  }, [scannerMode, scannerPhase]);

  const confirmScannerRg = useCallback(async () => {
    const rgCode = normalizeCodeInput(
      scannerPending.rg_code
      || scannerPreview.rg_code
      || scannerDraftRef.current?.rg_code
      || form.rg_code
    );
    if (!rgCode) {
      setScannerError('Nenhum RG válido foi identificado. Verifique novamente.');
      return;
    }

    const nextDraft = {
      ...(scannerDraftRef.current || { rg_code: '', tag_code: '' }),
      rg_code: rgCode
    };
    scannerDraftRef.current = nextDraft;
    setScannerDraft(nextDraft);
    setScannerAwaitingConfirmation(false);
    setScannerError('');

    if (scannerMode === 'allocation') {
      closeScanner();
      await fetchAllocationLookup({ rgCode, tagCode: '' });
      return;
    }

    setScannerPending((prev) => ({
      ...prev,
      rg_code: rgCode,
      tag_code: '',
    }));
    setForm((prev) => (
      prev.rg_code === rgCode
        ? prev
        : { ...prev, rg_code: rgCode }
    ));
    setScannerPhase('tag');
    setScannerTagAttemptConsumed(false);
    setScannerStep(`RG confirmado: ${rgCode}. Agora identifique a etiqueta ou clique em "Próximo".`);
  }, [closeScanner, fetchAllocationLookup, form.rg_code, scannerMode, scannerPending.rg_code, scannerPreview.rg_code]);

  const confirmScannerTag = useCallback(() => {
    const rgCode = normalizeCodeInput(scannerDraftRef.current?.rg_code || form.rg_code);
    if (!rgCode) {
      setScannerError('RG é obrigatório. Confirme o RG antes da etiqueta.');
      setScannerPhase('rg');
      return;
    }

    const tagCode = normalizeCodeInput(scannerPending.tag_code || scannerPreview.tag_code);
    if (!tagCode) {
      setScannerError('Nenhuma etiqueta válida foi identificada. Verifique novamente ou clique em "Próximo".');
      return;
    }

    setForm((prev) => ({
      ...prev,
      rg_code: rgCode,
      tag_code: tagCode
    }));
    setSuccess(`Leitura concluída. RG: ${rgCode} | Etiqueta: ${tagCode}`);
    closeScanner();
  }, [closeScanner, form.rg_code, scannerPending.tag_code, scannerPreview.tag_code]);

  const skipScannerTagStep = useCallback(() => {
    const rgCode = normalizeCodeInput(scannerDraftRef.current?.rg_code || form.rg_code);
    if (!rgCode) {
      setScannerError('RG é obrigatório. Confirme o RG antes de avançar.');
      setScannerPhase('rg');
      return;
    }

    setForm((prev) => ({
      ...prev,
      rg_code: rgCode
    }));
    setSuccess(`Leitura concluída. RG: ${rgCode}. Etiqueta não informada.`);
    closeScanner();
  }, [closeScanner, form.rg_code]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap'
        }}
      >
        <Box>
          <Typography variant="h5">Equipamentos</Typography>
          <Typography variant="body2" color="text.secondary">
            Gestão de equipamentos com foco em refrigeradores novos e alocados na base 02.02.20.
          </Typography>
        </Box>

        {canManageEquipments && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={() => setActiveScreen('manage')} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Cadastrar
            </Button>
            <Button
              variant="contained"
              startIcon={<CameraAltIcon />}
              onClick={openAllocationLookupScanner}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Scanear RG
            </Button>
          </Stack>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
        <CardContent sx={{ py: 0.5 }}>
          <Tabs
            value={activeScreen}
            onChange={(_, value) => setActiveScreen(value)}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            {screenOptions.map((item) => (
              <Tab key={item.value} value={item.value} label={item.label} />
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {isDashboardScreen && (
        <>
          <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
            <CardContent sx={{ display: 'grid', gap: 2 }}>
              <Typography variant="h6">Painel de refrigeradores</Typography>

              {loadingOverview ? (
                <Typography color="text.secondary">Carregando painel...</Typography>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' },
                    gap: 1.5
                  }}
                >
                  <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">Refrigeradores cadastrados</Typography>
                      <Typography variant="h5">{dashboard.total_cadastrados}</Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">Novos cadastrados</Typography>
                      <Typography variant="h5">{dashboard.novos_cadastrados}</Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">Disponíveis cadastrados</Typography>
                      <Typography variant="h5">{dashboard.disponiveis_cadastrados}</Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">Para reforma (Recap)</Typography>
                      <Typography variant="h5">{dashboard.recap_cadastrados}</Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">Para descarte (Sucata)</Typography>
                      <Typography variant="h5">{dashboard.sucata_cadastrados}</Typography>
                    </CardContent>
                  </Card>
                  <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                    <CardContent sx={{ display: 'grid', gap: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">Alocados na base 02.02.20</Typography>
                      <Typography variant="h5">{dashboard.alocados_020220_unidades}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {dashboard.alocados_020220_linhas} linhas | {dashboard.clientes_alocados_020220} clientes
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>
              )}
            </CardContent>
          </Card>

          <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
            <CardContent sx={{ display: 'grid', gap: 1.25 }}>
              <Typography variant="subtitle2">Acessos rápidos</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
                <Button variant="outlined" onClick={() => setActiveScreen('new-refrigerators')} fullWidth={isMobile}>
                  Ver não alocados
                </Button>
                <Button variant="outlined" onClick={() => setActiveScreen('materials')} fullWidth={isMobile}>
                  Ver materiais da base
                </Button>
                {canManageEquipments && (
                  <Button variant="contained" onClick={() => setActiveScreen('manage')} fullWidth={isMobile}>
                    Cadastrar equipamento
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
            <CardContent sx={{ display: 'grid', gap: 1.25 }}>
              <Typography variant="subtitle2">Verificação por RG/Etiqueta</Typography>
              {allocationLookupLoading ? (
                <Typography color="text.secondary">Consultando alocações...</Typography>
              ) : !allocationLookupResult ? (
                <Typography color="text.secondary">
                  Use o botão &quot;Scanear RG&quot; para consultar os dados dos equipamentos alocados.
                </Typography>
              ) : (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Consulta: RG {allocationLookupResult.rg_code || '-'} | Etiqueta {allocationLookupResult.tag_code || '-'}
                  </Typography>
                  {allocationLookupResult.items.length === 0 ? (
                    <Typography color="text.secondary">
                      Equipamento não encontrado na base 02.02.20 para o RG informado.
                    </Typography>
                  ) : isMobile ? (
                    <Box sx={SCROLLABLE_CARD_LIST_SX}>
                      {allocationLookupResult.items.map((item) => (
                        <Card key={item.inventory_item_id} sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                          <CardContent sx={{ display: 'grid', gap: 0.5, p: 1.25, '&:last-child': { pb: 1.25 } }}>
                            <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
                              {item.model_name || '-'}
                            </Typography>
                            <Typography variant="body2">Código do cliente: {item.client_code || '-'}</Typography>
                            <Typography variant="body2">Fantasia: {item.nome_fantasia || '-'}</Typography>
                            <Typography variant="body2">Setor: {item.setor || '-'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Emissão do contrato: {item.invoice_issue_date || '-'}
                            </Typography>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>
                  ) : (
                    <TableContainer sx={TABLE_CONTAINER_SX}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Código do cliente</TableCell>
                            <TableCell>Fantasia</TableCell>
                            <TableCell>Setor</TableCell>
                            <TableCell sx={COMPACT_MODEL_CELL_SX}>Descrição do equipamento</TableCell>
                            <TableCell>Emissão do contrato</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {allocationLookupResult.items.map((item) => (
                            <TableRow key={item.inventory_item_id}>
                              <TableCell>{item.client_code || '-'}</TableCell>
                              <TableCell>{item.nome_fantasia || '-'}</TableCell>
                              <TableCell>{item.setor || '-'}</TableCell>
                              <TableCell sx={COMPACT_MODEL_CELL_SX}>{item.model_name || '-'}</TableCell>
                              <TableCell>{item.invoice_issue_date || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {canManageEquipments && isManageScreen && (
        <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {editingId ? 'Editar equipamento' : 'Cadastrar novo equipamento'}
            </Typography>

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 1.5 }}>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }
                }}
              >
                <TextField
                  select
                  label="Categoria"
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    category: event.target.value,
                    voltage: event.target.value === 'refrigerador' ? prev.voltage : '',
                    rg_code: event.target.value === 'refrigerador' ? prev.rg_code : '',
                    tag_code: event.target.value === 'refrigerador' ? prev.tag_code : '',
                    status: event.target.value === 'refrigerador' ? prev.status : 'novo',
                    client_name: event.target.value === 'refrigerador' ? prev.client_name : '',
                    notes: event.target.value === 'refrigerador' ? prev.notes : '',
                    quantity: event.target.value === 'refrigerador' ? '1' : (prev.quantity || '1')
                  }))}
                  required
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Modelo"
                  value={form.model_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, model_name: event.target.value }))}
                  required
                />

                <TextField
                  label="Marca"
                  value={form.brand}
                  onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
                  required
                />

                {form.category === 'refrigerador' ? (
                  <>
                    <TextField
                      select
                      label="Voltagem"
                      value={form.voltage}
                      onChange={(event) => setForm((prev) => ({ ...prev, voltage: event.target.value }))}
                      required
                    >
                      {VOLTAGE_OPTIONS.map((item) => (
                        <MenuItem key={item.value || 'empty'} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      label="Status"
                      value={form.status}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        setForm((prev) => ({
                          ...prev,
                          status: nextStatus,
                        }));
                      }}
                      required
                    >
                      {STATUS_OPTIONS.map((item) => (
                        <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </TextField>
                  </>
                ) : (
                  <TextField
                    label="Quantidade"
                    type="number"
                    value={form.quantity}
                    onChange={(event) => setForm((prev) => ({ ...prev, quantity: normalizeQuantityInput(event.target.value) }))}
                    required
                    inputProps={{ min: 1, step: 1 }}
                  />
                )}
              </Box>

              {form.category === 'refrigerador' && (
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }
                  }}
                >
                  <TextField
                    label="RG"
                    value={form.rg_code}
                    onChange={(event) => setForm((prev) => ({ ...prev, rg_code: event.target.value }))}
                    required
                  />

                  <TextField
                    label="Etiqueta"
                    value={form.tag_code}
                    onChange={(event) => setForm((prev) => ({ ...prev, tag_code: event.target.value }))}
                    helperText="Opcional"
                  />
                </Box>
              )}

              {form.category === 'refrigerador' && (
                <Button
                  variant="outlined"
                  startIcon={<CameraAltIcon />}
                  onClick={openFullLabelScanner}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  Scanear
                </Button>
              )}

              {form.category === 'refrigerador' && (
                <TextField
                  label="Observação"
                  multiline
                  minRows={2}
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
                <Button type="submit" variant="contained" disabled={saving} fullWidth={isMobile}>
                  {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar equipamento'}
                </Button>

                {editingId && (
                  <Button type="button" variant="outlined" onClick={resetForm} fullWidth={isMobile}>
                    Cancelar edição
                  </Button>
                )}
              </Stack>

              <Box
                sx={{
                  mt: 1,
                  pt: 2,
                  borderTop: '1px solid var(--stroke)',
                  display: 'grid',
                  gap: 1.25,
                }}
              >
                <Typography variant="subtitle1">Importação em massa de refrigeradores</Typography>
                <Typography variant="body2" color="text.secondary">
                  Formato do CSV: Tipo, Modelo, Marca, Voltagem, RG e Etiqueta.
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
                  <Button
                    variant="outlined"
                    onClick={downloadBulkImportTemplate}
                    fullWidth={isMobile}
                  >
                    Baixar modelo CSV
                  </Button>
                  <input
                    ref={bulkImportInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleBulkImportFileChange}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => bulkImportInputRef.current?.click()}
                    fullWidth={isMobile}
                  >
                    Selecionar CSV
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleBulkImportSubmit}
                    disabled={!bulkImportFile || bulkImporting}
                    fullWidth={isMobile}
                  >
                    {bulkImporting ? 'Importando...' : 'Importar refrigeradores'}
                  </Button>
                  {bulkImportFile && (
                    <Button
                      variant="text"
                      onClick={clearBulkImportSelection}
                      disabled={bulkImporting}
                      fullWidth={isMobile}
                    >
                      Limpar
                    </Button>
                  )}
                </Stack>

                {bulkImportFile && (
                  <Typography variant="caption" color="text.secondary">
                    Arquivo selecionado: {bulkImportFile.name}
                  </Typography>
                )}

                {bulkImportResult && (
                  <Alert severity="info" sx={{ mt: 0.5 }}>
                    {`Total lido: ${Number(bulkImportResult.total_rows || 0)} | `}
                    {`Importados: ${Number(bulkImportResult.imported_count || 0)} | `}
                    {`Duplicados por código (RG/Etiqueta): ${Number(bulkImportResult.duplicated_by_rg || 0)} | `}
                    {`Duplicados no CSV: ${Number(bulkImportResult.duplicates_in_file || 0)} | `}
                    {`Duplicados na base 02.02.20: ${Number(bulkImportResult.duplicates_in_020220 || 0)} | `}
                    {`Duplicados no cadastro: ${Number(bulkImportResult.duplicates_in_cadastro || 0)} | `}
                    {`Inválidos: ${Number(bulkImportResult.invalid_rows || 0)} | `}
                    {`Ignorados (não refrigerador): ${Number(bulkImportResult.ignored_non_refrigerator || 0)}`}
                  </Alert>
                )}

                {Array.isArray(bulkImportResult?.errors) && bulkImportResult.errors.length > 0 && (
                  <Alert severity="warning">
                    {bulkImportResult.errors.slice(0, 10).join(' | ')}
                  </Alert>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {(isNewRefrigeratorsScreen || isMaterialsScreen) && (
        <>
          <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
            <CardContent sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6">
                  {isMaterialsScreen ? 'Filtros de materiais da base 02.02.20' : 'Filtros de refrigeradores disponíveis'}
                </Typography>
                <Button variant="outlined" onClick={() => refreshData({ notifySync: true })} fullWidth={isMobile}>Atualizar dados</Button>
              </Box>
              {isMaterialsScreen ? (
                <>
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 1.5,
                      gridTemplateColumns: { xs: '1fr', md: '2fr minmax(290px, 2.5fr) 1fr 1fr' }
                    }}
                  >
                    <TextField
                      label="Pesquisar materiais (02.02.20)"
                      placeholder="Modelo, RG, tipo, cliente ou comodato"
                      value={materialsFilters.q}
                      onChange={(event) => setMaterialsFilters((prev) => ({ ...prev, q: event.target.value }))}
                    />
                    <TextField
                      label="Mês/Ano"
                      value={selectedMonthYearValue}
                      placeholder="MM/AAAA"
                      onClick={openMonthPicker}
                      InputProps={{
                        readOnly: true,
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(event) => {
                                event.stopPropagation();
                                openMonthPicker(event);
                              }}
                            >
                              <CalendarMonthIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          cursor: 'pointer',
                        }
                      }}
                    />
                    {isMobile ? (
                      <Dialog open={monthPickerOpen} onClose={closeMonthPicker} fullWidth maxWidth="xs">
                        <DialogTitle>Selecionar mês/ano</DialogTitle>
                        <DialogContent>{monthPickerPanel}</DialogContent>
                        <DialogActions>
                          <Button onClick={closeMonthPicker}>Fechar</Button>
                        </DialogActions>
                      </Dialog>
                    ) : (
                      <Popover
                        open={monthPickerOpen}
                        anchorEl={monthPickerAnchorEl}
                        onClose={closeMonthPicker}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                      >
                        {monthPickerPanel}
                      </Popover>
                    )}
                    <TextField
                      select
                      label="Tipo de material"
                      value={materialsFilters.item_type}
                      onChange={(event) => setMaterialsFilters((prev) => ({ ...prev, item_type: event.target.value }))}
                    >
                      {MATERIAL_TYPE_OPTIONS.map((item) => (
                        <MenuItem key={item.value || 'all'} value={item.value}>
                          {item.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Ordenação"
                      value={materialsFilters.sort}
                      onChange={(event) => setMaterialsFilters((prev) => ({ ...prev, sort: event.target.value }))}
                    >
                      <MenuItem value="newest">Do mais novo para o mais antigo</MenuItem>
                      <MenuItem value="oldest">Do mais antigo para o mais novo</MenuItem>
                    </TextField>
                  </Box>
                </>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }
                  }}
                >
                  <TextField
                    label="Pesquisar refrigeradores disponíveis"
                    placeholder="Modelo, marca, RG, etiqueta ou voltagem"
                    value={overviewSearch}
                    onChange={(event) => setOverviewSearch(event.target.value)}
                  />
                  <TextField
                    select
                    label="Status"
                    value={nonAllocatedStatusFilter}
                    onChange={(event) => setNonAllocatedStatusFilter(event.target.value)}
                  >
                    {NON_ALLOCATED_STATUS_OPTIONS.map((item) => (
                      <MenuItem key={item.value} value={item.value}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Ordenação"
                    value={materialsFilters.sort}
                    onChange={(event) => setMaterialsFilters((prev) => ({ ...prev, sort: event.target.value }))}
                  >
                    <MenuItem value="newest">Do mais novo para o mais antigo</MenuItem>
                    <MenuItem value="oldest">Do mais antigo para o mais novo</MenuItem>
                  </TextField>
                </Box>
              )}
            </CardContent>
          </Card>

          {isNewRefrigeratorsScreen && (
            <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
              <CardContent sx={{ display: 'grid', gap: 1.25 }}>
                <Typography variant="h6">Refrigeradores disponíveis (não alocados)</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1 }}>
                  <Chip size="small" label={`Total: ${nonAllocatedDashboard.total_nao_alocados}`} />
                  <Chip size="small" color="success" label={`Disponíveis: ${nonAllocatedAvailableCount}`} />
                  <Chip size="small" color="warning" label={`Recap: ${nonAllocatedDashboard.recap}`} />
                  <Chip size="small" color="error" label={`Sucata: ${nonAllocatedDashboard.sucata}`} />
                </Box>
                {loadingNewRefrigerators ? (
                  <Typography color="text.secondary">Carregando refrigeradores não alocados...</Typography>
                ) : newRefrigerators.length === 0 ? (
                  <Typography color="text.secondary">Nenhum refrigerador disponível encontrado.</Typography>
                ) : (
                  <>
                    {isMobile ? (
                      <Box sx={SCROLLABLE_CARD_LIST_SX}>
                        {newRefrigerators.map((item) => {
                          const normalizedStatus = normalizeNonAllocatedStatus(item.status);
                          const statusLabel = nonAllocatedStatusLabelByValue[normalizedStatus] || item.status || '-';
                          return (
                            <Card key={item.id} sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                              <CardContent sx={{ display: 'grid', gap: 0.5, p: 1.25, '&:last-child': { pb: 1.25 } }}>
                                <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
                                  {item.model_name || '-'}
                                </Typography>
                                <Typography variant="body2">Marca: {item.brand || '-'}</Typography>
                                <Typography variant="body2">RG: {item.rg_code || '-'}</Typography>
                                <Typography variant="body2">Etiqueta: {item.tag_code || '-'}</Typography>
                                <Typography variant="body2">Status: {statusLabel}</Typography>
                                <Typography variant="body2">
                                  Voltagem: {voltageByValue[item.voltage] || item.voltage || 'Não informado'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Cadastrado: {formatDateTime(item.created_at)}
                                </Typography>
                                {canManageEquipments && (
                                  <Button
                                    color="error"
                                    variant="outlined"
                                    size="small"
                                    startIcon={<DeleteOutlineIcon fontSize="small" />}
                                    onClick={() => handleDeleteNonAllocatedEquipment(item)}
                                    disabled={deletingEquipmentId === Number(item.id)}
                                    sx={{ mt: 0.5 }}
                                  >
                                    {deletingEquipmentId === Number(item.id) ? 'Excluindo...' : 'Excluir'}
                                  </Button>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Box>
                    ) : (
                      <TableContainer sx={TABLE_CONTAINER_SX}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={COMPACT_MODEL_CELL_SX}>Modelo</TableCell>
                              <TableCell>Marca</TableCell>
                              <TableCell>RG</TableCell>
                              <TableCell>Etiqueta</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Voltagem</TableCell>
                              <TableCell>Cadastrado em</TableCell>
                              {canManageEquipments && <TableCell align="right">Ações</TableCell>}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {newRefrigerators.map((item) => {
                              const normalizedStatus = normalizeNonAllocatedStatus(item.status);
                              const statusLabel = nonAllocatedStatusLabelByValue[normalizedStatus] || item.status || '-';
                              return (
                                <TableRow key={item.id}>
                                  <TableCell sx={COMPACT_MODEL_CELL_SX}>{item.model_name}</TableCell>
                                  <TableCell>{item.brand || '-'}</TableCell>
                                  <TableCell>{item.rg_code}</TableCell>
                                  <TableCell>{item.tag_code}</TableCell>
                                  <TableCell>{statusLabel}</TableCell>
                                  <TableCell>{voltageByValue[item.voltage] || item.voltage || 'Não informado'}</TableCell>
                                  <TableCell>{formatDateTime(item.created_at)}</TableCell>
                                  {canManageEquipments && (
                                    <TableCell align="right">
                                      <Button
                                        color="error"
                                        variant="outlined"
                                        size="small"
                                        startIcon={<DeleteOutlineIcon fontSize="small" />}
                                        onClick={() => handleDeleteNonAllocatedEquipment(item)}
                                        disabled={deletingEquipmentId === Number(item.id)}
                                      >
                                        {deletingEquipmentId === Number(item.id) ? 'Excluindo...' : 'Excluir'}
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                    <PaginationFooter
                      offset={newRefrigeratorsPage.offset}
                      limit={newRefrigeratorsPage.limit}
                      total={newRefrigeratorsPage.total}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isMaterialsScreen && (
            <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
              <CardContent sx={{ display: 'grid', gap: 1.25 }}>
                <Typography variant="h6">Materiais alocados (base 02.02.20)</Typography>
                {loadingMaterials ? (
                  <Typography color="text.secondary">Carregando materiais...</Typography>
                ) : inventoryMaterials.length === 0 ? (
                  <Typography color="text.secondary">Nenhum material encontrado para os filtros atuais.</Typography>
                ) : (
                  <>
                    {isMobile ? (
                      <Box sx={SCROLLABLE_CARD_LIST_SX}>
                        {inventoryMaterials.map((item) => (
                          <Card key={item.inventory_item_id} sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
                            <CardContent sx={{ display: 'grid', gap: 0.5, p: 1.25, '&:last-child': { pb: 1.25 } }}>
                              <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
                                {item.model_name || '-'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {materialTypeByValue[item.item_type] || item.item_type || '-'}
                              </Typography>
                              <Typography variant="body2">Cliente: {item.nome_fantasia || '-'}</Typography>
                              <Typography variant="body2">Código: {item.client_code || '-'}</Typography>
                              <Typography variant="body2">RG: {item.rg_code || '-'}</Typography>
                              <Typography variant="body2">Qtd.: {item.quantity}</Typography>
                              <Typography variant="body2">Nota: {item.comodato_number || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                Emissão: {item.invoice_issue_date || '-'}
                              </Typography>
                            </CardContent>
                          </Card>
                        ))}
                      </Box>
                    ) : (
                      <TableContainer sx={TABLE_CONTAINER_SX}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Tipo</TableCell>
                              <TableCell>Cliente</TableCell>
                              <TableCell>Código</TableCell>
                              <TableCell sx={COMPACT_MODEL_CELL_SX}>Material</TableCell>
                              <TableCell>RG</TableCell>
                              <TableCell>Qtd.</TableCell>
                              <TableCell>Nota</TableCell>
                              <TableCell>Emissão</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {inventoryMaterials.map((item) => (
                              <TableRow key={item.inventory_item_id}>
                                <TableCell>{materialTypeByValue[item.item_type] || item.item_type || '-'}</TableCell>
                                <TableCell>{item.nome_fantasia || '-'}</TableCell>
                                <TableCell>{item.client_code || '-'}</TableCell>
                                <TableCell sx={COMPACT_MODEL_CELL_SX}>{item.model_name || '-'}</TableCell>
                                <TableCell>{item.rg_code || '-'}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>{item.comodato_number || '-'}</TableCell>
                                <TableCell>{item.invoice_issue_date || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                    <PaginationFooter
                      offset={inventoryPage.offset}
                      limit={inventoryPage.limit}
                      total={inventoryPage.total}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isMaterialsScreen && (
            <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'var(--shadow-md)' }}>
              <CardContent
                sx={{
                  display: 'flex',
                  alignItems: { xs: 'stretch', sm: 'center' },
                  justifyContent: 'space-between',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5
                }}
              >
                <Box>
                  <Typography variant="subtitle2">Período atual: {selectedMonthYearValue || '-'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Use o seletor de mês/ano apenas quando quiser escolher uma data específica.
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                  <Button
                    variant="contained"
                    onClick={handlePreviousPeriod}
                    disabled={!hasPreviousPeriod}
                    fullWidth={isMobile}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleNextPeriod}
                    disabled={!hasNextPeriod}
                    fullWidth={isMobile}
                  >
                    Próximo
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={scannerOpen} onClose={closeScanner} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle>{scannerMode === 'allocation' ? 'Scanear RG para verificar alocação' : 'Scanear equipamento'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {scannerStep || 'Aponte a câmera para o RG. A leitura será automática.'}
          </Typography>

          <Box
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
              border: '1px solid var(--stroke)',
              backgroundColor: '#111',
              position: 'relative'
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', display: 'block', maxHeight: isMobile ? '60vh' : 320, objectFit: 'cover' }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none'
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: `${activeScannerArea.top * 100}%`,
                  left: `${activeScannerArea.left * 100}%`,
                  width: `${activeScannerArea.width * 100}%`,
                  height: `${activeScannerArea.height * 100}%`,
                  border: `3px solid ${activeScannerArea.borderColor}`,
                  borderRadius: 1.5,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.2)'
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    top: -22,
                    left: 0,
                    px: 0.75,
                    borderRadius: 0.75,
                    bgcolor: activeScannerArea.labelColor,
                    color: activeScannerArea.labelTextColor,
                    fontWeight: 700
                  }}
                >
                  {activeScannerArea.label}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary">
            {scannerPhase === 'rg'
              ? 'RG: leitura automática no retângulo vermelho.'
              : 'Etiqueta (opcional): leitura automática no retângulo amarelo.'}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Confirmado: RG {scannerDraft.rg_code || '-'} | Etiqueta {scannerDraft.tag_code || '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Detectado: RG {scannerPending.rg_code || scannerPreview.rg_code || '-'} | Etiqueta {scannerPending.tag_code || scannerPreview.tag_code || '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Prévia OCR: RG {scannerPreview.rg_code || '-'} | Etiqueta {scannerPreview.tag_code || '-'}
          </Typography>
          {scannerPreview.raw_text && (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontFamily: 'var(--font-mono)',
                p: 0.75,
                borderRadius: 1,
                border: '1px dashed var(--stroke)',
                bgcolor: 'var(--surface-soft)'
              }}
            >
              {scannerPreview.raw_text}
            </Typography>
          )}
          {ocrBusy && <LinearProgress />}

          {scannerError && <Alert severity="warning">{scannerError}</Alert>}

          {scannerMode === 'allocation' && (
            <Card sx={{ border: '1px solid var(--stroke)', boxShadow: 'none' }}>
              <CardContent sx={{ display: 'grid', gap: 1 }}>
                <Typography variant="subtitle2">Resultado em tempo real (02.02.20)</Typography>
                {!scannerRealtimeLookup && !scannerRealtimeLookupLoading && (
                  <Typography variant="body2" color="text.secondary">
                    Aguardando leitura do RG...
                  </Typography>
                )}
                {scannerRealtimeLookupLoading && (
                  <Typography variant="body2" color="text.secondary">
                    Consultando alocação do RG {scannerPending.rg_code || scannerPreview.rg_code || '-'}...
                  </Typography>
                )}
                {!scannerRealtimeLookupLoading && scannerRealtimeLookup && (
                  <>
                    <Typography variant="caption" color="text.secondary">
                      RG consultado: {scannerRealtimeLookup.rg_code || '-'}
                    </Typography>
                    {Array.isArray(scannerRealtimeLookup.items) && scannerRealtimeLookup.items.length > 0 ? (
                      <Box sx={{ display: 'grid', gap: 0.75, maxHeight: 180, overflowY: 'auto' }}>
                        {scannerRealtimeLookup.items.map((item) => (
                          <Box
                            key={item.inventory_item_id}
                            sx={{
                              p: 1,
                              borderRadius: 1,
                              border: '1px solid var(--stroke)',
                              bgcolor: 'var(--surface-soft)'
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {item.model_name || '-'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              Código do cliente: {item.client_code || '-'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              Nome: {item.nome_fantasia || '-'}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary">
                              Setor: {item.setor || '-'}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Alert severity="info">Equipamento não encontrado na base 02.02.20 para o RG informado.</Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </DialogContent>

        <DialogActions sx={{ flexDirection: isMobile ? 'column-reverse' : 'row', gap: 1 }}>
          <Button onClick={closeScanner} fullWidth={isMobile}>Fechar</Button>
          {!scannerAwaitingConfirmation && !(scannerMode === 'form' && scannerPhase === 'tag') && (
            <Button variant="outlined" onClick={triggerScannerReadNow} disabled={ocrBusy} fullWidth={isMobile}>
              {ocrBusy ? 'Processando...' : 'Tentar leitura agora'}
            </Button>
          )}
          {scannerAwaitingConfirmation && (
            <Button variant="outlined" onClick={retryScannerDetection} disabled={ocrBusy} fullWidth={isMobile}>
              Tentar novamente
            </Button>
          )}
          {scannerAwaitingConfirmation && scannerMode === 'form' && scannerPhase === 'rg' && (
            <Button
              variant="contained"
              onClick={confirmScannerRg}
              disabled={ocrBusy || !normalizeCodeInput(scannerPending.rg_code || scannerPreview.rg_code)}
              fullWidth={isMobile}
            >
              Confirmar RG
            </Button>
          )}
          {scannerMode === 'form' && scannerPhase === 'tag' && (
            <Button
              variant="outlined"
              onClick={skipScannerTagStep}
              disabled={ocrBusy || !scannerHasRequiredRg}
              fullWidth={isMobile}
            >
              Próximo
            </Button>
          )}
          {scannerAwaitingConfirmation && scannerMode === 'form' && scannerPhase === 'tag' && (
            <Button
              variant="contained"
              onClick={confirmScannerTag}
              disabled={ocrBusy || !normalizeCodeInput(scannerPending.tag_code || scannerPreview.tag_code)}
              fullWidth={isMobile}
            >
              Confirmar etiqueta
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EquipmentPage;


