import { describe, expect, test } from "bun:test";
import { edgesAmong } from "../api";
import { NEIGHBORS } from "../words/neighbors";

describe("edgesAmong", () => {
  test("relates words that are in each other's neighbour lists, strongest first", () => {
    const edges = edgesAmong(["piano", "cello", "flute", "storm", "flood"]);
    const pair = (a: string, b: string) => edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    expect(pair("piano", "cello")).toBeDefined();
    expect(pair("storm", "flood")).toBeDefined();
    expect(pair("piano", "flood")).toBeUndefined();
    for (let i = 1; i < edges.length; i++) expect(edges[i - 1]!.s).toBeGreaterThanOrEqual(edges[i]!.s);
    for (const e of edges) expect(e.s).toBeGreaterThan(0);
  });

  test("every answer has a neighbour list and never lists itself", () => {
    const lists = Object.entries(NEIGHBORS);
    expect(lists.length).toBe(2315);
    for (const [w, list] of lists) {
      expect(list).toHaveLength(25);
      expect(list.includes(w)).toBe(false);
    }
  });
});
