// Prototype server for "Orbit": five hint words circle the secret and close in after every miss.
import index from "./index.html";
import { ranked, useModel, type Model } from "./neighbors";
import { PACK_WORDS } from "../../src/words/packs";
import { PACKS } from "../../src/game/config";

/** Concrete, guessable targets: every word from the non-loose theme packs. */
const TARGETS = [...new Set(Object.entries(PACK_WORDS).filter(([id]) => !PACKS[id]?.loose).flatMap(([, w]) => w))].sort();
import { hashString, mulberry32, pick } from "../../src/game/rng";

const server = Bun.serve({
  port: 3100,
  development: true,
  routes: {
    "/": index,
    "/api/game": (req) => {
      const url = new URL(req.url);
      const seed = url.searchParams.get("seed") ?? String(Date.now());
      const m = url.searchParams.get("model");
      const model = (m === "glove" || m === "both" ? m : "bge") as Model;
      useModel(model);
      const rand = mulberry32(hashString(`orbit:${seed}`));
      const target = pick(rand, TARGETS);
      const list = ranked(target);
      return Response.json({ seed, model, target, ranked: list.map((x) => x.w), sims: list.map((x) => Math.round(x.s * 100) / 100) });
    },
  },
});
console.log(`Orbit prototype at ${server.url}`);
