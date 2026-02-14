import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material';
import Sidebar from './Sidebar';
import Header from './Header';
import api from '../services/api';
import { hasPermission } from '../utils/auth';

const FOLLOWUP_PROMPT_PREFIX = 'pickup_followup_prompt_';
const FOLLOWUP_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const buildPromptKey = (dateReference) =>
  `${FOLLOWUP_PROMPT_PREFIX}${String(dateReference || '').replace(/\//g, '-')}`;

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [followupOpen, setFollowupOpen] = useState(false);
  const [followupInfo, setFollowupInfo] = useState(null);

  useEffect(() => {
    if (!hasPermission('pickups.withdrawals_history')) {
      return undefined;
    }

    let active = true;
    const checkDailyFollowup = async () => {
      try {
        if (location.pathname === '/pickups/withdrawals-history') {
          return;
        }

        const response = await api.get('/pickup-catalog/daily-followup/pending');
        if (!active) {
          return;
        }

        const data = response?.data || {};
        const dateReference = String(data?.date_reference || '').trim();
        const pendingCount = Number(data?.total_pending || 0);
        const shouldPrompt = Boolean(data?.can_prompt) && pendingCount > 0 && Boolean(dateReference);
        if (!shouldPrompt) {
          return;
        }

        const promptKey = buildPromptKey(dateReference);
        if (localStorage.getItem(promptKey) === '1') {
          return;
        }

        localStorage.setItem(promptKey, '1');
        setFollowupInfo(data);
        setFollowupOpen(true);
      } catch (err) {
        // Se a API falhar, não interrompe a navegação do usuário.
      }
    };

    checkDailyFollowup();
    const timerId = window.setInterval(checkDailyFollowup, FOLLOWUP_CHECK_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, [location.pathname]);

  const handleGoToFollowup = () => {
    setFollowupOpen(false);
    navigate('/pickups/withdrawals-history');
  };

  const pendingCount = Number(followupInfo?.total_pending || 0);
  const followupDate = String(followupInfo?.date_reference || '').trim();

  return (
    <>
      <Box className="app-shell">
        <Sidebar />
        <Box className="app-content">
          <Header />
          <Box className="page-anim">
            <Outlet />
          </Box>
        </Box>
      </Box>
      <Dialog open={followupOpen} onClose={() => setFollowupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Fechamento das retiradas do dia</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 1 }}>
            {`Existem ${pendingCount} retirada(s) pendente(s) para ${followupDate}.`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Atualize os status para concluída ou cancelada no histórico de retiradas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFollowupOpen(false)}>Depois</Button>
          <Button variant="contained" onClick={handleGoToFollowup}>
            Atualizar agora
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Layout;
