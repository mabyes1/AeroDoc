import type { TocItem } from '../types';

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const text = match[2].replace(/[*_`~[\]]/g, '').trim();
    if (!text) continue;

    items.push({
      id: slugify(text),
      text,
      level: match[1].length,
    });
  }

  return items;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function highlightCode(code: string, language?: string) {
  // Lazy import is handled by caller to keep initial bundle small.
  return { code, language: language || 'plaintext' };
}

export function codeLanguageFromFence(info: string | undefined) {
  if (!info) return 'plaintext';
  const token = info.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    shell: 'bash',
  };
  return map[token] || token || 'plaintext';
}

export function extractPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, '$3$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
