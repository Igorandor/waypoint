import { useEffect, useState } from 'react';
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
import { Operations } from './commands/Operations';
import { Observations } from './commands/Observations';
import { request } from './api';
import { ErrorBox, Loading, Modal } from './components/ui';
const navigation = [
  { id: 'runbooks', label: 'Runbooks', icon: Workflow },
  { id: 'overview', label: 'Instance watch', icon: Activity },
  { id: 'apps', label: 'Applications', icon: AppWindow },
  { id: 'permissions', label: 'Permissions', icon: KeyRound },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'tasks', label: 'Scheduled tasks', icon: Timer },
  { id: 'system', label: 'Processes and devices', icon: Server },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'explorer', label: 'API observations', icon: Braces },
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
        <div hidden={page !== 'runbooks'}>
          <Runbooks />
        </div>
        {['apps', 'permissions', 'security', 'tasks', 'system'].includes(page) ? (
          <Operations key={page} area={page} operator={session.info.username} />
        ) : page !== 'runbooks' ? (
          <Observations key={page} area={page} />
        ) : null}
        {finder && (
          <Modal title="Find a tool" onClose={() => setFinder(false)}>
            <div className="tool-finder">
              {navigation.map((item) => (
                <button key={item.id} onClick={() => navigate(item.id)}>
                  <item.icon size={19} />
                  {item.label}
                </button>
              ))}
            </div>
          </Modal>
        )}
      </WaypointShell>
    </div>
  );
}
function SignIn({ error: external, onSignIn }: { error: string; onSignIn: (value: any) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <main className="waypoint-signin">
      <section>
        <p className="waypoint-signin-mark">waypoint / IRIS</p>
        <h1>Operations, one step at a time.</h1>
        <p>Open a runbook, inspect its evidence, and control each change to your instance.</p>
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
            <button className="primary">{busy ? 'Connecting…' : 'Open operations desk'}</button>
          </fieldset>
        </form>
        <small>Uses your native IRIS permissions. This local demo requires SysAdmin API v2.</small>
      </section>
    </main>
  );
}
