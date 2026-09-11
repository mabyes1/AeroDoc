import DOMPurify from 'dompurify';
import { readFile, readTextFile } from '@tauri-apps/plugin-fs';
import { bytesToArrayBuffer } from './paths';
import type { CurrentFile, GridValue } from '../types';
import { emptyGrid } from './spreadsheet';

export async function loadMarkdown(file: CurrentFile) {
  const content = await readTextFile(file.path);
  return { markdownContent: content, editorContent: content };
}

export async function loadPdf(file: CurrentFile) {
  const bytes = await readFile(file.path);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

export async function loadDocx(file: CurrentFile) {
  const mammoth = (await import('mammoth')).default;
  const bytes = await readFile(file.path);
  const arrayBuffer = bytesToArrayBuffer(bytes);
  const html = await mammoth.convertToHtml({ arrayBuffer });
  const raw = await mammoth.extractRawText({ arrayBuffer });
  const cleanHtml = DOMPurify.sanitize(html.value || '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
  });
  return {
    docxHtml: cleanHtml || '<p>No previewable text found.</p>',
    plainText: raw.value,
    originalBytes: bytes,
  };
}

export async function loadTextOrCode(file: CurrentFile) {
  const content = await readTextFile(file.path);
  return { plainText: content, editorContent: content, markdownContent: content };
}

function cellDisplayValue(value: unknown): GridValue {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('result' in record && record.result !== undefined && record.result !== null) {
      return cellDisplayValue(record.result);
    }
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText
        .map(part => String((part as Record<string, unknown>).text ?? ''))
        .join('');
    }
    if ('text' in record) return cellDisplayValue(record.text);
    // formula without cached result: grid stays empty
    if ('formula' in record || 'sharedFormula' in record) return '';
  }
  return String(value);
}

function cellFormulaFromValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.startsWith('=')) return value;
  if (typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.formula) return `=${String(record.formula)}`;
  if (record.sharedFormula) return `=${String(record.sharedFormula)}`;
  return null;
}

/** Lightweight evaluator for common formulas so grid can show values without Excel. */
function evalSimpleFormula(formula: string, grid: GridValue[][]): GridValue {
  const expr = formula.replace(/^=/, '').trim().toUpperCase();
  const rangeMatch = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(expr);
  if (rangeMatch) {
    const [, fn, c1, r1, c2, r2] = rangeMatch;
    const colFrom = colLetterToIndex(c1);
    const colTo = colLetterToIndex(c2);
    const rowFrom = Number(r1) - 1;
    const rowTo = Number(r2) - 1;
    const nums: number[] = [];
    for (let r = rowFrom; r <= rowTo; r += 1) {
      for (let c = colFrom; c <= colTo; c += 1) {
        const raw = grid[r]?.[c];
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (raw !== '' && raw != null && Number.isFinite(n)) nums.push(n);
      }
    }
    if (nums.length === 0) return '';
    switch (fn) {
      case 'SUM': return nums.reduce((a, b) => a + b, 0);
      case 'AVERAGE': return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
      case 'MIN': return Math.min(...nums);
      case 'MAX': return Math.max(...nums);
      case 'COUNT': return nums.length;
      default: return '';
    }
  }
  // simple cell ref arithmetic: A1+B2, B2*2, etc.
  if (/^[A-Z0-9+\-*/().\s]+$/.test(expr) && /[A-Z]+\d+/.test(expr)) {
    const js = expr.replace(/([A-Z]+)(\d+)/g, (_m, col: string, row: string) => {
      const v = grid[Number(row) - 1]?.[colLetterToIndex(col)];
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? String(n) : '0';
    });
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${js});`)() as number;
      if (typeof result === 'number' && Number.isFinite(result)) return result;
    } catch {
      return '';
    }
  }
  return '';
}

function colLetterToIndex(letters: string) {
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

export async function loadSpreadsheet(file: CurrentFile): Promise<{
  workbook: unknown | null;
  sheetNames: string[];
  activeSheet: string;
  gridData: GridValue[][];
  cellFormulas: Record<string, string>;
}> {
  if (file.fileType === 'csv') {
    const Papa = (await import('papaparse')).default;
    const parsed = Papa.parse<GridValue[]>(await readTextFile(file.path), { skipEmptyLines: false });
    return {
      workbook: null,
      sheetNames: ['CSV'],
      activeSheet: 'CSV',
      gridData: parsed.data.length ? parsed.data : emptyGrid(),
      cellFormulas: {},
    };
  }

  const ExcelJS = (await import('exceljs')).default;
  const loadedWorkbook = new ExcelJS.Workbook();
  await loadedWorkbook.xlsx.load(bytesToArrayBuffer(await readFile(file.path)));
  const names = loadedWorkbook.worksheets.map(sheet => sheet.name);
  const firstSheet = names[0] || 'Sheet1';

  const worksheet = loadedWorkbook.getWorksheet(firstSheet);
  const rows: GridValue[][] = [];
  const cellFormulas: Record<string, string> = {};

  if (worksheet) {
    const rowCount = worksheet.rowCount || 0;
    const colCount = worksheet.columnCount || 0;
    for (let r = 1; r <= Math.max(rowCount, 1); r += 1) {
      const rowIndex = r - 1;
      const rowValues: GridValue[] = [];
      for (let c = 1; c <= Math.max(colCount, 1); c += 1) {
        const colIndex = c - 1;
        const cell = worksheet.getCell(r, c);
        const value = cell?.value;
        const formula = cellFormulaFromValue(value) ?? (cell?.formula ? `=${cell.formula}` : null);
        if (formula) cellFormulas[`${rowIndex},${colIndex}`] = formula;
        rowValues[colIndex] = cellDisplayValue(value);
      }
      rows[rowIndex] = rowValues;
    }
  }

  // Fill formula cells that have no cached result using simple evaluator
  for (const [key, formula] of Object.entries(cellFormulas)) {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (rows[r]?.[c] === '' || rows[r]?.[c] === undefined) {
      const computed = evalSimpleFormula(formula, rows);
      if (computed !== '') {
        if (!rows[r]) rows[r] = [];
        rows[r][c] = computed;
      }
    }
  }

  return {
    workbook: loadedWorkbook,
    sheetNames: names.length ? names : [firstSheet],
    activeSheet: firstSheet,
    gridData: rows.length ? rows : emptyGrid(),
    cellFormulas,
  };
}

export async function loadDocument(file: CurrentFile) {
  switch (file.fileType) {
    case 'markdown':
      return { kind: 'markdown' as const, ...(await loadMarkdown(file)) };
    case 'pdf':
      return { kind: 'pdf' as const, pdfUrl: await loadPdf(file) };
    case 'docx':
      return { kind: 'docx' as const, ...(await loadDocx(file)) };
    case 'text':
    case 'code':
    case 'html':
      return { kind: 'text' as const, ...(await loadTextOrCode(file)) };
    case 'xlsx':
    case 'csv':
      return { kind: 'sheet' as const, ...(await loadSpreadsheet(file)) };
    default:
      throw new Error(`Unsupported file type: ${file.fileType}`);
  }
}
