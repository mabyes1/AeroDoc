import {
  Search,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Trash2,
  FilePlus,
  FolderPlus,
  Files,
  Keyboard,
  X,
  Clock3,
  Type,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAppStore } from '../state/store';
import { filterTree, countFiles } from '../lib/files';
import type { FileNode, FileType } from '../types';

function fileIcon(fileType?: FileType) {
  if (fileType === 'xlsx' || fileType === 'csv') return <FileSpreadsheet />;
  if (fileType === 'code' || fileType === 'text') return <Type />;
  return <FileText />;
}

function TreeItem({ node, level }: { node: FileNode; level: number }) {
  const { expandedDirs, toggleDir, openFile, handleDelete, activeTab } = useAppStore();
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = activeTab?.file.path === node.path;

  if (node.kind === 'directory') {
    return (
      <div>
        <div
          className="tree-item dir-item"
          style={{ paddingLeft: `${level * 12 + 12}px` }}
          onClick={() => toggleDir(node)}
        >
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
          <span className="tree-item-label font-medium">{node.name}</span>
          {node.isLoading && <span className="file-ext">...</span>}
          <button
            className="tree-item-delete"
            onClick={e => {
              e.stopPropagation();
              void handleDelete(node);
            }}
            title="Delete directory"
          >
            <Trash2 size={12} />
          </button>
        </div>
        {isExpanded &&
          node.children?.map(child => (
            <TreeItem key={child.path} node={child} level={level + 1} />
          ))}
      </div>
    );
  }

  return (
    <div
      className={`tree-item file-item ${isSelected ? 'active' : ''}`}
      style={{ paddingLeft: `${level * 12 + 28}px` }}
      onClick={() => void openFile(node.path)}
    >
      {fileIcon(node.fileType)}
      <span className="tree-item-label">
        {node.name.replace(/\.(md|pdf|docx|xlsx|csv|txt)$/i, '')}
      </span>
      <span className="file-ext">{node.name.slice(node.name.lastIndexOf('.') + 1)}</span>
      <button
        className="tree-item-delete"
        onClick={e => {
          e.stopPropagation();
          void handleDelete(node);
        }}
        title="Delete file"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export function SidebarConnected() {
  const {
    rootDir,
    fileTree,
    searchQuery,
    setSearchQuery,
    openVault,
    handleNewFile,
    handleNewFolder,
    recentFiles,
    openFile,
    t,
    sidebarWidth,
    setPaletteOpen,
    setIsResizingSidebar,
  } = useAppStore();

  const filteredTree = useMemo(() => filterTree(fileTree, searchQuery), [fileTree, searchQuery]);
  const fileCount = useMemo(() => countFiles(fileTree), [fileTree]);

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">
        <div className="sidebar-heading">
          <div>
            <span className="eyebrow">{t('workspace')}</span>
            <strong>{rootDir?.split('/').pop() || t('noFolder')}</strong>
          </div>
          <button
            className="icon-button"
            onClick={() => void openVault()}
            title={`${t('openFolder')} (Ctrl+O)`}
            aria-label={t('openFolder')}
          >
            <FolderOpen size={15} />
          </button>
        </div>
        <div className="search-box">
          <Search />
          <input
            type="text"
            placeholder={t('searchFiles')}
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            disabled={!rootDir}
            aria-label={t('searchFiles')}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear"
            >
              <X size={12} />
            </button>
          )}
          <kbd>Ctrl K</kbd>
        </div>
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={13} />
          <span>{t('commandPalette')}</span>
          <kbd>Ctrl P</kbd>
        </button>
      </div>

      <div className="file-tree">
        {!rootDir ? (
          <div className="sidebar-empty">
            <FolderOpen className="sidebar-empty-icon" />
            <p>{t('noFolder')}</p>
            <button className="text-button" onClick={() => void openVault()}>
              {t('openFolder')}
            </button>
          </div>
        ) : (
          <>
            <div className="vault-header">
              <span className="vault-name">{t('files')}</span>
              <div className="vault-actions">
                <button
                  onClick={() => void handleNewFile()}
                  className="vault-action-btn"
                  title={t('newFile')}
                >
                  <FilePlus size={14} />
                </button>
                <button
                  onClick={() => void handleNewFolder()}
                  className="vault-action-btn"
                  title={t('newFolder')}
                >
                  <FolderPlus size={14} />
                </button>
              </div>
            </div>
            {filteredTree.length > 0 ? (
              filteredTree.map(node => <TreeItem key={node.path} node={node} level={0} />)
            ) : (
              <div className="tree-no-results">
                <Search size={20} />
                <span>{t('noResults')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {recentFiles.length > 0 && (
        <div className="recent-files">
          <div className="recent-files-header">
            <Clock3 size={12} />
            <span>{t('recentFiles')}</span>
          </div>
          {recentFiles.slice(0, 6).map(item => (
            <button
              key={item.path}
              className="recent-file-item"
              onClick={() => void openFile(item.path)}
              title={item.path}
            >
              {fileIcon(item.fileType)}
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <span>
          <Files size={13} /> {fileCount}
        </span>
        <span>
          <Keyboard size={13} /> Ctrl+B
        </span>
      </div>
      <div
        className="sidebar-resizer"
        onPointerDown={() => setIsResizingSidebar(true)}
        aria-hidden="true"
      />
    </aside>
  );
}
