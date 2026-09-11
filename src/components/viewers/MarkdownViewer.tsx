import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import hljs from 'highlight.js/lib/common';
import { List, Highlighter } from 'lucide-react';
import { useAppStore } from '../../state/store';
import { extractToc, slugify, codeLanguageFromFence } from '../../lib/markdown';
import { findFilePathByName } from '../../lib/files';
import type { TocItem } from '../../types';

export function MarkdownViewer({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  const { fileTree, openFile, t, activeTab, addAnnotation } = useAppStore();
  const [progress, setProgress] = useState(0);
  const toc: TocItem[] = useMemo(() => extractToc(content), [content]);

  useEffect(() => {
    const container = document.querySelector('.markdown-container.live-preview, .markdown-container:not(.live-preview)');
    const scrollParent = container?.closest('.document-canvas') as HTMLElement | null;
    if (!scrollParent) return;

    const onScroll = () => {
      const max = scrollParent.scrollHeight - scrollParent.clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.round((scrollParent.scrollTop / max) * 100)) : 0);
    };
    onScroll();
    scrollParent.addEventListener('scroll', onScroll);
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, [content]);

  const rendered = content.replace(/\[\[(.*?)\]\]/g, (_match, p1: string) => {
    const parts = p1.split('|');
    const target = parts[0];
    const alias = parts.length > 1 ? parts[1] : target;
    return `[${alias}](#wiki-${encodeURIComponent(target)})`;
  });

  return (
    <div className={`markdown-shell ${className}`.trim()}>
      {toc.length > 0 && (
        <nav className="markdown-toc" aria-label={t('toc')}>
          <div className="toc-header">
            <List size={13} />
            <span>{t('toc')}</span>
          </div>
          {toc.map((item: TocItem) => (
            <button
              key={`${item.id}-${item.level}`}
              className="toc-item"
              style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
              onClick={() => {
                document
                  .getElementById(item.id)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}

      <div className={`markdown-container ${className}`.trim()}>
        <div className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkFrontmatter]}
            components={{
              h1: ({ children }) => {
                const text = String(children);
                return <h1 id={slugify(text)}>{children}</h1>;
              },
              h2: ({ children }) => {
                const text = String(children);
                return <h2 id={slugify(text)}>{children}</h2>;
              },
              h3: ({ children }) => {
                const text = String(children);
                return <h3 id={slugify(text)}>{children}</h3>;
              },
              h4: ({ children }) => {
                const text = String(children);
                return <h4 id={slugify(text)}>{children}</h4>;
              },
              pre: ({ children }) => <pre className="code-block">{children}</pre>,
              code: ({ className: cls, children }) => {
                const match = /language-(\w+)/.exec(cls || '');
                const isBlock = Boolean(cls) || String(children).includes('\n');
                const lang = match?.[1] ? codeLanguageFromFence(match[1]) : undefined;
                const raw = String(children).replace(/\n$/, '');

                if (!isBlock) {
                  return <code className="inline-code">{children}</code>;
                }

                let html = '';
                try {
                  html = lang
                    ? hljs.highlight(raw, { language: lang }).value
                    : hljs.highlightAuto(raw).value;
                } catch {
                  html = raw
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;');
                }

                return (
                  <code
                    className={`hljs ${cls || ''}`.trim()}
                    data-lang={lang}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              },
              a: props => {
                if (props.href?.startsWith('#wiki-')) {
                  const target = decodeURIComponent(props.href.slice(6));
                  return (
                    <span
                      className="wiki-link"
                      onClick={() => {
                        const path = findFilePathByName(fileTree, target);
                        if (path) void openFile(path);
                        else alert(`AeroDoc: Target note "${target}.md" not found.`);
                      }}
                    >
                      {props.children}
                    </span>
                  );
                }
                return <a {...props} target="_blank" rel="noopener noreferrer" />;
              },
            }}
          >
            {rendered}
          </ReactMarkdown>
        </div>
      </div>

      <div className="reading-progress" title={`${t('readingProgress')} ${progress}%`}>
        <div className="reading-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {activeTab && (
        <button
          className="floating-highlight-btn"
          title={t('addHighlight')}
          onClick={() => {
            const text = window.getSelection()?.toString();
            if (!text) return;
            addAnnotation({
              filePath: activeTab.file.path,
              type: 'highlight',
              color: '#F0C674',
              text,
            });
          }}
        >
          <Highlighter size={14} />
        </button>
      )}
    </div>
  );
}
