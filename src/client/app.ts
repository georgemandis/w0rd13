import type { Feedback, Mark } from "../game/feedback";
import {
  DIFFICULTIES, DEFAULT_DIFFICULTY, DEFAULT_LENGTH, MIN_LENGTH, MAX_LENGTH, DEFAULT_CLOCK,
  COUNTDOWN_BUDGET_MS, COUNTDOWN_PENALTY_MS, PACKS, VOCABS, DEFAULT_VOCAB,
  isClock, isDifficulty, isLength, isPack, isVocab, localDateString, packAllowsDigits, variantLabel,
  type Clock, type Difficulty, type Mode, type Vocab,
} from "../game/config";
import { buildShareText, formatPuzzleDate, formatTime, pickAward, squareFor, type RoundResult } from "../game/share";
import { celebrateRound, commiserateRound, finishRun } from "./effects";

interface Clue { word: string; feedback: Feedback }
interface ClientPuzzle { date: string; mode: Mode; length: number; difficulty: Difficulty; pack: string; vocab: Vocab; rounds: { clues: Clue[] }[] }
interface GuessResponse { valid: boolean; correct?: boolean; answer?: string; feedback?: Feedback }
interface FinishedRound extends RoundResult { guess: string; answer: string; feedback: Feedback }

type Phase = "loading" | "intro" | "playing" | "revealed" | "exploded" | "done";

interface State {
  mode: Mode;
  length: number;
  difficulty: Difficulty;
  clock: Clock;
  pack: string;
  vocab: Vocab;
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

/** Swatch colours mirror the CSS themes so the menu can preview themes that aren't active. */
const THEMES = [
  { id: "classic", name: "Classic", bg: "#ffffff", a: "#6aaa64", b: "#c9b458" },
  { id: "slate", name: "Slate", bg: "#222938", a: "#5f9e5a", b: "#c8a94a" },
  { id: "noir", name: "Noir", bg: "#121213", a: "#538d4e", b: "#b59f3b" },
  { id: "bubblegum", name: "Bubblegum", bg: "#2c1a33", a: "#4fb383", b: "#e6b04e" },
  { id: "citrus", name: "Citrus", bg: "#fff8e6", a: "#4caf6d", b: "#f2a93b" },
  { id: "prince", name: "I Would Die 4 u", bg: "#2b0a4e", a: "#a35bff", b: "#f2c14e" },
] as const;
type Theme = (typeof THEMES)[number];
const THEME_KEY = "w0rd13:theme";
/**
 * Game settings live in the URL so a setup can be shared: ?letters=7&difficulty=extreme&pack=animals&clock=countdown&mode=bonus
 * Defaults (5 letters, normal, mixed, stopwatch, daily) are omitted, so a bare URL is always the standard game.
 */
interface Settings { mode: Mode; length: number; difficulty: Difficulty; clock: Clock; pack: string; vocab: Vocab }

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
  };
}

