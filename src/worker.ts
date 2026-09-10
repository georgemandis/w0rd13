import { handleApi } from "./api";

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

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    const cacheable = request.method === "GET" && url.pathname === "/api/puzzle" && url.searchParams.has("date");
    const edge = (caches as unknown as { default: Cache }).default;

    if (cacheable) {
      const hit = await edge.match(request);
      if (hit) return hit;
    }

    const api = await handleApi(request);
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
