// Prototype: embed every five-letter answer with Workers AI (bge-small) and save the vectors locally.
// Needs CF_ACCOUNT_ID and CF_TOKEN (a token with Workers AI access) in the environment or .env.
import { wordsForLength } from "../../src/words";
const ANSWERS = wordsForLength(5).answers;
const token = process.env.CF_TOKEN;
const account = process.env.CF_ACCOUNT_ID;
if (!token || !account) throw new Error("set CF_ACCOUNT_ID and CF_TOKEN (see .env.example)");
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
