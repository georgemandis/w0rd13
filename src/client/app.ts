import type { Feedback, Mark } from "../game/feedback";
import {
  DIFFICULTIES, DEFAULT_DIFFICULTY, DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH, DEFAULT_CLOCK,
  COUNTDOWN_BUDGET_MS, COUNTDOWN_PENALTY_MS, PACKS, VOCABS, DEFAULT_VOCAB, KINDS, DEFAULT_KIND, ORBIT_WORDS, ORBIT_GUESSES,
  isClock, isDifficulty, isKind, isLength, isPack, isVocab, localDateString, packAllowsDigits, variantLabel,
  type Clock, type Difficulty, type Kind, type Mode, type Vocab,
} from "../game/config";
import { buildShareText, formatPuzzleDate, formatTime, pickAward, squareFor, type RoundResult } from "../game/share";
import { celebrateRound, commiserateRound, finishRun } from "./effects";
import { orbitGraph, resetOrbitGraph } from "./orbitGraph";

interface Clue { word: string; feedback: Feedback }
interface ClientPuzzle { date: string; mode: Mode; length: number; difficulty: Difficulty; pack: string; vocab: Vocab; kind: Kind; rounds: { clues: Clue[]; hub?: string[]; theme?: string }[] }
interface GuessResponse { valid: boolean; correct?: boolean; answer?: string; feedback?: Feedback; near?: number | null }
interface FinishedRound extends RoundResult { guess: string; answer: string; feedback: Feedback; tries?: number }
/** Orbit mode: a wrong guess, how close it was in meaning (rank among the 25 nearest, or null for cold), and its letter feedback. */
interface OrbitGuess { word: string; near: number | null; feedback: Feedback }

type Phase = "loading" | "intro" | "playing" | "revealed" | "exploded" | "done";

interface State {
  mode: Mode;
  length: number;
  difficulty: Difficulty;
  clock: Clock;
  pack: string;
  vocab: Vocab;
  kind: Kind;
  budgetMs: number;
  penaltyMs: number;
  /** Time left recorded when a countdown run ended; used instead of the live clock once done. */
  finalTimeLeftMs: number | null;
  date: string;
  puzzle: ClientPuzzle | null;
  phase: Phase;
  round: number;
  input: string;
  roundStart: number;
  results: FinishedRound[];
  award: string;
  note: string;
  confirmingQuit: boolean;
  /** Orbit mode: wrong guesses so far on this word; the ring reveals one band per miss. */
  orbitGuesses: OrbitGuess[];
  /** Orbit mode: how the words on the board relate to each other, fetched per round. */
  orbitEdges: { a: string; b: string; s: number }[];
  submitting: boolean;
}

interface SavedGame {
  settings: Settings;
  results: FinishedRound[];
  award: string;
  timeLeftMs?: number;
  finishedAt: number;
  /** The "sad you quit" line chosen when the player gave up, kept so it doesn't change on reload. */
  note?: string;
}

const NAG_LINES = [
  "Nuh-uh. Not until you're done!",
  "No quitters! Finish first.",
  "The clock's still running, friend.",
  "Finish the word. Then we'll talk.",
  "You're so close. Probably.",
  "Nice try. Type the word.",
];

const QUIT_LINES = [
  "I used to look up to you… 😢",
  "It's fine. I'm fine. 🥺",
  "We were doing so well together. 💔",
  "The words will be here when you're ready. 😔",
  "No hard feelings. Some hard feelings. 😢",
  "I'll tell the other words you said hi. 🥺",
];
let nagIndex = 0;

/**
 * Swatch colours mirror the CSS themes so the menu can preview themes that aren't active.
 * `names` are how the legend describes the three tile states in that theme.
 */
const THEMES = [
  { id: "classic", name: "Classic", bg: "#ffffff", a: "#6aaa64", b: "#c9b458", names: ["Green", "Yellow", "Grey"] },
  { id: "slate", name: "Slate", bg: "#222938", a: "#5f9e5a", b: "#c8a94a", names: ["Green", "Yellow", "Grey"] },
  { id: "noir", name: "Noir", bg: "#121213", a: "#538d4e", b: "#b59f3b", names: ["Green", "Yellow", "Grey"] },
  { id: "bubblegum", name: "Bubblegum", bg: "#2c1a33", a: "#4fb383", b: "#e6b04e", names: ["Mint", "Gold", "Plum"] },
  { id: "citrus", name: "Citrus", bg: "#fff8e6", a: "#4caf6d", b: "#f2a93b", names: ["Green", "Orange", "Tan"] },
  { id: "prince", name: "I Would Die 4 u", bg: "#2b0a4e", a: "#a35bff", b: "#f2c14e", names: ["Purple", "Gold", "Dark purple"] },
  { id: "gameboy", name: "Game Boy", bg: "#c4cfa1", a: "#306230", b: "#8bac0f", names: ["Dark green", "Lime", "Olive"] },
  { id: "terminal", name: "Terminal", bg: "#0b0f0b", a: "#1f8f1f", b: "#b8a12a", names: ["Bright green", "Amber", "Dark"] },
  { id: "clown", name: "Down to Clown", bg: "#fffdf7", a: "#e63946", b: "#ffb703", names: ["Red", "Gold", "Blue"] },
  { id: "bottomline", name: "The Bottom Line", bg: "#ffffff", a: "#3d5cea", b: "#e0a526", names: ["Why it matters", "Go deeper", "Yes, but"] },
] as const;

