// Prototype: embed every Wordle answer with Workers AI (bge-small) and save the vectors locally.
import { ANSWERS } from "../../src/words/answers";
const token = process.env.CF_TOKEN!;
const account = "24166d3ab80f9215b1e9598ef0a687de";
const out: Record<string, number[]> = {};
for (let i = 0; i < ANSWERS.length; i += 100) {
  const batch = ANSWERS.slice(i, i + 100);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/baai/bge-small-en-v1.5`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text: batch }),
  });
  const d = (await res.json()) as { success: boolean; result?: { data: number[][] }; errors?: unknown };
  if (!d.success) throw new Error(JSON.stringify(d.errors));
  batch.forEach((w, j) => (out[w] = d.result!.data[j]!.map((x) => Math.round(x * 1e5) / 1e5)));
  process.stdout.write(`${Math.min(i + 100, ANSWERS.length)}/${ANSWERS.length}\r`);
}
await Bun.write("proto/orbit/vectors.json", JSON.stringify(out));
console.log(`\nwrote ${Object.keys(out).length} vectors`);
