import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Command,
  Layers,
  Network,
  Settings,
  History,
  Plug,
  Activity,
  Monitor,
} from "lucide-react";
import { apiBase, listWorkspaces, saveWorkspace, useConnection } from "./api";
import { DesktopPage } from "./DesktopPage";
import { isTauri } from "@tauri-apps/api/core";
const WorkspacePage = lazy(() =>
  import("./WorkspacePage").then((module) => ({
    default: module.WorkspacePage,
  })),
);

const navigation = [
  ["/", "Command surface", Command],
  ["/desktop", "Local windows", Monitor],
  ["/timeline", "Time Machine", History],
  ["/collaboration", "Collaboration", Network],
  ["/integrations", "Integrations", Plug],
  ["/activity", "Activity", Activity],
  ["/settings", "Settings", Settings],
] as const;
export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch(`${apiBase}/health`);
      if (!response.ok) throw new Error("API unavailable");
      return response.json();
    },
    refetchInterval: 15000,
  });
  return (
    <div className="shell">
      <aside>
        <Link className="brand" to="/">
          <Layers />
          FlowState<span>OS</span>
        </Link>
        <nav>
          {navigation.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="device">
          <Monitor />
          <div>
            {isTauri() ? "Windows companion" : "Web portal"}
            <small>
              {isTauri()
                ? "Read-only discovery available"
                : "Desktop companion required"}
            </small>
          </div>
        </div>
      </aside>
      <div className="content">
        <header>
          <span>Your workspace, shaped by your intent</span>
          <span className="status">
            <i className={health.isSuccess ? "online" : ""} />
            {health.isSuccess ? "API reachable" : "API unavailable"}
            <span>Switch · disconnected</span>
          </span>
        </header>
        <main>
          <Suspense fallback={<p>Loading workspace…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/workspace/:id" element={<WorkspacePage />} />
              <Route path="/settings" element={<Connection />} />
              <Route path="/desktop" element={<DesktopPage />} />
              <Route
                path="/timeline"
                element={
                  <Empty
                    title="Workspace Time Machine"
                    text="Native snapshot capture requires the desktop companion. No snapshots have been captured."
                  />
                }
              />
              <Route
                path="/collaboration"
                element={
                  <Empty
                    title="Shared intent. Local control."
                    text="Switch is not configured. Room requests and participant contributions will appear here once the Switch adapter is connected."
                  />
                }
              />
              <Route path="/integrations" element={<Integrations />} />
              <Route
                path="/activity"
                element={
                  <Empty
                    title="Execution activity"
                    text="No executor is connected. Saving a workspace records its configuration; it does not launch applications or arrange windows."
                  />
                }
              />
              <Route
                path="*"
                element={
                  <Empty
                    title="Page not found"
                    text="Return to the command surface to choose a workspace."
                  />
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer>
          <span>FlowState / Workspace orchestration</span>
          <span>Local execution unavailable</span>
        </footer>
      </div>
    </div>
  );
}
function Home() {
  const token = useConnection((s) => s.token);
  const workspaces = useQuery({
    queryKey: ["workspaces", token],
    queryFn: listWorkspaces,
    enabled: !!token,
  });
  const [intent, setIntent] = useState("");
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () =>
      saveWorkspace({
        name: intent.trim().slice(0, 120),
        intent,
        layout: "coding",
        resources: [],
      }),
    onSuccess: (workspace) => navigate(`/workspace/${workspace.id}`),
  });
  return (
    <>
      <section className="hero">
        <p className="eyebrow">The command surface</p>
        <h1>
          What are we
          <br />
          working on?
        </h1>
        <p>
          Give your next workspace a purpose.
          <br />
          Add its resources, then shape the arrangement.
        </p>
        <form
          className="command"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Command />
          <input
            aria-label="Workspace intent"
            maxLength={2000}
            placeholder="Describe what you want to accomplish…"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
          <button
            aria-label="Create workspace"
            disabled={!token || !intent.trim() || create.isPending}
          >
            <ArrowUpRight />
          </button>
        </form>
        <p className="caption">
          Creates a saved workspace draft · No AI model connected
        </p>
        {create.error && <p role="alert">{create.error.message}</p>}
      </section>
      <section>
        <div className="section-heading">
          <h2>Resume</h2>
          <span>{workspaces.data?.length ?? 0} workspaces</span>
        </div>
        {!token ? (
          <div className="empty">
            Connect to your local service to save and resume workspaces.{" "}
            <Link to="/settings">
              Open settings <ArrowUpRight />
            </Link>
          </div>
        ) : workspaces.isPending ? (
          <p>Loading workspaces…</p>
        ) : workspaces.error ? (
          <p role="alert">{workspaces.error.message}</p>
        ) : workspaces.data?.length ? (
          <div className="workspace-list">
            {workspaces.data.map((workspace) => (
              <Link to={`/workspace/${workspace.id}`} key={workspace.id}>
                <Layers />
                <div>
                  <strong>{workspace.name}</strong>
                  <small>
                    {workspace.resources.length} resources · {workspace.layout}{" "}
                    layout
                  </small>
                </div>
                <ArrowUpRight />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            Your first workspace starts with the command above
          </div>
        )}
      </section>
      <section className="bottom-grid">
        <div>
          <h2>Suggested</h2>
          <p>Suggestions become available when you save reusable workspaces.</p>
        </div>
        <div>
          <h2>Connected</h2>
          <div className="connection-row">
            <Monitor />
            <span>Web portal</span>
            <small>Current session</small>
          </div>
          <p>
            Native applications and browser tabs require the desktop companion.
          </p>
        </div>
      </section>
    </>
  );
}
function Connection() {
  const setToken = useConnection((s) => s.setToken);
  const token = useConnection((s) => s.token);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  async function connect(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/workspaces`, {
        headers: { Authorization: `Bearer ${value}` },
      });
      if (!response.ok)
        throw new Error(
          "Connection rejected. Check the API token and service.",
        );
      client.clear();
      setToken(value);
      setValue("");
      setMessage("Connected to the workspace service");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings">
      <p className="eyebrow">Connection & privacy</p>
      <h1>Settings</h1>
      <h2>Local service</h2>
      <p>
        Enter the device token configured on your API. It stays in memory for
        this session and is cleared when you reload.
      </p>
      <form onSubmit={connect}>
        <label htmlFor="token">Device token</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="primary" disabled={pending || value.length < 32}>
          Connect
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {token && (
        <button
          onClick={() => {
            setToken("");
            client.clear();
            setMessage("Disconnected");
          }}
        >
          Disconnect
        </button>
      )}
      <hr />
      <h2>Permissions</h2>
      <p>
        This web session can manage saved workspace configurations. No
        filesystem, window, calendar, browser-tab, or room permissions have been
        granted.
      </p>
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <section className="settings">
      <p className="eyebrow">FlowState OS</p>
      <h1>{title}</h1>
      <p>{text}</p>
      <Link to="/">Back to command surface</Link>
    </section>
  );
}
function Integrations() {
  return (
    <section>
      <h1>Integrations</h1>
      <p>Connection state reflects configured, verified adapters.</p>
      {[
        "Switch rooms",
        "Desktop companion",
        "Browser extension",
        "GitHub",
        "Google Calendar",
        "Google Drive",
      ].map((name) => (
        <div className="integration" key={name}>
          <Plug />
          <strong>{name}</strong>
          <span>Not configured</span>
        </div>
      ))}
    </section>
  );
}
