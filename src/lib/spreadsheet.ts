import type { GridValue } from '../types';

export const SHEET_ROW_HEIGHT = 30;
export const SHEET_COLUMN_WIDTH = 120;
export const SHEET_ROW_HEADER_WIDTH = 46;
export const SHEET_COLUMN_HEADER_HEIGHT = 28;
export const SHEET_OVERSCAN = 4;

export const emptyGrid = (): GridValue[][] =>
  Array.from({ length: 20 }, () => Array.from({ length: 8 }, () => ''));

export const getGridColumnCount = (
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  minimum = 0,
) => rows.reduce((largest, row) => Math.max(largest, row.length), minimum);

export const columnName = (index: number) => {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

export const cellToGridValue = (value: unknown): GridValue => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('result' in record) return cellToGridValue(record.result);
    if ('formula' in record) return `=${String(record.formula)}`;
    if ('sharedFormula' in record) return `=${String(record.sharedFormula)}`;
    if ('text' in record) return cellToGridValue(record.text);
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText
        .map(part => String((part as Record<string, unknown>).text ?? ''))
        .join('');
    }
  }
  return String(value);
};

export const normalizeSelection = (
  range: { anchor: { row: number; column: number }; focus: { row: number; column: number } } | null,
) => {
  if (!range) return null;
  return {
    startRow: Math.min(range.anchor.row, range.focus.row),
    endRow: Math.max(range.anchor.row, range.focus.row),
    startColumn: Math.min(range.anchor.column, range.focus.column),
    endColumn: Math.max(range.anchor.column, range.focus.column),
  };
};

export const isFormulaValue = (value: GridValue) =>
  typeof value === 'string' && value.startsWith('=');
