import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { CurrentFile, GridValue } from '../types';
import { saveDocxPreservingPackage } from './docxPreserve';

export async function saveMarkdown(path: string, content: string) {
  await writeTextFile(path, content);
}

export async function savePlainText(path: string, content: string) {
  await writeTextFile(path, content);
}

export async function saveDocx(path: string, content: string, originalBytes?: Uint8Array | null) {
  if (originalBytes && originalBytes.byteLength > 0) {
    return saveDocxPreservingPackage(path, originalBytes, content);
  }
  // No original package in memory — still write a safety note via simplified path
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const paragraphs = content.split(/\r?\n/).map(line => (
    new Paragraph({ children: [new TextRun(line || ' ')] })
  ));
  const doc = new Document({
    sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph('')] }],
  });
  const buffer = await Packer.toArrayBuffer(doc);
  await writeFile(path, new Uint8Array(buffer));
  return 'backup-fallback' as const;
}

export async function saveCsv(path: string, gridData: GridValue[][]) {
  const Papa = (await import('papaparse')).default;
  await writeTextFile(path, Papa.unparse(gridData));
}

export async function saveXlsx(
  path: string,
  workbook: unknown,
  sheetNames: string[],
  activeSheet: string,
  gridData: GridValue[][],
  cellFormulas: Record<string, string> = {},
) {
  const ExcelJS = (await import('exceljs')).default;
  const nextWorkbook = new ExcelJS.Workbook();
  const previous = workbook as import('exceljs').Workbook | null;
  const names = previous?.worksheets.map(sheet => sheet.name) ?? sheetNames;

  for (const name of names.length ? names : [activeSheet || 'Sheet1']) {
    const sheet = nextWorkbook.addWorksheet(name);
    const source = name === activeSheet ? gridData : worksheetToGridSafe(previous?.getWorksheet(name));
    const formulas = name === activeSheet ? cellFormulas : {};
    source.forEach((row, rowIndex) => {
      sheet.addRow(row.map((value, colIndex) => {
        const formula = formulas[`${rowIndex},${colIndex}`];
        if (formula && formula.startsWith('=')) {
          return { formula: formula.slice(1), result: value === '' ? undefined : value };
        }
        if (typeof value === 'string' && value.startsWith('=')) {
          return { formula: value.slice(1) };
        }
        return value === '' ? null : value;
      }));
    });
  }

  const data = await nextWorkbook.xlsx.writeBuffer();
  await writeFile(path, new Uint8Array(data));
  return nextWorkbook;
}

function worksheetToGridSafe(worksheet: import('exceljs').Worksheet | undefined): GridValue[][] {
  if (!worksheet) return [];
  const rows: GridValue[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values : [];
    rows[rowNumber - 1] = values.slice(1).map((value: unknown) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if ('formula' in record) return `=${String(record.formula)}`;
        if ('result' in record) {
          const result = record.result;
          if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
            return result;
          }
        }
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      return String(value);
    });
  });
  return rows;
}

export async function saveCurrentTab(file: CurrentFile, payload: {
  editorContent?: string;
  plainText?: string;
  gridData?: GridValue[][];
  cellFormulas?: Record<string, string>;
  workbook?: unknown;
  sheetNames?: string[];
  activeSheet?: string;
  originalBytes?: Uint8Array | null;
}): Promise<{ status: string; workbook?: unknown }> {
  switch (file.fileType) {
    case 'markdown':
      await saveMarkdown(file.path, payload.editorContent ?? '');
      return { status: 'saved' };
    case 'text':
    case 'code':
    case 'html':
      await savePlainText(file.path, payload.editorContent ?? payload.plainText ?? '');
      return { status: 'saved' };
    case 'docx': {
      const result = await saveDocx(
        file.path,
        payload.editorContent ?? '',
        payload.originalBytes ?? null,
      );
      return {
        status: result === 'preserved' ? 'savedDocxPreserved' : 'savedDocxBak',
      };
    }
    case 'csv':
      await saveCsv(file.path, payload.gridData ?? []);
      return { status: 'savedCsv' };
    case 'xlsx': {
      const nextWorkbook = await saveXlsx(
        file.path,
        payload.workbook,
        payload.sheetNames ?? [],
        payload.activeSheet ?? '',
        payload.gridData ?? [],
        payload.cellFormulas ?? {},
      );
      return { status: 'savedXlsx', workbook: nextWorkbook };
    }
    default:
      throw new Error('This file type is read-only');
  }
}