function themeFor(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** The legend sentence, in the current theme's own colour names. */
function legendText(): string {
  const [correct, present, absent] = themeFor(currentTheme()).names;
  return `${correct} is in the right spot. ${present} is in the word, somewhere else. ${absent} is not in the word.`;
}
type Theme = (typeof THEMES)[number];
const THEME_KEY = "w0rd13:theme";
/**
 * Game settings live in the URL so a setup can be shared: ?letters=7&difficulty=extreme&pack=animals&clock=countdown&mode=bonus
 * Defaults (5 letters, normal, mixed, stopwatch, daily) are omitted, so a bare URL is always the standard game.
 */
interface Settings { mode: Mode; length: number; difficulty: Difficulty; clock: Clock; pack: string; vocab: Vocab; kind: Kind }

const TODAY = localDateString();

function readUrlDate(): string {
  const d = new URLSearchParams(location.search).get("date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= TODAY ? d : TODAY;
}

function readUrlSettings(): Settings {
  const q = new URLSearchParams(location.search);
  const length = q.has("letters") ? Number(q.get("letters")) : DEFAULT_LENGTH;
  const mode = q.get("mode");
  return {
    mode: mode === "bonus" ? "bonus" : "daily",
    length: isLength(length) ? length : DEFAULT_LENGTH,
    difficulty: isDifficulty(q.get("difficulty")) ? (q.get("difficulty") as Difficulty) : DEFAULT_DIFFICULTY,
    clock: isClock(q.get("clock")) ? (q.get("clock") as Clock) : DEFAULT_CLOCK,
    pack: isPack(q.get("pack")) ? q.get("pack")! : "",
    vocab: isVocab(q.get("vocab")) ? (q.get("vocab") as Vocab) : DEFAULT_VOCAB,
    kind: isKind(q.get("game")) ? (q.get("game") as Kind) : DEFAULT_KIND,
  };
}

function isOrbit(): boolean {
  return state.kind === "orbit";
}

function settingsUrl(): string {
  const q = new URLSearchParams();
  if (state.mode !== "daily") q.set("mode", state.mode);
  if (state.kind !== DEFAULT_KIND) q.set("game", state.kind);
  if (state.length !== DEFAULT_LENGTH && !isOrbit()) q.set("letters", String(state.length));
  if (state.difficulty !== DEFAULT_DIFFICULTY) q.set("difficulty", state.difficulty);
  if (activePack()) q.set("pack", activePack());
  if (state.vocab !== DEFAULT_VOCAB && !activePack() && !isOrbit()) q.set("vocab", state.vocab);
  if (state.clock !== DEFAULT_CLOCK) q.set("clock", state.clock);
  if (state.date !== TODAY) q.set("date", state.date);
  const budget = new URLSearchParams(location.search).get("budget");
  if (budget) q.set("budget", budget);
  const qs = q.toString();
  return `${location.origin}${location.pathname}${qs ? `?${qs}` : ""}`;
}

function syncUrl(): void {
  const url = settingsUrl();
  if (url !== location.href) history.replaceState(null, "", url);
}

/** Countdown budget, overridable with ?budget=<seconds> for tuning and testing. */
function budgetFromUrl(): number {
  const secs = Number(new URLSearchParams(location.search).get("budget"));
  return secs > 0 ? secs * 1000 : COUNTDOWN_BUDGET_MS;
}

const app = document.getElementById("app")!;

/**
 * Privacy-friendly analytics by Plausible, on only when PLAUSIBLE_SCRIPT_ID is set at build time
 * (inlined by bun build --env / bunfig.toml). Queues calls until the script loads.
 */
function loadPlausible(): void {
  try {
    const id = process.env.PLAUSIBLE_SCRIPT_ID;
    if (!id) return;
    const w = window as unknown as { plausible?: { (...args: unknown[]): void; q?: unknown[]; init?: (o?: unknown) => void; o?: unknown } };
    w.plausible = w.plausible || Object.assign(function (...args: unknown[]) { (w.plausible!.q = w.plausible!.q || []).push(args); }, {});
    w.plausible.init = w.plausible.init || ((o?: unknown) => { w.plausible!.o = o || {}; });
    w.plausible.init();
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://plausible.io/js/${id}.js`;
    document.head.appendChild(s);
  } catch {
    /* no analytics is fine */
  }
}
loadPlausible();

/** Plausible custom events. */
function track(event: string, props: Record<string, string | number | boolean> = {}): void {
  try {
    (window as unknown as { plausible?: (e: string, o?: { props: typeof props }) => void }).plausible?.(event, { props });
  } catch {
    /* analytics must never break the game */
  }
}

function setupProps(): Record<string, string | number> {
  const s = currentSettings();
  return { mode: s.mode, game: s.kind, letters: s.length, difficulty: s.difficulty, clock: s.clock, pack: s.pack || "mixed", vocab: s.vocab };
}
const toastEl = document.getElementById("toast")!;
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const DIGIT_ROW = "1234567890";

const state: State = {
  ...readUrlSettings(),
  budgetMs: budgetFromUrl(),
  penaltyMs: 0,
  finalTimeLeftMs: null,
  date: readUrlDate(),
  puzzle: null,
  phase: "loading",
  round: 0,
  input: "",
  roundStart: 0,
  results: [],
  award: "",
  note: "",
  confirmingQuit: false,
  orbitGuesses: [],
  orbitEdges: [],
  submitting: false,
};

let timerHandle = 0;
let toastHandle = 0;

// ---------- persistence (one play per puzzle per browser) ----------

/** Word themes only exist for five-letter words (and Orbit is always five letters). */
function activePack(): string {
  return state.length === DEFAULT_LENGTH || isOrbit() ? state.pack : "";
}

function activeLength(): number {
  return isOrbit() ? DEFAULT_LENGTH : state.length;
}

function variant(): string {
  return variantLabel(activeLength(), state.difficulty, state.clock, activePack(), state.vocab, state.kind);
}

function isCountdown(): boolean {
  return state.clock === "countdown";
}

function puzzleQuery(): string {
  const pack = activePack() ? `&pack=${activePack()}` : "";
  const vocab = state.vocab !== DEFAULT_VOCAB && !activePack() && !isOrbit() ? `&vocab=${state.vocab}` : "";
  const kind = isOrbit() ? "&kind=orbit" : "";
  return `date=${state.date}&mode=${state.mode}&length=${activeLength()}&difficulty=${state.difficulty}${pack}${vocab}${kind}`;
}

/** The settings that identify a game (a pack overrides vocabulary, and only applies at five letters). */
function currentSettings(): Settings {
  const pack = activePack();
  return { mode: state.mode, length: activeLength(), difficulty: state.difficulty, clock: state.clock, pack, vocab: pack || isOrbit() ? DEFAULT_VOCAB : state.vocab, kind: state.kind };
}

/** One finished game per date and settings combination. */
function gameKey(date: string, s: Settings): string {
  const kind = (s.kind ?? DEFAULT_KIND) === DEFAULT_KIND ? "" : `:${s.kind}`;
  return `w0rd13:game:${date}:${s.mode}:${s.length}:${s.difficulty}:${s.clock}:${s.pack || "-"}:${s.vocab}${kind}`;
}

function storageKey(): string {
  return gameKey(state.date, currentSettings());
}

function loadSaved(): SavedGame | null {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? (JSON.parse(raw) as SavedGame) : null;
  } catch {
    return null;
  }
}

function save(): void {
  try {
    const game: SavedGame = { settings: currentSettings(), results: state.results, award: state.award, finishedAt: Date.now(), note: state.note };
    if (isCountdown()) {
      state.finalTimeLeftMs = timeLeftMs();
      game.timeLeftMs = state.finalTimeLeftMs;
    }
    localStorage.setItem(storageKey(), JSON.stringify(game));
  } catch {
    /* private mode etc. */
  }
}

/** Every finished game in this browser, keyed by date, newest first within a day. */
function allGames(): Map<string, SavedGame[]> {
  const byDate = new Map<string, SavedGame[]>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("w0rd13:game:")) continue;
      const date = k.split(":")[2]!;
      const g = JSON.parse(localStorage.getItem(k) ?? "null") as SavedGame | null;
      if (!g?.settings || !Array.isArray(g.results)) continue;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(g);
    }
  } catch {
    /* ignore */
  }
  for (const games of byDate.values()) games.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return byDate;
}

function gamesFor(date: string): SavedGame[] {
  return allGames().get(date) ?? [];
}

/** Finished games for the date being viewed, newest first. */
function gamesToday(): SavedGame[] {
  return gamesFor(state.date);
}

function isPerfect(g: SavedGame): boolean {
  return g.results.length > 0 && g.results.every((r) => r.correct);
}

function isStandard(s: Settings): boolean {
  return s.mode === "daily" && (s.kind ?? DEFAULT_KIND) === DEFAULT_KIND && s.length === DEFAULT_LENGTH && s.difficulty === DEFAULT_DIFFICULTY && s.clock === DEFAULT_CLOCK && !s.pack && s.vocab === DEFAULT_VOCAB;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localDateString(new Date(y!, m! - 1, d! + days));
}

interface Stats { daysPlayed: number; streak: number; perfect: number; bestStandardMs: number | null }

