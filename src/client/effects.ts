import confetti from "canvas-confetti";

/**
 * Little celebrations and commiserations. Everything here is decorative:
 * it respects reduced-motion and never blocks the game.
 */

const HAPPY = ["🎉", "⭐", "✨", "🦄", "⚡", "🌟", "🏆", "💚"];
const SAD = ["😢", "🥺", "💔", "😔", "🫠", "🌧️"];
const BOOM = ["💥", "🔥", "💣", "🧨"];

function reduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pickSome<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  return out;
}

function emojiShapes(items: readonly string[], n: number, scalar: number) {
  return pickSome(items, n).map((text) => confetti.shapeFromText({ text, scalar }));
}

/** A correct word. The burst grows with every word solved so the last one really pops. */
export function celebrateRound(solvedSoFar: number, total: number): void {
  if (reduced()) return;
  const progress = solvedSoFar / total;
  void confetti({
    particleCount: 40 + Math.round(120 * progress),
    spread: 55 + 40 * progress,
    startVelocity: 30 + 20 * progress,
    origin: { y: 0.45 },
    ticks: 160,
  });
  if (progress >= 0.5) {
    const scalar = 2;
    void confetti({
      particleCount: 6 + Math.round(10 * progress),
      spread: 90,
      scalar,
      shapes: emojiShapes(HAPPY, 3, scalar),
      origin: { y: 0.4 },
      ticks: 200,
    });
  }
}

/** A wrong word: a soft, slow drizzle of sad faces. */
export function commiserateRound(): void {
  if (reduced()) return;
  const scalar = 2.2;
  void confetti({
    particleCount: 8,
    spread: 70,
    startVelocity: 12,
    gravity: 0.6,
    decay: 0.93,
    scalar,
    shapes: emojiShapes(SAD, 2, scalar),
    origin: { y: 0.35 },
    ticks: 220,
  });
}

/** End of a run. Perfect gets fireworks from both sides; poor or forfeited gets a gentle rain. */
export function finishRun(kind: "perfect" | "good" | "rough" | "quit" | "boom"): void {
  if (reduced()) return;
  if (kind === "perfect" || kind === "good") {
    const bursts = kind === "perfect" ? 6 : 3;
    const scalar = 2;
    for (let i = 0; i < bursts; i++) {
      window.setTimeout(() => {
        void confetti({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, ticks: 220 });
        void confetti({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, ticks: 220 });
        if (kind === "perfect") {
          void confetti({ particleCount: 10, spread: 120, scalar, shapes: emojiShapes(HAPPY, 4, scalar), origin: { y: 0.3 }, ticks: 260 });
        }
      }, i * 350);
    }
    return;
  }
  const scalar = 2.2;
  const shapes = emojiShapes(kind === "boom" ? BOOM : SAD, 3, scalar);
  for (let i = 0; i < 3; i++) {
    window.setTimeout(() => {
      void confetti({
        particleCount: kind === "boom" ? 24 : 10,
        spread: 100,
        startVelocity: kind === "boom" ? 45 : 10,
        gravity: kind === "boom" ? 1 : 0.5,
        decay: 0.94,
        scalar,
        shapes,
        origin: { x: 0.2 + 0.3 * i, y: kind === "boom" ? 0.5 : 0.1 },
        ticks: 260,
      });
    }, i * 250);
  }
}
