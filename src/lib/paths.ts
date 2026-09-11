import type { FileType } from '../types';

export const SUPPORTED_EXTENSIONS = [
  '.md',
  '.pdf',
  '.docx',
  '.xlsx',
  '.csv',
  '.txt',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.rs',
  '.py',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
  '.log',
] as const;

const CODE_EXTENSIONS = new Set([
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.rs',
  '.py',
  '.css',
  '.yml',
  '.yaml',
  '.toml',
]);

const TEXT_EXTENSIONS = new Set(['.txt', '.log']);

export const norm = (p: string) => p.replace(/\\/g, '/');

export const getExtension = (name: string) => {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
};

export const getFileType = (name: string): FileType | null => {
  switch (getExtension(name)) {
    case '.md':
      return 'markdown';
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.xlsx':
      return 'xlsx';
    case '.csv':
      return 'csv';
    case '.html':
    case '.htm':
      return 'html';
    default: {
      const ext = getExtension(name);
      if (TEXT_EXTENSIONS.has(ext)) return 'text';
      if (CODE_EXTENSIONS.has(ext)) return 'code';
      return null;
    }
  }
};

export const bytesToArrayBuffer = (bytes: Uint8Array) => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

export const basename = (path: string) => path.substring(path.lastIndexOf('/') + 1);

export const dirname = (path: string) => path.substring(0, path.lastIndexOf('/'));
