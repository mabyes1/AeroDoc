import { AppStoreProvider, useAppStore } from './state/store';
import { TitleBar } from './components/TitleBar';
import { SidebarConnected } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { CommandPalette, GlobalShortcuts } from './components/CommandPalette';
import { DocumentToolbar } from './components/DocumentToolbar';
import { DocumentCanvas, StatusBar } from './components/DocumentCanvas';
import { WelcomeShell, WorkspaceEmpty, AnnotationsPanel } from './components/Welcome';
import { AssociationPicker } from './components/AssociationPicker';
import './index.css';

function AppShell() {
  const { rootDir, activeTab, sidebarCollapsed } = useAppStore();

  return (
    <div id="root">
      <TitleBar />
      <GlobalShortcuts />
      <CommandPalette />
      <AssociationPicker />
      <div className="app-body">
        {!sidebarCollapsed && <SidebarConnected />}
        <main className="content-pane">
          <TabBar />
          {activeTab ? (
            <>
              <DocumentToolbar />
              <DocumentCanvas />
              <AnnotationsPanel />
              <StatusBar />
            </>
          ) : rootDir ? (
            <WorkspaceEmpty />
          ) : (
            <WelcomeShell />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <AppShell />
    </AppStoreProvider>
  );
}
