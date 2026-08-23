import { describe, expect, it } from 'vitest';

import {
  MAX_PDF_UPLOAD_BYTES,
  formatFileSize,
  parseFilenameFromDisposition,
  validatePdfFile,
} from './deliveryPdf';

describe('deliveryPdf', () => {
  it('aceita um PDF dentro do limite', () => {
    const file = { name: 'contrato.pdf', type: 'application/pdf', size: 1024 };
    expect(validatePdfFile(file, 'Contrato')).toBe('');
  });

  it('rejeita extensão inválida e PDF acima de 10 MB', () => {
    expect(validatePdfFile({ name: 'foto.png', type: 'image/png', size: 100 }, 'NF')).toContain('PDF');
    expect(validatePdfFile({
      name: 'grande.pdf',
      type: 'application/pdf',
      size: MAX_PDF_UPLOAD_BYTES + 1,
    }, 'NF')).toContain('10 MB');
  });

  it('interpreta nomes UTF-8 do Content-Disposition', () => {
    expect(parseFilenameFromDisposition("inline; filename*=UTF-8''nota%20fiscal.pdf"))
      .toBe('nota fiscal.pdf');
  });

  it('formata o tamanho para apresentação', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });
});
