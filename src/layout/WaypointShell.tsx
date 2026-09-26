import type { ReactNode } from 'react';
import { LogOut, Moon, Search, Sun, type LucideIcon } from 'lucide-react';

type Props = {
  page: string;
  navigate: (page: string) => void;
  navigation: Array<{ id: string; label: string; icon: LucideIcon }>;
  username: string;
  theme: string;
  onTheme: () => void;
  onCommand: () => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
};
const labels: Record<string, string> = {
  runbooks: 'Runs',
  overview: 'Status',
  apps: 'Apps',
  permissions: 'Access',
  security: 'Secrets',
  tasks: 'Tasks',
  system: 'Host',
  logs: 'Logs',
  explorer: 'API',
};
export function WaypointShell(props: Props) {
  return (
    <>
      <header className="waypoint-commandbar">
        <a
          className="waypoint-wordmark"
          href="#runbooks"
          onClick={() => props.navigate('runbooks')}
        >
          waypoint<span>/ IRIS</span>
        </a>
        <span className="waypoint-location">
          {props.navigation.find((n) => n.id === props.page)?.label ?? 'Status'}
        </span>
        <div className="waypoint-command-actions">
          <button onClick={props.onCommand} aria-label="Go to workspace">
            <Search size={16} />
            <span>Find a tool</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            aria-label={props.theme === 'light' ? 'Use dark theme' : 'Use light theme'}
            onClick={props.onTheme}
          >
            {props.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button onClick={() => void props.onLogout()} aria-label={`Sign out ${props.username}`}>
            <span>{props.username}</span>
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <nav className="waypoint-toolrail" aria-label="Main navigation">
        {props.navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            title={label}
            aria-label={label}
            aria-current={props.page === id ? 'page' : undefined}
            onClick={() => props.navigate(id)}
          >
            <Icon size={20} />
            <span>{labels[id]}</span>
          </button>
        ))}
      </nav>
      <main className="waypoint-console" id="main-content" tabIndex={-1}>
        {props.children}
      </main>
    </>
  );
}
