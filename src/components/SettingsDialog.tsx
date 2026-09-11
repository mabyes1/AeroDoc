import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Link2, X } from 'lucide-react';
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

const STORE_KEY = 'aerodoc-associated-exts';

function loadSavedSelection(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        return Object.fromEntries(ALL_EXTS.map(item => [item.ext, parsed.includes(item.ext)]));
      }
    }
  } catch {
    // ignore
  }
  return Object.fromEntries(ALL_EXTS.map(item => [item.ext, item.defaultOn]));
}

export function SettingsDialog() {
  const { t } = useAppStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(loadSavedSelection);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener('aerodoc-open-settings', reopen);
    return () => window.removeEventListener('aerodoc-open-settings', reopen);
  }, []);

  if (!open) return null;

  const apply = async () => {
    setBusy(true);
    setMessage('');
    try {
      const extensions = ALL_EXTS.filter(item => selected[item.ext]).map(item => item.ext);
      await invoke('set_file_associations', { extensions });
      localStorage.setItem(STORE_KEY, JSON.stringify(extensions));
      setMessage(t('associationsDone'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="settings-dialog"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-label={t('settings')}
      >
        <header className="settings-header">
          <div className="settings-title">
            <Settings size={18} />
            <strong>{t('settings')}</strong>
          </div>
          <button
            className="settings-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <section className="settings-section">
          <div className="settings-section-title">
            <Link2 size={15} />
            <div>
              <strong>{t('associations')}</strong>
              <p>{t('associationsDesc')}</p>
            </div>
          </div>

          <div className="assoc-list">
            {ALL_EXTS.map(item => (
              <label key={item.ext} className="assoc-row">
                <input
                  type="checkbox"
                  checked={Boolean(selected[item.ext])}
                  onChange={event =>
                    setSelected(prev => ({ ...prev, [item.ext]: event.target.checked }))
                  }
                />
                <code className="assoc-ext">{item.ext}</code>
                <span className="assoc-label">{item.label}</span>
              </label>
            ))}
          </div>

          <div className="settings-footer">
            {message && <span className="settings-message">{message}</span>}
            <button
              className="settings-apply"
              onClick={() => void apply()}
              disabled={busy}
            >
              {busy ? '…' : t('associationsApply')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function openSettings() {
  window.dispatchEvent(new CustomEvent('aerodoc-open-settings'));
}
