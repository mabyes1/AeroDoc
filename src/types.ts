export type FileType =
  | 'markdown'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'csv'
  | 'text'
  | 'code'
  | 'html';

export type Theme = 'gemini' | 'claude' | 'sakura' | 'dark';
export type EditorLayout = 'editor' | 'split';
export type Locale = 'zh-TW' | 'en-US';

export interface CellPosition {
  row: number;
  column: number;
}

export interface CellRange {
  anchor: CellPosition;
  focus: CellPosition;
}

export interface SheetViewport {
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
}

export interface FileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  fileType?: FileType;
  children?: FileNode[];
  isLoaded?: boolean;
  isLoading?: boolean;
}

export interface CurrentFile {
  name: string;
  path: string;
  fileType: FileType;
}

export interface DocumentTab {
  id: string;
  file: CurrentFile;
  markdownContent: string;
  editorContent: string;
  isEditing: boolean;
  editorLayout: EditorLayout;
  pdfUrl: string | null;
  docxHtml: string;
  plainText: string;
  /** Original DOCX package bytes for non-destructive save. */
  originalBytes: Uint8Array | null;
  workbook: unknown | null;
  sheetNames: string[];
  activeSheet: string;
  gridData: GridValue[][];
  /** Formula map keyed by "row,col" (0-based). Grid shows calculated values. */
  cellFormulas: Record<string, string>;
  sheetDirty: boolean;
  selectedRange: CellRange | null;
  saveStatus: string;
  scrollTop?: number;
}

export type GridValue = string | number | boolean | null;

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface SearchHit {
  path: string;
  name: string;
  fileType: FileType;
  line: number;
  preview: string;
}

export interface RecentFileEntry {
  path: string;
  name: string;
  fileType: FileType;
  openedAt: number;
}

export interface Annotation {
  id: string;
  filePath: string;
  type: 'highlight' | 'note';
  color: string;
  text: string;
  pageNumber?: number;
  createdAt: number;
}

export type TranslationKey =
  | 'app.name'
  | 'workspace'
  | 'noFolder'
  | 'files'
  | 'searchFiles'
  | 'searchContent'
  | 'openFolder'
  | 'reopen'
  | 'newFile'
  | 'newFolder'
  | 'edit'
  | 'cancel'
  | 'save'
  | 'autoSave'
  | 'split'
  | 'reading'
  | 'editing'
  | 'words'
  | 'chars'
  | 'lines'
  | 'rows'
  | 'columns'
  | 'addRow'
  | 'addColumn'
  | 'unsaved'
  | 'saved'
  | 'saveFailed'
  | 'loadFailed'
  | 'welcome.eyebrow'
  | 'welcome.title'
  | 'welcome.desc'
  | 'welcome.reading'
  | 'welcome.readingDesc'
  | 'welcome.editing'
  | 'welcome.editingDesc'
  | 'welcome.data'
  | 'welcome.dataDesc'
  | 'workspaceReady'
  | 'workspaceReadyDesc'
  | 'newNote'
  | 'supports'
  | 'commandPalette'
  | 'commandHint'
  | 'goBack'
  | 'goForward'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'pageOf'
  | 'searchInPdf'
  | 'toc'
  | 'recentFiles'
  | 'closeTab'
  | 'discardConfirm'
  | 'discardVaultConfirm'
  | 'deleteConfirm'
  | 'notFound'
  | 'loadingPdf'
  | 'pdf.passwordTitle'
  | 'pdf.passwordPlaceholder'
  | 'pdf.passwordUnlock'
  | 'pdf.wrongPassword'
  | 'formulaPlaceholder'
  | 'savedDocxPreserved'
  | 'savedDocxBak'
  | 'associations'
  | 'associationsDesc'
  | 'associationsApply'
  | 'associationsSkip'
  | 'associationsDone'
  | 'settings'
  | 'noPreviewText'
  | 'simplifiedDocxWarn'
  | 'dragSelectCells'
  | 'copiedCells'
  | 'pastedCells'
  | 'searchResults'
  | 'noResults'
  | 'jumpTo'
  | 'createNote'
  | 'readingProgress'
  | 'highlights'
  | 'addHighlight'
  | 'language'
  | 'theme'
  | 'shortcuts'
  | 'openFile'
  | 'closeOthers'
  | 'copyPath'
  | 'revealInTree'
  | 'fullTextSearchPlaceholder';
