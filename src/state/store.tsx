import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { mkdir, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';
import type {
  Annotation,
  CellRange,
  CurrentFile,
  DocumentTab,
  FileNode,
  FileType,
  GridValue,
  Locale,
  RecentFileEntry,
  SearchHit,
  Theme,
} from '../types';
import { basename, getFileType, norm } from '../lib/paths';
import { findTreeNode, scanDir, updateTreeNode, searchVaultContent } from '../lib/files';
import { loadDocument } from '../lib/loaders';
import { saveCurrentTab } from '../lib/savers';
import { emptyGrid, normalizeSelection } from '../lib/spreadsheet';
import { translate } from '../i18n';

const RECENT_FILES_KEY = 'aerodoc-recent-files';
const MAX_RECENT_FILES = 12;

let tabSeq = 0;
const createTabId = () => `tab-${++tabSeq}-${Date.now()}`;

const createEmptyTabState = (file: CurrentFile): DocumentTab => ({
  id: createTabId(),
  file,
  markdownContent: '',
  editorContent: '',
  isEditing: false,
  editorLayout: 'editor',
  pdfUrl: null,
  docxHtml: '',
  plainText: '',
  workbook: null,
  sheetNames: [],
  activeSheet: '',
  gridData: emptyGrid(),
  cellFormulas: {},
  sheetDirty: false,
  selectedRange: null,
  saveStatus: '',
});

function parseRecentFiles(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentFileEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_FILES) : [];
  } catch {
    return [];
  }
}

function loadAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem('aerodoc-annotations');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Annotation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface AppStoreValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => string;

  rootDir: string | null;
  fileTree: FileNode[];
  recentVault: string | null;
  recentFiles: RecentFileEntry[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  tabs: DocumentTab[];
  activeTabId: string | null;
  activeTab: DocumentTab | null;
  historyBack: string[];
  historyForward: string[];

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  sidebarWidth: number;
  setSidebarWidth: (value: number) => void;
  isResizingSidebar: boolean;
  setIsResizingSidebar: (value: boolean) => void;

  paletteOpen: boolean;
  setPaletteOpen: (value: boolean) => void;
  fullTextQuery: string;
  setFullTextQuery: (value: string) => void;
  fullTextHits: SearchHit[];
  fullTextSearching: boolean;
  runFullTextSearch: (query: string) => Promise<void>;

  annotations: Annotation[];
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt'>) => void;
  removeAnnotation: (id: string) => void;

  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (value: boolean) => void;

  openVault: (dirPath?: string) => Promise<void>;
  openFile: (absPath: string, options?: { pushHistory?: boolean }) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  goBack: () => void;
  goForward: () => void;
  goToFileLine: (path: string, line: number) => Promise<void>;

  refreshTree: () => Promise<void>;
  loadDirChildren: (path: string) => Promise<void>;
  toggleDir: (node: FileNode) => void;
  handleNewFile: () => Promise<void>;
  handleNewFolder: () => Promise<void>;
  handleDelete: (node: FileNode) => Promise<void>;

  updateActiveTab: (patch: Partial<DocumentTab>) => void;
  enterEditMode: () => void;
  cancelEditMode: () => void;
  saveActiveFile: () => Promise<void>;
  canSaveActive: boolean;
  hasUnsavedActive: boolean;

  documentStats: { words: number; characters: number; lines: number } | null;
  relativeDocumentPath: string;

  expandedDirs: Set<string>;
  setExpandedDirs: (updater: (prev: Set<string>) => Set<string>) => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('aerodoc-theme');
    return saved === 'claude' || saved === 'sakura' || saved === 'dark' ? saved : 'gemini';
  });
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('aerodoc-locale');
    return saved === 'en-US' || saved === 'zh-TW' ? saved : 'zh-TW';
  });

  const [rootDir, setRootDir] = useState<string | null>(null);
  const rootDirRef = useRef<string | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [recentVault, setRecentVault] = useState<string | null>(
    () => localStorage.getItem('aerodoc-recent-vault'),
  );
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(parseRecentFiles);
  const [searchQuery, setSearchQuery] = useState('');

  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [historyBack, setHistoryBack] = useState<string[]>([]);
  const [historyForward, setHistoryForward] = useState<string[]>([]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('aerodoc-sidebar-collapsed') === 'true',
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('aerodoc-sidebar-width'));
    return Number.isFinite(saved) ? Math.min(420, Math.max(220, saved)) : 276;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [fullTextQuery, setFullTextQuery] = useState('');
  const [fullTextHits, setFullTextHits] = useState<SearchHit[]>([]);
  const [fullTextSearching, setFullTextSearching] = useState(false);

  const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(
    () => localStorage.getItem('aerodoc-auto-save') === 'true',
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const t = useCallback(
    (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aerodoc-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('aerodoc-locale', locale);
  }, [locale]);

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
    localStorage.setItem('aerodoc-annotations', JSON.stringify(annotations));
  }, [annotations]);

  const persistRecentFile = useCallback((file: CurrentFile) => {
    setRecentFiles(prev => {
      const next = [
        { path: file.path, name: file.name, fileType: file.fileType, openedAt: Date.now() },
        ...prev.filter(item => item.path !== file.path),
      ].slice(0, MAX_RECENT_FILES);
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const hasUnsavedActive = Boolean(
    activeTab &&
      ((activeTab.isEditing && activeTab.editorContent !== activeTab.markdownContent) ||
        activeTab.sheetDirty),
  );

  const canSaveActive = Boolean(
    activeTab &&
      ((activeTab.isEditing &&
        (activeTab.file.fileType === 'markdown' ||
          activeTab.file.fileType === 'docx' ||
          activeTab.file.fileType === 'text' ||
          activeTab.file.fileType === 'code' ||
          activeTab.file.fileType === 'html') &&
        activeTab.editorContent !== activeTab.markdownContent) ||
        ((activeTab.file.fileType === 'xlsx' || activeTab.file.fileType === 'csv') &&
          activeTab.sheetDirty)),
  );

  const updateTabById = useCallback((tabId: string, patch: Partial<DocumentTab>) => {
    setTabs(prev => prev.map(tab => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const updateActiveTab = useCallback(
    (patch: Partial<DocumentTab>) => {
      if (!activeTabId) return;
      updateTabById(activeTabId, patch);
    },
    [activeTabId, updateTabById],
  );

  const openFile = useCallback(
    async (absPath: string, options?: { pushHistory?: boolean }) => {
      const p = norm(absPath);
      if (loadingPath === p) return;

      const existing = tabs.find(tab => tab.file.path === p);
      if (existing) {
        if (options?.pushHistory !== false && activeTabId) {
          const currentPath = tabs.find(tab => tab.id === activeTabId)?.file.path;
          if (currentPath && currentPath !== p) {
            setHistoryBack(prev => [...prev, currentPath]);
            setHistoryForward([]);
          }
        }
        setActiveTabId(existing.id);
        return;
      }

      const name = basename(p);
      const fileType = getFileType(name);
      if (!fileType) return;

      setLoadingPath(p);
      const tab = createEmptyTabState({ name, path: p, fileType });

      try {
        const loaded = await loadDocument(tab.file);
        let next: DocumentTab = { ...tab };

        if (loaded.kind === 'markdown') {
          next = {
            ...next,
            markdownContent: loaded.markdownContent,
            editorContent: loaded.editorContent,
          };
        } else if (loaded.kind === 'pdf') {
          next = { ...next, pdfUrl: loaded.pdfUrl };
        } else if (loaded.kind === 'docx') {
          next = {
            ...next,
            docxHtml: loaded.docxHtml,
            plainText: loaded.plainText,
            markdownContent: loaded.plainText,
            editorContent: loaded.plainText,
          };
        } else if (loaded.kind === 'text') {
          next = {
            ...next,
            plainText: loaded.plainText,
            editorContent: loaded.editorContent,
            markdownContent: loaded.markdownContent,
          };
        } else if (loaded.kind === 'sheet') {
          next = {
            ...next,
            workbook: loaded.workbook,
            sheetNames: loaded.sheetNames,
            activeSheet: loaded.activeSheet,
            gridData: loaded.gridData,
            cellFormulas: loaded.cellFormulas,
            sheetDirty: false,
          };
        }

        if (options?.pushHistory !== false && activeTabId) {
          const currentPath = tabs.find(tabItem => tabItem.id === activeTabId)?.file.path;
          if (currentPath && currentPath !== p) {
            setHistoryBack(prev => [...prev, currentPath]);
            setHistoryForward([]);
          }
        }

        setTabs(prev => [...prev, next]);
        setActiveTabId(next.id);
        persistRecentFile(next.file);

        const currentRoot = rootDirRef.current;
        const parentDir = p.substring(0, p.lastIndexOf('/'));
        const isInsideVault = currentRoot && p.startsWith(`${currentRoot}/`);
        if (!isInsideVault) {
          setRootDir(parentDir);
          rootDirRef.current = parentDir;
          await invoke('allow_vault_scope', { path: parentDir });
          setFileTree(await scanDir(parentDir));
        }
        setExpandedDirs(prev => {
          const nextSet = new Set(prev);
          nextSet.add(parentDir);
          return nextSet;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const failed: DocumentTab = {
          ...tab,
          markdownContent: `> ${t('loadFailed')}\n\n\`\`\`\n${msg}\n\`\`\`\n\nPath: \`${p}\``,
          editorContent: '',
          saveStatus: `${t('loadFailed')}: ${msg}`,
        };
        setTabs(prev => [...prev, failed]);
        setActiveTabId(failed.id);
      } finally {
        setLoadingPath(null);
      }
    },
    [activeTabId, loadingPath, persistRecentFile, t, tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find(item => item.id === tabId);
      if (!tab) return;
      const dirty =
        (tab.isEditing && tab.editorContent !== tab.markdownContent) || tab.sheetDirty;
      if (dirty && !window.confirm(t('discardConfirm'))) return;

      if (tab.pdfUrl) URL.revokeObjectURL(tab.pdfUrl);

      setTabs(prev => {
        const next = prev.filter(item => item.id !== tabId);
        if (activeTabId === tabId) {
          const index = prev.findIndex(item => item.id === tabId);
          const fallback = next[Math.min(index, next.length - 1)];
          setActiveTabId(fallback?.id ?? null);
        }
        return next;
      });
    },
    [activeTabId, t, tabs],
  );

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      const dirtyOthers = tabs.filter(
        tab =>
          tab.id !== tabId &&
          ((tab.isEditing && tab.editorContent !== tab.markdownContent) || tab.sheetDirty),
      );
      if (dirtyOthers.length > 0 && !window.confirm(t('discardConfirm'))) return;

      setTabs(prev => {
        prev.forEach(tab => {
          if (tab.id !== tabId && tab.pdfUrl) URL.revokeObjectURL(tab.pdfUrl);
        });
        return prev.filter(tab => tab.id === tabId);
      });
      setActiveTabId(tabId);
    },
    [t, tabs],
  );

  const setActiveTab = useCallback((tabId: string) => setActiveTabId(tabId), []);

  const goBack = useCallback(() => {
    if (historyBack.length === 0) return;
    const target = historyBack[historyBack.length - 1];
    setHistoryBack(prev => prev.slice(0, -1));
    if (activeTabId) {
      const currentPath = tabs.find(tab => tab.id === activeTabId)?.file.path;
      if (currentPath) setHistoryForward(prev => [...prev, currentPath]);
    }
    void openFile(target, { pushHistory: false });
  }, [activeTabId, historyBack, openFile, tabs]);

  const goForward = useCallback(() => {
    if (historyForward.length === 0) return;
    const target = historyForward[historyForward.length - 1];
    setHistoryForward(prev => prev.slice(0, -1));
    if (activeTabId) {
      const currentPath = tabs.find(tab => tab.id === activeTabId)?.file.path;
      if (currentPath) setHistoryBack(prev => [...prev, currentPath]);
    }
    void openFile(target, { pushHistory: false });
  }, [activeTabId, historyForward, openFile, tabs]);

  const goToFileLine = useCallback(
    async (path: string, line: number) => {
      await openFile(path);
      window.setTimeout(() => {
        const event = new CustomEvent('aerodoc-goto-line', { detail: { path, line } });
        window.dispatchEvent(event);
      }, 80);
    },
    [openFile],
  );

  const openVault = useCallback(
    async (dirPath?: string) => {
      if (hasUnsavedActive && !window.confirm(t('discardVaultConfirm'))) return;

      let d = dirPath;
      if (!d) {
        const selected = await open({ directory: true, multiple: false });
        if (!selected || typeof selected !== 'string') return;
        d = selected;
      }

      const normalized = norm(d);
      setRootDir(normalized);
      rootDirRef.current = normalized;
      setRecentVault(normalized);
      localStorage.setItem('aerodoc-recent-vault', normalized);
      await invoke('allow_vault_scope', { path: normalized });
      setFileTree(await scanDir(normalized));
      setExpandedDirs(new Set([normalized]));
      setTabs(prev => {
        prev.forEach(tab => {
          if (tab.pdfUrl) URL.revokeObjectURL(tab.pdfUrl);
        });
        return [];
      });
      setActiveTabId(null);
      setHistoryBack([]);
      setHistoryForward([]);
    },
    [hasUnsavedActive, t],
  );

  const refreshTree = useCallback(async () => {
    if (!rootDirRef.current) return;
    setFileTree(await scanDir(rootDirRef.current));
  }, []);

  const loadDirChildren = useCallback(
    async (path: string) => {
      const node = findTreeNode(fileTree, path);
      if (!node || node.kind !== 'directory' || node.isLoaded || node.isLoading) return;

      setFileTree(prev =>
        updateTreeNode(prev, path, current => ({ ...current, isLoading: true })),
      );
      const children = await scanDir(path);
      setFileTree(prev =>
        updateTreeNode(prev, path, current => ({
          ...current,
          children,
          isLoaded: true,
          isLoading: false,
        })),
      );
    },
    [fileTree],
  );

  const toggleDir = useCallback(
    (node: FileNode) => {
      const path = node.path;
      const willExpand = !expandedDirs.has(path);

      setExpandedDirs(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });

      if (willExpand) void loadDirChildren(path);
    },
    [expandedDirs, loadDirChildren],
  );

  const handleNewFile = useCallback(async () => {
    if (!rootDir) return;
    const name = window.prompt(t('newFile') + ' (e.g. note.md):');
    if (!name) return;
    let fileName = name.trim();
    if (!fileName) return;
    if (!fileName.includes('.')) fileName += '.md';
    const path = `${rootDir}/${fileName}`;
    try {
      await writeTextFile(path, '');
      await refreshTree();
      await openFile(path);
    } catch (err) {
      alert(String(err));
    }
  }, [openFile, refreshTree, rootDir, t]);

  const handleNewFolder = useCallback(async () => {
    if (!rootDir) return;
    const name = window.prompt(t('newFolder') + ':');
    if (!name) return;
    const folderName = name.trim();
    if (!folderName) return;
    try {
      await mkdir(`${rootDir}/${folderName}`, { recursive: true });
      await refreshTree();
    } catch (err) {
      alert(String(err));
    }
  }, [refreshTree, rootDir, t]);

  const handleDelete = useCallback(
    async (node: FileNode) => {
      if (!window.confirm(`${t('deleteConfirm')}\n${node.name}`)) return;
      try {
        await remove(node.path, { recursive: true });
        const related = tabs.filter(tab => tab.file.path === node.path);
        related.forEach(tab => {
          if (tab.pdfUrl) URL.revokeObjectURL(tab.pdfUrl);
        });
        setTabs(prev => prev.filter(tab => tab.file.path !== node.path));
        if (related.some(tab => tab.id === activeTabId)) {
          setActiveTabId(null);
        }
        await refreshTree();
      } catch (err) {
        alert(String(err));
      }
    },
    [activeTabId, refreshTree, t, tabs],
  );

  const enterEditMode = useCallback(() => {
    if (!activeTab) return;
    if (activeTab.file.fileType === 'pdf') return;
    updateActiveTab({
      isEditing: true,
      editorLayout: 'editor',
      editorContent:
        activeTab.file.fileType === 'markdown' || activeTab.file.fileType === 'docx'
          ? activeTab.markdownContent || activeTab.plainText
          : activeTab.plainText || activeTab.markdownContent,
      saveStatus: '',
    });
  }, [activeTab, updateActiveTab]);

  const cancelEditMode = useCallback(() => {
    if (!activeTab) return;
    const dirty = activeTab.isEditing && activeTab.editorContent !== activeTab.markdownContent;
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    updateActiveTab({
      isEditing: false,
      editorLayout: 'editor',
      editorContent: activeTab.markdownContent || activeTab.plainText,
      saveStatus: '',
    });
  }, [activeTab, t, updateActiveTab]);

  const saveActiveFile = useCallback(async () => {
    if (!activeTab) return;
    try {
      const result = await saveCurrentTab(activeTab.file, {
        editorContent: activeTab.editorContent,
        plainText: activeTab.plainText,
        gridData: activeTab.gridData,
        cellFormulas: activeTab.cellFormulas,
        workbook: activeTab.workbook,
        sheetNames: activeTab.sheetNames,
        activeSheet: activeTab.activeSheet,
      });

      updateActiveTab({
        markdownContent: activeTab.editorContent,
        isEditing: false,
        sheetDirty: false,
        saveStatus: t('saved'),
        ...(result.workbook ? { workbook: result.workbook } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateActiveTab({ saveStatus: `${t('saveFailed')}: ${msg}` });
    }
  }, [activeTab, t, updateActiveTab]);

  const runFullTextSearch = useCallback(
    async (query: string) => {
      setFullTextQuery(query);
      if (!query.trim() || fileTree.length === 0) {
        setFullTextHits([]);
        return;
      }
      setFullTextSearching(true);
      try {
        const hits = await searchVaultContent(fileTree, query);
        setFullTextHits(hits);
      } finally {
        setFullTextSearching(false);
      }
    },
    [fileTree],
  );

  const addAnnotation = useCallback(
    (annotation: Omit<Annotation, 'id' | 'createdAt'>) => {
      setAnnotations(prev => [
        ...prev,
        {
          ...annotation,
          id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
        },
      ]);
    },
    [],
  );

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(item => item.id !== id));
  }, []);

  useEffect(() => {
    const unlisten = listen<string>('document-file-opened', event => {
      void openFile(event.payload);
    });
    return () => {
      void unlisten.then(fn => fn());
    };
  }, [openFile]);

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

  const documentStats = useMemo(() => {
    if (!activeTab) return null;
    if (
      activeTab.file.fileType !== 'markdown' &&
      activeTab.file.fileType !== 'docx' &&
      activeTab.file.fileType !== 'text' &&
      activeTab.file.fileType !== 'code'
    ) {
      return null;
    }
    const content = activeTab.isEditing ? activeTab.editorContent : activeTab.markdownContent || activeTab.plainText;
    const trimmed = content.trim();
    return {
      words: trimmed ? trimmed.split(/\s+/u).length : 0,
      characters: content.length,
      lines: content ? content.split(/\r?\n/u).length : 0,
    };
  }, [activeTab]);

  const relativeDocumentPath = useMemo(() => {
    if (!activeTab) return '';
    if (!rootDir || !activeTab.file.path.startsWith(rootDir)) return activeTab.file.name;
    return activeTab.file.path.slice(rootDir.length).replace(/^\//, '') || activeTab.file.name;
  }, [activeTab, rootDir]);

  const value: AppStoreValue = {
    theme,
    setTheme: setThemeState,
    locale,
    setLocale: setLocaleState,
    t,

    rootDir,
    fileTree,
    recentVault,
    recentFiles,
    searchQuery,
    setSearchQuery,

    tabs,
    activeTabId,
    activeTab,
    historyBack,
    historyForward,

    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    isResizingSidebar,
    setIsResizingSidebar,

    paletteOpen,
    setPaletteOpen,
    fullTextQuery,
    setFullTextQuery,
    fullTextHits,
    fullTextSearching,
    runFullTextSearch,

    annotations,
    addAnnotation,
    removeAnnotation,

    autoSaveEnabled,
    setAutoSaveEnabled,

    openVault,
    openFile,
    closeTab,
    closeOtherTabs,
    setActiveTab,
    goBack,
    goForward,
    goToFileLine,

    refreshTree,
    loadDirChildren,
    toggleDir,
    handleNewFile,
    handleNewFolder,
    handleDelete,

    updateActiveTab,
    enterEditMode,
    cancelEditMode,
    saveActiveFile,
    canSaveActive,
    hasUnsavedActive,

    documentStats,
    relativeDocumentPath,

    expandedDirs,
    setExpandedDirs,
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used within AppStoreProvider');
  return ctx;
}

export function selectionStats(tab: DocumentTab) {
  const normalized = normalizeSelection(tab.selectedRange as CellRange | null);
  if (!normalized) return { count: 0, normalized: null };
  const count =
    (normalized.endRow - normalized.startRow + 1) *
    (normalized.endColumn - normalized.startColumn + 1);
  return { count, normalized };
}

export type { DocumentTab, GridValue, FileType };
