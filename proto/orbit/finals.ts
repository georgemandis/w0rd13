// What would the last ring look like? Print the five nearest neighbours for a batch of candidate targets.
import { ranked } from "./neighbors";
import { PACK_WORDS } from "../../src/words/packs";
import { PACKS } from "../../src/game/config";
import { hashString, mulberry32, pick } from "../../src/game/rng";
const easy = [...new Set(Object.entries(PACK_WORDS).filter(([id]) => !PACKS[id]?.loose).flatMap(([, w]) => w))].sort();
console.log("target pool:", easy.length);
const rand = mulberry32(hashString("finals"));
let shown = 0, tries = 0;
while (shown < 14 && tries < 200) {
  tries++;
  const t = pick(rand, easy);
  const r = ranked(t);
  console.log(`${t.toUpperCase()}  ring 6: ${r.slice(0, 3).map((x) => x.w).join(" ")}  | ring 4: ${r.slice(6, 10).map((x) => x.w).join(" ")}  | ring 1: ${r.slice(80, 84).map((x) => x.w).join(" ")}`);
  shown++;
}
