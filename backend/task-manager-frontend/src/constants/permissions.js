export const PERMISSION_OPTIONS = [
  { code: 'tasks.manage', label: 'Criar e editar tarefas' },
  { code: 'routines.manage', label: 'Gerenciar rotinas' },
  { code: 'deliveries.manage', label: 'Gerenciar entregas' },
  { code: 'pickups.manage', label: 'Gerenciar retiradas de materiais' },
  { code: 'pickups.create_order', label: 'Ordem de retirada' },
  { code: 'pickups.import_base', label: 'Atualizar base de retiradas' },
  { code: 'pickups.orders_history', label: 'Histórico de ordens' },
  { code: 'pickups.withdrawals_history', label: 'Histórico de retiradas' },
  { code: 'comodatos.view', label: 'Dashboard de comodatos' },
  { code: 'equipments.view', label: 'Visualizar equipamentos' },
  { code: 'equipments.manage', label: 'Gerenciar equipamentos' }
];

const LABEL_BY_PERMISSION = PERMISSION_OPTIONS.reduce((acc, item) => {
  acc[item.code] = item.label;
  return acc;
}, {});

export const permissionLabel = (permissionCode) =>
  LABEL_BY_PERMISSION[String(permissionCode || '').trim()] || String(permissionCode || '').trim();