function settingsUrl(): string {
  const q = new URLSearchParams();
  if (state.mode !== "daily") q.set("mode", state.mode);
  if (state.length !== DEFAULT_LENGTH) q.set("letters", String(state.length));
  if (state.difficulty !== DEFAULT_DIFFICULTY) q.set("difficulty", state.difficulty);
  if (activePack()) q.set("pack", activePack());
  if (state.vocab !== DEFAULT_VOCAB && !activePack()) q.set("vocab", state.vocab);
  if (state.clock !== DEFAULT_CLOCK) q.set("clock", state.clock);
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
const toastEl = document.getElementById("toast")!;
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const DIGIT_ROW = "1234567890";

const state: State = {
  ...readUrlSettings(),
  budgetMs: budgetFromUrl(),
  penaltyMs: 0,
  finalTimeLeftMs: null,
  date: localDateString(),
  puzzle: null,
  phase: "loading",
  round: 0,
  input: "",
  roundStart: 0,
  results: [],
  award: "",
  note: "",
  confirmingQuit: false,
  submitting: false,
};

let timerHandle = 0;
let toastHandle = 0;

// ---------- persistence (one play per puzzle per browser) ----------

/** Word themes only exist for five-letter words. */
function activePack(): string {
  return state.length === DEFAULT_LENGTH ? state.pack : "";
}

function variant(): string {
  return variantLabel(state.length, state.difficulty, state.clock, activePack(), state.vocab);
}

function isCountdown(): boolean {
  return state.clock === "countdown";
}

function puzzleQuery(): string {
  const pack = activePack() ? `&pack=${activePack()}` : "";
  const vocab = state.vocab !== DEFAULT_VOCAB && !activePack() ? `&vocab=${state.vocab}` : "";
  return `date=${state.date}&mode=${state.mode}&length=${state.length}&difficulty=${state.difficulty}${pack}${vocab}`;
}

/** The settings that identify a game (a pack overrides vocabulary, and only applies at five letters). */
function currentSettings(): Settings {
  const pack = activePack();
  return { mode: state.mode, length: state.length, difficulty: state.difficulty, clock: state.clock, pack, vocab: pack ? DEFAULT_VOCAB : state.vocab };
}

/** One finished game per date and settings combination. */
function gameKey(date: string, s: Settings): string {
  return `w0rd13:game:${date}:${s.mode}:${s.length}:${s.difficulty}:${s.clock}:${s.pack || "-"}:${s.vocab}`;
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

/** Every finished game for today, newest first. */
function gamesToday(): SavedGame[] {
  const prefix = `w0rd13:game:${state.date}:`;
  const games: SavedGame[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const g = JSON.parse(localStorage.getItem(k) ?? "null") as SavedGame | null;
      if (g?.settings && Array.isArray(g.results)) games.push(g);
    }
  } catch {
    /* ignore */
  }
  return games.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
}

function settingsLabel(s: Settings): string {
  const v = variantLabel(s.length, s.difficulty, s.clock, s.pack, s.vocab);
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
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = theme.id;
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
  const res = await fetch(`/api/guess?${puzzleQuery()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ round: state.round, guess: state.input }),
  });
  const data = (await res.json().catch(() => ({ valid: false }))) as GuessResponse;
  state.submitting = false;
  setChecking(false);

  if (!data.valid) {
    shake("Not in the word list");
    return;
  }
  stopTimer();
  state.results.push({
    guess: state.input,
    answer: data.answer!,
    correct: data.correct!,
    feedback: data.feedback!,
    ms: Math.round(elapsed),
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
  state.round = index;
  state.input = "";
  state.confirmingQuit = false;
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

function keyButton(label: string, key: string, cls: string): HTMLElement {
  const b = h("button", { class: `kb ${cls}`.trim(), type: "button", "aria-label": key });
  b.textContent = label;
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
  const lengthSel = h("select", { id: "length", "aria-label": "Word length" }) as HTMLSelectElement;
  for (let n = MIN_LENGTH; n <= MAX_LENGTH; n++) {
    lengthSel.append(h("option", { value: String(n), ...(n === state.length ? { selected: "" } : {}) }, `${n} letters`));
  }
  const diffSel = h("select", { id: "difficulty", "aria-label": "Difficulty" }) as HTMLSelectElement;
  for (const [id, d] of Object.entries(DIFFICULTIES)) {
    const clues = d.clues === 1 ? "1 clue" : `${d.clues} clues`;
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
  return h("div", { class: "settings" },
    h("label", { class: "setting" }, h("span", { class: "muted small" }, "Word length"), lengthSel),
    h("label", { class: "setting" }, h("span", { class: "muted small" }, "Difficulty"), diffSel),
    h("label", { class: "setting setting-wide" }, h("span", { class: "muted small" }, "Word theme"), packSel, h("span", { class: "muted small", id: "pack-note" }, packNote())),
    h("label", { class: "setting setting-wide" }, h("span", { class: "muted small" }, "Vocabulary"), vocabSel, h("span", { class: "muted small", id: "vocab-note" }, vocabNote())),
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

function packNote(): string {
  if (state.length !== DEFAULT_LENGTH) return "Themes are five-letter only";
  return state.pack ? PACKS[state.pack]!.blurb : "Themes narrow the field, so the clues get sneakier";
}

function vocabNote(): string {
  if (activePack()) return "A word theme is its own vocabulary";
  return VOCABS[state.vocab].blurb;
}

function introText(): string {
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
    const total = g.results.reduce((sum, r) => sum + r.ms, 0);
    const time = g.timeLeftMs !== undefined ? `${formatTime(Math.max(0, g.timeLeftMs))} left` : formatTime(total);
    const current = sameSettings(g.settings, currentSettings());
    const btn = h("button", { class: `played-item${current ? " played-current" : ""}`, type: "button" },
      h("span", { class: "played-label" }, settingsLabel(g.settings)),
      h("span", { class: "played-score" }, `${g.results.map(squareFor).join("")} ${time}${g.award ? ` ${g.award}` : ""}`),
    );
    btn.addEventListener("click", () => applySettings(g.settings));
    list.append(h("li", {}, btn));
  }
  return h("section", { class: "played-today" },
    h("h3", {}, "Played today"),
    h("p", { class: "muted small" }, "Tap one to see its results, or change the setup above for a fresh board."),
    list,
  );
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
      h("h2", {}, "Five words. One guess each."),
      h("p", { id: "intro-text" }, introText()),
      h("p", { class: "muted small", id: "bonus-note", hidden: "" }, "Bonus is just another game for the same day. Different seed, nothing else changes."),
      h("div", { class: "legend" },
        wordRow("crane", ["x", "y", "x", "g", "x"]),
        h("p", { class: "muted" }, "Green is in the right spot. Yellow is in the word, somewhere else. Grey is not in the word."),
      ),
      settingsPanel(),
      start,
      h("p", { class: "muted small" }, "Press Enter to start"),
    ),
  );
  const played = playedToday();
  if (played) app.append(played);
  const bonusNote = document.getElementById("bonus-note");
  if (bonusNote) bonusNote.hidden = state.mode !== "bonus";
  start.focus();
}

function renderRound(): void {
  const round = state.puzzle!.rounds[state.round]!;
  const result = state.phase === "revealed" ? state.results[state.round]! : null;

  const board = h("section", { class: "board" });
  const pack = state.puzzle!.pack ? PACKS[state.puzzle!.pack] : null;
  board.append(
    h("div", { class: "status" },
      h("span", { class: "status-left" },
        h("span", { class: "muted" }, `Word ${state.round + 1} of ${state.puzzle!.rounds.length}`),
        ...(pack ? [h("span", { class: "pack-chip" }, pack.name)] : []),
      ),
      clock(),
    ),
  );
  const rows = h("div", { class: "rows" });
  for (const c of round.clues) rows.append(wordRow(c.word, c.feedback));

  if (result) {
    rows.append(wordRow(result.guess, result.feedback, result.correct ? "row-win" : "row-miss"));
    const verdict = h("p", { class: "verdict" });
    const penalty = isCountdown() && !result.correct ? `, ${formatTime(COUNTDOWN_PENALTY_MS)} burned` : "";
    verdict.append(
      h("strong", {}, result.correct ? "Got it" : `It was ${result.answer.toUpperCase()}${penalty}`),
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
    board.append(rows, keyboard(round.clues), giveUpControls());
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
      : r.exploded ? "boom" : r.correct ? (i === slowest ? "slowest" : "") : `you said ${r.guess.toUpperCase()}`;
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
