// Prototype: pull the GloVe vector for every five-letter answer out of a GloVe text file
// and save them locally as proto/orbit/vectors-glove.json (the 100-dimensional model was used).
// GloVe is public domain (PDDL): https://nlp.stanford.edu/projects/glove/ (glove.6B.zip, glove.6B.100d.txt).
//
//   bun proto/orbit/embed-glove.ts path/to/glove.6B.100d.txt
import { wordsForLength } from "../../src/words";
const path = process.argv[2];
if (!path) throw new Error("usage: bun proto/orbit/embed-glove.ts path/to/glove.6B.100d.txt");
const wanted = new Set(wordsForLength(5).answers);
const out: Record<string, number[]> = {};
let line = "";
const decoder = new TextDecoder();
for await (const chunk of Bun.file(path).stream()) {
  line += decoder.decode(chunk, { stream: true });
  const rows = line.split("\n");
  line = rows.pop() ?? "";
  for (const row of rows) {
    const space = row.indexOf(" ");
    const word = row.slice(0, space);
    if (!wanted.has(word) || out[word]) continue;
    out[word] = row.slice(space + 1).split(" ").map((x) => Math.round(Number(x) * 1e4) / 1e4);
  }
}
await Bun.write("proto/orbit/vectors-glove.json", JSON.stringify(out));
console.log(`wrote ${Object.keys(out).length} of ${wanted.size} vectors`);
