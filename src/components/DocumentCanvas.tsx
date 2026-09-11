import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/store';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { PdfViewer } from './viewers/PdfViewer';
import {
  DocxViewer,
  TextCodeViewer,
  SpreadsheetViewer,
  HtmlPreview,
} from './viewers/DocumentViewers';

export function DocumentCanvas() {
  const { activeTab, updateActiveTab, autoSaveEnabled, saveActiveFile } = useAppStore();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ value: string }>).detail;
      if (detail?.value !== undefined) {
        updateActiveTab({ editorContent: detail.value, saveStatus: '' });
      }
    };
    window.addEventListener('aerodoc-editor-change', onChange);
    return () => window.removeEventListener('aerodoc-editor-change', onChange);
  }, [updateActiveTab]);

  useEffect(() => {
    const onGoto = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; line: number }>).detail;
      if (!activeTab || detail.path !== activeTab.file.path) return;
      const textarea = editorRef.current;
      if (!textarea) return;
      const lines = textarea.value.split('\n');
      let pos = 0;
      for (let i = 0; i < detail.line - 1 && i < lines.length; i += 1) {
        pos += lines[i].length + 1;
      }
      if (activeTab.isEditing) {
        textarea.focus();
        textarea.setSelectionRange(pos, pos);
      } else {
        // open edit mode at line
        updateActiveTab({
          isEditing: true,
          editorContent: activeTab.markdownContent || activeTab.plainText,
        });
        window.setTimeout(() => {
          editorRef.current?.focus();
          editorRef.current?.setSelectionRange(pos, pos);
        }, 50);
      }
    };
    window.addEventListener('aerodoc-goto-line', onGoto);
    return () => window.removeEventListener('aerodoc-goto-line', onGoto);
  }, [activeTab, updateActiveTab]);

  useEffect(() => {
    if (!autoSaveEnabled || !activeTab?.isEditing) return;
    if (activeTab.file.fileType === 'pdf' || activeTab.file.fileType === 'xlsx' || activeTab.file.fileType === 'csv') {
      return;
    }
    if (activeTab.editorContent === activeTab.markdownContent) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void saveActiveFile();
    }, 8000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [activeTab, autoSaveEnabled, saveActiveFile]);

  if (!activeTab) return null;

  const { file, isEditing, editorLayout, editorContent } = activeTab;

  if (file.fileType === 'pdf') {
    return (
      <div className="document-canvas">
        <PdfViewer />
      </div>
    );
  }

  if (file.fileType === 'xlsx' || file.fileType === 'csv') {
    return (
      <div className="document-canvas">
        <SpreadsheetViewer />
      </div>
    );
  }

  if (file.fileType === 'docx') {
    return (
      <div className="document-canvas">
        {isEditing ? (
          <div className="editor-container">
            <textarea
              ref={editorRef}
              className="markdown-editor"
              value={editorContent}
              onChange={event => updateActiveTab({ editorContent: event.target.value, saveStatus: '' })}
              spellCheck={false}
            />
          </div>
        ) : (
          <DocxViewer />
        )}
      </div>
    );
  }

  if (file.fileType === 'text' || file.fileType === 'code') {
    return (
      <div className="document-canvas">
        {isEditing ? (
          <div className="editor-container">
            <textarea
              ref={editorRef}
              className="markdown-editor code-editor"
              value={editorContent}
              onChange={event => updateActiveTab({ editorContent: event.target.value, saveStatus: '' })}
              spellCheck={false}
            />
          </div>
        ) : (
          <TextCodeViewer />
        )}
      </div>
    );
  }

  // HTML: preview / source / split
  if (file.fileType === 'html') {
    const source = isEditing ? editorContent : activeTab.plainText || activeTab.markdownContent;
    if (isEditing && editorLayout === 'split') {
      return (
        <div className="document-canvas">
          <div className="editor-workspace split-view">
            <div className="editor-container">
              <textarea
                ref={editorRef}
                className="markdown-editor code-editor"
                value={editorContent}
                onChange={event => updateActiveTab({ editorContent: event.target.value, saveStatus: '' })}
                spellCheck={false}
              />
            </div>
            <HtmlPreview html={editorContent} />
          </div>
        </div>
      );
    }
    if (isEditing) {
      return (
        <div className="document-canvas">
          <div className="editor-workspace">
            <div className="editor-container">
              <textarea
                ref={editorRef}
                className="markdown-editor code-editor"
                value={editorContent}
                onChange={event => updateActiveTab({ editorContent: event.target.value, saveStatus: '' })}
                spellCheck={false}
                autoFocus
              />
            </div>
          </div>
        </div>
      );
    }
    // default: rendered preview (Ctrl+E for source, Split for both)
    return (
      <div className="document-canvas">
        <HtmlPreview html={source} />
      </div>
    );
  }

  // markdown
  if (isEditing && editorLayout === 'split') {
    return (
      <div className="document-canvas">
        <div className="editor-workspace split-view">
          <div className="editor-container">
            <textarea
              ref={editorRef}
              className="markdown-editor"
              value={editorContent}
              onChange={event => updateActiveTab({ editorContent: event.target.value, saveStatus: '' })}
              spellCheck={false}
            />
          </div>
          <MarkdownViewer content={editorContent} className="live-preview" />
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="document-canvas">
        <div className="editor-workspace">
          <div className="editor-container">
            <textarea
              ref={editorRef}
              className="markdown-editor"
              value={editorContent}
              onChange={event => updateActiveTab({ editorContent: event.target.value, saveStatus: '' })}
              spellCheck={false}
              autoFocus
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="document-canvas">
      <MarkdownViewer content={activeTab.markdownContent} />
    </div>
  );
}

export function StatusBar() {
  const { activeTab, documentStats, t } = useAppStore();
  if (!activeTab) return null;
  const isSpreadsheet = activeTab.file.fileType === 'xlsx' || activeTab.file.fileType === 'csv';

  return (
    <div className="statusbar">
      <div className="statusbar-group">
        <span>{activeTab.isEditing ? t('editing') : t('reading')}</span>
        <span>{activeTab.file.fileType.toUpperCase()}</span>
      </div>
      <div className="statusbar-group">
        {documentStats && (
          <>
            <span>
              {documentStats.words} {t('words')}
            </span>
            <span>
              {documentStats.characters} {t('chars')}
            </span>
            <span>
              {documentStats.lines} {t('lines')}
            </span>
          </>
        )}
        {isSpreadsheet && (
          <>
            <span>
              {activeTab.gridData.length} {t('rows')}
            </span>
            <span>
              {Math.max(...activeTab.gridData.map(r => r.length), 0)} {t('columns')}
            </span>
          </>
        )}
        <span className="shortcut-hint">Ctrl+S · Ctrl+P</span>
      </div>
    </div>
  );
}