function computeStats(byDate: Map<string, SavedGame[]>): Stats {
  const games = [...byDate.values()].flat();
  let streak = 0;
  // A streak counts back from today, or from yesterday if today hasn't been played yet.
  let cursor = byDate.has(TODAY) ? TODAY : shiftDate(TODAY, -1);
  while (byDate.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  const standardPerfect = games.filter((g) => isPerfect(g) && isStandard(g.settings)).map((g) => g.results.reduce((s, r) => s + r.ms, 0));
  return {
    daysPlayed: byDate.size,
    streak,
    perfect: games.filter(isPerfect).length,
    bestStandardMs: standardPerfect.length ? Math.min(...standardPerfect) : null,
  };
}

function dayLabel(date: string): string {
  if (date === TODAY) return "Today";
  if (date === shiftDate(TODAY, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "long" });
  return `${weekday}, ${formatPuzzleDate(date)}`;
}

function scoreText(g: SavedGame): string {
  const total = g.results.reduce((sum, r) => sum + r.ms, 0);
  const time = g.timeLeftMs !== undefined ? `${formatTime(Math.max(0, g.timeLeftMs))} left` : formatTime(total);
  return `${g.results.map(squareFor).join("")} ${time}${g.award ? ` ${g.award}` : ""}`;
}

/** Jump to another day (and optionally setup) and load it. */
function goToDate(date: string, settings?: Settings): void {
  stopTimer();
  state.date = date;
  if (settings) Object.assign(state, settings);
  syncMode();
  syncUrl();
  void loadPuzzle();
}

function settingsLabel(s: Settings): string {
  const v = variantLabel(s.length, s.difficulty, s.clock, s.pack, s.vocab, s.kind ?? DEFAULT_KIND);
  return `${s.mode === "bonus" ? "Bonus" : "Daily"}${v ? `, ${v}` : ""}`;
}

function sameSettings(a: Settings, b: Settings): boolean {
  return gameKey("", a) === gameKey("", b);
}

/** Switch to another setup (from the played-today list) and load it. */
function applySettings(s: Settings): void {
  stopTimer();
  Object.assign(state, s);
  syncMode();
  syncUrl();
  void loadPuzzle();
}

// ---------- themes ----------

function currentTheme(): string {
  return document.documentElement.dataset.theme ?? THEMES[0].id;
}

function swatchStyle(t: Theme): string {
  return `background: linear-gradient(135deg, ${t.a} 50%, ${t.b} 50%); box-shadow: 0 0 0 2px ${t.bg}`;
}

function applyTheme(id: string): void {
  const theme = themeFor(id);
  document.documentElement.dataset.theme = theme.id;
  const legend = document.getElementById("legend-text");
  if (legend) legend.textContent = legendText();
  const label = document.getElementById("theme-name");
  if (label) label.textContent = theme.name;
  const swatch = document.getElementById("theme-swatch");
  if (swatch) swatch.setAttribute("style", swatchStyle(theme));
  document.querySelectorAll<HTMLElement>(".theme-option").forEach((el) => {
    el.setAttribute("aria-checked", String(el.dataset.theme === theme.id));
  });
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* ignore */
  }
}

function buildThemeMenu(): void {
  const btn = document.getElementById("theme-btn")!;
  const list = document.getElementById("theme-list")!;
  for (const t of THEMES) {
    const item = h("button", { class: "theme-option", type: "button", role: "menuitemradio", "aria-checked": "false", "data-theme": t.id });
    item.append(h("span", { class: "swatch", style: swatchStyle(t), "aria-hidden": "true" }), h("span", {}, t.name));
    item.addEventListener("click", () => {
      applyTheme(t.id);
      setThemeMenu(false);
      btn.focus();
    });
    list.append(item);
  }
  btn.addEventListener("click", () => setThemeMenu(Boolean(list.hidden)));
  document.addEventListener("click", (e) => {
    if (!list.hidden && !document.getElementById("theme-menu")!.contains(e.target as Node)) setThemeMenu(false);
  });
  list.addEventListener("keydown", (e) => {
    const items = [...list.querySelectorAll<HTMLButtonElement>(".theme-option")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]!.focus();
    }
  });
}

function setThemeMenu(open: boolean): void {
  const btn = document.getElementById("theme-btn")!;
  const list = document.getElementById("theme-list")!;
  list.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  if (open) (list.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
}

// ---------- data ----------

let loadSeq = 0;

/**
 * Fetch the puzzle for the current settings. With `quiet`, the intro panel
 * stays on screen (so a select being changed is not torn down under the
 * pointer) and only its labels refresh once the puzzle arrives.
 */
async function loadPuzzle(quiet = false): Promise<void> {
  const seq = ++loadSeq;
  if (!quiet) state.phase = "loading";
  state.puzzle = null;
  state.results = [];
  state.award = "";
  state.note = "";
  state.confirmingQuit = false;
  state.round = 0;
  state.input = "";
  state.penaltyMs = 0;
  state.finalTimeLeftMs = null;
  if (quiet && state.phase === "intro") refreshIntro();
  else render();

  const res = await fetch(`/api/puzzle?${puzzleQuery()}`);
  const puzzle = (await res.json()) as ClientPuzzle;
  if (seq !== loadSeq) return; // a newer settings change superseded this fetch
  state.puzzle = puzzle;

  const saved = loadSaved();
  const finished = saved && (saved.results?.length === state.puzzle.rounds.length || saved.results?.some((r) => r.exploded));
  if (saved && finished && !quiet) {
    state.results = saved.results;
    state.award = saved.award ?? "";
    state.note = saved.note ?? "";
    if (isCountdown()) state.finalTimeLeftMs = saved.timeLeftMs ?? 0;
    state.phase = "done";
    render();
  } else if (quiet && state.phase === "intro") {
    refreshIntro();
  } else {
    state.phase = "intro";
    render();
  }
}

async function submitGuess(): Promise<void> {
  if (state.phase !== "playing" || state.submitting) return;
  if (state.input.length < state.puzzle!.length) {
    shake(`${state.puzzle!.length} letters, then Enter`);
    return;
  }
  state.submitting = true;
  setChecking(true);
  const elapsed = performance.now() - state.roundStart;
  const final = !isOrbit() || state.orbitGuesses.length + 1 >= ORBIT_GUESSES;
  const res = await fetch(`/api/guess?${puzzleQuery()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ round: state.round, guess: state.input, final }),
  });
  const data = (await res.json().catch(() => ({ valid: false }))) as GuessResponse;
  state.submitting = false;
  setChecking(false);

  if (!data.valid) {
    shake("Not in the word list");
    return;
  }
  if (isOrbit() && !data.correct && !final) {
    // A miss with tries left: mark it on the orbit, reveal the next ring, keep the clock running.
    state.orbitGuesses.push({ word: state.input, near: data.near ?? null, feedback: data.feedback ?? [] });
    const guessed = state.input;
    state.input = "";
    if (isCountdown()) {
      state.penaltyMs += COUNTDOWN_PENALTY_MS;
      if (timeLeftMs() <= 0) return explode();
    }
    render();
    void loadOrbitEdges();
    toast(`${guessed.toUpperCase()} is ${orbitHeat(data.near ?? null)}. ${ORBIT_GUESSES - state.orbitGuesses.length} left.`);
    return;
  }
  stopTimer();
  state.results.push({
    guess: state.input,
    answer: data.answer!,
    correct: data.correct!,
    feedback: data.feedback!,
    ms: Math.round(elapsed),
    ...(isOrbit() ? { tries: state.orbitGuesses.length + 1 } : {}),
  });
  if (isCountdown() && !data.correct) {
    state.penaltyMs += COUNTDOWN_PENALTY_MS;
    if (timeLeftMs() <= 0) return explode();
  }
  state.phase = "revealed";
  render();
  if (data.correct) celebrateRound(state.results.filter((r) => r.correct).length, state.puzzle!.rounds.length);
  else commiserateRound();
}

function finishKind(): "perfect" | "good" | "rough" | "quit" | "boom" {
  if (state.results.some((r) => r.gaveUp)) return "quit";
  if (state.results.some((r) => r.exploded)) return "boom";
  const correct = state.results.filter((r) => r.correct).length;
  const total = state.puzzle!.rounds.length;
  return correct === total ? "perfect" : correct >= total - 1 ? "good" : "rough";
}

async function revealAnswer(round: number): Promise<string> {
  try {
    const res = await fetch(`/api/reveal?${puzzleQuery()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ round }),
    });
    const data = (await res.json()) as { answer?: string };
    return data.answer ?? "";
  } catch {
    return "";
  }
}

