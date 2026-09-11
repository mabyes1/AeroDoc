import { Minus, Square, X, Sparkles, PanelLeftClose, PanelLeftOpen, Globe, Settings } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '../state/store';
import { openSettings } from './SettingsDialog';
import type { Theme, Locale } from '../types';

const appWindow = getCurrentWindow();

const themes: { id: Theme; label: string; cls: string }[] = [
  { id: 'gemini', label: 'Gemini blue', cls: 'dot-gemini' },
  { id: 'claude', label: 'Claude clay', cls: 'dot-claude' },
  { id: 'sakura', label: 'Sakura light', cls: 'dot-sakura' },
  { id: 'dark', label: 'Graphite dark', cls: 'dot-dark' },
];

export function TitleBar() {
  const {
    theme,
    setTheme,
    locale,
    setLocale,
    rootDir,
    sidebarCollapsed,
    setSidebarCollapsed,
    t,
  } = useAppStore();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-leading">
        <button
          className="titlebar-sidebar-toggle"
          onClick={() => setSidebarCollapsed(value => !value)}
          title={`${sidebarCollapsed ? 'Show' : 'Hide'} sidebar (Ctrl+B)`}
          aria-label={`${sidebarCollapsed ? 'Show' : 'Hide'} sidebar`}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <div className="titlebar-title" data-tauri-drag-region>
          <span className="brand-mark">
            <Sparkles className="titlebar-icon" />
          </span>
          <span data-tauri-drag-region>{t('app.name')}</span>
          {rootDir && (
            <span className="titlebar-workspace" data-tauri-drag-region>
              / {rootDir.split('/').pop()}
            </span>
          )}
        </div>
      </div>

      <div className="titlebar-controls">
        <div className="theme-selector" aria-label={t('theme')}>
          {themes.map(item => (
            <button
              key={item.id}
              className={`theme-dot ${item.cls} ${theme === item.id ? 'active' : ''}`}
              onClick={() => setTheme(item.id)}
              title={item.label}
              aria-label={item.label}
            />
          ))}
        </div>
        <button
          className="locale-toggle"
          onClick={() => setLocale((locale === 'zh-TW' ? 'en-US' : 'zh-TW') as Locale)}
          title={t('language')}
          aria-label={t('language')}
        >
          <Globe size={13} />
          <span>{locale === 'zh-TW' ? '中' : 'EN'}</span>
        </button>
        <button
          className="locale-toggle"
          onClick={openSettings}
          title={t('settings')}
          aria-label={t('settings')}
        >
          <Settings size={13} />
        </button>
        <div className="window-controls">
          <button className="win-btn" onClick={() => appWindow.minimize()} aria-label="Minimize">
            <Minus size={14} />
          </button>
          <button
            className="win-btn"
            onClick={() => appWindow.toggleMaximize()}
            aria-label="Maximize"
          >
            <Square size={11} />
          </button>
          <button className="win-btn win-close" onClick={() => appWindow.close()} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
