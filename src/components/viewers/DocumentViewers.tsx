import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'react';
import hljs from 'highlight.js/lib/common';
import { useAppStore } from '../../state/store';
import {
  SHEET_COLUMN_HEADER_HEIGHT,
  SHEET_COLUMN_WIDTH,
  SHEET_OVERSCAN,
  SHEET_ROW_HEADER_WIDTH,
  SHEET_ROW_HEIGHT,
  columnName,
  getGridColumnCount,
  normalizeSelection,
} from '../../lib/spreadsheet';
import type { CellRange, DocumentTab, GridValue, SheetViewport } from '../../types';
import { useState } from 'react';

export function DocxViewer() {
  const { activeTab, t } = useAppStore();
  if (!activeTab) return null;
  return (
    <div className="markdown-container">
      <div
        className="markdown-body docx-preview"
        dangerouslySetInnerHTML={{ __html: activeTab.docxHtml || `<p>${t('noPreviewText')}</p>` }}
      />
    </div>
  );
}

export function HtmlPreview({ html }: { html: string }) {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcdoc'],
      }),
    [html],
  );

  return (
    <div className="html-preview">
      <div className="html-preview-body" dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}

export function HtmlSourceViewer({ source }: { source: string }) {
  const html = useMemo(() => {
    try {
      return hljs.highlight(source, { language: 'xml' }).value;
    } catch {
      return source
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    }
  }, [source]);

  return (
    <div className="code-viewer">
      <pre className="hljs code-block">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

export function TextCodeViewer() {
  const { activeTab } = useAppStore();
  const html = useMemo(() => {
    if (!activeTab) return '';
    const code = activeTab.isEditing ? activeTab.editorContent : activeTab.plainText || activeTab.markdownContent;
    const lang =
      activeTab.file.fileType === 'code'
        ? langFromName(activeTab.file.name)
        : 'plaintext';
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      return escapeHtml(code);
    }
  }, [activeTab]);

  if (!activeTab) return null;

  if (activeTab.isEditing) {
    return (
      <div className="editor-container">
        <textarea
          className="markdown-editor code-editor"
          value={activeTab.editorContent}
          onChange={event => {
            const storeEvent = new CustomEvent('aerodoc-editor-change', {
              detail: { value: event.target.value },
            });
            window.dispatchEvent(storeEvent);
          }}
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="code-viewer">
      <pre className="hljs code-block">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function langFromName(name: string) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    rs: 'rust',
    py: 'python',
    css: 'css',
    html: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    md: 'markdown',
    log: 'plaintext',
    txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function colIndexFromLetter(letters: string) {
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function evalFormulaDisplay(formula: string, grid: GridValue[][]): GridValue {
  const expr = formula.replace(/^=/, '').trim().toUpperCase();
  const rangeMatch = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(expr);
  if (rangeMatch) {
    const [, fn, c1, r1, c2, r2] = rangeMatch;
    const colFrom = colIndexFromLetter(c1);
    const colTo = colIndexFromLetter(c2);
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
    if (!nums.length) return '';
    if (fn === 'SUM') return nums.reduce((a, b) => a + b, 0);
    if (fn === 'AVERAGE') return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    if (fn === 'MIN') return Math.min(...nums);
    if (fn === 'MAX') return Math.max(...nums);
    if (fn === 'COUNT') return nums.length;
  }
  if (/^[A-Z0-9+\-*/().\s]+$/.test(expr) && /[A-Z]+\d+/.test(expr)) {
    const js = expr.replace(/([A-Z]+)(\d+)/g, (_m, col: string, row: string) => {
      const v = grid[Number(row) - 1]?.[colIndexFromLetter(col)];
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? String(n) : '0';
    });
    try {
      const result = Function(`"use strict"; return (${js});`)() as number;
      if (typeof result === 'number' && Number.isFinite(result)) return result;
    } catch {
      return '';
    }
  }
  return '';
}

export function SpreadsheetViewer() {
  const { activeTab, updateActiveTab, t } = useAppStore();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<SheetViewport>({
    scrollTop: 0,
    scrollLeft: 0,
    width: 900,
    height: 600,
  });
  const [isSelecting, setIsSelecting] = useState(false);
  const frameRef = useRef<number | null>(null);

  const gridData = activeTab?.gridData ?? [];
  const cellFormulas = activeTab?.cellFormulas ?? {};
  const selectedRange = activeTab?.selectedRange ?? null;

  const normalized = useMemo(() => normalizeSelection(selectedRange as CellRange | null), [selectedRange]);

  const activeCell = normalized
    ? { row: normalized.startRow, column: normalized.startColumn }
    : selectedRange
      ? selectedRange.focus
      : null;

  const activeFormula = activeCell
    ? cellFormulas[`${activeCell.row},${activeCell.column}`] ?? ''
    : '';

  const activeCellValue = activeCell
    ? String(gridData[activeCell.row]?.[activeCell.column] ?? '')
    : '';

  const formulaBarValue = activeFormula || activeCellValue;

  useEffect(() => {
    const stop = () => setIsSelecting(false);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () =>
      setViewport({
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        width: el.clientWidth,
        height: el.clientHeight,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab?.id]);

  useEffect(() => {
    const isSheetFocused = () => {
      const el = viewportRef.current;
      return Boolean(el && document.activeElement && el.contains(document.activeElement));
    };

    const onCopy = (event: ClipboardEvent) => {
      if (!isSheetFocused() || !normalized || !event.clipboardData || !activeTab) return;
      const rows: string[] = [];
      for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
        const values: string[] = [];
        for (let col = normalized.startColumn; col <= normalized.endColumn; col += 1) {
          values.push(String(gridData[row]?.[col] ?? ''));
        }
        rows.push(values.join('\t'));
      }
      event.preventDefault();
      event.clipboardData.setData('text/plain', rows.join('\r\n'));
    };

    const onPaste = (event: ClipboardEvent) => {
      if (!isSheetFocused() || !selectedRange || !event.clipboardData || !activeTab) return;
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      const rows = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(row => row.split('\t'));
      if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
        rows.pop();
      }
      const startRow = normalized?.startRow ?? selectedRange.focus.row;
      const startCol = normalized?.startColumn ?? selectedRange.focus.column;
      const next = [...gridData];
      rows.forEach((pastedRow, rowOffset) => {
        const targetRow = startRow + rowOffset;
        while (next.length <= targetRow) next.push([]);
        const nextRow = [...(next[targetRow] ?? [])];
        pastedRow.forEach((value, colOffset) => {
          const targetCol = startCol + colOffset;
          while (nextRow.length <= targetCol) nextRow.push('');
          nextRow[targetCol] = value;
        });
        next[targetRow] = nextRow;
      });
      updateActiveTab({
        gridData: next,
        sheetDirty: true,
        selectedRange: {
          anchor: { row: startRow, column: startCol },
          focus: {
            row: startRow + rows.length - 1,
            column: startCol + Math.max(...rows.map(r => r.length)) - 1,
          },
        },
        saveStatus: '',
      });
    };

    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  }, [activeTab, gridData, normalized, selectedRange, updateActiveTab]);

  if (!activeTab) return null;

  const rowCount = Math.max(1, gridData.length);
  const columnCount = getGridColumnCount(gridData, 8);
  const startRow = Math.max(0, Math.floor(viewport.scrollTop / SHEET_ROW_HEIGHT) - SHEET_OVERSCAN);
  const endRow = Math.min(
    rowCount,
    Math.ceil((viewport.scrollTop + viewport.height) / SHEET_ROW_HEIGHT) + SHEET_OVERSCAN,
  );
  const startColumn = Math.max(
    0,
    Math.floor(viewport.scrollLeft / SHEET_COLUMN_WIDTH) - SHEET_OVERSCAN,
  );
  const endColumn = Math.min(
    columnCount,
    Math.ceil((viewport.scrollLeft + viewport.width) / SHEET_COLUMN_WIDTH) + SHEET_OVERSCAN,
  );
  const visibleRows = Array.from({ length: Math.max(0, endRow - startRow) }, (_, i) => startRow + i);
  const visibleColumns = Array.from(
    { length: Math.max(0, endColumn - startColumn) },
    (_, i) => startColumn + i,
  );

  const setCellValue = (row: number, col: number, value: string) => {
    const next = [...gridData];
    while (next.length <= row) next.push([]);
    const nextRow = [...(next[row] ?? [])];
    while (nextRow.length <= col) nextRow.push('');

    const nextFormulas = { ...cellFormulas };
    const key = `${row},${col}`;
    if (typeof value === 'string' && value.startsWith('=')) {
      nextFormulas[key] = value;
      nextRow[col] = evalFormulaDisplay(value, next);
    } else {
      delete nextFormulas[key];
      nextRow[col] = value;
    }
    next[row] = nextRow;

    updateActiveTab({
      gridData: next,
      cellFormulas: nextFormulas,
      sheetDirty: true,
      saveStatus: '',
    });
  };

  const applyFormulaBar = () => {
    if (!activeCell) return;
    const value = formulaBarValue;
    setCellValue(activeCell.row, activeCell.column, value);
  };

  const handleScroll = (target: HTMLDivElement) => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      setViewport({
        scrollTop: target.scrollTop,
        scrollLeft: target.scrollLeft,
        width: target.clientWidth,
        height: target.clientHeight,
      });
      frameRef.current = null;
    });
  };

  const selectedCellCount = normalized
    ? (normalized.endRow - normalized.startRow + 1) * (normalized.endColumn - normalized.startColumn + 1)
    : 0;

  return (
    <div className="sheet-pane">
      <div className="sheet-tabs">
        {activeTab.sheetNames.map(name => (
          <button
            key={name}
            className={`sheet-tab ${name === activeTab.activeSheet ? 'active' : ''}`}
            onClick={() => {
              updateActiveTab({ activeSheet: name, selectedRange: null, saveStatus: '' });
            }}
          >
            {name}
          </button>
        ))}
        <span className="sheet-selection-summary">
          {selectedCellCount > 0 ? `${selectedCellCount} selected` : t('dragSelectCells')}
        </span>
      </div>

      {/* Office-style formula bar */}
      <div className="formula-bar">
        <span className="formula-cell-ref">
          {activeCell ? `${columnName(activeCell.column)}${activeCell.row + 1}` : '—'}
        </span>
        <span className="formula-fx">fx</span>
        <input
          className="formula-input"
          value={formulaBarValue}
          placeholder={activeFormula ? activeFormula : t('formulaPlaceholder')}
          onChange={event => {
            if (!activeCell) return;
            const value = event.target.value;
            const next = [...gridData];
            while (next.length <= activeCell.row) next.push([]);
            const nextRow = [...(next[activeCell.row] ?? [])];
            while (nextRow.length <= activeCell.column) nextRow.push('');
            const key = `${activeCell.row},${activeCell.column}`;
            const nextFormulas = { ...cellFormulas };
            if (value.startsWith('=')) {
              nextFormulas[key] = value;
              // live-compute simple formulas so grid shows a value
              nextRow[activeCell.column] = evalFormulaDisplay(value, next);
            } else {
              delete nextFormulas[key];
              nextRow[activeCell.column] = value;
            }
            next[activeCell.row] = nextRow;
            updateActiveTab({
              gridData: next,
              cellFormulas: nextFormulas,
              sheetDirty: true,
              saveStatus: '',
            });
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') applyFormulaBar();
          }}
          aria-label="Formula bar"
        />
      </div>
      <div
        ref={viewportRef}
        className={`sheet-grid-wrap ${isSelecting ? 'is-selecting' : ''}`}
        tabIndex={0}
        onScroll={event => handleScroll(event.currentTarget)}
        onPointerLeave={() => setIsSelecting(false)}
        role="grid"
      >
        <div
          className="sheet-virtual-canvas"
          style={{
            width: SHEET_ROW_HEADER_WIDTH + columnCount * SHEET_COLUMN_WIDTH,
            height: SHEET_COLUMN_HEADER_HEIGHT + rowCount * SHEET_ROW_HEIGHT,
          }}
        >
          <div
            className="sheet-header-cell sheet-corner"
            style={{
              top: viewport.scrollTop,
              left: viewport.scrollLeft,
              width: SHEET_ROW_HEADER_WIDTH,
              height: SHEET_COLUMN_HEADER_HEIGHT,
            }}
          />
          {visibleColumns.map(columnIndex => (
            <div
              key={`c-${columnIndex}`}
              className="sheet-header-cell sheet-column-header"
              style={{
                top: viewport.scrollTop,
                left: SHEET_ROW_HEADER_WIDTH + columnIndex * SHEET_COLUMN_WIDTH,
                width: SHEET_COLUMN_WIDTH,
                height: SHEET_COLUMN_HEADER_HEIGHT,
              }}
            >
              {columnName(columnIndex)}
            </div>
          ))}
          {visibleRows.map(rowIndex => (
            <div
              key={`r-${rowIndex}`}
              className="sheet-header-cell sheet-row-header"
              style={{
                top: SHEET_COLUMN_HEADER_HEIGHT + rowIndex * SHEET_ROW_HEIGHT,
                left: viewport.scrollLeft,
                width: SHEET_ROW_HEADER_WIDTH,
                height: SHEET_ROW_HEIGHT,
              }}
            >
              {rowIndex + 1}
            </div>
          ))}
          {visibleRows.flatMap(rowIndex =>
            visibleColumns.map(columnIndex => {
              const selected =
                normalized &&
                rowIndex >= normalized.startRow &&
                rowIndex <= normalized.endRow &&
                columnIndex >= normalized.startColumn &&
                columnIndex <= normalized.endColumn;
              return (
                <div
                  key={`${rowIndex}-${columnIndex}`}
                  className={`sheet-data-cell ${selected ? 'selected' : ''}`}
                  style={{
                    top: SHEET_COLUMN_HEADER_HEIGHT + rowIndex * SHEET_ROW_HEIGHT,
                    left: SHEET_ROW_HEADER_WIDTH + columnIndex * SHEET_COLUMN_WIDTH,
                    width: SHEET_COLUMN_WIDTH,
                    height: SHEET_ROW_HEIGHT,
                  }}
                  onPointerDown={event => {
                    setSelectedRangeHandler(updateActiveTab, rowIndex, columnIndex, event.shiftKey, selectedRange);
                    setIsSelecting(true);
                  }}
                  onPointerEnter={() => {
                    if (!isSelecting) return;
                    setSelectedRangeHandler(updateActiveTab, rowIndex, columnIndex, true, selectedRange);
                  }}
                >
                  <input
                    value={String((gridData[rowIndex] as GridValue[] | undefined)?.[columnIndex] ?? '')}
                    onChange={event => setCellValue(rowIndex, columnIndex, event.target.value)}
                    onFocus={() => {
                      if (!selected) {
                        updateActiveTab({
                          selectedRange: {
                            anchor: { row: rowIndex, column: columnIndex },
                            focus: { row: rowIndex, column: columnIndex },
                          },
                        });
                      }
                    }}
                  />
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

function setSelectedRangeHandler(
  updateActiveTab: (patch: Partial<DocumentTab>) => void,
  row: number,
  column: number,
  shiftKey: boolean,
  previous: CellRange | null,
) {
  const focus = { row, column };
  updateActiveTab({
    selectedRange: {
      anchor: shiftKey && previous ? previous.anchor : focus,
      focus,
    },
  });
}
