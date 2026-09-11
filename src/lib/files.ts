import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { norm, getFileType } from './paths';
import type { FileType, FileNode, SearchHit } from '../types';

const MAX_SEARCH_FILES = 800;
const MAX_SNIPPET = 180;

export async function scanDir(dirPath: string): Promise<FileNode[]> {
  const d = norm(dirPath);
  try {
    const entries = await readDir(d);
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (!entry.name) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const childPath = `${d}/${entry.name}`;

      if (entry.isDirectory) {
        nodes.push({
          name: entry.name,
          path: childPath,
          kind: 'directory',
          children: [],
          isLoaded: false,
        });
      } else if (entry.isFile) {
        const fileType = getFileType(entry.name);
        if (fileType) nodes.push({ name: entry.name, path: childPath, kind: 'file', fileType });
      }
    }

    return nodes.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name);
      return a.kind === 'directory' ? -1 : 1;
    });
  } catch {
    return [];
  }
}

export async function collectFiles(
  nodes: FileNode[],
  max = MAX_SEARCH_FILES,
  acc: FileNode[] = [],
): Promise<FileNode[]> {
  for (const node of nodes) {
    if (acc.length >= max) return acc;
    if (node.kind === 'file') {
      acc.push(node);
      continue;
    }
    if (!node.children || node.children.length === 0) {
      node.children = await scanDir(node.path);
      node.isLoaded = true;
    }
    await collectFiles(node.children ?? [], max, acc);
  }
  return acc;
}

export async function searchVaultContent(
  rootFiles: FileNode[],
  query: string,
  limit = 80,
): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const files = await collectFiles(rootFiles);
  const hits: SearchHit[] = [];

  for (const file of files) {
    if (hits.length >= limit) break;
    if (file.fileType === 'pdf' || file.fileType === 'docx' || file.fileType === 'xlsx') continue;

    try {
      const text = await readTextFile(file.path);
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (hits.length >= limit) break;
        const line = lines[i];
        const lower = line.toLowerCase();
        if (!lower.includes(q)) continue;
        const idx = lower.indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(line.length, idx + q.length + 80);
        const preview = `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`;
        hits.push({
          path: file.path,
          name: file.name,
          fileType: (file.fileType ?? 'text') as FileType,
          line: i + 1,
          preview: preview.slice(0, MAX_SNIPPET),
        });
      }
    } catch {
      // skip unreadable files
    }
  }

  return hits;
}

export function findFilePathByName(nodes: FileNode[], targetName: string): string | null {
  const target = targetName.toLowerCase();
  for (const node of nodes) {
    if (node.kind === 'file') {
      const nameWithoutExt = node.name.replace(/\.[^/.]+$/, '').toLowerCase();
      if (nameWithoutExt === target || node.name.toLowerCase() === target) return node.path;
    } else if (node.children) {
      const found = findFilePathByName(node.children, targetName);
      if (found) return found;
    }
  }
  return null;
}

export function updateTreeNode(
  nodes: FileNode[],
  path: string,
  updater: (node: FileNode) => FileNode,
): FileNode[] {
  return nodes.map(node => {
    if (node.path === path) return updater(node);
    if (node.kind === 'directory' && node.children) {
      return { ...node, children: updateTreeNode(node.children, path, updater) };
    }
    return node;
  });
}

export function findTreeNode(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === 'directory' && node.children) {
      const found = findTreeNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function countFiles(nodes: FileNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === 'file' ? 1 : countFiles(node.children ?? [])),
    0,
  );
}

export function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.kind === 'file') {
      if (node.name.toLowerCase().includes(q)) acc.push(node);
    } else {
      const kids = filterTree(node.children ?? [], query);
      if (node.name.toLowerCase().includes(q) || kids.length > 0) {
        acc.push({ ...node, children: kids, isLoaded: true });
      }
    }
    return acc;
  }, []);
}
