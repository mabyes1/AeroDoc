import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import { useAppStore } from '../../state/store';

type PdfjsModule = typeof import('pdfjs-dist');
type PDFDocumentProxy = import('pdfjs-dist').PDFDocumentProxy;

const PAGE_GAP = 16;

export function PdfViewer() {
  const { activeTab, t } = useAppStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTasks = useRef(new Map<number, { cancel: () => void }>());
  const [pdfjs, setPdfjs] = useState<PdfjsModule | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [pageWidths, setPageWidths] = useState<number[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<{ page: number; text: string }[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');

  const pdfUrl = activeTab?.pdfUrl ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        mod.GlobalWorkerOptions.workerSrc = worker.default;
        if (!cancelled) setPdfjs(mod);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDocument = useCallback(async () => {
    if (!pdfjs || !pdfUrl) return;
    setLoading(true);
    setError(null);
    setPasswordError(null);
    try {
      const existing = docRef.current;
      if (existing) {
        try {
          await existing.cleanup();
        } catch {
          // ignore
        }
      }
      renderTasks.current.forEach(task => task.cancel());
      renderTasks.current.clear();

      const loadingTask = pdfjs.getDocument({
        url: pdfUrl,
        password: password || undefined,
      });
      const doc = await loadingTask.promise;
      docRef.current = doc;
      setNeedPassword(false);
      setNumPages(doc.numPages);
      const widths: number[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 5); i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        widths.push(viewport.width);
      }
      setPageWidths(widths);
      setCurrentPage(1);
    } catch (err) {
      const anyErr = err as { name?: string; message?: string };
      const isPassword =
        anyErr?.name === 'PasswordException' ||
        /password/i.test(anyErr?.message ?? '');
      if (isPassword) {
        setNeedPassword(true);
        setPasswordError(password ? t('pdf.wrongPassword') : null);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }, [pdfUrl, pdfjs, password, t]);

  useEffect(() => {
    void loadDocument();
    return () => {
      renderTasks.current.forEach(task => task.cancel());
      renderTasks.current.clear();
      if (docRef.current) {
        try {
          void docRef.current.cleanup();
        } catch {
          // ignore
        }
        docRef.current = null;
      }
    };
  }, [loadDocument]);

  const submitPassword = () => {
    if (!passwordDraft.trim()) return;
    setPassword(passwordDraft);
    setPasswordDraft('');
  };

  const pageLayout = useMemo(() => {
    const avgWidth = pageWidths.length
      ? pageWidths.reduce((a, b) => a + b, 0) / pageWidths.length
      : 612;
    const width = Math.round(avgWidth * scale);
    // approximate letter aspect
    const height = Math.round(width * 1.294);
    const offsets: number[] = [];
    for (let i = 0; i < numPages; i += 1) {
      offsets.push(i * (height + PAGE_GAP));
    }
    return { width, height, offsets, totalHeight: numPages * (height + PAGE_GAP) };
  }, [numPages, pageWidths, scale]);

  const renderPage = useCallback(
    async (pageNumber: number, canvas: HTMLCanvasElement) => {
      const doc = docRef.current;
      if (!doc) return;
      const existing = renderTasks.current.get(pageNumber);
      if (existing) existing.cancel();

      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (!context) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: transform as number[] | undefined,
      } as Parameters<typeof page.render>[0]);
      renderTasks.current.set(pageNumber, task);
      try {
        await task.promise;
      } catch {
        // render cancelled
      } finally {
        renderTasks.current.delete(pageNumber);
      }
    },
    [scale],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !numPages) return;

    const canvases = root.querySelectorAll<HTMLCanvasElement>('canvas[data-page]');
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const canvas = entry.target as HTMLCanvasElement;
          const pageNumber = Number(canvas.dataset.page);
          if (!pageNumber) continue;
          setCurrentPage(pageNumber);
          void renderPage(pageNumber, canvas);
        }
      },
      { root, rootMargin: '200px 0px', threshold: 0.01 },
    );

    canvases.forEach(canvas => observer.observe(canvas));
    return () => observer.disconnect();
  }, [numPages, renderPage, pageLayout.width, pageLayout.height, scale]);

  const fitWidth = () => {
    const root = containerRef.current;
    if (!root || !pageWidths.length) return;
    const avgWidth = pageWidths.reduce((a, b) => a + b, 0) / pageWidths.length;
    const next = (root.clientWidth - 48) / avgWidth;
    setScale(Math.max(0.4, Math.min(3, Number(next.toFixed(2)))));
  };

  const scrollToPage = (page: number) => {
    const root = containerRef.current;
    if (!root) return;
    const top = pageLayout.offsets[page - 1] ?? 0;
    root.scrollTo({ top, behavior: 'smooth' });
    setCurrentPage(page);
  };

  const runSearch = async () => {
    const doc = docRef.current;
    if (!doc || !searchQuery.trim()) {
      setSearchHits([]);
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const hits: { page: number; text: string }[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ');
      const lower = text.toLowerCase();
      let from = 0;
      while (hits.length < 50) {
        const idx = lower.indexOf(q, from);
        if (idx === -1) break;
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + q.length + 50);
        hits.push({ page: i, text: text.slice(start, end) });
        from = idx + q.length;
      }
    }
    setSearchHits(hits);
    setSearchIndex(0);
    if (hits[0]) scrollToPage(hits[0].page);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.pdf-search-input')?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (needPassword) {
    return (
      <div className="empty-state pdf-password-gate">
        <p className="pdf-password-title">{t('pdf.passwordTitle')}</p>
        {passwordError && <p className="pdf-password-error">{passwordError}</p>}
        <div className="pdf-password-form">
          <input
            type="password"
            autoFocus
            value={passwordDraft}
            placeholder={t('pdf.passwordPlaceholder')}
            onChange={event => setPasswordDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') submitPassword();
            }}
            aria-label={t('pdf.passwordPlaceholder')}
          />
          <button className="toolbar-btn primary" onClick={submitPassword}>
            {t('pdf.passwordUnlock')}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <p>{t('loadFailed')}: {error}</p>
      </div>
    );
  }

  if (loading || !pdfjs) {
    return (
      <div className="empty-state">
        <p>{t('loadingPdf')}</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button onClick={() => scrollToPage(Math.max(1, currentPage - 1))}>‹</button>
        <span className="pdf-page-label">
          {t('pageOf', { page: currentPage, total: numPages })}
        </span>
        <button onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}>›</button>
        <span className="pdf-toolbar-sep" />
        <button title={t('zoomOut')} onClick={() => setScale(s => Math.max(0.4, Number((s - 0.15).toFixed(2))))}>
          <ZoomOut size={14} />
        </button>
        <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
        <button title={t('zoomIn')} onClick={() => setScale(s => Math.min(3, Number((s + 0.15).toFixed(2))))}>
          <ZoomIn size={14} />
        </button>
        <button title={t('zoomFit')} onClick={fitWidth}>
          <Maximize2 size={14} />
        </button>
        <span className="pdf-toolbar-spacer" />
        <button
          className={searchOpen ? 'active' : ''}
          title={`${t('searchInPdf')} (Ctrl+F)`}
          onClick={() => setSearchOpen(open => !open)}
        >
          <Search size={14} />
        </button>
      </div>

      {searchOpen && (
        <div className="pdf-search-bar">
          <Search size={14} />
          <input
            className="pdf-search-input"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') void runSearch();
            }}
            placeholder={t('searchInPdf')}
          />
          <button onClick={() => void runSearch()}>{t('searchContent')}</button>
          {searchHits.length > 0 && (
            <span className="pdf-search-count">
              {searchIndex + 1}/{searchHits.length}
              <button
                onClick={() => {
                  const next = (searchIndex + 1) % searchHits.length;
                  setSearchIndex(next);
                  scrollToPage(searchHits[next].page);
                }}
              >
                ↓
              </button>
            </span>
          )}
          <button className="icon-btn" onClick={() => setSearchOpen(false)} aria-label="Close search">
            <X size={12} />
          </button>
        </div>
      )}

      {searchHits.length > 0 && (
        <div className="pdf-search-hits">
          {searchHits.slice(0, 12).map((hit, index) => (
            <button
              key={`${hit.page}-${index}`}
              className={index === searchIndex ? 'active' : ''}
              onClick={() => {
                setSearchIndex(index);
                scrollToPage(hit.page);
              }}
            >
              <strong>p.{hit.page}</strong>
              <span>{hit.text}</span>
            </button>
          ))}
        </div>
      )}

      <div className="pdf-scroll" ref={containerRef}>
        <div className="pdf-pages" style={{ height: pageLayout.totalHeight, width: pageLayout.width }}>
          {Array.from({ length: numPages }, (_, index) => index + 1).map(pageNumber => (
            <div
              key={pageNumber}
              className={`pdf-page ${pageNumber === currentPage ? 'current' : ''}`}
              style={{
                top: pageLayout.offsets[pageNumber - 1],
                width: pageLayout.width,
                height: pageLayout.height,
              }}
            >
              <canvas data-page={pageNumber} />
              <span className="pdf-page-number">{pageNumber}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
