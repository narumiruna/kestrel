// Loopback-only, in-memory fixtures for verify-web-review-browser.mjs.
// Start: node scripts/web-review-browser.fixture.mjs
// Restart this fixture before each verification run. No database or device access.
import { createServer } from "node:http";
const stamp = "2026-01-01T00:00:00.000Z";
const session = {
  accessToken: "fixture-access",
  accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  refreshToken: "fixture-refresh",
  session: { id: "22222222-2222-4222-8222-222222222222" },
  user: { id: "11111111-1111-4111-8111-111111111111", username: "fixtureuser" },
};
const place = (id, name) => ({
  id,
  name,
  latitude: 25.033,
  longitude: 121.5654,
  description: "Offline fixture",
  tags: [],
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: null,
});
let places = [
  place("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Fixture place"),
  place("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Delete fixture"),
];
const route = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Fixture route",
  description: null,
  defaultSpeedKmh: 15,
  mode: "ONCE",
  isPublic: false,
  createdAt: stamp,
  updatedAt: stamp,
  currentRevision: {
    id: "55555555-5555-4555-8555-555555555555",
    revisionNumber: 1,
    waypoints: [
      { latitude: 25.033, longitude: 121.5654, sequence: 0 },
      { latitude: 25.036, longitude: 121.5694, sequence: 1 },
    ],
  },
};
let refreshes = 0,
  passwordCalls = 0,
  loginCalls = 0,
  placeReads = 0,
  holdRoutes = false,
  held = [],
  placeWrites = 0;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const reply = (code, value) => {
    res.writeHead(code, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(value === undefined ? undefined : JSON.stringify(value));
  };
  if (path === "/__fixture" && req.method === "GET")
    return reply(200, {
      session,
      refreshes,
      passwordCalls,
      loginCalls,
      placeReads,
      placeWrites,
      held: held.length,
    });
  let chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  let body = {};
  try {
    body = JSON.parse(raw || "{}");
  } catch {}
  if (path === "/__fixture" && req.method === "POST") {
    if (body.holdRoutes) holdRoutes = true;
    if (body.release) {
      for (const release of held) release();
      held = [];
    }
    return reply(200, { ok: true });
  }
  if (path === "/auth/refresh") {
    refreshes++;
    return reply(200, {
      ...session,
      accessToken: `fixture-access-${refreshes}`,
      refreshToken: `fixture-refresh-${refreshes}`,
    });
  }
  if (path === "/auth/session") return reply(204);
  if (path === "/auth/session/revoke") return reply(204);
  if (path === "/auth/login") {
    loginCalls++;
    return reply(200, session);
  }
  if (path === "/auth/password/change") {
    passwordCalls++;
    return reply(401, {
      code: "INVALID_CURRENT_PASSWORD",
      message: "invalid current password",
    });
  }
  if (path === "/auth/methods")
    return reply(200, {
      androidQrLogin: { enabled: false },
      oidc: { enabled: false, displayName: "Fixture provider" },
    });
  if (path === "/auth/sessions")
    return reply(200, { serverTime: stamp, sessions: [] });
  if (path === "/auth/oidc/link")
    return reply(200, {
      enabled: false,
      linked: false,
      displayName: "Fixture provider",
    });
  if (path === "/places" && req.method === "GET") {
    placeReads++;
    return reply(200, places);
  }
  if (path.startsWith("/places/") && req.method === "DELETE") {
    places = places.filter((p) => p.id !== path.split("/")[2]);
    return reply(204);
  }
  if (path.startsWith("/places/") && req.method === "PATCH") {
    placeWrites++;
    const id = path.split("/")[2];
    places = places.map((p) => (p.id === id ? { ...p, ...body } : p));
    return reply(
      200,
      places.find((p) => p.id === id),
    );
  }
  if (path === "/routes" && req.method === "GET") {
    if (holdRoutes) {
      holdRoutes = false;
      held.push(() => reply(200, [route]));
      return;
    }
    return reply(200, [route]);
  }
  if (path.startsWith("/routes/") && req.method === "PATCH") {
    Object.assign(route, body);
    return reply(200, route);
  }
  if (path === "/devices") return reply(200, { devices: [] });
  if (path === "/ai/settings")
    return reply(200, {
      generation: 0,
      connectionGenerations: {},
      selection: null,
      connections: [],
    });
  if (path === "/ai/catalog")
    return reply(200, { version: "fixture", providers: [] });
  if (path.endsWith("/share-link")) return reply(404, { message: "not found" });
  return reply(404, { message: "Unexpected fixture endpoint" });
});
server.listen(4330, "127.0.0.1", () =>
  console.log("Fixture ready on 4330; dummy data only"),
);
