import { FolderOpen, BookOpen, Edit3, FileSpreadsheet, Clock3, FilePlus, FolderPlus, Sparkles } from 'lucide-react';
import { useAppStore } from '../state/store';

export function WelcomeShell() {
  const { openVault, recentVault, t } = useAppStore();

  return (
    <div className="welcome-shell">
      <div className="welcome-hero">
        <span className="welcome-mark">
          <Sparkles />
        </span>
        <span className="eyebrow">{t('welcome.eyebrow')}</span>
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.desc')}</p>
        <div className="welcome-actions">
          <button className="open-folder-btn" onClick={() => void openVault()}>
            <FolderOpen size={17} />
            {t('openFolder')}
          </button>
          {recentVault && (
            <button
              className="recent-vault-btn"
              onClick={() => void openVault(recentVault)}
              title={recentVault}
            >
              <Clock3 size={16} />
              {t('reopen')} {recentVault.split('/').pop()}
            </button>
          )}
        </div>
      </div>

      <div className="capability-grid">
        <div className="capability-card">
          <BookOpen />
          <strong>{t('welcome.reading')}</strong>
          <span>{t('welcome.readingDesc')}</span>
        </div>
        <div className="capability-card">
          <Edit3 />
          <strong>{t('welcome.editing')}</strong>
          <span>{t('welcome.editingDesc')}</span>
        </div>
        <div className="capability-card">
          <FileSpreadsheet />
          <strong>{t('welcome.data')}</strong>
          <span>{t('welcome.dataDesc')}</span>
        </div>
      </div>

      <div className="shortcut-strip">
        <span>
          <kbd>Ctrl P</kbd> {t('commandPalette')}
        </span>
        <span>
          <kbd>Ctrl O</kbd> {t('openFolder')}
        </span>
        <span>
          <kbd>Ctrl E</kbd> {t('edit')}
        </span>
        <span>
          <kbd>Ctrl S</kbd> {t('save')}
        </span>
      </div>
    </div>
  );
}

export function WorkspaceEmpty() {
  const { rootDir, handleNewFile, handleNewFolder, t } = useAppStore();
  return (
    <div className="workspace-empty">
      <span className="workspace-empty-icon">
        <FolderOpen />
      </span>
      <span className="eyebrow">{rootDir?.split('/').pop()}</span>
      <h2>{t('workspaceReady')}</h2>
      <p>{t('workspaceReadyDesc')}</p>
      <div className="welcome-actions">
        <button className="open-folder-btn" onClick={() => void handleNewFile()}>
          <FilePlus size={16} />
          {t('newNote')}
        </button>
        <button className="recent-vault-btn" onClick={() => void handleNewFolder()}>
          <FolderPlus size={16} />
          {t('newFolder')}
        </button>
      </div>
      <p className="supported-list">
        {t('supports')}: .md .pdf .docx .xlsx .csv .txt .json .ts .js .rs .py …
      </p>
    </div>
  );
}

export function AnnotationsPanel() {
  const { annotations, activeTab, removeAnnotation, t } = useAppStore();
  if (!activeTab) return null;
  const items = annotations.filter(item => item.filePath === activeTab.file.path);
  if (items.length === 0) return null;

  return (
    <div className="annotations-panel">
      <div className="annotations-header">{t('highlights')}</div>
      {items.map(item => (
        <div key={item.id} className="annotation-item">
          <span className="annotation-color" style={{ background: item.color }} />
          <span className="annotation-text">{item.text}</span>
          <button onClick={() => removeAnnotation(item.id)} aria-label="Remove">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
