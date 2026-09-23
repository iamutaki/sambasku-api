// Entry CLOUDFLARE WORKERS - pasangan runtime untuk main.ts (Node).
// Dua entry berbagi satu composition root (app.ts) tanpa perubahan.
//
// Pola: LAZY IMPORT. app.ts (dan env.ts/client.ts di dalamnya) membaca
// process.env saat module load - di Workers, env datang dari BINDINGS,
// jadi isi process.env dulu (via nodejs_compat), baru import aplikasi.
// Satu kali per isolate; isolate dipakai ulang antar request.

/** Bindings wrangler.toml: [vars] + secrets */
interface Env {
  [key: string]: unknown;
}

// Tipe `app` via import type-only (dihapus saat build - runtime tetap lazy)
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

/** bindings string → process.env, SEBELUM app di-import */
async function bootstrap(env: Env): Promise<void> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') vars[key] = value;
  }
  Object.assign(process.env, vars);
}