/** The player gives up: the current word (if still open) and every word after it are forfeited. */
function giveUp(): void {
  stopTimer();
  const total = state.puzzle!.rounds.length;
  const from = state.phase === "revealed" ? state.round + 1 : state.round;
  const pendingReveal: FinishedRound[] = [];
  for (let i = from; i < total; i++) {
    const r: FinishedRound = {
      guess: i === state.round ? state.input : "",
      answer: "",
      correct: false,
      feedback: [],
      ms: i === state.round && state.phase === "playing" ? Math.round(performance.now() - state.roundStart) : 0,
      gaveUp: true,
    };
    state.results.push(r);
    pendingReveal.push(r);
    void revealAnswer(i).then((answer) => {
      r.answer = answer;
      save();
      if (state.phase === "done") render();
    });
  }
  state.award = pickAward(state.results);
  state.note = QUIT_LINES[Math.floor(Math.random() * QUIT_LINES.length)]!;
  state.confirmingQuit = false;
  state.phase = "done";
  save();
  render();
  finishRun("quit");
  track("Gave up", { ...setupProps(), solved: state.results.filter((r) => r.correct).length });
}

function giveUpControls(): HTMLElement {
  const box = h("div", { class: "giveup" });
  if (!state.confirmingQuit) {
    const btn = h("button", { class: "giveup-btn", type: "button" }, "Give up");
    btn.addEventListener("click", () => {
      btn.blur();
      state.confirmingQuit = true;
      box.replaceWith(giveUpControls());
    });
    box.append(btn);
    return box;
  }
  const left = state.puzzle!.rounds.length - (state.phase === "revealed" ? state.round + 1 : state.round);
  const yes = h("button", { class: "giveup-btn giveup-yes", type: "button" }, "Yes, I give up");
  const no = h("button", { class: "secondary giveup-no", type: "button" }, "No, keep going");
  yes.addEventListener("click", () => { yes.blur(); giveUp(); });
  no.addEventListener("click", () => {
    no.blur();
    state.confirmingQuit = false;
    box.replaceWith(giveUpControls());
  });
  box.append(
    h("p", { class: "giveup-ask" }, `Really? ${left === 1 ? "There's only one word left." : `${left} words are still waiting.`}`),
    h("div", { class: "giveup-row" }, yes, no),
  );
  return box;
}

/** Orbit: relatedness among everything on the board (hub words plus guesses), redrawn when it arrives. */
async function loadOrbitEdges(): Promise<void> {
  const round = state.puzzle?.rounds[state.round];
  if (!round?.hub) return;
  const words = [...new Set([...round.hub, ...state.orbitGuesses.map((g) => g.word)])];
  const forRound = state.round;
  try {
    const res = await fetch("/api/edges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ words }) });
    const data = (await res.json()) as { edges: { a: string; b: string; s: number }[] };
    if (state.round !== forRound) return;
    state.orbitEdges = data.edges ?? [];
    if (state.phase === "playing" || state.phase === "revealed") render();
  } catch {
    /* lines are decoration; the game goes on without them */
  }
}

/** Countdown hit zero: the current word (or the one just missed) blows up and the run ends. */
function explode(): void {
  stopTimer();
  const last = state.results[state.results.length - 1];
  if (last && state.results.length === state.round + 1) {
    last.exploded = true;
  } else {
    const blown: FinishedRound = {
      guess: state.input,
      answer: "",
      correct: false,
      feedback: [],
      ms: Math.round(performance.now() - state.roundStart),
      exploded: true,
    };
    state.results.push(blown);
    void revealAnswer(state.round).then((answer) => {
      blown.answer = answer;
      save();
      if (state.phase === "done") render();
    });
  }
  state.award = pickAward(state.results);
  save();
  state.phase = "exploded";
  render();
  finishRun("boom");
  track("Exploded", { ...setupProps(), solved: state.results.filter((r) => r.correct).length });
  window.setTimeout(() => {
    if (state.phase === "exploded") {
      state.phase = "done";
      render();
    }
  }, 1800);
}

/** While a guess is being checked, dim the input row and grey out Enter so the wait is obvious. */
function setChecking(on: boolean): void {
  document.getElementById("input-row")?.classList.toggle("checking", on);
  const enter = document.querySelector<HTMLButtonElement>('.kb[aria-label="Enter"]');
  if (enter) {
    enter.disabled = on;
    enter.textContent = on ? "…" : "Enter";
  }
}

function startRound(index: number): void {
  if (index === 0) track("Game started", setupProps());
  resetOrbitGraph();
  state.round = index;
  state.input = "";
  state.confirmingQuit = false;
  state.orbitGuesses = [];
  state.orbitEdges = [];
  if (isOrbit()) void loadOrbitEdges();
  state.phase = "playing";
  state.roundStart = performance.now();
  render();
  startTimer();
}

function nextRound(): void {
  if (state.round + 1 >= state.puzzle!.rounds.length) {
    state.phase = "done";
    state.award = pickAward(state.results);
    save();
    stopTimer();
    render();
    finishRun(finishKind());
    track("Game finished", { ...setupProps(), outcome: finishKind(), correct: state.results.filter((r) => r.correct).length, seconds: Math.round(totalMs() / 1000) });
  } else {
    startRound(state.round + 1);
  }
}

// ---------- timer ----------

function totalMs(): number {
  return state.results.reduce((s, r) => s + r.ms, 0);
}

function currentMs(): number {
  const live = state.phase === "playing" ? performance.now() - state.roundStart : 0;
  return totalMs() + live;
}

function timeLeftMs(): number {
  if (state.finalTimeLeftMs !== null) return state.finalTimeLeftMs;
  return state.budgetMs - currentMs() - state.penaltyMs;
}

function clockText(): string {
  return isCountdown() ? formatTime(Math.max(0, timeLeftMs())) : formatTime(currentMs());
}

function startTimer(): void {
  stopTimer();
  timerHandle = window.setInterval(() => {
    if (isCountdown() && state.phase === "playing" && timeLeftMs() <= 0) return explode();
    const el = document.getElementById("clock");
    if (el) {
      el.textContent = clockText();
      el.parentElement?.classList.toggle("clock-danger", isCountdown() && timeLeftMs() < 15_000);
    }
  }, 200);
}

function stopTimer(): void {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = 0;
}

// ---------- input ----------

function handleKey(key: string): void {
  if (state.phase === "intro" && key === "Enter") return startPressed();
  if (state.phase === "revealed" && key === "Enter") return nextRound();
  if (state.phase !== "playing") return;

  if (key === "Enter") {
    void submitGuess();
  } else if (key === "Backspace") {
    state.input = state.input.slice(0, -1);
    renderInputRow();
  } else if (allowedChar(key) && state.input.length < state.puzzle!.length) {
    state.input += key.toLowerCase();
    renderInputRow();
  }
}

function allowedChar(key: string): boolean {
  if (/^[a-z]$/i.test(key)) return true;
  return /^[0-9]$/.test(key) && packAllowsDigits(state.puzzle?.pack ?? "");
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target instanceof Element ? e.target : null;
  if (e.key === "Escape" && !document.getElementById("theme-list")!.hidden) {
    setThemeMenu(false);
    document.getElementById("theme-btn")!.focus();
    return;
  }
  // Typing inside the theme menu or a form control must not feed the board.
  if (target && (target.closest(".theme-menu") || target.tagName === "SELECT")) return;
  if (target && target.tagName === "BUTTON" && e.key === "Enter") return;
  handleKey(e.key);
});

