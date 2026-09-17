// Entry CLOUDFLARE WORKERS — pasangan runtime untuk main.ts (Node).
// Dua entry berbagi satu composition root (app.ts) tanpa perubahan.
//
// Pola: LAZY IMPORT. app.ts (dan env.ts/client.ts di dalamnya) membaca
// process.env saat module load — di Workers, env datang dari BINDINGS,
// jadi isi process.env dulu (via nodejs_compat), baru import aplikasi.
// Satu kali per isolate; isolate dipakai ulang antar request.
//
// Hyperdrive: binding proxy TCP ke PostgreSQL — driver tetap `pg`
// (Section 8: tanpa vendor lock-in). Tanpa binding (mis. wrangler dev
// sebelum Hyperdrive dibuat), fallback ke DATABASE_URL dari .env/dev.

/** Bindings wrangler.toml: [vars] + secrets + Hyperdrive */
interface Env {
  HYPERDRIVE?: { connectionString: string };
  [key: string]: unknown;
}

// Tipe `app` via import type-only (dihapus saat build — runtime tetap lazy)
type App = typeof import('./app').app;

let appPromise: Promise<App> | null = null;

export default {
  fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    if (!appPromise) {
      appPromise = bootstrap(env)
        .then(() => import('./app'))
        .then((m) => m.app);
    }
    return appPromise.then((app) => app.fetch(request as never, env as never, ctx as never));
  },
};

/** bindings (string + Hyperdrive) → process.env, SEBELUM app di-import */
async function bootstrap(env: Env): Promise<void> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === 'HYPERDRIVE') continue; // binding object, bukan string
    if (typeof value === 'string') vars[key] = value;
  }
  if (env.HYPERDRIVE?.connectionString) {
    vars.DATABASE_URL = env.HYPERDRIVE.connectionString;
  }
  Object.assign(process.env, vars);
}
