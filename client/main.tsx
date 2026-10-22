import {
  StrictMode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  ApiError,
  bytes,
  fileUrl,
  setSession,
  type Health,
  type LibraryEntry,
  type Progress,
  type Resource,
  type Session,
  type Storage,
  type TorrentFile,
} from "./api";
import { Icon, type IconName } from "./icons";
import { AppBackdrop } from "./AppBackdrop";
const Player = lazy(() =>
  import("./Player").then((module) => ({ default: module.Player })),
);
import "@fontsource/doto/latin-900.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "./style.css";

type Page =
  "open" | "library" | "favorites" | "downloads" | "settings" | "resource";
interface Recent {
  id: string;
  name: string;
  openedAt: string;
}
const sections: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: "open", label: "Open torrent", icon: "plus" },
  { id: "library", label: "Library", icon: "library" },
  { id: "favorites", label: "Favorites", icon: "star" },
  { id: "downloads", label: "Downloads", icon: "download" },
];
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
}
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 28 28">
          <path d="M4 5h20v5h-7v13h-6V10H4Z" fill="currentColor" />
          <path
            d="m20 15 4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
        </svg>
      </span>
      <span className="brand-word">
        Torrently
        <span className="brand-dot" />
      </span>
    </div>
  );
}
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);
  const [hours, minutes] = [now.getHours(), now.getMinutes()].map((part) =>
    String(part).padStart(2, "0"),
  );
  return (
    <time
      className="clock"
      dateTime={now.toISOString()}
      aria-label={now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}
    >
      {hours}
      <span className="clock-colon">:</span>
      {minutes}
    </time>
  );
}
function App() {
  const [session, setSessionState] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState<Page>("open");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [resource, setResource] = useState<Resource | null>(null);
  const [selected, setSelected] = useState<TorrentFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [downloads, setDownloads] = useState<
    Array<{ id: string; name: string; url: string; at: string }>
  >([]);
  const operation = useRef<AbortController | null>(null);
  const currentEntry = library.find(
    (entry) => entry.resourceId === resource?.id,
  );

  const loadLibrary = useCallback(async () => {
    const [saved, opened] = await Promise.all([
      api<LibraryEntry[]>("/api/library"),
      api<Recent[]>("/api/recent"),
    ]);
    setLibrary(saved);
    setRecent(opened);
  }, []);
  useEffect(() => {
    const cancel = new AbortController();
    api<Session>("/api/session", {}, cancel.signal)
      .then((value) => {
        setSession(value);
        setSessionState(value);
      })
      .catch((e) => {
        if (
          !cancel.signal.aborted &&
          (!(e instanceof ApiError) || e.status !== 401)
        )
          setError(message(e));
      })
      .finally(() => {
        if (!cancel.signal.aborted) setBooting(false);
      });
    return () => cancel.abort();
  }, []);
  useEffect(() => {
    if (session) void loadLibrary().catch((e) => setError(message(e)));
  }, [session, loadLibrary]);
  useEffect(() => {
    if (!session) return;
    const update = () =>
      void api<Health>("/api/health")
        .then(setHealth)
        .catch(() => setHealth(null));
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [session]);
  useEffect(() => {
    if (page !== "settings" || !session) return;
    void api<Storage>("/api/admin/storage")
      .then(setStorage)
      .catch((e) => setError(message(e)));
  }, [page, session]);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function perform(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setError("");
    setSelected(null);
  }
  async function openResource(id: string) {
    setBusy(true);
    setBusyMessage("Opening torrent…");
    setError("");
    operation.current?.abort();
    operation.current = new AbortController();
    try {
      const value = await api<Resource>(
        `/api/torrents/${encodeURIComponent(id)}`,
        {},
        operation.current.signal,
      );
      setResource(value);
      setSelected(null);
      setPage("resource");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(magnet?: string, torrent?: File) {
    setBusy(true);
    setBusyMessage("Resolving torrent metadata from peers…");
    setError("");
    operation.current?.abort();
    operation.current = new AbortController();
    try {
      if (
        torrent &&
        (!/\.torrent$/i.test(torrent.name) || torrent.size > 2_000_000)
      )
        throw new Error("Choose a .torrent file smaller than 2 MB.");
      const value = await api<Resource>(
        "/api/torrents",
        torrent
          ? {
              method: "POST",
              headers: { "Content-Type": "application/x-bittorrent" },
              body: await torrent.arrayBuffer(),
            }
          : {
              method: "POST",
              body: JSON.stringify({ magnet: magnet?.trim() }),
            },
        operation.current.signal,
      );
      setResource(value);
      setSelected(null);
      setPage("resource");
      await loadLibrary();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveResource(favorite = false) {
    if (!resource) return;
    await api("/api/library", {
      method: "POST",
      body: JSON.stringify({
        resourceId: resource.id,
        name: resource.name,
        favorite,
      }),
    });
    await loadLibrary();
    setNotice("Saved to your library.");
  }
  async function progress(value: Progress) {
    if (!resource) return;
    try {
      let entry = library.find((item) => item.resourceId === resource.id);
      if (!entry) {
        await api("/api/library", {
          method: "POST",
          body: JSON.stringify({
            resourceId: resource.id,
            name: resource.name,
          }),
        });
        const list = await api<LibraryEntry[]>("/api/library");
        setLibrary(list);
        entry = list.find((item) => item.resourceId === resource.id);
      }
      if (entry) {
        await api(`/api/library/${encodeURIComponent(entry.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ progress: value }),
        });
        setLibrary((items) =>
          items.map((item) =>
            item.id === entry!.id ? { ...item, progress: value } : item,
          ),
        );
      }
    } catch (e) {
      setError(`Playback progress could not be saved: ${message(e)}`);
    }
  }
  function download(file?: TorrentFile) {
    if (!resource) return;
    const url = file
      ? fileUrl(resource.id, file.id)
      : `/api/torrents/${encodeURIComponent(resource.id)}/archive`;
    const id = `${resource.id}:${file?.id ?? "archive"}`;
    setDownloads((items) => [
      {
        id,
        name: file?.name ?? `${resource.name}.zip`,
        url,
        at: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      ...items.filter((item) => item.id !== id),
    ]);
    const link = document.createElement("a");
    link.href = url;
    link.download = file?.name ?? `${resource.name}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice(
      "Download requested. Follow its progress in your browser’s downloads.",
    );
  }
  async function favorite(entry: LibraryEntry) {
    await api(`/api/library/${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ favorite: !entry.favorite }),
    });
    await loadLibrary();
  }
  async function remove(entry: LibraryEntry) {
    await api(`/api/library/${encodeURIComponent(entry.id)}`, {
      method: "DELETE",
    });
    await loadLibrary();
    setNotice("Removed from your library.");
  }

  if (booting)
    return (
      <div className="boot">
        <Logo />
        <p>Connecting to your server…</p>
      </div>
    );
  if (!session)
    return (
      <Login
        error={error}
        onLogin={async (email, password) => {
          setError("");
          try {
            const value = await api<Session>("/api/login", {
              method: "POST",
              body: JSON.stringify({ email, password }),
            });
            setSession(value);
            setSessionState(value);
          } catch (e) {
            setError(message(e));
          }
        }}
      />
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {sections.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
              {item.id === "library" && library.length > 0 && (
                <span className="nav-count">{library.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="server-note">
            <span
              className={`status-dot ${health?.status === "ok" ? "online" : ""}`}
            />
            <div>
              <strong>
                {health?.status === "ok"
                  ? "Server connected"
                  : health?.upstream === "unconfigured"
                    ? "Engine not configured"
                    : health
                      ? "Engine unavailable"
                      : "Checking server"}
                <small>Self-hosted · Private workspace</small>
              </strong>
            </div>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Icon name="settings" size={19} />
            Settings
          </button>
          <div className="account">
            <span className="avatar">
              {session.user.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-email">{session.user.email}</span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                void perform(async () => {
                  await api("/api/logout", { method: "POST" });
                  setSessionState(null);
                  setLibrary([]);
                  setResource(null);
                  setSelected(null);
                })
              }
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span>{" "}
            {page === "resource"
              ? "Torrent files"
              : page === "open"
                ? "Open torrent"
                : page[0].toUpperCase() + page.slice(1)}
          </span>
          <span className="topbar-right">
            <Clock />
            <span className="private-label">
              <span className="private-lock" />
              Private instance
            </span>
          </span>
        </header>
        <main id="main-content">
          {error && (
            <div className="message error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Icon name="check" size={17} />
              {notice}
            </div>
          )}
          {busy && (
            <div className="message working" role="status">
              <span className="spinner" />
              <span>
                {busyMessage}
                <small>
                  Metadata availability depends on reachable torrent peers.
                </small>
              </span>
              <button
                className="button quiet"
                onClick={() => operation.current?.abort()}
              >
                Cancel
              </button>
            </div>
          )}
          {page === "open" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">YOUR CONTENT. YOUR SERVER.</span>
                <h1>Make yourself at home.</h1>
                <p>Open a torrent. Pick a file. Press play.</p>
              </div>
              <TorrentInput busy={busy} onSubmit={submit} />
              <div className="workflow">
                <div>
                  <span>01</span>
                  <strong>Add your torrent</strong>
                  <p>A magnet link or a .torrent file.</p>
                </div>
                <div>
                  <span>02</span>
                  <strong>Find your file</strong>
                  <p>Browse the actual torrent contents.</p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Watch or download</strong>
                  <p>Delivered through your own server.</p>
                </div>
              </div>
              <div className="section-heading">
                <h2>Recently opened</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("library")}
                >
                  View library <Icon name="arrow" size={16} />
                </button>
              </div>
              {recent.length ? (
                <RecentList
                  entries={recent.slice(0, 4)}
                  onOpen={openResource}
                />
              ) : (
                <Empty
                  icon="library"
                  title="Your next watch starts here"
                  detail="Torrents you save will appear in your private library."
                  compact
                />
              )}
              <div className="privacy-note">
                <Icon name="server" size={17} />
                <span>
                  Files travel through your server. Its IP address participates
                  in the torrent swarm.
                </span>
              </div>
            </>
          )}
          {(page === "library" || page === "favorites") && (
            <>
              <div className="page-heading compact-heading">
                <span className="eyebrow">YOUR COLLECTION</span>
                <h1>{page === "library" ? "Library" : "Favorites"}</h1>
                <p>Saved torrents and the place you left off.</p>
              </div>
              <LibraryView
                entries={
                  page === "favorites"
                    ? library.filter((item) => item.favorite)
                    : library
                }
                onOpen={openResource}
                onFavorite={(entry) => void perform(() => favorite(entry))}
                onRemove={(entry) => void perform(() => remove(entry))}
              />
            </>
          )}
          {page === "resource" && resource && (
            <>
              <div className="page-heading compact-heading resource-heading">
                <div>
                  <span className="eyebrow">TORRENT CONTENTS</span>
                  <h1>{resource.name}</h1>
                  <p>
                    {resource.files.length.toLocaleString()} files{" "}
                    <span className="dot-divider">·</span>
                    {bytes(resource.size)}
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button"
                    onClick={() =>
                      void perform(() =>
                        currentEntry ? favorite(currentEntry) : saveResource(),
                      )
                    }
                  >
                    <Icon name={currentEntry ? "star" : "plus"} size={17} />
                    {currentEntry
                      ? currentEntry.favorite
                        ? "Unfavorite"
                        : "Favorite"
                      : "Save to library"}
                  </button>
                  <button className="button" onClick={() => download()}>
                    <Icon name="download" size={17} />
                    Download ZIP
                  </button>
                </div>
              </div>
              {selected && (
                <Suspense
                  fallback={<p className="muted">Loading media player…</p>}
                >
                  <Player
                    key={`${resource.id}:${selected.id}`}
                    resource={resource}
                    file={selected}
                    resume={currentEntry?.progress}
                    onProgress={(value) => void progress(value)}
                    onClose={() => setSelected(null)}
                  />
                </Suspense>
              )}
              <FileBrowser
                resource={resource}
                selected={selected?.id}
                onPlay={setSelected}
                onDownload={download}
              />
              <div className="resource-management">
                <ReportForm
                  resourceId={resource.id}
                  onSuccess={() =>
                    setNotice("Report saved for the administrator.")
                  }
                  onError={setError}
                />
                <button
                  className="text-button remove-resource"
                  onClick={() =>
                    void perform(async () => {
                      await api(
                        `/api/torrents/${encodeURIComponent(resource.id)}`,
                        { method: "DELETE" },
                      );
                      setSelected(null);
                      setResource(null);
                      setPage("open");
                      await loadLibrary();
                      setNotice(
                        "Torrent removed from your workspace. Shared cached data is managed by the server.",
                      );
                    })
                  }
                >
                  Remove from workspace
                </button>
              </div>
            </>
          )}
          {page === "downloads" && (
            <>
              <div className="page-heading compact-heading">
                <span className="eyebrow">ORIGINAL FILES</span>
                <h1>Downloads</h1>
                <p>Files requested during this browser session.</p>
              </div>
              {downloads.length ? (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>File</th>
                          <th>Requested</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {downloads.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className="file-title">
                                <Icon name="file" />
                                {item.name}
                              </span>
                            </td>
                            <td className="muted">{item.at}</td>
                            <td>
                              <a
                                className="button quiet"
                                href={item.url}
                                download
                              >
                                <Icon name="download" size={16} />
                                Retry
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="fine-print">
                    Your browser manages download progress, pause, resume, and
                    completion. Requests listed here are not completion
                    confirmations.
                  </p>
                </>
              ) : (
                <Empty
                  icon="download"
                  title="No downloads requested"
                  detail="Open a torrent and download any file, or the entire archive."
                />
              )}
            </>
          )}
          {page === "settings" && (
            <>
              <div className="page-heading compact-heading">
                <span className="eyebrow">YOUR INSTANCE</span>
                <h1>Settings</h1>
                <p>Account, connection, and server storage.</p>
              </div>
              <div className="settings-section">
                <h2>Account</h2>
                <div className="setting-row">
                  <span>Signed in as</span>
                  <strong>{session.user.email}</strong>
                </div>
                <p className="fine-print">
                  Account credentials and server limits are managed by the
                  administrator in the deployment configuration.
                </p>
              </div>
              <div className="settings-section">
                <h2>Connection</h2>
                <div className="setting-row">
                  <span>Application</span>
                  <strong>{health?.status ?? "Unavailable"}</strong>
                </div>
                <div className="setting-row">
                  <span>Torrent engine</span>
                  <strong>{String(health?.upstream ?? "Unavailable")}</strong>
                </div>
                <div className="setting-row">
                  <span>Database</span>
                  <strong>{String(health?.database ?? "Unavailable")}</strong>
                </div>
              </div>
              <div className="settings-section">
                <h2>Storage & capacity</h2>
                {storage ? (
                  <>
                    <div className="storage-summary">
                      <div>
                        <small>FREE SPACE</small>
                        <strong>{bytes(storage.free)}</strong>
                      </div>
                      <div>
                        <small>DISK CAPACITY</small>
                        <strong>{bytes(storage.total)}</strong>
                      </div>
                      <div>
                        <small>TORRENT CACHE</small>
                        <strong>{bytes(storage.cacheBytes)}</strong>
                      </div>
                    </div>
                    {storage.total > 0 && (
                      <meter
                        className="storage-meter"
                        min="0"
                        max={storage.total}
                        value={storage.total - storage.free}
                        aria-label="Disk usage"
                      />
                    )}
                    <div className="setting-row">
                      <span>Active streams</span>
                      <strong>{storage.activeStreams}</strong>
                    </div>
                    <div className="setting-row">
                      <span>Active downloads</span>
                      <strong>{storage.activeDownloads}</strong>
                    </div>
                    {Object.entries(storage.limits ?? {}).map(
                      ([key, value]) => (
                        <div className="setting-row" key={key}>
                          <span>{key.replace(/([A-Z])/g, " $1")}</span>
                          <strong>{value}</strong>
                        </div>
                      ),
                    )}
                  </>
                ) : (
                  <p className="muted">
                    Storage information is unavailable. Administrator access may
                    be required.
                  </p>
                )}
              </div>
            </>
          )}
        </main>
        <footer>
          TORRENTLY <span>Made for your own server.</span>
          <span className="footer-right">
            Use content you have permission to share.
          </span>
        </footer>
      </div>
    </div>
  );
}

function Login({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(email, password);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <div className="login-top">
        <Logo />
        <span className="private-label">Private instance</span>
      </div>
      <main className="login-main">
        <span className="eyebrow">WELCOME HOME</span>
        <h1>
          Your library.
          <br />
          On your terms.
        </h1>
        <p>Sign in to your Torrently server.</p>
        <form className="login-form" onSubmit={submit}>
          {error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          <label>
            Email address
            <input
              name="email"
              autoComplete="username"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <Icon name="arrow" size={18} />
          </button>
        </form>
        <p className="fine-print">
          Use the account configured by your server administrator.
        </p>
      </main>
      <footer>
        TORRENTLY<span>Your private streaming workspace.</span>
      </footer>
    </div>
  );
}
function TorrentInput({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (magnet?: string, file?: File) => Promise<void>;
}) {
  const [magnet, setMagnet] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^magnet:\?/i.test(magnet.trim())) {
      setError("Paste a magnet link beginning with magnet:?.");
      return;
    }
    setError("");
    void onSubmit(magnet);
  }
  function fileSelected(file?: File) {
    if (file && !busy) {
      setError("");
      void onSubmit(undefined, file);
    }
  }
  return (
    <section
      className={`torrent-input ${dragging ? "dragging" : ""}`}
      aria-label="Open a torrent"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        fileSelected(event.dataTransfer.files[0]);
      }}
    >
      <div className="input-heading">
        <span className="input-symbol">
          <Icon name="plus" size={23} />
        </span>
        <div>
          <h2>Start with a torrent</h2>
          <p>Paste a magnet link or drop a .torrent file.</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="magnet">
          Magnet link
        </label>
        <div className="magnet-field">
          <input
            id="magnet"
            type="text"
            value={magnet}
            onChange={(event) => setMagnet(event.target.value)}
            placeholder="magnet:?xt=urn:btih:…"
            autoComplete="off"
            spellCheck="false"
            disabled={busy}
          />
          <button
            className="button primary"
            type="submit"
            disabled={busy || !magnet.trim()}
          >
            Open torrent
            <Icon name="arrow" size={18} />
          </button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="upload-line">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="upload" size={17} />
          Upload a .torrent file
        </button>
        <span>
          or drag it anywhere here <span className="dot-divider">·</span> up to
          2 MB
        </span>
        <input
          ref={input}
          type="file"
          accept=".torrent,application/x-bittorrent"
          hidden
          onChange={(event) => {
            fileSelected(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </section>
  );
}
function Empty({
  icon,
  title,
  detail,
  compact = false,
}: {
  icon: IconName;
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact-empty" : ""}`}>
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
    </div>
  );
}
function RecentList({
  entries,
  onOpen,
}: {
  entries: Recent[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="library-list">
      {entries.map((entry) => (
        <div className="library-row" key={entry.id}>
          <span className="library-file-icon">
            <Icon name="folder" size={23} />
          </span>
          <button className="library-open" onClick={() => onOpen(entry.id)}>
            <strong>{entry.name}</strong>
            <small>
              Opened{" "}
              {new Date(entry.openedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </small>
          </button>
          <button
            className="icon-button"
            aria-label={`Open ${entry.name}`}
            onClick={() => onOpen(entry.id)}
          >
            <Icon name="arrow" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
function ReportForm({
  resourceId,
  onSuccess,
  onError,
}: {
  resourceId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="report-form">
      <summary>Report content</summary>
      <p className="fine-print">
        This report is saved privately for your server administrator.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void api("/api/abuse", {
            method: "POST",
            body: JSON.stringify({ resourceId, reason }),
          })
            .then(() => {
              setReason("");
              onSuccess();
            })
            .catch((e) => onError(message(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label htmlFor="report-reason">
          Reason
          <textarea
            id="report-reason"
            minLength={10}
            maxLength={4000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Submitting…" : "Submit report"}
        </button>
      </form>
    </details>
  );
}
function LibraryView(props: {
  entries: LibraryEntry[];
  onOpen: (id: string) => void;
  onFavorite: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = props.entries.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="list-toolbar">
        <span className="muted">{props.entries.length} saved torrents</span>
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search library"
            placeholder="Search library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {entries.length ? (
        <LibraryList {...props} entries={entries} />
      ) : (
        <Empty
          icon="library"
          title={
            query ? "No matching torrents" : "A little room for your favorites"
          }
          detail={
            query
              ? "Try a different search."
              : "Open a torrent and save it to keep it here."
          }
        />
      )}
    </>
  );
}
function LibraryList({
  entries,
  onOpen,
  onFavorite,
  onRemove,
}: {
  entries: LibraryEntry[];
  onOpen: (id: string) => void;
  onFavorite: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
}) {
  return (
    <div className="library-list">
      {entries.map((entry) => (
        <div className="library-row" key={entry.id}>
          <span className="library-file-icon">
            <Icon name="folder" size={23} />
          </span>
          <button
            className="library-open"
            onClick={() => onOpen(entry.resourceId)}
          >
            <strong>{entry.name}</strong>
            <small>
              {entry.progress
                ? `Resume at ${Math.floor(entry.progress.position / 60)}:${String(Math.floor(entry.progress.position % 60)).padStart(2, "0")}`
                : "Saved torrent"}
              <span className="dot-divider">·</span>
              {new Date(entry.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </small>
            {entry.progress && entry.progress.duration > 0 && (
              <progress
                max={entry.progress.duration}
                value={entry.progress.position}
                aria-label="Playback progress"
              />
            )}
          </button>
          <button
            className={`icon-button ${entry.favorite ? "favorite" : ""}`}
            aria-label={`${entry.favorite ? "Unfavorite" : "Favorite"} ${entry.name}`}
            onClick={() => onFavorite(entry)}
          >
            <Icon name="star" size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={`Remove ${entry.name} from library`}
            onClick={() => onRemove(entry)}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      ))}
    </div>
  );
}
function FileBrowser({
  resource,
  selected,
  onPlay,
  onDownload,
}: {
  resource: Resource;
  selected?: string;
  onPlay: (file: TorrentFile) => void;
  onDownload: (file: TorrentFile) => void;
}) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [limit, setLimit] = useState(100);
  const files = resource.files.filter((file) =>
    file.path.toLowerCase().includes(query.toLowerCase()),
  );
  const inFolder = query
    ? files
    : files.filter((file) => file.path.startsWith(folder));
  const folders = query
    ? []
    : [
        ...new Set(
          inFolder
            .map((file) => file.path.slice(folder.length))
            .filter((path) => path.includes("/"))
            .map((path) => path.split("/")[0]),
        ),
      ].sort();
  const visible = query
    ? files
    : inFolder.filter((file) => !file.path.slice(folder.length).includes("/"));
  const crumbs = folder.split("/").filter(Boolean);
  return (
    <section className="file-browser">
      <div className="list-toolbar">
        <div className="folder-breadcrumbs">
          <button
            className="text-button"
            onClick={() => {
              setFolder("");
              setLimit(100);
            }}
          >
            All files
          </button>
          {crumbs.map((part, i) => (
            <span key={i}>
              /
              <button
                className="text-button"
                onClick={() => {
                  setFolder(crumbs.slice(0, i + 1).join("/") + "/");
                  setLimit(100);
                }}
              >
                {part}
              </button>
            </span>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Search torrent files"
            placeholder="Search files"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(100);
            }}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Type</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {folders.map((name) => (
              <tr key={name} className="folder-row">
                <td colSpan={4}>
                  <button
                    className="file-title folder-button"
                    onClick={() => {
                      setFolder(folder + name + "/");
                      setLimit(100);
                    }}
                  >
                    <Icon name="folder" />
                    {name}
                    <span className="folder-arrow">›</span>
                  </button>
                </td>
              </tr>
            ))}
            {visible.slice(0, limit).map((file) => (
              <tr
                key={file.id}
                className={selected === file.id ? "selected-file" : ""}
              >
                <td>
                  <span className="file-title">
                    <Icon
                      name={
                        file.kind === "video"
                          ? "video"
                          : file.kind === "audio"
                            ? "audio"
                            : "file"
                      }
                      size={20}
                    />
                    <span className="file-name">
                      {query ? file.path : file.name}
                    </span>
                  </span>
                </td>
                <td className="muted numeric">{bytes(file.size)}</td>
                <td>
                  <span className="file-type">
                    {file.kind === "file"
                      ? file.name.split(".").pop()?.toUpperCase().slice(0, 8) ||
                        "FILE"
                      : file.kind.toUpperCase()}
                  </span>
                </td>
                <td>
                  <div className="file-actions">
                    {(file.kind === "video" || file.kind === "audio") && (
                      <button
                        className="button quiet play-button"
                        onClick={() => onPlay(file)}
                        aria-label={`Play ${file.name}`}
                      >
                        <Icon name="play" size={15} />
                        <span>Play</span>
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Download ${file.name}`}
                      onClick={() => onDownload(file)}
                    >
                      <Icon name="download" size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && !folders.length && (
        <Empty
          icon="search"
          title="No files found"
          detail="Try another search or open a different folder."
        />
      )}
      {visible.length > limit && (
        <button
          className="button load-more"
          onClick={() => setLimit((value) => value + 100)}
        >
          Show more files ({visible.length - limit} remaining)
        </button>
      )}
      <p className="fine-print">
        {resource.files.length.toLocaleString()} files in this torrent.
        Availability depends on reachable peers.
      </p>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppBackdrop />
    <App />
  </StrictMode>,
);
