// Orbit prototype client, v2: rings accumulate, guesses land on the orbit at their true distance.

interface Game { seed: string; target: string; ranked: string[]; sims: number[] }

/** ?mode=one shows the six nearest neighbours at once and gives a single guess: "what's the hub of these?" */
const ONE_SHOT = new URLSearchParams(location.search).get("mode") === "one";
const MAX_GUESSES = ONE_SHOT ? 1 : 4;
/** Rank bands the hints are drawn from before each guess. Every ring is a real hint; the last is the top three. */
const BANDS: [number, number][] = [[15, 40], [6, 15], [3, 8], [1, 3]];
const RING_SIZES = [5, 4, 3, 3];
/** Only this many rings stay legible; older ones collapse to dots. */
const KEEP_RINGS = 2;
const N_TOTAL = 2314;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let game: Game;
let round = 0;
let guesses: { word: string; rank: number }[] = [];
let over = false;
let placed = 0; // angle offset so successive rings interleave

function rankOf(word: string): number {
  return game.ranked.indexOf(word) + 1; // 1 = closest; 0 = not in list
}

/** Radius as a fraction of the box: log scale so the inner ranks get room. */
function radiusFor(rank: number): number {
  const t = Math.log(Math.max(1, rank)) / Math.log(N_TOTAL);
  return 0.12 + 0.36 * t;
}

function heat(rank: number): { label: string; cls: string } {
  if (rank <= 3) return { label: "burning", cls: "heat-hot" };
  if (rank <= 15) return { label: "scorching", cls: "heat-hot" };
  if (rank <= 50) return { label: "hot", cls: "heat-hot" };
  if (rank <= 200) return { label: "warm", cls: "heat-warm" };
  if (rank <= 700) return { label: "lukewarm", cls: "heat-warm" };
  return { label: "cold", cls: "heat-cold" };
}

function seededPick(band: [number, number], n: number, salt: number): string[] {
  const [lo, hi] = band;
  const shown = new Set([...guesses.map((g) => g.word), ...[...document.querySelectorAll<HTMLElement>(".hint")].map((e) => e.dataset.word!)]);
  const pool = game.ranked.slice(lo - 1, hi).filter((w) => !shown.has(w));
  let x = 2166136261 ^ salt;
  for (const ch of game.seed) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  const out: string[] = [];
  while (out.length < n && pool.length) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out.push(pool.splice(x % pool.length, 1)[0]!);
  }
  return out;
}

function place(el: HTMLElement, rank: number, angleDeg: number, fromRank?: number): void {
  const box = $("orbit").getBoundingClientRect().width;
  const a = angleDeg * (Math.PI / 180);
  const at = (r: number) => `translate(calc(${Math.cos(a) * r * box}px - 50%), calc(${Math.sin(a) * r * box}px - 50%))`;
  el.style.transform = at(radiusFor(fromRank ?? N_TOTAL));
  $("ring").append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.remove("enter");
    el.style.transform = at(radiusFor(rank));
  }));
}

function addOneShotRing(): void {
  const words = game.ranked.slice(0, 6);
  words.forEach((w, i) => {
    const el = document.createElement("div");
    el.className = "hint enter";
    el.dataset.word = w;
    el.textContent = w;
    place(el, 6 + i * 2, -90 + 60 * i, 40);
  });
}

function addRing(): void {
  if (ONE_SHOT) return addOneShotRing();
  // Age what's already there: the previous ring dims, anything older collapses to a dot.
  document.querySelectorAll<HTMLElement>(".hint:not(.guess)").forEach((el) => {
    const age = Number(el.dataset.age ?? 0) + 1;
    el.dataset.age = String(age);
    el.classList.toggle("old", age >= 1);
    el.classList.toggle("dot", age >= KEEP_RINGS);
  });
  const words = seededPick(BANDS[Math.min(round, BANDS.length - 1)]!, RING_SIZES[Math.min(round, RING_SIZES.length - 1)]!, round);
  const n = words.length;
  words.forEach((w, i) => {
    const el = document.createElement("div");
    el.className = "hint enter";
    el.dataset.word = w;
    const h = heat(rankOf(w));
    el.innerHTML = `${w}<small class="${h.cls}">${h.label}</small>`;
    place(el, rankOf(w), -90 + (360 / n) * i + placed * 23, rankOf(w) * 4);
  });
  placed++;
}

function addGuessMarker(word: string, rank: number): void {
  const el = document.createElement("div");
  el.className = "hint guess enter";
  el.dataset.word = word;
  el.textContent = word;
  place(el, rank, 200 + guesses.length * 47, N_TOTAL);
}

function renderGuesses(): void {
  const ul = $("guesses");
  ul.replaceChildren();
  for (const g of [...guesses].reverse()) {
    const h = heat(g.rank);
    const li = document.createElement("li");
    li.innerHTML = `<span class="w">${g.word}</span><span class="heat ${h.cls}">#${g.rank} ${h.label}</span>`;
    ul.append(li);
  }
}

function finish(won: boolean): void {
  over = true;
  const c = $("center");
  c.textContent = game.target;
  c.className = `center ${won ? "won" : "lost"}`;
  $("status").textContent = won ? `Got it in ${guesses.length}.` : `It was ${game.target.toUpperCase()}.`;
}

async function newGame(seed?: string): Promise<void> {
  const model = new URLSearchParams(location.search).get("model") ?? "bge";
  const res = await fetch(`/api/game?seed=${encodeURIComponent(seed ?? String(Date.now()))}&model=${model}`);
  game = (await res.json()) as Game;
  round = 0; guesses = []; over = false; placed = 0;
  $("seed").textContent = game.seed;
  $("center").textContent = "?"; $("center").className = "center";
  $("status").textContent = "";
  $("ring").replaceChildren();
  renderGuesses();
  addRing();
  $<HTMLInputElement>("guess").value = "";
  $("guess").focus();
  history.replaceState(null, "", `?seed=${encodeURIComponent(game.seed)}&model=${model}${ONE_SHOT ? "&mode=one" : ""}`);
  $("seed").textContent = `${game.seed} (${model})`;
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (over) return;
  const input = $<HTMLInputElement>("guess");
  const word = input.value.trim().toLowerCase();
  input.value = "";
  if (word === game.target) { guesses.push({ word, rank: 0 }); renderGuesses(); return finish(true); }
  const rank = rankOf(word);
  if (!rank) { $("status").textContent = "Not in the word list."; return; }
  if (guesses.some((g) => g.word === word)) { $("status").textContent = "Already tried that one."; return; }
  guesses.push({ word, rank });
  renderGuesses();
  addGuessMarker(word, rank);
  const h = heat(rank);
  $("status").textContent = `${word.toUpperCase()} is ${h.label}.`;
  round++;
  if (round >= MAX_GUESSES) return finish(false);
  addRing();
});
$("guesses-label").textContent = ONE_SHOT ? "One guess." : `${MAX_GUESSES} guesses.`;
if (ONE_SHOT) $("lede").textContent = "Six words orbit a secret word they all relate to. Name the word in the middle. One guess.";
$("new").addEventListener("click", () => void newGame());
$("reveal").addEventListener("click", () => !over && finish(false));
void newGame(new URLSearchParams(location.search).get("seed") ?? undefined);
