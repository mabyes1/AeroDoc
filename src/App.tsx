import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import {
  Search,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Minus,
  Square,
  X,
  Edit3,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  FolderPlus,
  FilePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Columns2,
  Eye,
  FileSpreadsheet,
  BookOpen,
  Keyboard,
  Clock3,
  Files,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, readTextFile, writeFile, writeTextFile, mkdir, remove } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Workbook, Worksheet } from 'exceljs';
import './index.css';

const appWindow = getCurrentWindow();
const norm = (p: string) => p.replace(/\\/g, '/');

const SUPPORTED_EXTENSIONS = ['.md', '.pdf', '.docx', '.xlsx', '.csv'] as const;
type FileType = 'markdown' | 'pdf' | 'docx' | 'xlsx' | 'csv';
type GridValue = string | number | boolean | null;
type Theme = 'gemini' | 'claude' | 'sakura' | 'dark';
type EditorLayout = 'editor' | 'split';

interface CellPosition {
  row: number;
  column: number;
}

interface CellRange {
  anchor: CellPosition;
  focus: CellPosition;
}

interface SheetViewport {
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
}

const SHEET_ROW_HEIGHT = 30;
const SHEET_COLUMN_WIDTH = 120;
const SHEET_ROW_HEADER_WIDTH = 46;
const SHEET_COLUMN_HEADER_HEIGHT = 28;
const SHEET_OVERSCAN = 4;

interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  fileType?: FileType;
  children?: FileNode[];
  isLoaded?: boolean;
  isLoading?: boolean;
}

interface CurrentFile {
  name: string;
  path: string;
  fileType: FileType;
}

const getExtension = (name: string) => {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
};

const getFileType = (name: string): FileType | null => {
  switch (getExtension(name)) {
    case '.md':
      return 'markdown';
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.xlsx':
      return 'xlsx';
    case '.csv':
      return 'csv';
    default:
      return null;
  }
};

const bytesToArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const emptyGrid = (): GridValue[][] => Array.from({ length: 20 }, () => Array.from({ length: 8 }, () => ''));

const getGridColumnCount = (rows: ReadonlyArray<ReadonlyArray<unknown>>, minimum = 0) => (
  rows.reduce((largest, row) => Math.max(largest, row.length), minimum)
);

const columnName = (index: number) => {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const cellToGridValue = (value: unknown): GridValue => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('result' in record) return cellToGridValue(record.result);
    if ('text' in record) return cellToGridValue(record.text);
    if ('formula' in record) return `=${String(record.formula)}`;
    if ('richText' in record && Array.isArray(record.richText)) {
      return record.richText.map(part => String((part as Record<string, unknown>).text ?? '')).join('');
    }
  }
  return String(value);
};

