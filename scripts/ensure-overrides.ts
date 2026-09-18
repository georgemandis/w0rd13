// Creates src/words/overrides.ts from overrides.example.ts when it is missing,
// so a fresh clone builds. Runs on install and before each build.
const target = "src/words/overrides.ts";
if (!(await Bun.file(target).exists())) {
  await Bun.write(target, await Bun.file("src/words/overrides.example.ts").text());
  console.log(`created ${target} from the example (no private word lists)`);
}
