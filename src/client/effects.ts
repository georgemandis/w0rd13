import confetti from "canvas-confetti";

/**
 * Little celebrations and commiserations. Everything here is decorative:
 * it respects reduced-motion and never blocks the game.
 */

const HAPPY = ["🎉", "⭐", "✨", "🦄", "⚡", "🌟", "🏆", "💚"];
const SAD = ["😢", "🥺", "💔", "😔"];
const TEAR = "💧";
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

/**
 * Rain: teardrops fall straight down from above the page across its full width,
 * with a sad face here and there. Nothing bursts, nothing sparkles.
 */
function rain(intensity: number, faces: number): void {
  const scalar = 1.6;
  const drop = confetti.shapeFromText({ text: TEAR, scalar });
  const faceShapes = emojiShapes(SAD, faces, scalar + 0.6);
  const columns = 6;
  for (let i = 0; i < columns; i++) {
    window.setTimeout(() => {
      void confetti({
        particleCount: Math.round(6 * intensity),
        angle: 270,
        spread: 12,
        startVelocity: 8,
        gravity: 1.3,
        drift: 0,
        decay: 0.97,
        scalar,
        shapes: [drop],
        colors: ["#6aa4d8"],
        origin: { x: (i + 0.5) / columns, y: -0.05 },
        ticks: 280,
      });
    }, i * 60);
  }
  window.setTimeout(() => {
    void confetti({
      particleCount: faces,
      angle: 270,
      spread: 30,
      startVelocity: 6,
      gravity: 1.1,
      decay: 0.97,
      scalar: scalar + 0.6,
      shapes: faceShapes,
      origin: { x: 0.5, y: -0.05 },
      ticks: 300,
    });
  }, 150);
}

/** A wrong word: a short, sad shower. */
export function commiserateRound(): void {
  if (reduced()) return;
  rain(1, 2);
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
  if (kind === "boom") {
    const scalar = 2.2;
    const shapes = emojiShapes(BOOM, 3, scalar);
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => {
        void confetti({ particleCount: 24, spread: 100, startVelocity: 45, gravity: 1, decay: 0.94, scalar, shapes, origin: { x: 0.2 + 0.3 * i, y: 0.5 }, ticks: 260 });
      }, i * 250);
    }
    return;
  }
  // Rough finish or giving up: a longer, heavier rain.
  rain(kind === "quit" ? 2.5 : 2, 4);
  window.setTimeout(() => rain(1.5, 2), 900);
}
