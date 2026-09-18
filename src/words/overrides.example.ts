// Optional private word lists. Any length listed here replaces the generated
// lists in byLength.ts for that length; everything else falls through.
//
// This file is copied to overrides.ts on install if that file is missing.
// overrides.ts is gitignored, so whatever you put there stays out of the repo.
import type { WordLists } from "./index";

export const OVERRIDES: Partial<Record<number, WordLists>> = {};
