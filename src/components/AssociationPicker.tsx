import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link2 } from 'lucide-react';
import { useAppStore } from '../state/store';

const ALL_EXTS = [
  { ext: '.md', label: 'Markdown', defaultOn: true },
  { ext: '.pdf', label: 'PDF', defaultOn: true },
  { ext: '.docx', label: 'Word', defaultOn: true },
  { ext: '.xlsx', label: 'Excel', defaultOn: true },
  { ext: '.csv', label: 'CSV', defaultOn: true },
  { ext: '.txt', label: 'Text', defaultOn: false },
  { ext: '.json', label: 'JSON', defaultOn: false },
  { ext: '.html', label: 'HTML', defaultOn: false },
];

const SEEN_KEY = 'aerodoc-associations-seen';

export function AssociationPicker() {
  const { t } = useAppStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALL_EXTS.map(item => [item.ext, item.defaultOn])),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) !== '1') {
      setOpen(true);
    }
    const reopen = () => setOpen(true);
    window.addEventListener('aerodoc-open-associations', reopen);
    return () => window.removeEventListener('aerodoc-open-associations', reopen);
  }, []);

  if (!open) return null;

  const apply = async () => {
    setBusy(true);
    setMessage('');
    try {
      const extensions = ALL_EXTS.filter(item => selected[item.ext]).map(item => item.ext);
      await invoke('set_file_associations', { extensions });
      localStorage.setItem(SEEN_KEY, '1');
      setMessage(t('associationsDone'));
      window.setTimeout(() => setOpen(false), 700);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setOpen(false);
  };

  return (
    <div className="palette-overlay" onClick={skip}>
      <div
        className="palette-panel assoc-panel"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-label={t('associations')}
      >
        <div className="assoc-header">
          <Link2 size={18} />
          <div>
            <strong>{t('associations')}</strong>
            <p>{t('associationsDesc')}</p>
          </div>
        </div>
        <div className="assoc-grid">
          {ALL_EXTS.map(item => (
            <label key={item.ext} className="assoc-item">
              <input
                type="checkbox"
                checked={Boolean(selected[item.ext])}
                onChange={event =>
                  setSelected(prev => ({ ...prev, [item.ext]: event.target.checked }))
                }
              />
              <span className="assoc-ext">{item.ext}</span>
              <span className="assoc-label">{item.label}</span>
            </label>
          ))}
        </div>
        {message && <div className="assoc-message">{message}</div>}
        <div className="assoc-actions">
          <button className="toolbar-btn" onClick={skip} disabled={busy}>
            {t('associationsSkip')}
          </button>
          <button className="toolbar-btn primary" onClick={() => void apply()} disabled={busy}>
            {t('associationsApply')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small helper for palette / settings: apply current selection later. */
export async function applyAssociations(extensions: string[]) {
  await invoke('set_file_associations', { extensions });
}
