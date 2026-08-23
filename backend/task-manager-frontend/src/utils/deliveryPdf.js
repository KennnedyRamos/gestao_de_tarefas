export const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

export const formatFileSize = (size) => {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const validatePdfFile = (file, label = 'Arquivo') => {
  if (!file) {
    return `${label} é obrigatório.`;
  }
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  if (!name.endsWith('.pdf') || (type && !['application/pdf', 'application/x-pdf'].includes(type))) {
    return `${label} precisa ser um arquivo PDF.`;
  }
  if (Number(file.size || 0) > MAX_PDF_UPLOAD_BYTES) {
    return `${label} excede o limite de 10 MB.`;
  }
  return '';
};

export const parseFilenameFromDisposition = (contentDispositionValue) => {
  if (!contentDispositionValue) {
    return '';
  }
  const utfMatch = contentDispositionValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch (err) {
      return utfMatch[1];
    }
  }
  const simpleMatch = contentDispositionValue.match(/filename="?([^";]+)"?/i);
  return simpleMatch?.[1] || '';
};

export const extractPdfRequestError = async (error) => {
  const status = error?.response?.status;
  const payload = error?.response?.data;
  let detail = payload?.detail;

  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    try {
      const parsed = JSON.parse(await payload.text());
      detail = parsed?.detail;
    } catch (parseError) {
      detail = '';
    }
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (status === 404) {
    return 'PDF não encontrado. O arquivo pode ter sido removido do armazenamento.';
  }
  if (status === 403) {
    return 'Você não possui permissão para visualizar este PDF.';
  }
  if (status === 503) {
    return 'O armazenamento de documentos ainda não está configurado.';
  }
  return 'Não foi possível abrir o PDF. Tente novamente.';
};
