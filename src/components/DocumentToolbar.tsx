import {
  Save,
  Edit3,
  RotateCcw,
  Columns2,
  Plus,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Type,
  Highlighter,
} from 'lucide-react';
import { useAppStore } from '../state/store';

export function DocumentToolbar() {
  const {
    activeTab,
    updateActiveTab,
    enterEditMode,
    cancelEditMode,
    saveActiveFile,
    canSaveActive,
    hasUnsavedActive,
    autoSaveEnabled,
    setAutoSaveEnabled,
    relativeDocumentPath,
    t,
    addAnnotation,
  } = useAppStore();

  if (!activeTab) return null;
  const { file, isEditing, editorLayout, saveStatus, sheetDirty } = activeTab;
  const isSpreadsheet = file.fileType === 'xlsx' || file.fileType === 'csv';
  const isMarkdown = file.fileType === 'markdown';
  const isHtml = file.fileType === 'html';
  const isTextLike =
    isMarkdown ||
    isHtml ||
    file.fileType === 'docx' ||
    file.fileType === 'text' ||
    file.fileType === 'code';

  const supportsSplit = isMarkdown || isHtml;

  const addRow = () => {
    const width = Math.max(8, ...activeTab.gridData.map(row => row.length));
    updateActiveTab({
      gridData: [...activeTab.gridData, Array.from({ length: width }, () => '')],
      sheetDirty: true,
      saveStatus: '',
    });
  };

  const addColumn = () => {
    updateActiveTab({
      gridData: activeTab.gridData.map(row => [...row, '']),
      sheetDirty: true,
      saveStatus: '',
    });
  };

  return (
    <div className="document-toolbar">
      <div className="document-meta">
        <span className="document-icon">
          {isSpreadsheet ? (
            <FileSpreadsheet size={17} />
          ) : isMarkdown ? (
            <BookOpen size={17} />
          ) : file.fileType === 'code' || file.fileType === 'text' ? (
            <Type size={17} />
          ) : (
            <FileText size={17} />
          )}
        </span>
        <div className="document-heading">
          <div className="document-title-row">
            <span className="document-title">{file.name}</span>
            <span className="file-type-badge">
              {file.fileType === 'markdown' ? 'MD' : file.fileType.toUpperCase()}
            </span>
            {hasUnsavedActive && (
              <span className="dirty-indicator">
                <span /> {t('unsaved')}
              </span>
            )}
            {saveStatus && (
              <span className={`save-status ${saveStatus.includes('failed') ? 'error' : ''}`}>
                {saveStatus}
              </span>
            )}
          </div>
          <span className="document-path" title={file.path}>
            {relativeDocumentPath}
          </span>
        </div>
      </div>

      <div className="document-actions">
        {supportsSplit && isEditing && (
          <div className="view-switcher" aria-label="Editor layout">
            <button
              className={editorLayout === 'editor' ? 'active' : ''}
              onClick={() => updateActiveTab({ editorLayout: 'editor' })}
            >
              <Edit3 size={14} />
              <span>{isHtml ? 'Source' : t('edit')}</span>
            </button>
            <button
              className={editorLayout === 'split' ? 'active' : ''}
              onClick={() => updateActiveTab({ editorLayout: 'split' })}
            >
              <Columns2 size={14} />
              <span>{t('split')}</span>
            </button>
          </div>
        )}

        {supportsSplit && isEditing && (
          <label className="auto-save-toggle" title="Auto-save">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={event => setAutoSaveEnabled(event.target.checked)}
            />
            <span className="toggle-track">
              <span />
            </span>
            <span>{t('autoSave')}</span>
          </label>
        )}

        {isSpreadsheet && (
          <>
            <button className="toolbar-btn" onClick={addRow} title={t('addRow')}>
              <Plus size={14} />
              {t('addRow')}
            </button>
            <button className="toolbar-btn" onClick={addColumn} title={t('addColumn')}>
              <Plus size={14} />
              {t('addColumn')}
            </button>
          </>
        )}

        {file.fileType === 'pdf' && (
          <button
            className="toolbar-btn"
            onClick={() => {
              const text = window.getSelection()?.toString();
              addAnnotation({
                filePath: file.path,
                type: 'highlight',
                color: '#8AB4F8',
                text: text || 'PDF highlight',
              });
            }}
            title={t('addHighlight')}
          >
            <Highlighter size={14} />
            {t('addHighlight')}
          </button>
        )}

        {isTextLike &&
          (isEditing ? (
            <button className="toolbar-btn" onClick={cancelEditMode} title={`${t('cancel')} (Esc)`}>
              <RotateCcw size={14} />
              {t('cancel')}
            </button>
          ) : (
            <button
              className="toolbar-btn"
              onClick={enterEditMode}
              title={`${t('edit')} (Ctrl+E)`}
            >
              <Edit3 size={14} />
              {t('edit')}
            </button>
          ))}

        {file.fileType !== 'pdf' && (
          <button
            className="toolbar-btn primary"
            onClick={() => void saveActiveFile()}
            title={`${t('save')} (Ctrl+S)`}
            disabled={!canSaveActive && !sheetDirty}
          >
            <Save size={14} />
            {t('save')}
          </button>
        )}
      </div>
    </div>
  );
}
