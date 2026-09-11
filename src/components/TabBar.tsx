import { X, FileText, FileSpreadsheet, Type, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../state/store';
import type { FileType } from '../types';

function iconFor(fileType: FileType) {
  if (fileType === 'xlsx' || fileType === 'csv') return <FileSpreadsheet size={13} />;
  if (fileType === 'code' || fileType === 'text') return <Type size={13} />;
  return <FileText size={13} />;
}

export function TabBar() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    historyBack,
    historyForward,
    goBack,
    goForward,
    t,
  } = useAppStore();

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      <div className="tab-nav">
        <button
          className="tab-nav-btn"
          onClick={goBack}
          disabled={historyBack.length === 0}
          title={t('goBack')}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          className="tab-nav-btn"
          onClick={goForward}
          disabled={historyForward.length === 0}
          title={t('goForward')}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="tab-list" role="tablist">
        {tabs.map(tab => {
          const dirty =
            (tab.isEditing && tab.editorContent !== tab.markdownContent) || tab.sheetDirty;
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab-item ${active ? 'active' : ''} ${dirty ? 'dirty' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onAuxClick={event => {
                if (event.button === 1) closeTab(tab.id);
              }}
              onContextMenu={event => {
                event.preventDefault();
                if (window.confirm(t('closeTab'))) closeTab(tab.id);
              }}
              role="tab"
              aria-selected={active}
              title={tab.file.path}
            >
              {iconFor(tab.file.fileType)}
              <span className="tab-name">{tab.file.name}</span>
              {dirty && <span className="tab-dirty-dot" />}
              <button
                className="tab-close"
                onClick={event => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                title={t('closeTab')}
                aria-label={t('closeTab')}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {tabs.length > 1 && activeTabId && (
        <button
          className="tab-close-others"
          onClick={() => closeOtherTabs(activeTabId)}
          title={t('closeOthers')}
        >
          {t('closeOthers')}
        </button>
      )}
    </div>
  );
}
