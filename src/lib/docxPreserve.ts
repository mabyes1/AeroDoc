import JSZip from 'jszip';
import { writeFile } from '@tauri-apps/plugin-fs';
import { bytesToArrayBuffer } from './paths';

/**
 * Non-destructive DOCX save:
 * 1. Always write a one-time .bak of the original bytes.
 * 2. Rewrite only word/document.xml text runs inside the original package,
 *    so styles, images, numbering, headers/footers stay intact.
 * 3. Fall back to simplified rewrite only if the package cannot be parsed —
 *    still keeping the .bak.
 */
export async function saveDocxPreservingPackage(
  path: string,
  originalBytes: Uint8Array,
  plainText: string,
): Promise<'preserved' | 'backup-fallback'> {
  // 1) one-time backup of the pristine original
  const bakPath = `${path}.aerodoc.bak`;
  try {
    await writeFile(bakPath, originalBytes);
  } catch {
    // backup is best-effort; continue with rewrite
  }

  try {
    const zip = await JSZip.loadAsync(bytesToArrayBuffer(originalBytes));
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('word/document.xml missing');
    const xml = await docFile.async('string');

    const rewritten = replaceDocumentXmlText(xml, plainText);
    zip.file('word/document.xml', rewritten);
    const out = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    await writeFile(path, out);
    return 'preserved';
  } catch {
    // 2) fallback: simplified DOCX, original already backed up
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const paragraphs = plainText.split(/\r?\n/).map(line => (
      new Paragraph({ children: [new TextRun(line || ' ')] })
    ));
    const doc = new Document({
      sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph('')] }],
    });
    const buffer = await Packer.toArrayBuffer(doc);
    await writeFile(path, new Uint8Array(buffer));
    return 'backup-fallback';
  }
}

/** Replace visible paragraph text while keeping run/paragraph properties. */
export function replaceDocumentXmlText(xml: string, plainText: string): string {
  const lines = plainText.split(/\r?\n/);
  const parser = new DOMParser();
  const dom = parser.parseFromString(xml, 'application/xml');
  if (dom.querySelector('parsererror')) {
    throw new Error('Invalid document.xml');
  }

  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = Array.from(dom.getElementsByTagNameNS(w, 'p'));

  // If paragraph count mismatches, map as many lines as we can; leftover lines
  // are appended as new paragraphs cloned from the last one.
  paragraphs.forEach((p, index) => {
    const text = lines[index] ?? '';
    setParagraphText(p, text, w);
  });

  if (lines.length > paragraphs.length && paragraphs.length > 0) {
    const body = paragraphs[0].parentNode;
    const template = paragraphs[paragraphs.length - 1];
    for (let i = paragraphs.length; i < lines.length; i += 1) {
      const clone = template.cloneNode(true) as Element;
      setParagraphText(clone, lines[i] ?? '', w);
      body?.appendChild(clone);
    }
  }

  return new XMLSerializer().serializeToString(dom);
}

function setParagraphText(p: Element, text: string, ns: string) {
  const runs = Array.from(p.getElementsByTagNameNS(ns, 'r'));
  if (runs.length === 0) {
    // create a minimal run
    const r = p.ownerDocument!.createElementNS(ns, 'w:r');
    const t = p.ownerDocument!.createElementNS(ns, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = text;
    r.appendChild(t);
    p.appendChild(r);
    return;
  }

  // Put full line in the first run's first w:t; clear the rest.
  let placed = false;
  runs.forEach(run => {
    const texts = Array.from(run.getElementsByTagNameNS(ns, 't'));
    if (texts.length === 0) {
      const t = run.ownerDocument!.createElementNS(ns, 'w:t');
      t.setAttribute('xml:space', 'preserve');
      t.textContent = placed ? '' : text;
      run.appendChild(t);
      placed = true;
      return;
    }
    texts.forEach((t, i) => {
      if (!placed && i === 0) {
        t.setAttribute('xml:space', 'preserve');
        t.textContent = text;
        placed = true;
      } else {
        t.textContent = '';
      }
    });
  });
}
