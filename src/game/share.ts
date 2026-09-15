import type { Mode } from "./config";

export interface RoundResult {
  correct: boolean;
  ms: number;
  /** Countdown mode: the clock hit zero on this word. */
  exploded?: boolean;
  /** The player gave up on or before this word. */
  gaveUp?: boolean;
  /** Orbit mode: how many guesses this word took (or was allowed before the miss). */
  tries?: number;
}

export interface ShareInput {
  date: string;
  mode: Mode;
  results: RoundResult[];
  /** Optional emoji from pickAward, appended to the summary line. */
  award?: string;
  /** Optional variant such as "7 letters, extreme"; shown after the date. */
  variant?: string;
  /** Countdown mode: time remaining when the run ended. Shown instead of time spent. */
  timeLeftMs?: number;
}

export const GOOD_AWARDS: readonly string[] = ["🏆", "⭐", "⚡", "🦄", "🌟", "🎉"];
export const BAD_AWARDS: readonly string[] = ["🤡", "☹️", "💀", "😭", "🫠"];
/** Giving up is sad, not funny: no clowns here. */
export const QUIT_AWARDS: readonly string[] = ["😢", "🥺", "💔", "😔"];
const GOOD_MIN_CORRECT = 5;
const BAD_MAX_CORRECT = 2;

/** A perfect run gets a good award, a rough one gets a bad award, a quitter gets a sad one, anything else none. */
export function pickAward(results: RoundResult[], rand: () => number = Math.random): string {
  const correct = results.filter((r) => r.correct).length;
  const exploded = results.some((r) => r.exploded);
  const gaveUp = results.some((r) => r.gaveUp);
  const pool: readonly string[] = gaveUp
    ? QUIT_AWARDS
    : exploded || correct <= BAD_MAX_CORRECT ? BAD_AWARDS : correct >= GOOD_MIN_CORRECT ? GOOD_AWARDS : [];
  if (pool.length === 0) return "";
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPuzzleDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

export function squareFor(r: RoundResult): string {
  if (r.gaveUp) return "🏳️";
  return r.exploded ? "💥" : r.correct ? "🟩" : "⬛";
}

/**
 * Shareable result. The first three lines match the classic format so it
 * still reads the same in chat; the breakdown below shows which word got you.
 */
export function buildShareText({ date, mode, results, award, variant, timeLeftMs }: ShareInput): string {
  const total = results.reduce((sum, r) => sum + r.ms, 0);
  const time = timeLeftMs === undefined ? formatTime(total) : `${formatTime(Math.max(0, timeLeftMs))} left`;
  const dateLabel = mode === "bonus" ? `Bonus ${formatPuzzleDate(date)}` : formatPuzzleDate(date);
  const label = variant ? `${dateLabel} (${variant})` : dateLabel;
  const squares = results.map(squareFor).join("");
  // Words never reached after giving up show in the summary squares but not the breakdown.
  const breakdown = results
    .filter((r) => !(r.gaveUp && r.ms === 0))
    .map((r) => `${squareFor(r)} ${formatTime(r.ms)}${r.tries ? ` in ${r.tries}` : ""}`);
  const summary = `${squares} ${time}${award ? ` ${award}` : ""}`;
  return ["w0rd13", label, summary, "", ...breakdown].join("\n");
}