function syncMode(): void {
  document.querySelectorAll<HTMLButtonElement>(".mode").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
  });
}

/** The title is a home link. It works whenever a word isn't in progress. */
function goHome(): void {
  if (state.phase === "playing" || state.phase === "revealed") {
    toast(NAG_LINES[nagIndex++ % NAG_LINES.length]!);
    return;
  }
  if (state.phase === "loading" || state.phase === "exploded") return;
  state.phase = "intro";
  render();
  window.scrollTo({ top: 0 });
}

document.getElementById("home-btn")?.addEventListener("click", goHome);

/** Every single-finger gesture, in escalating order. The last one is earned. */
const FINGERS = ["☝️", "👆", "👉", "👈", "👇", "🫵", "🖕"];

/** Easter egg: linger on the logo (or tap it) and it flips to show what "in 1" looks like. Each flip advances the sequence. */
function setupLogoFlip(): void {
  const logo = document.getElementById("logo");
  const back = logo?.querySelector<HTMLElement>(".logo-back");
  if (!logo || !back) return;
  let hoverTimer = 0;
  let unflipTimer = 0;
  let finger = 0;
  const flip = () => {
    if (!logo.classList.contains("flipped")) {
      const next = FINGERS[finger % FINGERS.length]!;
      back.textContent = next;
      logo.classList.toggle("rude", next === FINGERS[FINGERS.length - 1]);
      finger++;
    }
    window.clearTimeout(unflipTimer);
    logo.classList.add("flipped");
    unflipTimer = window.setTimeout(() => logo.classList.remove("flipped", "rude"), 1000);
  };
  logo.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    hoverTimer = window.setTimeout(flip, 450);
  });
  logo.addEventListener("pointerleave", () => window.clearTimeout(hoverTimer));
  logo.addEventListener("click", (e) => {
    e.stopPropagation(); // the logo flips; the title text is the home link
    flip();
  });
}
setupLogoFlip();
buildThemeMenu();
applyTheme(currentTheme());
syncMode();
syncUrl();

document.querySelectorAll<HTMLButtonElement>(".mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode as Mode;
    if (mode === state.mode) return;
    if (state.phase === "playing" || state.phase === "revealed") {
      const ok = window.confirm("Switching puzzles will discard this run. Continue?");
      if (!ok) return;
    }
    stopTimer();
    state.mode = mode;
    syncMode();
    syncUrl();
    void loadPuzzle();
  });
});

// ---------- rendering ----------

