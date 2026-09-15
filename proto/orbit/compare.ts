import { ranked, useModel } from "./neighbors";
const targets = ["plant", "waist", "comet", "scale", "torch", "melon", "bunny", "disco", "album", "tonic", "piano", "joint", "brown", "paint", "march", "crane", "nurse", "storm"];
for (const t of targets) {
  const rows: string[] = [];
  for (const m of ["bge", "glove", "both"] as const) { useModel(m); const r = ranked(t); rows.push(`${m}: ${r.slice(0, 4).map((x) => x.w).join(" ")}`); }
  console.log(t.toUpperCase().padEnd(6) + rows.join("  ‖  "));
}
