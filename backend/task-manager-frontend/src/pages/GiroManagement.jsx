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
    { label: `Base ${type}`, value: summary.equipment_count },
    { label: 'Giro OK', value: summary.giro_ok_equipment },
    { label: 'Giro NOK', value: summary.giro_nok_equipment },
    { label: 'Meta', value: summary.target_percent === null ? '—' : `${summary.target_percent}%` },
    { label: 'Atingimento real', value: `${summary.giro_ok_percent}%` },
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

const SummaryTable = ({ rows }) => {
  const mesaOrder = ['Mesa 5', 'Mesa 6', 'Outros'];
  const mesaGroups = mesaOrder
    .map((mesa) => ({ mesa, rows: rows.filter((row) => row.mesa === mesa) }))
    .filter((group) => group.rows.length > 0);

  return (
  <Box>
    <Typography variant="h6" sx={{ mb: 1 }}>Resultado por mesa e setor</Typography>
    {mesaGroups.map(({ mesa, rows: sectorRows }) => (
      <Box key={mesa} sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.75 }}>{mesa}</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2}>Setor</TableCell>
                <TableCell align="center" colSpan={6}>VISA</TableCell>
                <TableCell align="center" colSpan={6}>SOPI</TableCell>
              </TableRow>
              <TableRow>
                {['Base', 'OK', 'NOK', 'Meta', 'Real', 'GAP', 'Base', 'OK', 'NOK', 'Meta', 'Real', 'GAP'].map((label, index) => (
                  <TableCell key={`${label}-${index}`} align="right">{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sectorRows.map((row) => (
                <TableRow key={row.name} hover>
                  <TableCell>{row.name || 'Sem informação'}</TableCell>
                  {[row.visa, row.sopi].flatMap((summary) => [
                    summary.equipment_count,
                    summary.giro_ok_equipment,
                    summary.giro_nok_equipment,
                    summary.target_percent === null ? '—' : `${summary.target_percent}%`,
                    `${summary.giro_ok_percent}%`,
                    currency(summary.gap)
                  ]).map((value, index) => (
                    <TableCell key={`${row.name}-${index}`} align="right" sx={{ whiteSpace: 'nowrap' }}>{value}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    ))}
    {rows.length === 0 && <Alert severity="info">Sem equipamentos elegíveis nesta competência.</Alert>}
  </Box>
  );
};

const GiroManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const canManage = hasPermission('giro.manage');
  const pathPart = location.pathname.split('/')[2] || 'overview';
  const activeTab = ['visa', 'sopi'].includes(pathPart) ? pathPart : 'overview';
  const [imports, setImports] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [cities, setCities] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [salesMonthsByEquipment, setSalesMonthsByEquipment] = useState({ visa: [], sopi: [] });
  const [selectedMonth, setSelectedMonth] = useState('');
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
      const months = response.data.available_months || [];
      setAvailableMonths(months);
      const salesMonths = response.data.sales_months_by_equipment || { visa: [], sopi: [] };
      setSalesMonthsByEquipment(salesMonths);
      const latestMonthWithSales = months.find((month) => (
        Object.values(salesMonths).some((equipmentMonths) => equipmentMonths.includes(month))
      ));
      setSelectedMonth((current) => (
        months.includes(current) ? current : (latestMonthWithSales || months[0] || '')
      ));
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
    api.get('/giro/overview', { params: { city, month: selectedMonth } })
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
  }, [activeTab, city, ready, selectedMonth]);

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
        month: selectedMonth,
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
  }, [activeTab, city, debouncedSearch, equipmentType, mesa, page, ready, sector, selectedMonth]);

  const exportReport = async () => {
    try {
      setError('');
      const response = await api.get(`/giro/reports/${equipmentType}/export`, {
        params: { sector, city, mesa, month: selectedMonth, search: debouncedSearch },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `giro-${equipmentType}-${selectedMonth || 'atual'}.xlsx`;
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
  const availableYears = [...new Set(availableMonths.map((month) => month.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const selectedYear = selectedMonth.slice(0, 4);
  const monthsInSelectedYear = availableMonths
    .filter((month) => month.startsWith(`${selectedYear}-`))
    .sort((a, b) => b.localeCompare(a));
  const chooseYear = (year) => {
    const monthForYear = availableMonths.find((month) => month.startsWith(`${year}-`));
    if (monthForYear) {
      setSelectedMonth(monthForYear);
      setPage(1);
    }
  };
  const monthFilter = (
    <Stack spacing={0.75} sx={{ minWidth: 0, maxWidth: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary">Competência</Typography>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel id="giro-year-label">Ano</InputLabel>
          <Select
            labelId="giro-year-label"
            label="Ano"
            value={selectedYear}
            onChange={(event) => chooseYear(event.target.value)}
          >
            {availableYears.map((year) => <MenuItem key={year} value={year}>{year}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>
      <Box
        role="group"
        aria-label="Selecionar mês"
        sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', maxWidth: '100%', pb: 0.5 }}
      >
        {monthsInSelectedYear.map((option) => {
          const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
            .format(new Date(Number(selectedYear), Number(option.slice(5, 7)) - 1, 1))
            .replace('.', '');
          return (
            <Button
              key={option}
              size="small"
              variant={selectedMonth === option ? 'contained' : 'outlined'}
              aria-pressed={selectedMonth === option}
              onClick={() => { setSelectedMonth(option); setPage(1); }}
              sx={{ flex: '0 0 auto', minWidth: 64 }}
            >
              {monthName}
            </Button>
          );
        })}
      </Box>
      {selectedMonth && (
        <Typography variant="caption" color="text.secondary">
          {monthLabel(selectedMonth)}
        </Typography>
      )}
    </Stack>
  );
  const missingSalesTypes = ['visa', 'sopi'].filter(
      (type) => !salesMonthsByEquipment[type]?.includes(selectedMonth)
  );

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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              {monthFilter}
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
          </Stack>
          {overview?.equipment_is_estimated && (
            <Alert severity="info">
              Estimativa de equipamentos para {monthLabel(selectedMonth)}: VISA usa a base de {monthLabel(overview.visa_equipment_reference_month)} e SOPI usa a base de {monthLabel(overview.sopi_equipment_reference_month)}. O histórico de faturamento permanece referente à competência selecionada.
            </Alert>
          )}
          {missingSalesTypes.length > 0 && selectedMonth && (
            <Alert severity="warning">
              Não há faturamento {missingSalesTypes.map((type) => type.toUpperCase()).join(' ou ')} importado para {monthLabel(selectedMonth)}; o cálculo desse tipo considera faturamento zero.
            </Alert>
          )}
          {loadingReport && <CircularProgress size={28} />}
          {overview && (
            <>
              <SummaryCards summary={overview.visa} type="VISA" />
              <SummaryCards summary={overview.sopi} type="SOPI" />
              <SummaryTable rows={overview.by_sector} />
            </>
          )}
        </Box>
      )}

      {!loadingImports && ready && ['visa', 'sopi'].includes(activeTab) && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }}>
            <Typography variant="h6">{equipmentType.toUpperCase()} · {selectedMonth ? monthLabel(selectedMonth) : 'mês atual'}</Typography>
            {monthFilter}
          </Stack>
          {report && <SummaryCards summary={report.summary} type={equipmentType.toUpperCase()} />}
          {report?.equipment_is_estimated && (
            <Alert severity="info">
              Estimativa de equipamentos para {monthLabel(selectedMonth)}: usando a base de {monthLabel(report.equipment_reference_month)}. O histórico de faturamento permanece referente à competência selecionada.
            </Alert>
          )}
          {!salesMonthsByEquipment[equipmentType]?.includes(selectedMonth) && selectedMonth && (
            <Alert severity="warning">
              Não há faturamento {equipmentType.toUpperCase()} importado para {monthLabel(selectedMonth)}; o cálculo considera faturamento zero.
            </Alert>
          )}
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
                  {['Código PDV', 'Fantasia', 'Setor', 'Cidade', 'Status', 'Frequência', 'Equip.', ...(report?.months || []).map(monthLabel), 'Última compra (mês)', 'Meta PDV', 'GAP', 'Giro'].map((label) => (
                    <TableCell key={label} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingReport && <TableRow><TableCell colSpan={11 + (report?.months?.length || 0)} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
                {!loadingReport && report?.items.map((item) => (
                  <TableRow key={item.client_code} hover>
                    <TableCell>{item.client_code}</TableCell>
                    <TableCell>{item.fantasy_name || '-'}</TableCell>
                    <TableCell>{item.sector || '-'}</TableCell>
                    <TableCell>{item.city || '-'}</TableCell>
                    <TableCell>{item.client_status || '-'}</TableCell>
                    <TableCell>{item.frequency || '-'}</TableCell>
                    <TableCell>{item.equipment_count}</TableCell>
                    {report.months.map((month) => <TableCell key={month}>{currency(item.month_sales[month])}</TableCell>)}
                    <TableCell>{item.last_purchase_month ? monthLabel(item.last_purchase_month) : '-'}</TableCell>
                    <TableCell>{currency(item.monthly_target)}</TableCell>
                    <TableCell sx={{ color: item.gap > 0 ? 'error.main' : 'success.main' }}>{currency(item.gap)}</TableCell>
                    <TableCell>{item.giro_status}</TableCell>
                  </TableRow>
                ))}
                {!loadingReport && report?.items.length === 0 && (
                  <TableRow><TableCell colSpan={11 + (report?.months?.length || 0)} align="center">Nenhum PDV encontrado para os filtros selecionados.</TableCell></TableRow>
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
