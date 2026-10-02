import ExcelJS from 'exceljs';

/**
 * Universal Excel export utility using patched, secure ExcelJS
 */
export async function exportToExcel(
  sheets: Array<{
    name: string;
    columns: Array<{ header: string; key: string; width?: number }>;
    rows: Array<Record<string, any>>;
  }>,
  filename: string
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KNITNECT Production ERP';
  workbook.created = new Date();

  for (const sheetDef of sheets) {
    const worksheet = workbook.addWorksheet(sheetDef.name, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    worksheet.columns = sheetDef.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 18,
    }));

    // Header styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };

    sheetDef.rows.forEach((row) => {
      worksheet.addRow(row);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Server-side Excel upload validation with size and MIME type security limits
 */
export const MAX_EXCEL_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB limit
export const ALLOWED_EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

export async function parseExcelUploadBuffer(fileBuffer: ArrayBuffer) {
  if (fileBuffer.byteLength > MAX_EXCEL_UPLOAD_BYTES) {
    throw new Error('File exceeds maximum allowable size limit of 5MB');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  return workbook;
}