const worksheetToGrid = (worksheet: Worksheet | undefined): GridValue[][] => {
  if (!worksheet) return emptyGrid();
  const rows: GridValue[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = Array.isArray(row.values) ? row.values : [];
    rows[rowNumber - 1] = values.slice(1).map(cellToGridValue);
  });
  return rows.length ? rows : emptyGrid();
};

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('aerodoc-theme');
    return savedTheme === 'claude' || savedTheme === 'sakura' || savedTheme === 'dark' ? savedTheme : 'gemini';
  });
  const [rootDir, setRootDir] = useState<string | null>(null);
  const rootDirRef = useRef<string | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState('');
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [gridData, setGridData] = useState<GridValue[][]>(emptyGrid);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => localStorage.getItem('aerodoc-auto-save') === 'true');
  const [sheetDirty, setSheetDirty] = useState(false);
  const [editorLayout, setEditorLayout] = useState<EditorLayout>('editor');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('aerodoc-sidebar-collapsed') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const savedWidth = Number(localStorage.getItem('aerodoc-sidebar-width'));
    return Number.isFinite(savedWidth) ? Math.min(420, Math.max(220, savedWidth)) : 276;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [recentVault, setRecentVault] = useState<string | null>(() => localStorage.getItem('aerodoc-recent-vault'));
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [isSelectingCells, setIsSelectingCells] = useState(false);
  const [sheetViewport, setSheetViewport] = useState<SheetViewport>({ scrollTop: 0, scrollLeft: 0, width: 900, height: 600 });
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const sheetViewportRef = useRef<HTMLDivElement | null>(null);
  const sheetScrollFrameRef = useRef<number | null>(null);
  const keyboardContextRef = useRef<{
    currentFile: CurrentFile | null;
    canSave: boolean;
    isEditing: boolean;
    openVault: () => Promise<void>;
    saveFile: () => Promise<void>;
    enterEdit: () => void;
    cancelEdit: () => void;
  } | null>(null);

  const hasTextUnsavedChanges = isEditing && editorContent !== markdownContent;
  const hasUnsavedChanges = hasTextUnsavedChanges || sheetDirty;
  const isSpreadsheet = currentFile?.fileType === 'xlsx' || currentFile?.fileType === 'csv';
  const canSave = isSpreadsheet ? sheetDirty : hasTextUnsavedChanges;

  const resetDocumentState = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setDocxHtml('');
    setWorkbook(null);
    setSheetNames([]);
    setActiveSheet('');
    setGridData(emptyGrid());
    setMarkdownContent('');
    setEditorContent('');
    setIsEditing(false);
    setEditorLayout('editor');
    setSheetDirty(false);
    setSelectedRange(null);
    setSaveStatus('');
  };

  const loadMarkdown = async (file: CurrentFile) => {
    const content = await readTextFile(file.path);
    setMarkdownContent(content);
    setEditorContent(content);
  };

  const loadPdf = async (file: CurrentFile) => {
    const bytes = await readFile(file.path);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    setPdfUrl(URL.createObjectURL(blob));
  };

  const loadDocx = async (file: CurrentFile) => {
    const mammoth = (await import('mammoth')).default;
    const bytes = await readFile(file.path);
    const arrayBuffer = bytesToArrayBuffer(bytes);
    const html = await mammoth.convertToHtml({ arrayBuffer });
    const raw = await mammoth.extractRawText({ arrayBuffer });
    setDocxHtml(html.value || '<p>No previewable text found.</p>');
    setMarkdownContent(raw.value);
    setEditorContent(raw.value);
  };

  const loadSpreadsheet = async (file: CurrentFile) => {
    if (file.fileType === 'csv') {
      const Papa = (await import('papaparse')).default;
      const parsed = Papa.parse<GridValue[]>(await readTextFile(file.path), { skipEmptyLines: false });
      setWorkbook(null);
      setSheetNames(['CSV']);
      setActiveSheet('CSV');
      setGridData(parsed.data.length ? parsed.data : emptyGrid());
      setSheetDirty(false);
      setSelectedRange(null);
      return;
    }

    const ExcelJS = (await import('exceljs')).default;
    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.load(bytesToArrayBuffer(await readFile(file.path)));
    const names = loadedWorkbook.worksheets.map(sheet => sheet.name);
    const firstSheet = names[0] || 'Sheet1';

    setWorkbook(loadedWorkbook);
    setSheetNames(names.length ? names : [firstSheet]);
    setActiveSheet(firstSheet);
    setGridData(worksheetToGrid(loadedWorkbook.getWorksheet(firstSheet)));
    setSheetDirty(false);
    setSelectedRange(null);
  };

  const openFile = async (absPath: string) => {
    if (hasUnsavedChanges && !window.confirm('Discard unsaved changes and open another file?')) return;

    const p = norm(absPath);
    const name = p.substring(p.lastIndexOf('/') + 1);
    const fileType = getFileType(name);
    if (!fileType) return;

    try {
      resetDocumentState();
      const file = { name, path: p, fileType };
      setCurrentFile(file);

      const currentRoot = rootDirRef.current;
      const parentDir = p.substring(0, p.lastIndexOf('/'));
      const isInsideVault = currentRoot && p.startsWith(currentRoot + '/');
      if (!isInsideVault) {
        setRootDir(parentDir);
        rootDirRef.current = parentDir;
        await invoke('allow_vault_scope', { path: parentDir });
        setFileTree(await scanDir(parentDir));
      }
      setExpandedDirs(prev => new Set(prev).add(parentDir));

      if (fileType === 'markdown') await loadMarkdown(file);
      if (fileType === 'pdf') await loadPdf(file);
      if (fileType === 'docx') await loadDocx(file);
      if (fileType === 'xlsx' || fileType === 'csv') await loadSpreadsheet(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMarkdownContent(`> Error loading file\n\n\`\`\`\n${msg}\n\`\`\`\n\nPath: \`${p}\``);
      setEditorContent('');
      setCurrentFile({ name, path: p, fileType });
      setSaveStatus(`Load failed: ${msg}`);
    }
  };

  const openVault = async (dirPath: string) => {
    if (hasUnsavedChanges && !window.confirm('Discard unsaved changes and open another vault?')) return;

    const d = norm(dirPath);
    setRootDir(d);
    rootDirRef.current = d;
    setRecentVault(d);
    localStorage.setItem('aerodoc-recent-vault', d);
    await invoke('allow_vault_scope', { path: d });
    setFileTree(await scanDir(d));
    setExpandedDirs(new Set([d]));
    setCurrentFile(null);
    resetDocumentState();
  };

  const scanDir = async (dirPath: string): Promise<FileNode[]> => {
    const d = norm(dirPath);
    try {
      const entries = await readDir(d);
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        if (!entry.name) continue;
        const childPath = d + '/' + entry.name;

        if (entry.isDirectory) {
          nodes.push({ name: entry.name, path: childPath, kind: 'directory', children: [], isLoaded: false });
        } else if (entry.isFile) {
          const fileType = getFileType(entry.name);
          if (fileType) nodes.push({ name: entry.name, path: childPath, kind: 'file', fileType });
        }
      }

      return nodes.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
      });
    } catch {
      return [];
    }
  };

  const updateTreeNode = (nodes: FileNode[], path: string, updater: (node: FileNode) => FileNode): FileNode[] => {
    return nodes.map(node => {
      if (node.path === path) return updater(node);
      if (node.kind === 'directory' && node.children) {
        return { ...node, children: updateTreeNode(node.children, path, updater) };
      }
      return node;
    });
  };

  const findTreeNode = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.kind === 'directory' && node.children) {
        const found = findTreeNode(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const handleNewFile = async () => {
    if (!rootDir) return;
    const name = window.prompt("Enter new file name (e.g. note.md):");
    if (!name) return;
    let fileName = name.trim();
    if (!fileName) return;
    if (!fileName.includes('.')) {
      fileName += '.md';
    }
    const path = `${rootDir}/${fileName}`;
    try {
      await writeTextFile(path, "");
      setFileTree(await scanDir(rootDir));
      await openFile(path);
    } catch (err) {
      alert(`Failed to create file: ${err}`);
    }
  };

  const handleNewFolder = async () => {
    if (!rootDir) return;
    const name = window.prompt("Enter new folder name:");
    if (!name) return;
    const folderName = name.trim();
    if (!folderName) return;
    const path = `${rootDir}/${folderName}`;
    try {
      await mkdir(path, { recursive: true });
      setFileTree(await scanDir(rootDir));
    } catch (err) {
      alert(`Failed to create folder: ${err}`);
    }
  };

  const handleDelete = async (node: FileNode) => {
    const ok = window.confirm(`Are you sure you want to delete ${node.name}? This cannot be undone.`);
    if (!ok) return;
    try {
      await remove(node.path, { recursive: true });
      if (currentFile?.path === node.path) {
        setCurrentFile(null);
        resetDocumentState();
      }
      if (rootDir) {
        setFileTree(await scanDir(rootDir));
      }
    } catch (err) {
      alert(`Failed to delete item: ${err}`);
    }
  };

  const saveMarkdownSilently = useCallback(async () => {
    if (!currentFile || editorContent === markdownContent) return;
    try {
      setSaveStatus('Auto-saving...');
      await writeTextFile(currentFile.path, editorContent);
      setMarkdownContent(editorContent);
      setSaveStatus('Auto-saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch {
      setSaveStatus('Auto-save failed');
    }
  }, [currentFile, editorContent, markdownContent]);

  useEffect(() => {
    if (!autoSaveEnabled || !isEditing || !currentFile || currentFile.fileType !== 'markdown') return;

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(() => {
      void saveMarkdownSilently();
    }, 30000); // 30 seconds

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [autoSaveEnabled, currentFile, isEditing, saveMarkdownSilently]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [currentFile, isEditing]);

  useEffect(() => {
    const unlisten = listen<string>('document-file-opened', (event) => {
      openFile(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  // Rebind the desktop file-open listener when document guard state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges, markdownContent, pdfUrl]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aerodoc-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('aerodoc-auto-save', String(autoSaveEnabled));
  }, [autoSaveEnabled]);

  useEffect(() => {
    localStorage.setItem('aerodoc-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('aerodoc-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handlePointerMove = (event: PointerEvent) => {
      setSidebarWidth(Math.min(420, Math.max(220, event.clientX)));
    };
    const handlePointerUp = () => setIsResizingSidebar(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    document.body.classList.add('is-resizing-sidebar');

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.classList.remove('is-resizing-sidebar');
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleOpenVault = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') await openVault(selected);
    } catch (err) {
      console.error('Error opening vault:', err);
    }
  };

  const handleOpenRecentVault = async () => {
    if (!recentVault) return;
    try {
      await openVault(recentVault);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`AeroDoc could not reopen this folder.\n\n${msg}`);
    }
  };

  const loadDirChildren = async (path: string) => {
    const node = findTreeNode(fileTree, path);
    if (!node || node.kind !== 'directory' || node.isLoaded || node.isLoading) return;

    setFileTree(prev => updateTreeNode(prev, path, current => ({ ...current, isLoading: true })));
    const children = await scanDir(path);
    setFileTree(prev => updateTreeNode(prev, path, current => ({
      ...current,
      children,
      isLoaded: true,
      isLoading: false,
    })));
  };

  const toggleDir = (node: FileNode) => {
    const path = node.path;
    const willExpand = !expandedDirs.has(path);

    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });

    if (willExpand) void loadDirChildren(path);
  };

  const enterEditMode = () => {
    setEditorContent(markdownContent);
    setIsEditing(true);
    setEditorLayout('editor');
    setSaveStatus('');
    window.setTimeout(() => editorRef.current?.focus(), 0);
  };

  const cancelEditMode = () => {
    if (hasUnsavedChanges && !window.confirm('Discard unsaved changes?')) return;
    setEditorContent(markdownContent);
    setIsEditing(false);
    setEditorLayout('editor');
    setSaveStatus('');
  };

  const saveMarkdown = async () => {
    if (!currentFile) return;
    await writeTextFile(currentFile.path, editorContent);
    setMarkdownContent(editorContent);
    setIsEditing(false);
    setSaveStatus('Saved');
  };

  const saveDocx = async () => {
    if (!currentFile) return;
    const ok = window.confirm('This rewrites the DOCX as a simplified text document. Continue?');
    if (!ok) return;

    const { Document, Packer, Paragraph, TextRun } = await import('docx');

    const paragraphs = editorContent.split(/\r?\n/).map(line => (
      new Paragraph({ children: [new TextRun(line || ' ')] })
    ));
    const doc = new Document({ sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph('')] }] });
    const buffer = await Packer.toArrayBuffer(doc);
    await writeFile(currentFile.path, new Uint8Array(buffer));
    setMarkdownContent(editorContent);
    setIsEditing(false);
    setSaveStatus('Saved simplified DOCX');
    await loadDocx(currentFile);
  };

  const writeGridToWorksheet = (targetWorkbook: Workbook, sheetName: string, rows: GridValue[][]) => {
    const sheet = targetWorkbook.getWorksheet(sheetName) ?? targetWorkbook.addWorksheet(sheetName);
    if (sheet.rowCount > 0) sheet.spliceRows(1, sheet.rowCount);
    rows.forEach(row => sheet.addRow(row));
  };

  const saveSpreadsheet = async () => {
    if (!currentFile) return;
    const sheetName = activeSheet || 'Sheet1';

    if (currentFile.fileType === 'csv') {
      const Papa = (await import('papaparse')).default;
      await writeTextFile(currentFile.path, Papa.unparse(gridData));
      setSaveStatus('Saved CSV');
      setSheetDirty(false);
      return;
    }

    const ExcelJS = (await import('exceljs')).default;
    const nextWorkbook = new ExcelJS.Workbook();
    const names = workbook?.worksheets.map(sheet => sheet.name) ?? [sheetName];
    for (const name of names.length ? names : [sheetName]) {
      const sheet = nextWorkbook.addWorksheet(name);
      const rows = name === sheetName ? gridData : worksheetToGrid(workbook?.getWorksheet(name));
      rows.forEach(row => sheet.addRow(row));
    }
    const data = await nextWorkbook.xlsx.writeBuffer();
    await writeFile(currentFile.path, new Uint8Array(data));
    setWorkbook(nextWorkbook);
    setSaveStatus('Saved XLSX');
    setSheetDirty(false);
  };

  const saveCurrentFile = async () => {
    if (!currentFile) return;
    try {
      if (currentFile.fileType === 'markdown') await saveMarkdown();
      if (currentFile.fileType === 'docx') await saveDocx();
      if (currentFile.fileType === 'xlsx' || currentFile.fileType === 'csv') await saveSpreadsheet();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveStatus(`Save failed: ${msg}`);
    }
  };

  const switchSheet = (sheetName: string) => {
    if (!workbook) return;
    if (activeSheet && sheetDirty) {
      writeGridToWorksheet(workbook, activeSheet, gridData);
      setWorkbook(workbook);
    }
    setActiveSheet(sheetName);
    setGridData(worksheetToGrid(workbook.getWorksheet(sheetName)));
    setSheetDirty(false);
    setSelectedRange(null);
    setSaveStatus('');
  };

  const setCellValue = (rowIndex: number, columnIndex: number, value: string) => {
    setGridData(prev => {
      const next = [...prev];
      while (next.length <= rowIndex) next.push([]);
      const nextRow = [...(next[rowIndex] ?? [])];
      while (nextRow.length <= columnIndex) nextRow.push('');
      nextRow[columnIndex] = value;
      next[rowIndex] = nextRow;
      return next;
    });
    setSheetDirty(true);
    setSaveStatus('');
  };

  const addRow = () => {
    const width = getGridColumnCount(gridData, 8);
    setGridData(prev => [...prev, Array.from({ length: width }, () => '')]);
    setSheetDirty(true);
    setSaveStatus('');
  };

  const addColumn = () => {
    setGridData(prev => prev.map(row => [...row, '']));
    setSheetDirty(true);
    setSaveStatus('');
  };

  const normalizedSelection = useMemo(() => {
    if (!selectedRange) return null;
    return {
      startRow: Math.min(selectedRange.anchor.row, selectedRange.focus.row),
      endRow: Math.max(selectedRange.anchor.row, selectedRange.focus.row),
      startColumn: Math.min(selectedRange.anchor.column, selectedRange.focus.column),
      endColumn: Math.max(selectedRange.anchor.column, selectedRange.focus.column),
    };
  }, [selectedRange]);

  const selectedCellCount = normalizedSelection
    ? (normalizedSelection.endRow - normalizedSelection.startRow + 1) * (normalizedSelection.endColumn - normalizedSelection.startColumn + 1)
    : 0;

  const isCellSelected = (row: number, column: number) => Boolean(
    normalizedSelection
    && row >= normalizedSelection.startRow
    && row <= normalizedSelection.endRow
    && column >= normalizedSelection.startColumn
    && column <= normalizedSelection.endColumn
  );

  const handleCellPointerDown = (row: number, column: number, shiftKey: boolean) => {
    const nextFocus = { row, column };
    setSelectedRange(previous => ({
      anchor: shiftKey && previous ? previous.anchor : nextFocus,
      focus: nextFocus,
    }));
    setIsSelectingCells(true);
  };

  const handleCellPointerEnter = (row: number, column: number) => {
    if (!isSelectingCells) return;
    setSelectedRange(previous => previous ? { ...previous, focus: { row, column } } : {
      anchor: { row, column },
      focus: { row, column },
    });
  };

  const applyPastedGrid = (startRow: number, startColumn: number, pastedRows: string[][]) => {
    if (pastedRows.length === 0) return;

    setGridData(previous => {
      const next = [...previous];
      pastedRows.forEach((pastedRow, rowOffset) => {
        const targetRowIndex = startRow + rowOffset;
        while (next.length <= targetRowIndex) next.push([]);
        const nextRow = [...(next[targetRowIndex] ?? [])];
        pastedRow.forEach((value, columnOffset) => {
          const targetColumnIndex = startColumn + columnOffset;
          while (nextRow.length <= targetColumnIndex) nextRow.push('');
          nextRow[targetColumnIndex] = value;
        });
        next[targetRowIndex] = nextRow;
      });
      return next;
    });

    const pastedColumnCount = getGridColumnCount(pastedRows, 1);
    setSelectedRange({
      anchor: { row: startRow, column: startColumn },
      focus: {
        row: startRow + pastedRows.length - 1,
        column: startColumn + pastedColumnCount - 1,
      },
    });
    setSheetDirty(true);
    setSaveStatus(`Pasted ${pastedRows.length} × ${pastedColumnCount}`);
  };

  const handleSheetScroll = (target: HTMLDivElement) => {
    if (sheetScrollFrameRef.current !== null) return;
    sheetScrollFrameRef.current = window.requestAnimationFrame(() => {
      setSheetViewport({
        scrollTop: target.scrollTop,
        scrollLeft: target.scrollLeft,
        width: target.clientWidth,
        height: target.clientHeight,
      });
      sheetScrollFrameRef.current = null;
    });
  };

  useEffect(() => {
    const stopSelecting = () => setIsSelectingCells(false);
    window.addEventListener('pointerup', stopSelecting);
    return () => window.removeEventListener('pointerup', stopSelecting);
  }, []);

  useEffect(() => {
    if (!isSpreadsheet) return;
    const viewport = sheetViewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => setSheetViewport(previous => ({
      ...previous,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      scrollTop: viewport.scrollTop,
      scrollLeft: viewport.scrollLeft,
    }));

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [currentFile?.path, isSpreadsheet]);

  useEffect(() => {
    const isSheetFocused = () => Boolean(
      isSpreadsheet
      && sheetViewportRef.current
      && document.activeElement
      && sheetViewportRef.current.contains(document.activeElement)
    );

    const handleCopy = (event: ClipboardEvent) => {
      if (!isSheetFocused() || !normalizedSelection || !event.clipboardData) return;
      const rows: string[] = [];
      for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
        const values: string[] = [];
        for (let column = normalizedSelection.startColumn; column <= normalizedSelection.endColumn; column += 1) {
          values.push(String(gridData[row]?.[column] ?? ''));
        }
        rows.push(values.join('\t'));
      }
      event.preventDefault();
      event.clipboardData.setData('text/plain', rows.join('\r\n'));
      setSaveStatus(`Copied ${selectedCellCount} cell${selectedCellCount === 1 ? '' : 's'}`);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!isSheetFocused() || !selectedRange || !event.clipboardData) return;
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(row => row.split('\t'));
      if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
      const startRow = normalizedSelection?.startRow ?? selectedRange.focus.row;
      const startColumn = normalizedSelection?.startColumn ?? selectedRange.focus.column;
      applyPastedGrid(startRow, startColumn, rows);
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [gridData, isSpreadsheet, normalizedSelection, selectedCellCount, selectedRange]);

  const fileCount = useMemo(() => {
    const countFiles = (nodes: FileNode[]): number => nodes.reduce((total, node) => (
      total + (node.kind === 'file' ? 1 : countFiles(node.children ?? []))
    ), 0);
    return countFiles(fileTree);
  }, [fileTree]);

  const documentStats = useMemo(() => {
    if (!currentFile || (currentFile.fileType !== 'markdown' && currentFile.fileType !== 'docx')) return null;
    const content = isEditing ? editorContent : markdownContent;
    const trimmed = content.trim();
    return {
      words: trimmed ? trimmed.split(/\s+/u).length : 0,
      characters: content.length,
      lines: content ? content.split(/\r?\n/u).length : 0,
    };
  }, [currentFile, editorContent, isEditing, markdownContent]);

  const relativeDocumentPath = useMemo(() => {
    if (!currentFile) return '';
    if (!rootDir || !currentFile.path.startsWith(rootDir)) return currentFile.name;
    return currentFile.path.slice(rootDir.length).replace(/^\//, '') || currentFile.name;
  }, [currentFile, rootDir]);

  useEffect(() => {
    keyboardContextRef.current = {
      currentFile,
      canSave,
      isEditing,
      openVault: handleOpenVault,
      saveFile: saveCurrentFile,
      enterEdit: enterEditMode,
      cancelEdit: cancelEditMode,
    };
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const context = keyboardContextRef.current;
      if (!context) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'o') {
        event.preventDefault();
        void context.openVault();
      }
      if (modifier && key === 's' && context.currentFile) {
        event.preventDefault();
        if (context.canSave) void context.saveFile();
      }
      if (modifier && key === 'k') {
        event.preventDefault();
        setSidebarCollapsed(false);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (modifier && key === 'b') {
        event.preventDefault();
        setSidebarCollapsed(value => !value);
      }
      if (modifier && key === 'e' && context.currentFile && (context.currentFile.fileType === 'markdown' || context.currentFile.fileType === 'docx')) {
        event.preventDefault();
        if (context.isEditing) context.cancelEdit(); else context.enterEdit();
      }
      if (event.key === 'Escape' && context.isEditing) {
        context.cancelEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return fileTree;
    const q = searchQuery.toLowerCase();
    const filter = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce<FileNode[]>((acc, node) => {
        if (node.kind === 'file') {
          if (node.name.toLowerCase().includes(q)) acc.push(node);
        } else if (node.children) {
          const kids = filter(node.children);
          if (node.name.toLowerCase().includes(q) || kids.length > 0) acc.push({ ...node, children: kids });
        }
        return acc;
      }, []);
    };
    return filter(fileTree);
  }, [fileTree, searchQuery]);

  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedDirs.has(node.path);
      const isSelected = currentFile?.path === node.path;

      if (node.kind === 'directory') {
        return (
          <div key={node.path}>
            <div className="tree-item dir-item" style={{ paddingLeft: `${level * 12 + 12}px` }} onClick={() => toggleDir(node)}>
              {isExpanded ? <ChevronDown /> : <ChevronRight />}
              <span className="tree-item-label font-medium">{node.name}</span>
              {node.isLoading && <span className="file-ext">...</span>}
              <button
                className="tree-item-delete"
                onClick={(e) => { e.stopPropagation(); void handleDelete(node); }}
                title="Delete directory"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {isExpanded && node.children && renderTree(node.children, level + 1)}
          </div>
        );
      }

      return (
        <div
          key={node.path}
          className={`tree-item file-item ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: `${level * 12 + 28}px` }}
          onClick={() => openFile(node.path)}
        >
          {node.fileType === 'xlsx' || node.fileType === 'csv' ? <FileSpreadsheet /> : <FileText />}
          <span className="tree-item-label">{node.name.replace(/\.(md|pdf|docx|xlsx|csv)$/i, '')}</span>
          <span className="file-ext">{getExtension(node.name).slice(1)}</span>
          <button
            className="tree-item-delete"
            onClick={(e) => { e.stopPropagation(); void handleDelete(node); }}
            title="Delete file"
          >
            <Trash2 size={12} />
          </button>
        </div>
      );
    });
  };

  const findFilePathByName = (nodes: FileNode[], targetName: string): string | null => {
    for (const node of nodes) {
      if (node.kind === 'file') {
        const nameWithoutExt = node.name.replace(/\.[^/.]+$/, "");
        if (nameWithoutExt.toLowerCase() === targetName.toLowerCase()) {
          return node.path;
        }
      } else if (node.kind === 'directory' && node.children) {
        const path = findFilePathByName(node.children, targetName);
        if (path) return path;
      }
    }
    return null;
  };

  const renderMarkdownPreview = (content = markdownContent, className = '') => (
    <div className={`markdown-container ${className}`.trim()}>
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkFrontmatter]}
          children={content.replace(/\[\[(.*?)\]\]/g, (_match, p1) => {
            const parts = p1.split('|');
            const target = parts[0];
            const alias = parts.length > 1 ? parts[1] : target;
            return `[${alias}](#wiki-${encodeURIComponent(target)})`;
          })}
          components={{
            a: (props) => {
              if (props.href?.startsWith('#wiki-')) {
                const target = decodeURIComponent(props.href.slice(6));
                return (
                  <span
                    className="wiki-link"
                    onClick={() => {
                      const path = findFilePathByName(fileTree, target);
                      if (path) {
                        void openFile(path);
                      } else {
                        alert(`AeroDoc: Target note "${target}.md" not found in current vault.`);
                      }
                    }}
                  >
                    {props.children}
                  </span>
                );
              }
              return <a {...props} target="_blank" rel="noopener noreferrer" />;
            }
          }}
        />
      </div>
    </div>
  );

  const renderDocumentBody = () => {
    if (!currentFile) return null;

    if (currentFile.fileType === 'pdf') {
      return pdfUrl ? <iframe className="pdf-frame" src={pdfUrl} title={currentFile.name} /> : <div className="empty-state"><p>Loading PDF...</p></div>;
    }

    if (currentFile.fileType === 'xlsx' || currentFile.fileType === 'csv') {
      const rowCount = Math.max(1, gridData.length);
      const columnCount = getGridColumnCount(gridData, 8);
      const startRow = Math.max(0, Math.floor(sheetViewport.scrollTop / SHEET_ROW_HEIGHT) - SHEET_OVERSCAN);
      const endRow = Math.min(
        rowCount,
        Math.ceil((sheetViewport.scrollTop + sheetViewport.height) / SHEET_ROW_HEIGHT) + SHEET_OVERSCAN,
      );
      const startColumn = Math.max(0, Math.floor(sheetViewport.scrollLeft / SHEET_COLUMN_WIDTH) - SHEET_OVERSCAN);
      const endColumn = Math.min(
        columnCount,
        Math.ceil((sheetViewport.scrollLeft + sheetViewport.width) / SHEET_COLUMN_WIDTH) + SHEET_OVERSCAN,
      );
      const visibleRows = Array.from({ length: Math.max(0, endRow - startRow) }, (_unused, index) => startRow + index);
      const visibleColumns = Array.from({ length: Math.max(0, endColumn - startColumn) }, (_unused, index) => startColumn + index);

      return (
        <div className="sheet-pane">
          <div className="sheet-tabs">
            {sheetNames.map(name => (
              <button key={name} className={`sheet-tab ${name === activeSheet ? 'active' : ''}`} onClick={() => switchSheet(name)}>
                {name}
              </button>
            ))}
            <span className="sheet-selection-summary">
              {selectedCellCount > 0 ? `${selectedCellCount} selected` : 'Drag to select cells'}
            </span>
          </div>
          <div
            ref={sheetViewportRef}
            className={`sheet-grid-wrap ${isSelectingCells ? 'is-selecting' : ''}`}
            tabIndex={0}
            onScroll={(event) => handleSheetScroll(event.currentTarget)}
            onPointerLeave={() => setIsSelectingCells(false)}
            role="grid"
            aria-rowcount={rowCount}
            aria-colcount={columnCount}
            aria-label={`${currentFile.name} spreadsheet`}
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
                  top: sheetViewport.scrollTop,
                  left: sheetViewport.scrollLeft,
                  width: SHEET_ROW_HEADER_WIDTH,
                  height: SHEET_COLUMN_HEADER_HEIGHT,
                }}
              />

              {visibleColumns.map(columnIndex => (
                <div
                  key={`column-${columnIndex}`}
                  className="sheet-header-cell sheet-column-header"
                  style={{
                    top: sheetViewport.scrollTop,
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
                  key={`row-${rowIndex}`}
                  className="sheet-header-cell sheet-row-header"
                  style={{
                    top: SHEET_COLUMN_HEADER_HEIGHT + rowIndex * SHEET_ROW_HEIGHT,
                    left: sheetViewport.scrollLeft,
                    width: SHEET_ROW_HEADER_WIDTH,
                    height: SHEET_ROW_HEIGHT,
                  }}
                >
                  {rowIndex + 1}
                </div>
              ))}

              {visibleRows.flatMap(rowIndex => visibleColumns.map(columnIndex => {
                const selected = isCellSelected(rowIndex, columnIndex);
                const isAnchor = selectedRange?.anchor.row === rowIndex && selectedRange.anchor.column === columnIndex;
                return (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className={`sheet-data-cell ${selected ? 'selected' : ''} ${isAnchor ? 'selection-anchor' : ''}`}
                    style={{
                      top: SHEET_COLUMN_HEADER_HEIGHT + rowIndex * SHEET_ROW_HEIGHT,
                      left: SHEET_ROW_HEADER_WIDTH + columnIndex * SHEET_COLUMN_WIDTH,
                      width: SHEET_COLUMN_WIDTH,
                      height: SHEET_ROW_HEIGHT,
                    }}
                    onPointerDown={(event) => handleCellPointerDown(rowIndex, columnIndex, event.shiftKey)}
                    onPointerEnter={() => handleCellPointerEnter(rowIndex, columnIndex)}
                    role="gridcell"
                    aria-selected={selected}
                  >
                    <input
                      value={String(gridData[rowIndex]?.[columnIndex] ?? '')}
                      onChange={(event) => setCellValue(rowIndex, columnIndex, event.target.value)}
                      onFocus={() => {
                        if (!selected) {
                          setSelectedRange({
                            anchor: { row: rowIndex, column: columnIndex },
                            focus: { row: rowIndex, column: columnIndex },
                          });
                        }
                      }}
                      aria-label={`${columnName(columnIndex)}${rowIndex + 1}`}
                    />
                  </div>
                );
              }))}
            </div>
          </div>
        </div>
      );
    }

    if (isEditing) {
      const editor = (
        <div className="editor-container">
          <textarea
            ref={editorRef}
            className="markdown-editor"
            value={editorContent}
            onChange={(event) => {
              setEditorContent(event.target.value);
              setSaveStatus('');
            }}
            onBlur={() => {
              if (autoSaveEnabled && isEditing && currentFile && currentFile.fileType === 'markdown') {
                void saveMarkdownSilently();
              }
            }}
            spellCheck={false}
            aria-label={`Edit ${currentFile.name}`}
          />
        </div>
      );

      if (currentFile.fileType === 'markdown' && editorLayout === 'split') {
        return (
          <div className="editor-workspace split-view">
            {editor}
            {renderMarkdownPreview(editorContent, 'live-preview')}
          </div>
        );
      }

      return (
        <div className="editor-workspace">
          {editor}
        </div>
      );
    }

    if (currentFile.fileType === 'docx') {
      return (
        <div className="markdown-container">
          <div className="markdown-body docx-preview" dangerouslySetInnerHTML={{ __html: docxHtml }} />
        </div>
      );
    }

    return renderMarkdownPreview();
  };

  return (
    <div id="root">
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-leading">
          <button
            className="titlebar-sidebar-toggle"
            onClick={() => setSidebarCollapsed(value => !value)}
            title={`${sidebarCollapsed ? 'Show' : 'Hide'} sidebar (Ctrl+B)`}
            aria-label={`${sidebarCollapsed ? 'Show' : 'Hide'} sidebar`}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <div className="titlebar-title" data-tauri-drag-region>
            <span className="brand-mark"><Sparkles className="titlebar-icon" /></span>
            <span data-tauri-drag-region>AeroDoc</span>
            {rootDir && <span className="titlebar-workspace" data-tauri-drag-region>/ {rootDir.split('/').pop()}</span>}
          </div>
        </div>

        <div className="titlebar-controls">
          <div className="theme-selector" aria-label="Color theme">
            <button className={`theme-dot dot-gemini ${theme === 'gemini' ? 'active' : ''}`} onClick={() => setTheme('gemini')} title="Gemini blue" aria-label="Use Gemini blue theme" />
            <button className={`theme-dot dot-claude ${theme === 'claude' ? 'active' : ''}`} onClick={() => setTheme('claude')} title="Claude clay" aria-label="Use Claude clay theme" />
            <button className={`theme-dot dot-sakura ${theme === 'sakura' ? 'active' : ''}`} onClick={() => setTheme('sakura')} title="Sakura light" aria-label="Use Sakura light theme" />
            <button className={`theme-dot dot-dark ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} title="Graphite dark" aria-label="Use Graphite dark theme" />
          </div>
          <div className="window-controls">
            <button className="win-btn" onClick={() => appWindow.minimize()} aria-label="Minimize"><Minus size={14} /></button>
            <button className="win-btn" onClick={() => appWindow.toggleMaximize()} aria-label="Maximize"><Square size={11} /></button>
            <button className="win-btn win-close" onClick={() => appWindow.close()} aria-label="Close"><X size={14} /></button>
          </div>
        </div>
      </div>

      <div className="app-body">
        {!sidebarCollapsed && (
          <aside className="sidebar" style={{ width: sidebarWidth }}>
            <div className="sidebar-header">
              <div className="sidebar-heading">
                <div>
                  <span className="eyebrow">Workspace</span>
                  <strong>{rootDir?.split('/').pop() || 'No folder open'}</strong>
                </div>
                <button className="icon-button" onClick={handleOpenVault} title="Open folder (Ctrl+O)" aria-label="Open folder">
                  <FolderOpen size={15} />
                </button>
              </div>
              <div className="search-box">
                <Search />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search files"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  disabled={!rootDir}
                  aria-label="Search files"
                />
                {searchQuery && (
                  <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                    <X size={12} />
                  </button>
                )}
                <kbd>Ctrl K</kbd>
              </div>
            </div>

            <div className="file-tree">
              {!rootDir ? (
                <div className="sidebar-empty">
                  <FolderOpen className="sidebar-empty-icon" />
                  <p>Open a folder to browse documents.</p>
                  <button className="text-button" onClick={handleOpenVault}>Choose folder</button>
                </div>
              ) : (
                <>
                  <div className="vault-header">
                    <span className="vault-name">Files</span>
                    <div className="vault-actions">
                      <button onClick={handleNewFile} className="vault-action-btn" title="New file" aria-label="New file"><FilePlus size={14} /></button>
                      <button onClick={handleNewFolder} className="vault-action-btn" title="New folder" aria-label="New folder"><FolderPlus size={14} /></button>
                    </div>
                  </div>
                  {filteredTree.length > 0 ? renderTree(filteredTree) : (
                    <div className="tree-no-results">
                      <Search size={20} />
                      <span>No matching files</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="sidebar-footer">
              <span><Files size={13} /> {fileCount} visible files</span>
              <span><Keyboard size={13} /> Ctrl+B</span>
            </div>
            <div className="sidebar-resizer" onPointerDown={() => setIsResizingSidebar(true)} aria-hidden="true" />
          </aside>
        )}

        <main className="content-pane">
          {currentFile ? (
            <>
              <div className="document-toolbar">
                <div className="document-meta">
                  <span className="document-icon">
                    {isSpreadsheet ? <FileSpreadsheet size={17} /> : currentFile.fileType === 'markdown' ? <BookOpen size={17} /> : <FileText size={17} />}
                  </span>
                  <div className="document-heading">
                    <div className="document-title-row">
                      <span className="document-title">{currentFile.name}</span>
                      <span className="file-type-badge">{currentFile.fileType === 'markdown' ? 'MD' : currentFile.fileType.toUpperCase()}</span>
                      {hasUnsavedChanges && <span className="dirty-indicator"><span /> Unsaved</span>}
                      {saveStatus && <span className={`save-status ${saveStatus.includes('failed') ? 'error' : ''}`}>{saveStatus}</span>}
                    </div>
                    <span className="document-path" title={currentFile.path}>{relativeDocumentPath}</span>
                  </div>
                </div>

                <div className="document-actions">
                  {currentFile.fileType === 'markdown' && isEditing && (
                    <div className="view-switcher" aria-label="Editor layout">
                      <button className={editorLayout === 'editor' ? 'active' : ''} onClick={() => setEditorLayout('editor')} title="Editor only">
                        <Edit3 size={14} /><span>Edit</span>
                      </button>
                      <button className={editorLayout === 'split' ? 'active' : ''} onClick={() => setEditorLayout('split')} title="Split editor and preview">
                        <Columns2 size={14} /><span>Split</span>
                      </button>
                    </div>
                  )}

                  {currentFile.fileType === 'markdown' && isEditing && (
                    <label className="auto-save-toggle" title="Save Markdown 30 seconds after typing stops">
                      <input type="checkbox" checked={autoSaveEnabled} onChange={(event) => setAutoSaveEnabled(event.target.checked)} />
                      <span className="toggle-track"><span /></span>
                      <span>Auto-save</span>
                    </label>
                  )}

                  {isSpreadsheet && (
                    <>
                      <button className="toolbar-btn" onClick={addRow} title="Add row"><Plus size={14} />Row</button>
                      <button className="toolbar-btn" onClick={addColumn} title="Add column"><Plus size={14} />Column</button>
                    </>
                  )}

                  {(currentFile.fileType === 'markdown' || currentFile.fileType === 'docx') && (isEditing ? (
                    <button className="toolbar-btn" onClick={cancelEditMode} title="Discard changes (Esc)"><RotateCcw size={14} />Cancel</button>
                  ) : (
                    <button className="toolbar-btn" onClick={enterEditMode} title="Edit as plain text (Ctrl+E)"><Edit3 size={14} />Edit</button>
                  ))}

                  {currentFile.fileType !== 'pdf' && (
                    <button className="toolbar-btn primary" onClick={saveCurrentFile} title="Save file (Ctrl+S)" disabled={!canSave}>
                      <Save size={14} />Save
                    </button>
                  )}
                </div>
              </div>

              <div className="document-canvas">{renderDocumentBody()}</div>

              <div className="statusbar">
                <div className="statusbar-group">
                  <span>{isEditing ? <Edit3 size={12} /> : <Eye size={12} />}{isEditing ? 'Editing' : 'Reading'}</span>
                  <span>{currentFile.fileType.toUpperCase()}</span>
                </div>
                <div className="statusbar-group">
                  {documentStats && <><span>{documentStats.words} words</span><span>{documentStats.characters} chars</span><span>{documentStats.lines} lines</span></>}
                  {isSpreadsheet && <><span>{gridData.length} rows</span><span>{getGridColumnCount(gridData)} columns</span></>}
                  <span className="shortcut-hint">Ctrl+S save</span>
                </div>
              </div>
            </>
          ) : !rootDir ? (
            <div className="welcome-shell">
              <div className="welcome-hero">
                <span className="welcome-mark"><Sparkles /></span>
                <span className="eyebrow">Local-first document workspace</span>
                <h1>Read, edit, and move on.</h1>
                <p>AeroDoc keeps lightweight documents close at hand without hauling in a full office suite.</p>
                <div className="welcome-actions">
                  <button className="open-folder-btn" onClick={handleOpenVault}><FolderOpen size={17} />Open folder</button>
                  {recentVault && (
                    <button className="recent-vault-btn" onClick={handleOpenRecentVault} title={recentVault}>
                      <Clock3 size={16} />Reopen {recentVault.split('/').pop()}
                    </button>
                  )}
                </div>
              </div>

              <div className="capability-grid">
                <div className="capability-card"><BookOpen /><strong>Focused reading</strong><span>Markdown, PDF, and DOCX previews with a calm reading width.</span></div>
                <div className="capability-card"><Edit3 /><strong>Quick edits</strong><span>Plain-text editing, live Markdown split view, and optional auto-save.</span></div>
                <div className="capability-card"><FileSpreadsheet /><strong>Small data jobs</strong><span>Edit CSV and XLSX values without opening a heavyweight spreadsheet app.</span></div>
              </div>

              <div className="shortcut-strip">
                <span><kbd>Ctrl O</kbd> Open</span><span><kbd>Ctrl K</kbd> Search</span><span><kbd>Ctrl E</kbd> Edit</span><span><kbd>Ctrl S</kbd> Save</span>
              </div>
            </div>
          ) : (
            <div className="workspace-empty">
              <span className="workspace-empty-icon"><FolderOpen /></span>
              <span className="eyebrow">{rootDir.split('/').pop()}</span>
              <h2>Your workspace is ready.</h2>
              <p>Select a document from the sidebar, or create a fresh Markdown note.</p>
              <div className="welcome-actions">
                <button className="open-folder-btn" onClick={handleNewFile}><FilePlus size={16} />New note</button>
                <button className="recent-vault-btn" onClick={handleNewFolder}><FolderPlus size={16} />New folder</button>
              </div>
              <p className="supported-list">Supports {SUPPORTED_EXTENSIONS.join('  ')}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
