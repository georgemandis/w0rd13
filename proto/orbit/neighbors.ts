import bge from "./vectors.json";
import glove from "./vectors-glove.json";
export type Model = "bge" | "glove" | "both";
const MODELS: Record<"bge" | "glove", Record<string, number[]>> = { bge: bge as Record<string, number[]>, glove: glove as Record<string, number[]> };
let V: Record<string, number[]> = MODELS.bge;
let words = Object.keys(V);
let current: Model = "bge";
export function useModel(m: Model): void { current = m; V = MODELS[m === "both" ? "bge" : m]; words = Object.keys(V); rebuildNorms(); }
const norm = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
let N: Record<string, number> = {};
function rebuildNorms() { N = Object.fromEntries(words.map((w) => [w, norm(V[w]!)])); }
rebuildNorms();
export const sim = (a: string, b: string) => V[a]!.reduce((s, x, i) => s + x * V[b]![i]!, 0) / (N[a]! * N[b]!);
function rankedIn(model: "bge" | "glove", target: string) {
  const M = MODELS[model];
  const n = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const t = M[target]!; const tn = n(t);
  return Object.keys(M).filter((w) => w !== target).map((w) => ({ w, s: M[w]!.reduce((acc, x, i) => acc + x * t[i]!, 0) / (n(M[w]!) * tn) })).sort((a, b) => b.s - a.s);
}

/** Ranked neighbours. "both" averages each word's rank across the two models, which blunts either one's blind spots. */
export function ranked(target: string): { w: string; s: number }[] {
  if (current !== "both") return words.filter((w) => w !== target && V[w]).map((w) => ({ w, s: sim(target, w) })).sort((a, b) => b.s - a.s);
  if (!MODELS.glove[target]) return rankedIn("bge", target);
  const a = rankedIn("bge", target), b = rankedIn("glove", target);
  const rb = new Map(b.map((x, i) => [x.w, i]));
  return a.filter((x) => rb.has(x.w)).map((x, i) => ({ w: x.w, s: 1 / (1 + (i + rb.get(x.w)!) / 2) })).sort((p, q) => q.s - p.s);
}
if (import.meta.main) {
  for (const t of ["crane", "pizza", "happy", "storm", "piano", "nurse"]) {
    const r = ranked(t);
    console.log(`${t}: ` + r.slice(0, 10).map((x) => `${x.w} ${x.s.toFixed(2)}`).join(", ") + `  | mid: ${r[1100]!.w} ${r[1100]!.s.toFixed(2)} | far: ${r[2300]!.w} ${r[2300]!.s.toFixed(2)}`);
  }
}
