import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import api from '../services/api';

const safeText = (value) => String(value || '').trim();

const formatDate = (value) => {
  if (!value) return '-';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return value;
};

const Pendencies = () => {
  const [tab, setTab] = useState('assinaturas');
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPendencies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/pickup-catalog/pendencies');
      setData(response.data);
      setError('');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Não foi possível carregar as pendências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPendencies();
  }, [loadPendencies]);

  useEffect(() => {
    const intervalId = window.setInterval(loadPendencies, 30000);
    const handleFocus = () => loadPendencies();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadPendencies]);

  const filteredRows = useMemo(() => {
    const rows = tab === 'assinaturas'
      ? (data?.pending_signatures || [])
      : (data?.pending_requests || []);
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    if (!needle) return rows;
    return rows.filter((row) => [
      row.client_code,
      row.nome,
      row.fantasia,
      row.document,
      row.setor,
      row.description,
      row.comodato_number,
      row.rg,
      row.destination_client_code,
      row.destination_fantasy_name,
      row.request_type,
    ].some((value) => safeText(value).toLocaleLowerCase('pt-BR').includes(needle)));
  }, [data, search, tab]);

  return (
    <Box sx={{ display: 'grid', gap: 2, p: { xs: 1.5, md: 3 }, minWidth: 0 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Pendências</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Assinaturas e baixas são conferidas com a versão mais recente da base 02.02.20.
          {data?.loaded_at ? ` Atualizada em ${new Date(data.loaded_at).toLocaleString('pt-BR')}.` : ''}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!data?.signatures_available && tab === 'assinaturas' && (
        <Alert severity="warning">
          A base 02.02.20 ainda não contém as colunas CC e CNF. Atualize a base com essas colunas para verificar pendências de assinatura.
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          <Tabs
            value={tab}
            onChange={(_, value) => { setTab(value); setSearch(''); }}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab value="assinaturas" label={`Assinaturas (${data?.pending_signatures?.length || 0})`} />
            <Tab value="baixas" label={`Baixas / DE-PARA (${data?.pending_requests?.length || 0})`} />
          </Tabs>

          <TextField
            size="small"
            label="Buscar cliente ou equipamento"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
          />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {[
                      'Código',
                      'Nome',
                      'Fantasia',
                      'CPF/CNPJ',
                      'Setor',
                      'Status',
                      'Equipamento / comodato',
                      'Quantidade',
                      'Emissão',
                      ...(tab === 'baixas' ? ['Pendência', 'Destino'] : []),
                    ].map((label) => (
                      <TableCell key={label} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>{row.client_code || '-'}</TableCell>
                      <TableCell>{row.nome || '-'}</TableCell>
                      <TableCell>{row.fantasia || '-'}</TableCell>
                      <TableCell>{row.document || '-'}</TableCell>
                      <TableCell>{row.setor || '-'}</TableCell>
                      <TableCell>{row.status || '-'}</TableCell>
                      <TableCell sx={{ minWidth: 220 }}>
                        {row.description}
                        {row.comodato_number ? ` · Comodato ${row.comodato_number}` : ''}
                        {row.rg ? ` · RG ${row.rg}` : ''}
                      </TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell>{formatDate(row.issue_date)}</TableCell>
                      {tab === 'baixas' && (
                        <>
                          <TableCell>
                            {row.request_type === 'de_para' ? 'DE-PARA' : 'Baixa'}
                          </TableCell>
                          <TableCell>
                            {row.destination_fantasy_name || row.destination_client_code || '-'}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                  {!filteredRows.length && (
                    <TableRow>
                      <TableCell colSpan={tab === 'baixas' ? 11 : 9} align="center">
                        {search ? 'Nenhum resultado para essa busca.' : 'Não há pendências nesta categoria.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Pendencies;
