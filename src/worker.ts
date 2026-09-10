import { handleApi, type PuzzleStore } from "./api";
import type { Puzzle } from "./game/puzzle";

/**
 * Cloudflare Worker entry. Static assets (the built client in ./dist) are served
 * by the platform; only /api/* reaches this code (see wrangler.jsonc). Puzzle
 * responses are deterministic per day, so they are cached at the edge.
 */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

const PUZZLE_CACHE_SECONDS = 3600;
const STORE_TTL_SECONDS = 86400;

/**
 * Generated puzzles (answers included) are kept in the edge cache under an
 * internal key so a fresh isolate can score a guess without regenerating.
 * The key is never a routable URL, so clients can't fetch it.
 */
function puzzleStore(edge: Cache, ctx: Ctx): PuzzleStore {
  const keyFor = (key: string) => new Request(`https://w0rd13.internal/puzzle/${encodeURIComponent(key)}`);
  return {
    async get(key) {
      const hit = await edge.match(keyFor(key));
      return hit ? ((await hit.json()) as Puzzle) : null;
    },
    async put(key, puzzle) {
      const res = new Response(JSON.stringify(puzzle), {
        headers: { "content-type": "application/json", "Cache-Control": `public, max-age=${STORE_TTL_SECONDS}` },
      });
      ctx.waitUntil(edge.put(keyFor(key), res));
    },
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    const cacheable = request.method === "GET" && url.pathname === "/api/puzzle" && url.searchParams.has("date");
    const edge = (caches as unknown as { default: Cache }).default;

    if (cacheable) {
      const hit = await edge.match(request);
      if (hit) return hit;
    }

    const api = await handleApi(request, puzzleStore(edge, ctx));
    if (!api) return env.ASSETS.fetch(request);

    if (cacheable && api.ok) {
      const cached = new Response(api.body, api);
      cached.headers.set("Cache-Control", `public, max-age=${PUZZLE_CACHE_SECONDS}`);
      ctx.waitUntil(edge.put(request, cached.clone()));
      return cached;
    }
    return api;
  },
};
