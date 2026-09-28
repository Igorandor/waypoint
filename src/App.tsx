import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Workflow,
  AppWindow,
  KeyRound,
  Shield,
  Timer,
  Server,
  ScrollText,
  Braces,
} from 'lucide-react';
import { WaypointShell } from './layout/WaypointShell';
import { Runbooks } from './pages/Runbooks';
import { request } from './api';
import { ErrorBox, Loading, Modal, RetainedWorkspace } from './components/ui';
const ProcedureLibrary = lazy(() =>
  import('./procedures/ProcedureLibrary').then((module) => ({ default: module.ProcedureLibrary })),
);
const CommandHistory = lazy(() =>
  import('./commands/CommandHistory').then((module) => ({ default: module.CommandHistory })),
);
const TaskWorkspace = lazy(() =>
  import('./tasks/TaskWorkspace').then((module) => ({ default: module.TaskWorkspace })),
);
const CapacityWatch = lazy(() =>
  import('./capacity/CapacityWatch').then((module) => ({ default: module.CapacityWatch })),
);
const ApplicationWorkspace = lazy(() =>
  import('./applications/ApplicationWorkspace').then((module) => ({
    default: module.ApplicationWorkspace,
  })),
);
const LogInvestigation = lazy(() =>
  import('./logs/LogInvestigation').then((module) => ({ default: module.LogInvestigation })),
);
const Operations = lazy(() =>
  import('./commands/Operations').then((module) => ({ default: module.Operations })),
);
const Observations = lazy(() =>
  import('./commands/Observations').then((module) => ({ default: module.Observations })),
);
const OperationsDesk = lazy(() =>
  import('./desk/OperationsDesk').then((module) => ({ default: module.OperationsDesk })),
);
const navigation = [
  { id: 'operations-desk', label: 'Operations desk', icon: Activity },
  { id: 'runbooks', label: 'Runbooks', icon: Workflow },
  { id: 'procedures', label: 'Procedure library', icon: Workflow },
  { id: 'command-history', label: 'Command history', icon: ScrollText },
  { id: 'overview', label: 'Instance status', icon: Activity },
  { id: 'capacity-watch', label: 'Capacity watch', icon: Activity },
  { id: 'apps', label: 'Applications', icon: AppWindow },
  { id: 'application-readiness', label: 'Application readiness', icon: AppWindow },
  { id: 'permissions', label: 'Permissions', icon: KeyRound },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'tasks', label: 'Scheduled tasks', icon: Timer },
  { id: 'task-readiness', label: 'Task readiness', icon: Timer },
  { id: 'system', label: 'Processes and devices', icon: Server },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'log-investigation', label: 'Log investigation', icon: ScrollText },
  { id: 'explorer', label: 'REST explorer', icon: Braces },
];
function currentPage() {
  const value = location.hash.slice(1);
  return navigation.some((item) => item.id === value) ? value : 'runbooks';
}
export default function App() {
  const [session, setSession] = useState<any>(),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(''),
    [page, setPage] = useState(currentPage),
    [proceduresVisited, setProceduresVisited] = useState(false),
    [theme, setTheme] = useState(() =>
      localStorage.getItem('waypoint-theme') === 'dark' ? 'dark' : 'light',
    ),
    [finder, setFinder] = useState(false);
  useEffect(() => {
    let live = true;
    void request('session')
      .then((value) => {
        if (live) setSession(value);
      })
      .catch((e) => {
        if (live && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    const ended = () => {
      setSession(undefined);
      setError('Session ended. Sign in again.');
    };
    const hash = () => setPage(currentPage());
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setFinder((value) => !value);
      }
    };
    window.addEventListener('session-ended', ended);
    window.addEventListener('hashchange', hash);
    window.addEventListener('keydown', shortcut);
    return () => {
      live = false;
      window.removeEventListener('session-ended', ended);
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('keydown', shortcut);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('waypoint-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!session) setProceduresVisited(false);
    else if (page === 'procedures') setProceduresVisited(true);
  }, [page, session]);
  function navigate(id: string) {
    location.hash = id;
    setPage(id);
    setFinder(false);
  }
  async function logout() {
    try {
      await request('logout', {});
      setSession(undefined);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (checking) return <Loading />;
  if (!session) return <SignIn error={error} onSignIn={setSession} />;
  return (
    <div className="waypoint-app">
      <WaypointShell
        page={page}
        navigate={navigate}
        navigation={navigation}
        username={session.info.username}
        theme={theme}
        onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onCommand={() => setFinder(true)}
        onLogout={logout}
      >
        {error && <ErrorBox error={error} />}
        <RetainedWorkspace hidden={page !== 'runbooks'}>
          <Runbooks />
        </RetainedWorkspace>
        {(proceduresVisited || page === 'procedures') && (
          <RetainedWorkspace hidden={page !== 'procedures'}>
            <Suspense fallback={<Loading />}>
              <ProcedureLibrary active={page === 'procedures'} />
            </Suspense>
          </RetainedWorkspace>
        )}
        <Suspense fallback={<Loading />}>
          {['apps', 'permissions', 'security', 'tasks', 'system'].includes(page) ? (
            <Operations key={page} area={page} operator={session.info.username} />
          ) : page === 'command-history' ? (
            <CommandHistory />
          ) : page === 'task-readiness' ? (
            <TaskWorkspace />
          ) : page === 'capacity-watch' ? (
            <CapacityWatch />
          ) : page === 'application-readiness' ? (
            <ApplicationWorkspace />
          ) : page === 'log-investigation' ? (
            <LogInvestigation />
          ) : page === 'operations-desk' ? (
            <OperationsDesk />
          ) : page !== 'runbooks' && page !== 'procedures' ? (
            <Observations key={page} area={page} />
          ) : null}
        </Suspense>
        {finder && <ToolFinder onClose={() => setFinder(false)} navigate={navigate} />}
      </WaypointShell>
    </div>
  );
}
const toolKeywords: Record<string, string> = {
  'operations-desk': 'handover restoration follow-up',
  runbooks: 'runs maintenance restore',
  procedures: 'plans checklist versions',
  'command-history': 'receipts reconcile changes',
  overview: 'health instance status',
  'capacity-watch': 'cpu memory disk samples',
  apps: 'web routes csp rest',
  'application-readiness': 'dependencies prerequisites',
  permissions: 'user users role roles resource resources access',
  security: 'wallet certificate certificates x509 tls ssl oauth secrets',
  tasks: 'schedule jobs',
  'task-readiness': 'history schedule execution',
  system: 'process pid device database storage',
  logs: 'audit journal messages alerts',
  'log-investigation': 'log context bookmarks',
  explorer: 'api endpoints',
};
function ToolFinder({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = navigation.filter((item) => {
    const searchable = `${item.label} ${toolKeywords[item.id] ?? ''}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  return (
    <Modal title="Find a tool" onClose={onClose}>
      <div className="tool-finder-search">
        <label className="field">
          Search tools
          <input
            ref={input}
            autoFocus
            value={query}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            placeholder="Name or keyword"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="muted" role="status">
          {matches.length
            ? `${matches.length} matching ${matches.length === 1 ? 'tool' : 'tools'}`
            : 'No matching tools. Try another name or keyword.'}
        </p>
      </div>
      <div className="tool-finder">
        {matches.map((item) => (
          <button key={item.id} onClick={() => navigate(item.id)}>
            <item.icon size={19} />
            {item.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
function SignIn({ error: external, onSignIn }: { error: string; onSignIn: (value: any) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <main className="waypoint-signin">
      <section>
        <p className="waypoint-signin-mark">waypoint / IRIS</p>
        <h1>Sign in to Waypoint</h1>
        <p>Run procedures and manage your IRIS instance.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget,
              fields = new FormData(form);
            setBusy(true);
            setError('');
            try {
              const session = await request('login', {
                username: fields.get('username'),
                password: fields.get('password'),
              });
              form.reset();
              onSignIn(session);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label className="field">
              IRIS username
              <input name="username" required autoComplete="username" maxLength={128} />
            </label>
            <label className="field">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                maxLength={1024}
              />
            </label>
            {(error || external) && <ErrorBox error={error || external} />}
            <button className="primary">{busy ? 'Connecting…' : 'Sign in'}</button>
          </fieldset>
        </form>
        <small>Your IRIS account permissions apply.</small>
      </section>
    </main>
  );
}
