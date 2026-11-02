import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Starts the production app (`next start`) against a throw-away, migrated and seeded SQLite file.
 * Never touches data/finance.db. Set E2E_SKIP_BUILD=1 to reuse an existing .next build.
 * Tests read the URL from the E2E_BASE_URL provided via vitest's `provide`.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string, server: ChildProcess, ms = 60_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early (${server.exitCode})`);
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): void {
  const r = spawnSync(cmd, args, { env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
}

export default async function setup(project: { provide: (key: string, value: string) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "ifm-e2e-"));
  const env = { ...process.env, DATABASE_URL: join(dir, "finance.db") };
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  run(npx, ["tsx", "src/db/seed.ts"], env); // migrates, then seeds the temp database
  if (!process.env.E2E_SKIP_BUILD) run(npx, ["next", "build"], env);

  const port = await freePort();
  const server = spawn(npx, ["next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitFor(baseUrl, server);
  } catch (e) {
    server.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  project.provide("baseUrl", baseUrl);
  project.provide("databaseUrl", env.DATABASE_URL);

  return () => {
    server.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    databaseUrl: string;
  }
}