function h(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

function tile(letter: string, mark: Mark | "empty" | "filled"): HTMLElement {
  return h("div", { class: `tile tile-${mark}` }, letter.toUpperCase());
}

function wordRow(word: string, feedback: Feedback, extra = ""): HTMLElement {
  const row = h("div", { class: `row ${extra}`.trim(), style: `--len: ${word.length}` });
  for (let i = 0; i < word.length; i++) row.append(tile(word[i] ?? "", feedback[i] ?? "x"));
  return row;
}

function orbitHeat(near: number | null): string {
  if (near === null) return "cold";
  if (near <= 3) return "burning";
  if (near <= 8) return "hot";
  if (near <= 15) return "warm";
  return "lukewarm";
}

/** Ring radius (percent of the board) for band k, where 0 is the farthest band and the last is the nearest. */
const ORBIT_RADII = [46, 38.5, 31, 23.5, 16];

/**
 * Orbit mode board. `hub` lists neighbours nearest first; the ring reveals from the far end, one band per
 * miss, so the words edge inward. Wrong guesses sit on the orbit at their own distance, or outside if cold.
 */
function orbitBoard(hub: string[], guesses: OrbitGuess[], reveal: { answer: string; correct: boolean } | null): HTMLElement {
  const board = h("div", { class: "orbit" });
  const per = ORBIT_WORDS[state.puzzle!.difficulty];
  const shown = reveal ? ORBIT_GUESSES : Math.min(ORBIT_GUESSES, guesses.length + 1);
  const centre = h("div", { class: `orbit-centre${reveal ? (reveal.correct ? " orbit-win" : " orbit-miss") : ""}` }, reveal ? reveal.answer : "?");
  board.append(centre);
  const at = (radius: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `left: ${50 + Math.cos(a) * radius}%; top: ${50 + Math.sin(a) * radius}%`;
  };
  // Everything placed so far, so guess markers can find an empty angle near their own radius.
  const placed: { radius: number; deg: number }[] = [];
  // A guessed word that is also a ring word is marked on the ring itself rather than drawn twice.
  const guessed = new Set(guesses.map((g) => g.word));
  const onRing = new Set<string>();
  for (let k = 0; k < shown; k++) {
    const band = hub.slice((ORBIT_GUESSES - 1 - k) * per, (ORBIT_GUESSES - k) * per);
    // Each older ring fades and shrinks a step further, so only the newest one competes for attention.
    const age = shown - 1 - k;
    const fade = age === 0 ? 1 : Math.max(0.12, 0.55 * 0.55 ** (age - 1));
    // Every ring sways gently on its own period; words counter-sway so they stay upright.
    const ring = h("div", { class: "orbit-ring", style: `--sway: ${(11 + k * 2.5).toFixed(1)}s` });
    // Consecutive rings are offset by half a slot, so neighbouring rings interleave instead of stacking.
    const offset = (180 / band.length) * k;
    band.forEach((w, i) => {
      const deg = -90 + (360 / band.length) * i + offset;
      placed.push({ radius: ORBIT_RADII[k]!, deg });
      if (guessed.has(w)) onRing.add(w);
      ring.append(h("div", {
        class: `orbit-word${age > 0 ? " orbit-faded" : ""}${guessed.has(w) ? " orbit-hit" : ""}`,
        style: `${at(ORBIT_RADII[k]!, deg)}; opacity: ${fade.toFixed(2)}; --age: ${age}`,
        title: w,
      }, w));
    });
    board.append(ring);
  }
  guesses.forEach((g, i) => {
    if (onRing.has(g.word)) return;
    const radius = g.near === null ? 48 : 16 + (g.near / 25) * 30;
    const age = guesses.length - 1 - i;
    const deg = emptiestAngle(placed, radius);
    placed.push({ radius, deg });
    board.append(h("div", { class: `orbit-word orbit-guess${g.near === null ? " orbit-cold" : ""}`, style: `${at(radius, deg)}; opacity: ${Math.max(0.35, 1 - age * 0.2).toFixed(2)}` }, g.word));
  });
  return board;
}

/** The angle with the most room among things placed at a similar radius, tried every 15 degrees. */
function emptiestAngle(placed: { radius: number; deg: number }[], radius: number): number {
  const near = placed.filter((p) => Math.abs(p.radius - radius) < 11);
  let best = 200;
  let bestGap = -1;
  for (let deg = 0; deg < 360; deg += 15) {
    const gap = near.reduce((min, p) => {
      const d = Math.abs(((deg - p.deg) % 360) + 540) % 360 - 180;
      return Math.min(min, Math.abs(d));
    }, 360);
    if (gap > bestGap) {
      bestGap = gap;
      best = deg;
    }
  }
  return best;
}

function inputRow(): HTMLElement {
  const len = state.puzzle!.length;
  const row = h("div", { class: "row row-input", id: "input-row", style: `--len: ${len}` });
  for (let i = 0; i < len; i++) {
    const ch = state.input[i] ?? "";
    row.append(tile(ch, ch ? "filled" : "empty"));
  }
  return row;
}

function renderInputRow(): void {
  const old = document.getElementById("input-row");
  if (old) old.replaceWith(inputRow());
}

function keyboard(clues: Clue[]): HTMLElement {
  const best: Record<string, Mark> = {};
  const rank: Record<Mark, number> = { x: 0, y: 1, g: 2 };
  for (const c of clues) {
    for (let i = 0; i < c.word.length; i++) {
      const ch = c.word[i]!;
      const m = c.feedback[i]!;
      if (!best[ch] || rank[m] > rank[best[ch]!]) best[ch] = m;
    }
  }
  const kb = h("div", { class: "keyboard" });
  if (packAllowsDigits(state.puzzle!.pack)) {
    const row = h("div", { class: "kb-row kb-digits" });
    for (const ch of DIGIT_ROW) row.append(keyButton(ch, ch, best[ch] ? `kb-${best[ch]}` : "kb-digit"));
    kb.append(row);
  }
  KEY_ROWS.forEach((letters, i) => {
    const row = h("div", { class: "kb-row" });
    if (i === 2) row.append(keyButton("Enter", "Enter", "kb-wide"));
    for (const ch of letters) {
      row.append(keyButton(ch, ch, best[ch] ? `kb-${best[ch]}` : ""));
    }
    if (i === 2) row.append(keyButton("⌫", "Backspace", "kb-wide"));
    kb.append(row);
  });
  return kb;
}

/** Backspace is drawn as an SVG so it can't disappear into a font that lacks the ⌫ glyph. */
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/></svg>';

function keyButton(label: string, key: string, cls: string): HTMLElement {
  const b = h("button", { class: `kb ${cls}`.trim(), type: "button", "aria-label": key });
  if (key === "Backspace") b.innerHTML = BACKSPACE_ICON;
  else b.textContent = label;
  b.addEventListener("click", () => handleKey(key));
  return b;
}

function clock(): HTMLElement {
  const danger = isCountdown() && timeLeftMs() < 15_000 ? " clock-danger" : "";
  return h("div", { class: `clock${danger}` }, h("span", { id: "clock" }, clockText()));
}

function square(r: RoundResult): HTMLElement {
  if (r.gaveUp) return h("span", { class: "sq sq-boom", role: "img", "aria-label": "gave up" }, "🏳️");
  if (r.exploded) return h("span", { class: "sq sq-boom", role: "img", "aria-label": "exploded" }, "💥");
  return h("span", { class: `sq ${r.correct ? "sq-g" : "sq-x"}` });
}

function puzzleLabel(): string {
  const d = formatPuzzleDate(state.date);
  const base = state.mode === "bonus" ? `Bonus ${d}` : d;
  return variant() ? `${base} (${variant()})` : base;
}

function settingsPanel(): HTMLElement {
  const kindSel = h("select", { id: "kind", "aria-label": "Game" }) as HTMLSelectElement;
  for (const [id, k] of Object.entries(KINDS)) {
    kindSel.append(h("option", { value: id, ...(id === state.kind ? { selected: "" } : {}) }, k.name));
  }
  kindSel.addEventListener("change", () => {
    state.kind = isKind(kindSel.value) ? kindSel.value : DEFAULT_KIND;
    syncUrl();
    state.phase = "intro";
    void loadPuzzle();
  });
  const lengthSel = h("select", { id: "length", "aria-label": "Word length" }) as HTMLSelectElement;
  for (let n = MIN_LENGTH; n <= MAX_LENGTH; n++) {
    lengthSel.append(h("option", { value: String(n), ...(n === state.length ? { selected: "" } : {}) }, `${n} letters`));
  }
  const diffSel = h("select", { id: "difficulty", "aria-label": "Difficulty" }) as HTMLSelectElement;
  for (const [id, d] of Object.entries(DIFFICULTIES)) {
    const clues = isOrbit() ? `${ORBIT_WORDS[id as Difficulty]} per ring` : d.clues === 1 ? "1 clue" : `${d.clues} clues`;
    diffSel.append(h("option", { value: id, ...(id === state.difficulty ? { selected: "" } : {}) }, `${d.label}, ${clues}`));
  }
  lengthSel.addEventListener("change", () => {
    state.length = Number(lengthSel.value);
    syncUrl();
    void loadPuzzle(true);
  });
  diffSel.addEventListener("change", () => {
    state.difficulty = diffSel.value as Difficulty;
    syncUrl();
    void loadPuzzle(true);
  });
  const packSel = h("select", { id: "pack", "aria-label": "Word theme" }) as HTMLSelectElement;
  packSel.append(h("option", { value: "", ...(state.pack === "" ? { selected: "" } : {}) }, "Mixed, every word"));
  for (const [id, pack] of Object.entries(PACKS)) {
    packSel.append(h("option", { value: id, ...(id === state.pack ? { selected: "" } : {}) }, pack.name));
  }
  packSel.addEventListener("change", () => {
    state.pack = isPack(packSel.value) ? packSel.value : "";
    syncUrl();
    void loadPuzzle(true);
  });
  const vocabSel = h("select", { id: "vocab", "aria-label": "Vocabulary" }) as HTMLSelectElement;
  for (const [id, v] of Object.entries(VOCABS)) {
    vocabSel.append(h("option", { value: id, ...(id === state.vocab ? { selected: "" } : {}) }, v.name));
  }
  vocabSel.addEventListener("change", () => {
    state.vocab = isVocab(vocabSel.value) ? vocabSel.value : DEFAULT_VOCAB;
    syncUrl();
    void loadPuzzle(true);
  });
  const clockSel = h("select", { id: "clock", "aria-label": "Clock" }) as HTMLSelectElement;
  clockSel.append(
    h("option", { value: "stopwatch", ...(state.clock === "stopwatch" ? { selected: "" } : {}) }, "Stopwatch"),
    h("option", { value: "countdown", ...(state.clock === "countdown" ? { selected: "" } : {}) },
      `Countdown, ${formatTime(state.budgetMs)} on the fuse`),
  );
  clockSel.addEventListener("change", () => {
    state.clock = clockSel.value as Clock;
    syncUrl();
    void loadPuzzle(true);
  });
  const link = h("button", { class: "link-btn", type: "button" }, "Copy link to this setup");
  link.addEventListener("click", async () => {
    const ok = await copy(settingsUrl());
    toast(ok ? "Link copied" : "Couldn't copy. Grab it from the address bar.");
  });
  const orbit = isOrbit();
  return h("div", { class: "settings" },
    // Orbit is a secret mode for now: the Game control only appears once you've arrived via ?game=orbit.
    h("label", { class: "setting setting-wide", ...(orbit ? {} : { hidden: "" }) }, h("span", { class: "muted small" }, "Game"), kindSel, h("span", { class: "muted small" }, KINDS[state.kind].blurb)),
    h("label", { class: "setting", ...(orbit ? { hidden: "" } : {}) }, h("span", { class: "muted small" }, "Word length"), lengthSel),
    h("label", { class: `setting${orbit ? " setting-wide" : ""}` }, h("span", { class: "muted small" }, "Difficulty"), diffSel),
    h("label", { class: "setting setting-wide" }, h("span", { class: "muted small" }, "Word theme"), packSel, h("span", { class: "muted small", id: "pack-note" }, packNote())),
    h("label", { class: "setting setting-wide", ...(orbit ? { hidden: "" } : {}) }, h("span", { class: "muted small" }, "Vocabulary"), vocabSel, h("span", { class: "muted small", id: "vocab-note" }, vocabNote())),
    h("label", { class: "setting setting-wide" }, h("span", { class: "muted small" }, "Clock"), clockSel),
    link,
  );
}

function render(): void {
  app.replaceChildren();
  switch (state.phase) {
    case "loading":
      app.append(h("p", { class: "muted center" }, "Loading puzzle…"));
      break;
    case "intro":
      renderIntro();
      break;
    case "playing":
    case "revealed":
      renderRound();
      break;
    case "exploded":
      renderExplosion();
      break;
    case "done":
      renderResults();
      break;
  }
}

function pastDayNotice(): HTMLElement {
  const back = h("button", { class: "link-btn", type: "button" }, "Back to today");
  back.addEventListener("click", () => goToDate(TODAY));
  const label = dayLabel(state.date);
  const text = label === "Yesterday" ? "You're looking at yesterday's puzzle. " : `You're looking at the puzzle from ${label}. `;
  return h("p", { class: "past-notice" }, h("span", {}, text), back);
}

function packNote(): string {
  if (isOrbit()) return state.pack ? `Secret words come from ${PACKS[state.pack]!.name}` : "Pick a theme to keep the secret words on topic";
  if (state.length !== DEFAULT_LENGTH) return "Themes are five-letter only";
  return state.pack ? PACKS[state.pack]!.blurb : "Themes narrow the field, so the clues get sneakier";
}

function vocabNote(): string {
  if (activePack()) return "A word theme is its own vocabulary";
  return VOCABS[state.vocab].blurb;
}

function introText(): string {
  if (isOrbit()) {
    const per = ORBIT_WORDS[state.difficulty];
    const ring = per === 1 ? "one word" : `${per} words`;
    return isCountdown()
      ? `Words related to a secret word orbit it, farthest first. Each miss reveals ${ring} closer in. ${ORBIT_GUESSES} guesses per word. You have ${formatTime(state.budgetMs)} for all five, a wrong guess burns ${formatTime(COUNTDOWN_PENALTY_MS)}, and at zero the whole thing blows up.`
      : `Words related to a secret word orbit it, farthest first. Each miss reveals ${ring} closer in, colours the letters you guessed, and lands your guess where it belongs. You're told the category. ${ORBIT_GUESSES} guesses per word, and the clock runs the whole time.`;
  }
  return isCountdown()
    ? `Each word comes with a few guesses already played. Read the colours, work out the only word that fits, and type it. You have ${formatTime(state.budgetMs)} for all five, a wrong guess burns ${formatTime(COUNTDOWN_PENALTY_MS)}, and at zero the whole thing blows up.`
    : "Each word comes with a few guesses already played. Read the colours, work out the only word that fits, and type it. You get one shot per word and the clock runs the whole time.";
}

function alreadyPlayed(): boolean {
  return loadSaved() !== null;
}

function startLabel(): string {
  if (!state.puzzle) return "Loading…";
  if (alreadyPlayed()) return "See today's results";
  return isCountdown() ? "Light the fuse" : "Start the clock";
}

function startPressed(): void {
  if (!state.puzzle) return;
  if (alreadyPlayed()) {
    void loadPuzzle();
    return;
  }
  startRound(0);
}

function playedToday(): HTMLElement | null {
  const games = gamesToday();
  if (games.length === 0) return null;
  const list = h("ul", { class: "played" });
  for (const g of games) {
    const current = sameSettings(g.settings, currentSettings());
    const btn = h("button", { class: `played-item${current ? " played-current" : ""}`, type: "button" },
      h("span", { class: "played-label" }, settingsLabel(g.settings)),
      h("span", { class: "played-score" }, scoreText(g)),
    );
    btn.addEventListener("click", () => applySettings(g.settings));
    list.append(h("li", {}, btn));
  }
  return h("section", { class: "played-today" },
    h("h3", {}, state.date === TODAY ? "Played today" : `Played on ${formatPuzzleDate(state.date)}`),
    h("p", { class: "muted small" }, "Tap one to see its results, or change the setup above for a fresh board."),
    list,
  );
}

/** Stats plus the past week, plus any older days that were played. Past days can be revisited or played late. */
function historySection(): HTMLElement | null {
  const byDate = allGames();
  const stats = computeStats(byDate);
  const week: string[] = [];
  for (let back = 1; back <= 7; back++) week.push(shiftDate(TODAY, -back));
  const older = [...byDate.keys()].filter((d) => d < week[week.length - 1]! ).sort().reverse();
  if (byDate.size === 0 && state.date === TODAY) {
    // Nothing played yet: keep the intro clean apart from a way to reach yesterday.
    const link = h("button", { class: "link-btn", type: "button" }, "Play yesterday's puzzle");
    link.addEventListener("click", () => goToDate(shiftDate(TODAY, -1)));
    return h("section", { class: "history" }, link);
  }

  const statRow = h("dl", { class: "stats" },
    stat(String(stats.daysPlayed), stats.daysPlayed === 1 ? "day played" : "days played"),
    stat(String(stats.streak), stats.streak === 1 ? "day streak" : "day streak"),
    stat(String(stats.perfect), "perfect runs"),
    stat(stats.bestStandardMs === null ? "–" : formatTime(stats.bestStandardMs), "best standard"),
  );

  const list = h("ul", { class: "played" });
  const row = (date: string) => {
    const games = byDate.get(date) ?? [];
    const featured = games.find((g) => isStandard(g.settings)) ?? games[0];
    const extra = games.length > 1 ? `, +${games.length - 1} more` : "";
    const btn = h("button", { class: `played-item${date === state.date ? " played-current" : ""}`, type: "button" },
      h("span", { class: "played-label" }, dayLabel(date), h("span", { class: "muted small" }, featured ? `${games.length > 1 || !isStandard(featured.settings) ? ` ${settingsLabel(featured.settings)}` : ""}${extra}` : " not played")),
      h("span", { class: "played-score" }, featured ? scoreText(featured) : "Play it"),
    );
    btn.addEventListener("click", () => goToDate(date, featured?.settings));
    return h("li", {}, btn);
  };
  for (const d of week) list.append(row(d));
  for (const d of older) list.append(row(d));

  return h("section", { class: "history" },
    h("h3", {}, "Your week"),
    statRow,
    list,
  );
}

function stat(value: string, label: string): HTMLElement {
  return h("div", { class: "stat" }, h("dt", {}, label), h("dd", {}, value));
}

/** Update the intro's text in place after a settings change, leaving the controls untouched. */
function refreshIntro(): void {
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set("intro-label", puzzleLabel());
  set("intro-text", introText());
  set("pack-note", packNote());
  const legend = document.getElementById("legend");
  if (legend) legend.hidden = isOrbit();
  set("vocab-note", vocabNote());
  set("start-btn", startLabel());
  const bonusNote = document.getElementById("bonus-note");
  if (bonusNote) bonusNote.hidden = state.mode !== "bonus";
  const start = document.getElementById("start-btn") as HTMLButtonElement | null;
  if (start) start.disabled = !state.puzzle;
  document.querySelectorAll<HTMLElement>(".played-item").forEach((el) => {
    el.classList.toggle("played-current", el.querySelector(".played-label")?.textContent === settingsLabel(currentSettings()));
  });
}

function renderIntro(): void {
  const start = h("button", { class: "primary", type: "button", id: "start-btn" }, startLabel()) as HTMLButtonElement;
  start.disabled = !state.puzzle;
  start.addEventListener("click", startPressed);
  app.append(
    h("section", { class: "intro" },
      h("p", { class: "eyebrow", id: "intro-label" }, puzzleLabel()),
      ...(state.date !== TODAY ? [pastDayNotice()] : []),
      h("h2", {}, "Five words. One guess each."),
      h("p", { id: "intro-text" }, introText()),
      h("p", { class: "muted small", id: "bonus-note", hidden: "" }, "Bonus is just another game for the same day. Different seed, nothing else changes."),
      h("div", { class: "legend", id: "legend", ...(isOrbit() ? { hidden: "" } : {}) },
        wordRow("crane", ["x", "y", "x", "g", "x"]),
        h("p", { class: "muted", id: "legend-text" }, legendText()),
      ),
      settingsPanel(),
      start,
      h("p", { class: "muted small" }, "Press Enter to start"),
    ),
  );
  const played = playedToday();
  if (played) app.append(played);
  const hist = historySection();
  if (hist) app.append(hist);
  const bonusNote = document.getElementById("bonus-note");
  if (bonusNote) bonusNote.hidden = state.mode !== "bonus";
  start.focus();
}

function renderRound(): void {
  const round = state.puzzle!.rounds[state.round]!;
  const result = state.phase === "revealed" ? state.results[state.round]! : null;

  const board = h("section", { class: "board" });
  const pack = state.puzzle!.pack ? PACKS[state.puzzle!.pack] : null;
  const theme = !pack && round.theme ? PACKS[round.theme] : null;
  board.append(
    h("div", { class: "status" },
      h("span", { class: "status-left" },
        h("span", { class: "muted" }, `Word ${state.round + 1} of ${state.puzzle!.rounds.length}`),
        ...(pack ? [h("span", { class: "pack-chip" }, pack.name)] : theme ? [h("span", { class: "pack-chip" }, `A ${theme.name} word`)] : []),
      ),
      clock(),
    ),
  );
  const rows = h("div", { class: "rows" });
  if (round.hub) {
    const css = getComputedStyle(document.documentElement);
    const colour = (name: string) => css.getPropertyValue(name).trim();
    const board = h("div", { class: "orbit orbit-graph" });
    board.append(orbitGraph({
      key: `${state.date}:${state.mode}:${state.round}:${round.hub.join(",")}`,
      hub: round.hub,
      per: ORBIT_WORDS[state.puzzle!.difficulty],
      rings: result ? ORBIT_GUESSES : Math.min(ORBIT_GUESSES, state.orbitGuesses.length + 1),
      guesses: state.orbitGuesses,
      edges: state.orbitEdges,
      reveal: result ? { answer: result.answer, correct: result.correct } : null,
      colors: { text: colour("--text"), bg: colour("--bg"), line: colour("--line"), muted: colour("--muted"), miss: colour("--miss"), green: colour("--green") },
    }));
    rows.append(board);
  }
  for (const c of round.clues) rows.append(wordRow(c.word, c.feedback));
  // Orbit: earlier misses stack up as ordinary coloured rows, so spelling narrows things too.
  for (const g of state.orbitGuesses) rows.append(wordRow(g.word, g.feedback));

  if (result) {
    rows.append(wordRow(result.guess, result.feedback, result.correct ? "row-win" : "row-miss"));
    const verdict = h("p", { class: "verdict" });
    const penalty = isCountdown() && !result.correct ? `, ${formatTime(COUNTDOWN_PENALTY_MS)} burned` : "";
    const got = result.tries && result.tries > 1 ? `Got it in ${result.tries}` : "Got it";
    verdict.append(
      h("strong", {}, result.correct ? got : `It was ${result.answer.toUpperCase()}${penalty}`),
      h("span", { class: "verdict-time" }, formatTime(result.ms)),
    );
    const isLast = state.round + 1 >= state.puzzle!.rounds.length;
    const next = h("button", { class: "primary", type: "button" }, isLast ? "See results" : "Next word");
    next.addEventListener("click", nextRound);
    board.append(rows, verdict, next);
    if (!isLast) board.append(giveUpControls());
    app.append(board);
    next.focus();
  } else {
    rows.append(inputRow());
    const known: Clue[] = [...round.clues, ...state.orbitGuesses.map((g) => ({ word: g.word, feedback: g.feedback }))];
    board.append(rows, keyboard(known), giveUpControls());
    app.append(board);
  }
}

function renderExplosion(): void {
  app.classList.add("quake");
  window.setTimeout(() => app.classList.remove("quake"), 700);
  app.append(
    h("section", { class: "explosion" },
      h("div", { class: "boom", role: "img", "aria-label": "Explosion" }, "💥"),
      h("h2", {}, "Boom."),
      h("p", { class: "muted" }, "The fuse ran out."),
    ),
  );
}

function renderResults(): void {
  const results = state.results;
  const countdown = isCountdown();
  const exploded = results.some((r) => r.exploded);
  const gaveUp = results.some((r) => r.gaveUp);
  const left = Math.max(0, timeLeftMs());
  const share = buildShareText({
    date: state.date, mode: state.mode, results, award: state.award, variant: variant(),
    ...(countdown ? { timeLeftMs: left } : {}),
  });
  const solved = results.filter((r) => r.correct).length;
  const slowest = results.reduce((best, r, i) => (!r.gaveUp && r.ms > results[best]!.ms ? i : best), 0);
  const total = state.puzzle!.rounds.length;

  let blurb: string;
  if (gaveUp) blurb = state.note || QUIT_LINES[0]!;
  else if (exploded) blurb = solved === 0 ? "Nothing solved before the blast." : `${solved} solved before the blast.`;
  else if (countdown) blurb = solved === total ? `All five, with ${formatTime(left)} to spare.` : `${solved} of ${total} in one, ${formatTime(left)} to spare.`;
  else blurb = solved === total ? "All five in one." : `${solved} of ${total} in one.`;

  const summary = h("section", { class: "results" },
    h("p", { class: "eyebrow" }, puzzleLabel()),
    ...(state.date !== TODAY ? [pastDayNotice()] : []),
    h("div", { class: "squares" }, ...results.map(square)),
    ...(state.award ? [h("div", { class: "award", role: "img", "aria-label": "Award" }, state.award)] : []),
    h("div", { class: `clock clock-final${exploded ? " clock-danger" : ""}` }, countdown ? formatTime(left) : formatTime(totalMs())),
    h("p", { class: gaveUp ? "quit-note" : "muted" }, blurb),
  );

  const breakdown = h("ol", { class: "breakdown" });
  results.forEach((r, i) => {
    const li = h("li", { class: `bd ${i === slowest && results.length > 1 && !r.exploded ? "bd-slowest" : ""}`.trim() });
    const note = r.gaveUp
      ? (r.ms > 0 ? "gave up here" : "never reached")
      : r.exploded ? "boom" : r.correct ? (r.tries && r.tries > 1 ? `in ${r.tries}` : i === slowest ? "slowest" : "") : `you said ${r.guess.toUpperCase()}`;
    li.append(
      square(r),
      h("span", { class: "bd-time" }, formatTime(r.ms)),
      h("span", { class: "bd-word" }, r.answer ? r.answer.toUpperCase() : "?".repeat(state.puzzle!.length)),
      h("span", { class: "bd-note muted" }, note),
    );
    breakdown.append(li);
  });

  const another = h("button", { class: "secondary", type: "button" }, "Play another setup");
  another.addEventListener("click", () => {
    state.phase = "intro";
    render();
    document.querySelector(".settings")?.scrollIntoView({ block: "start" });
  });
  const shareBtn = h("button", { class: "primary", type: "button" }, "Copy score");
  shareBtn.addEventListener("click", async () => {
    const ok = await copy(share);
    toast(ok ? "Copied. Paste it wherever you brag." : "Couldn't copy. Select the text below instead.");
    track("Score copied", setupProps());
  });
  const pre = h("pre", { class: "share-preview" }, share);

  app.append(summary, breakdown, shareBtn, pre, another);
}

// ---------- helpers ----------

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h("textarea", { style: "position:fixed;opacity:0" }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastHandle);
  toastHandle = window.setTimeout(() => (toastEl.hidden = true), 2200);
}

function shake(message: string): void {
  const row = document.getElementById("input-row");
  if (row) {
    row.classList.remove("shake");
    void row.offsetWidth;
    row.classList.add("shake");
  }
  toast(message);
}

void loadPuzzle();
