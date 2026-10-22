// Answers the app's /api requests inside the page so the real interface can
// be previewed without a server. The titles are Blender Foundation open
// movies, freely shareable under Creative Commons.
import type { Health, LibraryEntry, Resource, Session, Storage } from "../api";

const GB = 1e9,
  MB = 1e6;
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

const resources: Resource[] = [
  {
    id: "08ada5a7a6183aae1e09d831df6748d566095a10",
    name: "Sintel (2010)",
    size: 1.27 * GB,
    files: [
      {
        id: "1",
        path: "Sintel/Sintel.2010.1080p.mkv",
        name: "Sintel.2010.1080p.mkv",
        size: 1.18 * GB,
        kind: "video",
      },
      {
        id: "2",
        path: "Sintel/Sintel.2010.Soundtrack.flac",
        name: "Sintel.2010.Soundtrack.flac",
        size: 62 * MB,
        kind: "audio",
      },
      {
        id: "3",
        path: "Sintel/Subtitles/sintel_en.srt",
        name: "sintel_en.srt",
        size: 1.6e3,
        kind: "subtitle",
      },
      {
        id: "4",
        path: "Sintel/Subtitles/sintel_de.srt",
        name: "sintel_de.srt",
        size: 1.7e3,
        kind: "subtitle",
      },
      {
        id: "5",
        path: "Sintel/Extras/Making.of.Sintel.mp4",
        name: "Making.of.Sintel.mp4",
        size: 24 * MB,
        kind: "video",
      },
      {
        id: "6",
        path: "Sintel/poster.jpg",
        name: "poster.jpg",
        size: 2.1 * MB,
        kind: "file",
      },
    ],
  },
  {
    id: "dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c",
    name: "Big Buck Bunny (2008)",
    size: 276 * MB,
    files: [
      {
        id: "1",
        path: "Big.Buck.Bunny.mp4",
        name: "Big.Buck.Bunny.mp4",
        size: 263 * MB,
        kind: "video",
      },
      {
        id: "2",
        path: "Big.Buck.Bunny.en.srt",
        name: "Big.Buck.Bunny.en.srt",
        size: 1.1e3,
        kind: "subtitle",
      },
      {
        id: "3",
        path: "poster.jpg",
        name: "poster.jpg",
        size: 13 * MB,
        kind: "file",
      },
    ],
  },
  {
    id: "209c8226b299b308beaf2b9cd3fb49212dbd13ec",
    name: "Tears of Steel (2012)",
    size: 571 * MB,
    files: [
      {
        id: "1",
        path: "Tears.of.Steel.2012.1080p.mov",
        name: "Tears.of.Steel.2012.1080p.mov",
        size: 568 * MB,
        kind: "video",
      },
      {
        id: "2",
        path: "Tears.of.Steel.en.srt",
        name: "Tears.of.Steel.en.srt",
        size: 3.4e3,
        kind: "subtitle",
      },
    ],
  },
];

let signedIn = new URLSearchParams(location.search).get("signedout") !== "1";
const session: Session = {
  user: { id: "u1", email: "you@torrently.local", admin: true },
  csrfToken: "preview",
};
let library: LibraryEntry[] = [
  {
    id: "l1",
    resourceId: resources[0].id,
    name: resources[0].name,
    favorite: true,
    updatedAt: day(1),
    progress: { fileId: "1", position: 2712, duration: 888 * 4 },
  },
  {
    id: "l2",
    resourceId: resources[1].id,
    name: resources[1].name,
    favorite: false,
    updatedAt: day(4),
    progress: null,
  },
  {
    id: "l3",
    resourceId: resources[2].id,
    name: resources[2].name,
    favorite: false,
    updatedAt: day(9),
    progress: { fileId: "1", position: 402, duration: 734 },
  },
];
const recent = resources.map((item, i) => ({
  id: item.id,
  name: item.name,
  openedAt: day(i * 2 + 1),
}));
const health: Health = { status: "ok", upstream: "ok", database: "ok" };
const storage: Storage = {
  total: 2 * 1e12,
  free: 1.38 * 1e12,
  cacheBytes: 214 * GB,
  limits: { maxStreams: 4, maxDownloads: 2, maxTranscodes: 1 },
  activeStreams: 1,
  activeDownloads: 0,
};

function reply(status: number, body: unknown, delay = 120) {
  return new Promise<Response>((resolve) =>
    setTimeout(
      () =>
        resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      delay,
    ),
  );
}
const ok = (data: unknown, delay?: number) => reply(200, { data }, delay);
const fail = (status: number, message: string) =>
  reply(status, { error: { code: "PREVIEW", message } });

async function route(method: string, path: string, body: string | null) {
  const json = body ? JSON.parse(body) : {};
  if (path === "/api/session")
    return signedIn ? ok(session) : fail(401, "Sign in to continue.");
  if (path === "/api/login") {
    signedIn = true;
    return ok(session, 500);
  }
  if (path === "/api/logout") {
    signedIn = false;
    return ok({});
  }
  if (path === "/api/health") return ok(health);
  if (path === "/api/admin/storage") return ok(storage);
  if (path === "/api/recent") return ok(recent);
  if (path === "/api/library" && method === "GET") return ok(library);
  if (path === "/api/library" && method === "POST") {
    if (!library.some((item) => item.resourceId === json.resourceId))
      library = [
        {
          id: `l${Date.now()}`,
          resourceId: json.resourceId,
          name: json.name,
          favorite: !!json.favorite,
          updatedAt: new Date().toISOString(),
          progress: null,
        },
        ...library,
      ];
    return ok({});
  }
  const entry = path.match(/^\/api\/library\/([^/]+)$/);
  if (entry) {
    const id = decodeURIComponent(entry[1]);
    if (method === "DELETE") library = library.filter((item) => item.id !== id);
    else
      library = library.map((item) =>
        item.id === id ? { ...item, ...json } : item,
      );
    return ok({});
  }
  if (path === "/api/torrents" && method === "POST")
    return ok(resources[0], 900);
  const torrent = path.match(/^\/api\/torrents\/([^/]+)$/);
  if (torrent) {
    if (method === "DELETE") return ok({});
    const found = resources.find(
      (item) => item.id === decodeURIComponent(torrent[1]),
    );
    return found ? ok(found, 400) : fail(404, "Torrent not found.");
  }
  if (path === "/api/abuse") return ok({});
  return fail(
    503,
    "Streaming and downloads need a Torrently server; this is a design preview.",
  );
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    location.href,
  );
  if (url.origin !== location.origin || !url.pathname.includes("/api/"))
    return realFetch(input, init);
  const path = url.pathname.slice(url.pathname.indexOf("/api/"));
  return route(
    init?.method ?? "GET",
    path,
    typeof init?.body === "string" ? init.body : null,
  );
};
