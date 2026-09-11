import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  FileText,
  FolderOpen,
  Edit3,
  Palette,
  CornerDownLeft,
} from 'lucide-react';
import { useAppStore } from '../state/store';
import { collectFiles } from '../lib/files';
import type { FileNode, Theme } from '../types';

type PaletteAction = {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const store = useAppStore();
  const {
    paletteOpen,
    setPaletteOpen,
    t,
    fileTree,
    openFile,
    openVault,
    setTheme,
    setLocale,
    enterEditMode,
    saveActiveFile,
    activeTab,
    recentFiles,
    goToFileLine,
    runFullTextSearch,
    fullTextHits,
  } = store;
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'command' | 'search'>('command');
  const [files, setFiles] = useState<FileNode[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) {
      setQuery('');
      setMode('command');
      setHighlight(0);
      return;
    }
    inputRef.current?.focus();
    void collectFiles(fileTree).then(setFiles);
  }, [paletteOpen, fileTree]);

  const commands = useMemo<PaletteAction[]>(() => {
    const actions: PaletteAction[] = [
      {
        id: 'open-vault',
        title: t('openFolder'),
        subtitle: 'Ctrl+O',
        category: 'File',
        run: () => void openVault(),
      },
      {
        id: 'toggle-theme',
        title: `${t('theme')}: Gemini`,
        category: 'View',
        run: () => setTheme('gemini' as Theme),
      },
      {
        id: 'theme-claude',
        title: `${t('theme')}: Claude`,
        category: 'View',
        run: () => setTheme('claude' as Theme),
      },
      {
        id: 'theme-sakura',
        title: `${t('theme')}: Sakura`,
        category: 'View',
        run: () => setTheme('sakura' as Theme),
      },
      {
        id: 'theme-dark',
        title: `${t('theme')}: Dark`,
        category: 'View',
        run: () => setTheme('dark' as Theme),
      },
      {
        id: 'locale-zh',
        title: `${t('language')}: 繁體中文`,
        category: 'View',
        run: () => setLocale('zh-TW'),
      },
      {
        id: 'locale-en',
        title: `${t('language')}: English`,
        category: 'View',
        run: () => setLocale('en-US'),
      },
      {
        id: 'file-associations',
        title: t('associations'),
        category: 'System',
        run: () => {
          localStorage.removeItem('aerodoc-associations-seen');
          window.dispatchEvent(new CustomEvent('aerodoc-open-associations'));
        },
      },
    ];

    if (activeTab) {
      actions.push({
        id: 'edit',
        title: t('edit'),
        subtitle: 'Ctrl+E',
        category: 'Document',
        run: () => enterEditMode(),
      });
      actions.push({
        id: 'save',
        title: t('save'),
        subtitle: 'Ctrl+S',
        category: 'Document',
        run: () => void saveActiveFile(),
      });
      actions.push({
        id: 'copy-path',
        title: t('copyPath'),
        category: 'Document',
        run: () => void navigator.clipboard.writeText(activeTab.file.path),
      });
    }

    for (const file of files.slice(0, 40)) {
      actions.push({
        id: `file-${file.path}`,
        title: file.name,
        subtitle: file.path,
        category: t('files'),
        run: () => void openFile(file.path),
      });
    }

    for (const recent of recentFiles) {
      actions.push({
        id: `recent-${recent.path}`,
        title: `${t('recentFiles')}: ${recent.name}`,
        subtitle: recent.path,
        category: t('recentFiles'),
        run: () => void openFile(recent.path),
      });
    }

    return actions;
  }, [
    activeTab,
    enterEditMode,
    fileTree.length,
    files,
    openFile,
    openVault,
    recentFiles,
    saveActiveFile,
    setLocale,
    setTheme,
    t,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 30);
    return commands
      .filter(action =>
        `${action.title} ${action.subtitle ?? ''} ${action.category}`.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [commands, query]);

  const showSearchMode = mode === 'search' || query.startsWith('?');
  const searchQuery = query.startsWith('?') ? query.slice(1).trim() : query;

  useEffect(() => {
    if (!showSearchMode || !searchQuery) return;
    const timer = window.setTimeout(() => {
      void runFullTextSearch(searchQuery);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [runFullTextSearch, searchQuery, showSearchMode]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPaletteOpen(false);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight(prev => (prev + 1) % Math.max(1, showSearchMode ? fullTextHits.length : filtered.length));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight(prev => {
          const max = Math.max(1, showSearchMode ? fullTextHits.length : filtered.length);
          return (prev - 1 + max) % max;
        });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (showSearchMode) {
          const hit = fullTextHits[highlight];
          if (hit) {
            void goToFileLine(hit.path, hit.line);
            setPaletteOpen(false);
          }
          return;
        }
        const action = filtered[highlight];
        if (action) {
          void action.run();
          setPaletteOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filtered, fullTextHits, goToFileLine, highlight, paletteOpen, setPaletteOpen, showSearchMode]);

  useEffect(() => {
    setHighlight(0);
  }, [mode, query]);

  if (!paletteOpen) return null;

  return (
    <div className="palette-overlay" onClick={() => setPaletteOpen(false)}>
      <div className="palette-panel" onClick={event => event.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => {
              const value = event.target.value;
              setQuery(value);
              setMode(value.startsWith('?') ? 'search' : 'command');
            }}
            placeholder={
              showSearchMode ? t('fullTextSearchPlaceholder') : t('commandHint')
            }
            aria-label={t('commandPalette')}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="palette-body" ref={listRef}>
          {showSearchMode ? (
            fullTextHits.length === 0 ? (
              <div className="palette-empty">{t('noResults')}</div>
            ) : (
              fullTextHits.map((hit, index) => (
                <button
                  key={`${hit.path}-${hit.line}-${index}`}
                  className={`palette-item ${index === highlight ? 'active' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => {
                    void goToFileLine(hit.path, hit.line);
                    setPaletteOpen(false);
                  }}
                >
                  <FileText size={14} />
                  <div className="palette-item-text">
                    <strong>
                      {hit.name}
                      <span className="palette-meta">:{hit.line}</span>
                    </strong>
                    <span>{hit.preview}</span>
                  </div>
                  <CornerDownLeft size={12} className="palette-enter" />
                </button>
              ))
            )
          ) : filtered.length === 0 ? (
            <div className="palette-empty">{t('noResults')}</div>
          ) : (
            filtered.map((action, index) => (
              <button
                key={action.id}
                className={`palette-item ${index === highlight ? 'active' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => {
                  void action.run();
                  setPaletteOpen(false);
                }}
              >
                {action.category === t('files') ? (
                  <FileText size={14} />
                ) : action.category === 'View' ? (
                  <Palette size={14} />
                ) : action.category === 'Document' ? (
                  <Edit3 size={14} />
                ) : (
                  <FolderOpen size={14} />
                )}
                <div className="palette-item-text">
                  <strong>{action.title}</strong>
                  <span>
                    {action.category}
                    {action.subtitle ? ` · ${action.subtitle}` : ''}
                  </span>
                </div>
                <CornerDownLeft size={12} className="palette-enter" />
              </button>
            ))
          )}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑↓</kbd> {t('jumpTo')}
          </span>
          <span>
            <kbd>Enter</kbd> {t('openFile')}
          </span>
          <span>
            <kbd>? </kbd> {t('searchContent')}
          </span>
        </div>
      </div>
    </div>
  );
}

export function GlobalShortcuts() {
  const {
    openVault,
    saveActiveFile,
    setSidebarCollapsed,
    setPaletteOpen,
    activeTab,
    enterEditMode,
    cancelEditMode,
    goBack,
    goForward,
    canSaveActive,
  } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (modifier && key === 'p') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (modifier && key === 'o') {
        event.preventDefault();
        void openVault();
        return;
      }
      if (modifier && key === 's' && activeTab) {
        event.preventDefault();
        if (canSaveActive) void saveActiveFile();
        return;
      }
      if (modifier && key === 'b') {
        event.preventDefault();
        setSidebarCollapsed(value => !value);
        return;
      }
      if (modifier && key === 'k') {
        event.preventDefault();
        setSidebarCollapsed(false);
        window.setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('.search-box input');
          input?.focus();
        }, 0);
        return;
      }
      if (modifier && key === 'e' && activeTab && activeTab.file.fileType !== 'pdf') {
        event.preventDefault();
        if (activeTab.isEditing) cancelEditMode();
        else enterEditMode();
        return;
      }
      if (modifier && event.altKey && key === 'arrowleft') {
        event.preventDefault();
        goBack();
        return;
      }
      if (modifier && event.altKey && key === 'arrowright') {
        event.preventDefault();
        goForward();
        return;
      }
      if (event.key === 'Escape' && activeTab?.isEditing && !isInput) {
        cancelEditMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    canSaveActive,
    cancelEditMode,
    enterEditMode,
    goBack,
    goForward,
    openVault,
    saveActiveFile,
    setPaletteOpen,
    setSidebarCollapsed,
  ]);

  return null;
}
