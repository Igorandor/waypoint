import { RelayShell } from './layout/RelayShell';
import { lazy, Suspense, useEffect, useState } from 'react';

import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Command,
  ExternalLink,
  Globe,
  LayoutDashboard,
  Search,
  Server,
  Shield,
  Users,
  Workflow,
  X,
} from 'lucide-react';

import { entities } from '../shared/catalog';

import { request } from './api';

import { useData } from './hooks';

import { ErrorBox, IconButton, Loading, Modal } from './components/ui';

import { Collection } from './pages/Collection';

import { Overview } from './pages/Overview';

import { System } from './pages/System';

const Explorer = lazy(() =>
  import('./pages/Explorer').then((module) => ({ default: module.Explorer })),
);

import { Logs } from './pages/Logs';
import { Runbooks } from './pages/Runbooks';

const navigation = [
  { id: 'runbooks', label: 'Operations desk', icon: Workflow },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'apps', label: 'Web applications', icon: Globe },
  { id: 'permissions', label: 'Access & permissions', icon: Users },
  { id: 'security', label: 'Security & secrets', icon: Shield },
  { id: 'tasks', label: 'Scheduled tasks', icon: Workflow },
  { id: 'system', label: 'System resources', icon: Server },
  { id: 'logs', label: 'Logs & activity', icon: Activity },
  { id: 'explorer', label: 'REST explorer', icon: BookOpen },
];

export default function App() {
  const [session, setSession] = useState<any>(),
    [sessionError, setSessionError] = useState(''),
    [checking, setChecking] = useState(true),
    [page, setPage] = useState(() => location.hash.slice(1) || 'runbooks'),
    [toast, setToast] = useState(''),
    [command, setCommand] = useState(false),
    [theme, setTheme] = useState(() => localStorage.getItem('relay-theme') ?? 'light');

  useEffect(() => {
    request('session')
      .then(setSession)
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => setSession(undefined);
    window.addEventListener('session-ended', expired);
    return () => window.removeEventListener('session-ended', expired);
  }, []);

  useEffect(() => {
    const change = () => setPage(location.hash.slice(1) || 'runbooks');
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('relay-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const navigate = (id: string) => {
    location.hash = id;
    setPage(id);
    setCommand(false);
  };

  async function logout() {
    setSessionError('');
    try {
      await request('logout', {});
      setSession(undefined);
    } catch (error) {
      setSessionError('Sign out could not be confirmed. ' + (error as Error).message);
    }
  }

  if (checking) return <Loading />;

  if (!session)
    return (
      <Login
        onLogin={(value) => {
          setSessionError('');
          setSession(value);
        }}
      />
    );

  const info = session.info,
    props = { info, notify: setToast };

  return (
    <div className="app-shell relay-app">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      <RelayShell
        page={page}
        navigate={navigate}
        navigation={navigation}
        username={info.username}
        theme={theme}
        onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onCommand={() => setCommand(true)}
        onLogout={logout}
      >
        {sessionError && <ErrorBox error={sessionError} retry={() => void logout()} />}
        <div hidden={page !== 'runbooks'}>
          <Runbooks />
        </div>
        {page === 'overview' && <Overview navigate={navigate} info={info} />}

        {page === 'apps' && <Collection entity={entities.apps} {...props} />}

        {page === 'permissions' && (
          <Group key="permissions" ids={['users', 'roles', 'resources']} {...props} />
        )}

        {page === 'security' && (
          <Group
            key="security"
            ids={['collections', 'secrets', 'certificates', 'tls', 'oauthServers', 'oauthClients']}
            {...props}
          />
        )}

        {page === 'tasks' && <Collection entity={entities.tasks} {...props} />}

        {page === 'system' && <System {...props} />}
        {page === 'logs' && <Logs />}
        {page === 'explorer' && (
          <Suspense fallback={<Loading />}>
            <Explorer />
          </Suspense>
        )}

        {!navigation.some((n) => n.id === page) && <Overview navigate={navigate} info={info} />}
      </RelayShell>

      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <IconButton title="Dismiss notification" onClick={() => setToast('')}>
            <X size={14} />
          </IconButton>
        </div>
      )}

      {command && <CommandMenu navigate={navigate} onClose={() => setCommand(false)} />}
    </div>
  );
}

