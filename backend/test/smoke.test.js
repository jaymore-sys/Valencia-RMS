// Run: npm test --prefix backend   (uses node:test, no extra dependencies)
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const PORT = 5057;
const base = `http://127.0.0.1:${PORT}`;
let server;

const boot = (env) =>
  spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), ...env },
  });

const waitReady = (proc) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 15000);
    proc.stdout.on("data", (d) => {
      if (String(d).includes("Server running")) {
        clearTimeout(t);
        resolve();
      }
    });
    proc.on("exit", (c) => reject(new Error("server exited " + c)));
  });

test.before(async () => {
  server = boot({ JWT_SECRET: "test-secret", NODE_ENV: "test" });
  await waitReady(server);
});

test.after(() => server && server.kill());

test("refuses to start without JWT_SECRET", async () => {
  const p = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "5058", JWT_SECRET: "" },
  });
  const code = await new Promise((r) => p.on("exit", r));
  assert.strictEqual(code, 1);
});

test("health + security headers, no X-Powered-By", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("x-powered-by"), null);
  assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok(res.headers.get("x-request-id"));
});

test("db-test does not disclose the database name", async () => {
  const res = await fetch(`${base}/api/db-test`);
  const body = await res.json();
  assert.ok(!("database" in body));
  assert.ok(!("message" in body));
});

test("unknown route -> JSON 404, malformed JSON -> 400, bad origin -> 403", async () => {
  assert.strictEqual((await fetch(`${base}/api/nope`)).status, 404);

  const bad = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{oops",
  });
  assert.strictEqual(bad.status, 400);

  const cors = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://evil.example" },
  });
  assert.strictEqual(cors.status, 403);
});

test("every API route except login and leave-review requires auth", () => {
  const src = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
  const imports = {};
  for (const m of src.matchAll(
    /const (\w+)\s*=\s*require\(\s*"\.\/routes\/(\w+)"\s*\)/g
  ))
    imports[m[1]] = m[2];

  const open = [];
  for (const m of src.matchAll(/app\.use\(\s*"(\/api\/[^"]+)"\s*,\s*(\w+)\s*\)/g)) {
    if (!imports[m[2]]) continue;
    const router = require(path.join(root, "src/routes", imports[m[2]]));
    let routerAuth = false;
    for (const l of router.stack) {
      if (!l.route) {
        if (l.name === "authMiddleware" || l.handle?.name === "authMiddleware")
          routerAuth = true;
        continue;
      }
      if (!routerAuth && !l.route.stack.some((s) => s.name === "authMiddleware"))
        open.push(`${Object.keys(l.route.methods)[0].toUpperCase()} ${m[1]}${l.route.path}`);
    }
  }

  // login must be public; leave-review is guarded by its one-time token.
  assert.deepStrictEqual(open.sort(), [
    "GET /api/leave-review/:token",
    "POST /api/auth/login",
  ]);
});

test("login is rate limited (429 after 10 attempts)", async () => {
  let last;
  for (let i = 0; i < 11; i++) {
    last = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "x" }),
    });
  }
  assert.strictEqual(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
});

test("production error responses never leak SQL/internal text", () => {
  const { hideInternalErrors } = (() => {
    process.env.NODE_ENV = "production";
    delete require.cache[require.resolve("../src/middleware/hardening")];
    return require("../src/middleware/hardening");
  })();
  let sent;
  const res = { statusCode: 500, json: (b) => (sent = b) };
  hideInternalErrors({ id: "r1" }, res, () => {});
  res.json({ success: false, message: "x", error: "SELECT secret", sqlMessage: "bad" });
  assert.deepStrictEqual(sent, { success: false, message: "x", requestId: "r1" });
});

test("/api/admin router is gated to the admin role (regression)", () => {
  const router = require("../src/routes/adminroutes");
  // Router-level layers (not routes) must include requireRole's closure.
  const gated = router.stack.some(
    (l) => !l.route && String(l.handle).includes("allowedRoles")
  );
  assert.ok(gated, "adminroutes must call router.use(authMiddleware, requireRole('admin'))");
});

test("superadmin project routes used by the Projects page are mounted (regression)", () => {
  const router = require("../src/routes/superadminroutes");
  const have = new Set(
    router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map((m) => `${m} ${layer.route.path}`)
      )
  );
  for (const route of [
    "get /projects/:projectId/context",
    "post /projects/assign",
    "put /projects/:projectId/assignees",
    "post /projects/:projectId/tasks",
    "delete /projects/:projectId",
  ]) {
    assert.ok(have.has(route), `missing ${route}`);
  }
});
