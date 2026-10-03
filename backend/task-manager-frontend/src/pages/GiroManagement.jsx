import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

import api from '../services/api';
import { hasPermission } from '../utils/auth';

const currency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(Number(value || 0));

const monthLabel = (month) => {
  const [year, number] = String(month || '').split('-');
  const date = new Date(Number(year), Number(number) - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date);
};

const apiError = (error) => error?.response?.data?.detail || 'Não foi possível carregar os dados do Giro.';

const SummaryCards = ({ summary, type }) => {
  const cards = [
    { label: `Equipamentos ${type}`, value: summary.equipment_count },
    { label: 'Giro OK', value: `${summary.giro_ok_percent}%` },
    { label: 'Clientes fora da meta', value: summary.clients_not_meeting },
    { label: 'Faturamento do mês', value: currency(summary.current_sales) },
    { label: 'Meta dos PDVs', value: currency(summary.monthly_target) },
    { label: 'GAP total', value: currency(summary.gap) }
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
      {cards.map((card) => (
        <Card key={card.label} variant="outlined">
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography color="text.secondary" variant="body2">{card.label}</Typography>
            <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}>{card.value}</Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

const QuarterSummary = ({ summary, type }) => (
  <Paper variant="outlined" sx={{ p: 2 }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
      TRI {type} · {summary.months.map(monthLabel).join(' · ')}
    </Typography>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mt: 1 }}>
      <Typography>Meta TRI (média simples): {summary.target_percent === null ? 'indisponível' : `${summary.target_percent}%`}</Typography>
      <Typography>Real TRI (ponderado até o mês atual): {summary.real_percent === null ? 'indisponível' : `${summary.real_percent}%`}</Typography>
    </Stack>
    {summary.missing_target_months.length > 0 && (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Faltam metas para: {summary.missing_target_months.map(monthLabel).join(', ')}.
      </Typography>
    )}
    {summary.missing_equipment_months.length > 0 && (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Para calcular o real ponderado, importe os snapshots de equipamentos de: {summary.missing_equipment_months.map(monthLabel).join(', ')}.
      </Typography>
    )}
  </Paper>
);

const SummaryTable = ({ title, rows }) => (
  <Box>
    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{title === 'Por setor' ? 'Setor' : title === 'Por mesa' ? 'Mesa' : 'Cidade'}</TableCell>
            <TableCell align="right">VISA OK</TableCell>
            <TableCell align="right">GAP VISA</TableCell>
            <TableCell align="right">SOPI OK</TableCell>
            <TableCell align="right">GAP SOPI</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell>{row.name || 'Sem informação'}</TableCell>
              <TableCell align="right">{row.visa.giro_ok_percent}%</TableCell>
              <TableCell align="right">{currency(row.visa.gap)}</TableCell>
              <TableCell align="right">{row.sopi.giro_ok_percent}%</TableCell>
              <TableCell align="right">{currency(row.sopi.gap)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={5}>Sem equipamentos elegíveis.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>
  </Box>
);

const GiroManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const canManage = hasPermission('giro.manage');
  const pathPart = location.pathname.split('/')[2] || 'overview';
  const activeTab = ['visa', 'sopi'].includes(pathPart) ? pathPart : 'overview';
  const [imports, setImports] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [mesa, setMesa] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const importsByDataset = useMemo(
    () => Object.fromEntries(imports.map((item) => [item.dataset, item])),
    [imports]
  );
  const ready = ['clients', 'equipment', 'sales', 'targets'].every((dataset) => importsByDataset[dataset]);
  const equipmentType = activeTab === 'sopi' ? 'sopi' : 'visa';

  useEffect(() => {
    if (pathPart === 'imports') {
      navigate(canManage ? '/base-retiradas' : '/giro', { replace: true });
    }
  }, [canManage, navigate, pathPart]);

  const loadImports = useCallback(async () => {
    setLoadingImports(true);
    try {
      const response = await api.get('/giro/imports');
      setImports(response.data.imports || []);
      setSectors(response.data.sectors || []);
      setCities(response.data.cities || []);
      setError('');
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setLoadingImports(false);
    }
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!ready || activeTab !== 'overview') {
      setOverview(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingReport(true);
    api.get('/giro/overview', { params: { city } })
      .then((response) => {
        if (!cancelled) {
          setOverview(response.data);
          setError('');
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(apiError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, city, ready]);

  useEffect(() => {
    if (!ready || !['visa', 'sopi'].includes(activeTab)) {
      setReport(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingReport(true);
    api.get(`/giro/reports/${equipmentType}`, {
      params: {
        sector,
        city,
        mesa,
        search: debouncedSearch,
        page,
        page_size: 100
      }
    })
      .then((response) => {
        if (!cancelled) {
          setReport(response.data);
          setError('');
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(apiError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, city, debouncedSearch, equipmentType, mesa, page, ready, sector]);

  const exportReport = async () => {
    try {
      setError('');
      const response = await api.get(`/giro/reports/${equipmentType}/export`, {
        params: { sector, city, mesa, search: debouncedSearch },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `giro-${equipmentType}-${report?.months?.[3] || 'atual'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(apiError(requestError));
    }
  };

  const changeTab = (_, value) => {
    navigate(value === 'overview' ? '/giro' : `/giro/${value}`);
    setPage(1);
    setError('');
  };

  return (
    <Box sx={{ display: 'grid', gap: 2, p: { xs: 1.5, md: 3 } }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Gestão de Giro</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          VISA: R$ 1.200 por refrigerador · SOPI: R$ 2.000 por refrigerador · somente equipamentos com saldo, instalados desde 01/01/2023.
        </Typography>
      </Box>

      <Tabs value={activeTab} onChange={changeTab} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="overview" label="Resultado mensal" />
        <Tab value="visa" label="Giro VISA" />
        <Tab value="sopi" label="Giro SOPI" />
      </Tabs>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {loadingImports && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}

      {!loadingImports && !ready && (
        <Alert severity="info">
          Atualize as bases compartilhadas 01.20.11/02.02.20 e importe 03.02.37 - 3 M e METAS em “Atualizar base”.
          {canManage
            ? <Button sx={{ ml: 1 }} onClick={() => navigate('/base-retiradas')}>Ir para atualização de bases</Button>
            : ' Solicite a um usuário com permissão para atualizar as bases.'}
        </Alert>
      )}

      {!loadingImports && ready && activeTab === 'overview' && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }}>
            <Typography variant="h6">
              {overview ? `Competência ${monthLabel(overview.month)}` : 'Resultado do mês vigente'}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="giro-overview-city-label">Cidade</InputLabel>
              <Select
                labelId="giro-overview-city-label"
                label="Cidade"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              >
                <MenuItem value="">Todas as cidades</MenuItem>
                {cities.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          {loadingReport && <CircularProgress size={28} />}
          {overview && (
            <>
              <SummaryCards summary={overview.visa} type="VISA" />
              <QuarterSummary summary={overview.visa_tri} type="VISA" />
              <SummaryCards summary={overview.sopi} type="SOPI" />
              <QuarterSummary summary={overview.sopi_tri} type="SOPI" />
              <SummaryTable title="Por setor" rows={overview.by_sector} />
              <SummaryTable title="Por mesa" rows={overview.by_mesa} />
              <SummaryTable title="Por cidade" rows={overview.by_city} />
            </>
          )}
        </Box>
      )}

      {!loadingImports && ready && ['visa', 'sopi'].includes(activeTab) && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Typography variant="h6">{equipmentType.toUpperCase()} · {report?.months?.[3] ? monthLabel(report.months[3]) : 'mês atual'}</Typography>
          {report && <SummaryCards summary={report.summary} type={equipmentType.toUpperCase()} />}
          {report && <QuarterSummary summary={report.tri} type={equipmentType.toUpperCase()} />}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="giro-sector-label">Setor</InputLabel>
              <Select
                labelId="giro-sector-label"
                label="Setor"
                value={sector}
                onChange={(event) => { setSector(event.target.value); setPage(1); }}
              >
                <MenuItem value="">Todos os setores</MenuItem>
                {sectors.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="giro-city-label">Cidade</InputLabel>
              <Select
                labelId="giro-city-label"
                label="Cidade"
                value={city}
                onChange={(event) => { setCity(event.target.value); setPage(1); }}
              >
                <MenuItem value="">Todas as cidades</MenuItem>
                {cities.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="giro-mesa-label">Mesa</InputLabel>
              <Select
                labelId="giro-mesa-label"
                label="Mesa"
                value={mesa}
                onChange={(event) => { setMesa(event.target.value); setPage(1); }}
              >
                <MenuItem value="">Todas as mesas</MenuItem>
                {['Mesa 5', 'Mesa 6', 'Outros'].map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Buscar PDV"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              sx={{ minWidth: 220 }}
            />
            <Button variant="contained" onClick={exportReport} disabled={!report || loadingReport}>
              Exportar Excel
            </Button>
          </Stack>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Código PDV', 'Fantasia', 'Documento', 'Status', 'Frequência', 'Equip.', ...(report?.months || []).map(monthLabel), 'Meta PDV', 'GAP', 'Giro'].map((label) => (
                    <TableCell key={label} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingReport && <TableRow><TableCell colSpan={13} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
                {!loadingReport && report?.items.map((item) => (
                  <TableRow key={item.client_code} hover>
                    <TableCell>{item.client_code}</TableCell>
                    <TableCell>{item.fantasy_name || '-'}</TableCell>
                    <TableCell>{item.document || '-'}</TableCell>
                    <TableCell>{item.client_status || '-'}</TableCell>
                    <TableCell>{item.frequency || '-'}</TableCell>
                    <TableCell>{item.equipment_count}</TableCell>
                    {report.months.map((month) => <TableCell key={month}>{currency(item.month_sales[month])}</TableCell>)}
                    <TableCell>{currency(item.monthly_target)}</TableCell>
                    <TableCell sx={{ color: item.gap > 0 ? 'error.main' : 'success.main' }}>{currency(item.gap)}</TableCell>
                    <TableCell>{item.giro_status}</TableCell>
                  </TableRow>
                ))}
                {!loadingReport && report?.items.length === 0 && (
                  <TableRow><TableCell colSpan={13} align="center">Nenhum PDV encontrado para os filtros selecionados.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {report && report.total_items > report.page_size && (
            <Pagination
              count={Math.ceil(report.total_items / report.page_size)}
              page={page}
              onChange={(_, value) => setPage(value)}
              sx={{ display: 'flex', justifyContent: 'center' }}
            />
          )}
        </Box>
      )}

    </Box>
  );
};

export default GiroManagement;