function Group({ ids, info, notify }: { ids: string[]; info: any; notify: (s: string) => void }) {
  const [tab, setTab] = useState(ids[0]);
  return (
    <>
      <div className="tabs group-tabs" aria-label="Workspace sections">
        {ids.map((id) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {entities[id].title}
          </button>
        ))}
      </div>
      {tab === 'secrets' ? (
        <Secrets info={info} notify={notify} />
      ) : tab === 'oauthClients' ? (
        <OAuthClients info={info} notify={notify} />
      ) : (
        <Collection key={tab} entity={entities[tab]} info={info} notify={notify} />
      )}
    </>
  );
}

function Secrets({ info, notify }: { info: any; notify: (s: string) => void }) {
  const collections = useData<any[]>('/v2/wallet/collections'),
    [collection, setCollection] = useState('');
  const selected = collection || collections.data?.[0]?.Name;
  return (
    <>
      {collections.error && <ErrorBox error={collections.error} />}
      <div className="collection-picker">
        <label htmlFor="wallet-collection">Collection</label>
        <select
          id="wallet-collection"
          value={selected ?? ''}
          onChange={(e) => setCollection(e.target.value)}
        >
          <option value="">Choose a collection…</option>
          {collections.data?.map((c) => (
            <option key={c.Name}>{c.Name}</option>
          ))}
        </select>
        <span>Values stay in the IRIS wallet.</span>
      </div>
      {selected ? (
        <Collection
          key={selected}
          entity={entities.secrets}
          info={info}
          notify={notify}
          query={{ collection: selected }}
        />
      ) : (
        <p className="notice">Create a wallet collection first, then add its secrets here.</p>
      )}
    </>
  );
}

function CommandMenu({
  navigate,
  onClose,
}: {
  navigate: (s: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  return (
    <Modal title="Go to workspace" onClose={onClose}>
      <div className="modal-body">
        <div className="search-field">
          <Search size={18} />
          <input
            autoFocus
            aria-label="Find a workspace"
            placeholder="Search workspaces…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="command-options">
          {navigation
            .filter((n) => n.label.toLowerCase().includes(search.toLowerCase()))
            .map((n) => (
              <button key={n.id} onClick={() => navigate(n.id)}>
                <n.icon size={18} />
                {n.label}
                <ArrowRight size={15} />
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}

function Login({ onLogin }: { onLogin: (s: any) => void }) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState('Configured IRIS instance');

  useEffect(() => {
    request('health')
      .then((d) => setTarget(d.target))
      .catch(() => {});
  }, []);

  return (
    <div className="login-layout relay-login">
      <div className="login-form">
        <div className="login-card">
          <div className="brand">
            <span className="brand-mark">R</span>
            <span>
              relay<span className="brand-subtitle">IRIS operations</span>
            </span>
          </div>
          <h1>Sign in</h1>
          <p>Sign in with your IRIS account.</p>
          <div className="target-label">
            <Server size={15} aria-hidden="true" />
            <code>{target}</code>
          </div>
          {error && <ErrorBox error={error} />}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                onLogin(await request('login', { username, password }));
                setPassword('');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="primary" disabled={busy}>
              {busy ? 'Connecting…' : 'Connect to IRIS'} <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-note">
            <Shield size={15} /> Your existing IRIS permissions apply. Credentials are kept in
            server memory for this session.
          </p>
        </div>
      </div>
    </div>
  );
}

function OAuthClients({ info, notify }: { info: any; notify: (s: string) => void }) {
  const servers = useData<any[]>('/v2/security/oauth2/client/server-definitions'),
    [server, setServer] = useState('');
  const selected = server || String(servers.data?.[0]?.ID ?? '');
  return (
    <>
      {servers.error && <ErrorBox error={servers.error} />}
      <div className="collection-picker">
        <label htmlFor="oauth-server">Authorization server</label>
        <select id="oauth-server" value={selected} onChange={(e) => setServer(e.target.value)}>
          <option value="">Choose a server definition…</option>
          {servers.data?.map((s) => (
            <option key={s.ID} value={s.ID}>
              {s.IssuerEndpoint ?? s.ID}
            </option>
          ))}
        </select>
      </div>
      {selected ? (
        <Collection
          key={selected}
          entity={{
            ...entities.oauthClients,
            defaults: { ...entities.oauthClients.defaults, OAuth2ServerDefinition: selected },
          }}
          info={info}
          notify={notify}
          query={{ serverId: selected }}
        />
      ) : (
        <p className="notice">
          Create an OAuth server definition first, then configure its clients here.
        </p>
      )}
    </>
  );
}
