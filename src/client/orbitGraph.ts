import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag } from "d3-drag";
import "d3-transition"; // adds selection.transition()

/**
 * Orbit mode as a force-directed graph. Every word is a node held on an orbit
 * whose radius says how close it is to the secret; collision keeps the labels
 * apart and lets them bump when dragged. The camera eases in as rings get
 * closer, and once the word is revealed you can zoom and pan freely.
 */

export interface OrbitInput {
  /** Identifies the round; a new key builds a new graph. */
  key: string;
  /** Neighbours, nearest first. */
  hub: string[];
  /** Words revealed per ring, and how many rings are showing. */
  per: number;
  rings: number;
  guesses: { word: string; near: number | null }[];
  /** Relatedness between words on the board, strongest first. */
  edges: { a: string; b: string; s: number }[];
  reveal: { answer: string; correct: boolean } | null;
  colors: { text: string; bg: string; line: string; muted: string; miss: string; green: string };
}

interface Node extends SimulationNodeDatum {
  id: string;
  kind: "hub" | "guess" | "centre";
  /** Orbit radius in graph units, after the layout zoom and rim clamp. */
  orbit: number;
  /** Orbit radius in true proportions (nearest ring 62, farthest 180). */
  trueOrbit: number;
  /** 0 for the newest ring; older rings fade. */
  age: number;
  cold?: boolean;
  /** Guessed word that is also a hub word. */
  hit?: boolean;
  width: number;
}

interface Link extends SimulationLinkDatum<Node> {
  s: number;
  /** Touches a guess, so it is drawn brighter: "my guess attached to these". */
  mine: boolean;
}

/** Each word keeps only its strongest few edges, so the board reads as clusters rather than a web. */
const EDGES_PER_WORD = 2;

const VIEW = 200; // viewBox half-size
const RING_RADII = [180, 148, 118, 90, 62]; // outermost band first, true proportions
const CENTRE_R = 30;
/**
 * The camera never zooms during play. Instead the layout does: the newest ring is always laid
 * out at NEWEST_AT, older rings are pushed outward as they age, and nothing goes past the RIM,
 * so no word is ever cut off by the edge of the board. The reveal restores true proportions.
 */
const NEWEST_AT = 126;
const RIM = VIEW - 22;

let graph: {
  key: string;
  svg: SVGSVGElement;
  root: SVGGElement;
  sim: Simulation<Node, undefined>;
  nodes: Node[];
  links: Link[];
  zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  free: boolean;
} | null = null;

const labelWidth = (word: string) => word.length * 8.2 + 18;

function fade(age: number): number {
  return age === 0 ? 1 : Math.max(0.12, 0.55 * 0.55 ** (age - 1));
}

/** Builds or updates the graph for the current round and returns its element. */
export function orbitGraph(input: OrbitInput): SVGSVGElement {
  if (!graph || graph.key !== input.key) graph = create(input);
  update(graph, input);
  return graph.svg;
}

function create(input: OrbitInput) {
  const svg = select(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
    .attr("class", "orbit-svg")
    .attr("viewBox", `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`)
    .attr("role", "img")
    .attr("aria-label", "Words orbiting the secret word");
  // A soft circular horizon: whatever reaches the rim dissolves rather than being sliced off.
  const defs = svg.append("defs");
  const grad = defs.append("radialGradient").attr("id", "orbit-vignette").attr("cx", "50%").attr("cy", "50%").attr("r", "50%");
  grad.append("stop").attr("offset", "84%").attr("stop-color", "#fff");
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#000");
  defs.append("mask").attr("id", "orbit-mask").append("rect").attr("x", -VIEW).attr("y", -VIEW).attr("width", VIEW * 2).attr("height", VIEW * 2).attr("fill", "url(#orbit-vignette)");
  const root = svg.append("g").attr("class", "orbit-root").attr("mask", "url(#orbit-mask)");
  // Faint guide orbits, so the distances read even before words arrive; redrawn as the layout zooms.
  const guides = root.append("g").attr("class", "orbit-guides");
  for (const r of RING_RADII) guides.append("circle").attr("r", r).attr("fill", "none").attr("stroke", input.colors.line).attr("stroke-dasharray", "3 5").attr("opacity", 0.5);
  root.append("g").attr("class", "orbit-links");
  root.append("g").attr("class", "orbit-nodes");
  const centre = root.append("g").attr("class", "orbit-centre-node");
  centre.append("circle").attr("r", CENTRE_R).attr("fill", input.colors.text);
  centre.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("fill", input.colors.bg).attr("font-size", 26).attr("font-weight", 800).text("?");

  // The centre is a pinned node so labels collide with it and never cover the answer.
  const nodes: Node[] = [{ id: "?", kind: "centre", orbit: 0, trueOrbit: 0, age: 0, width: CENTRE_R * 2 + 8, x: 0, y: 0, fx: 0, fy: 0 }];
  const sim = forceSimulation<Node>(nodes)
    .force("radial", forceRadial<Node>((d) => d.orbit, 0, 0).strength((d) => (d.kind === "centre" ? 0 : 0.9)))
    .force("collide", forceCollide<Node>((d) => d.width / 2 + 6).strength(0.9).iterations(3))
    .force("charge", forceManyBody<Node>().strength(-18))
    .force("link", forceLink<Node, Link>([]).id((d) => `${d.kind}:${d.id}`).distance((l) => 36 + (1 - l.s) * 90).strength((l) => 0.12 + l.s * 0.25))
    .force("x", forceX<Node>(0).strength(0.005))
    .force("y", forceY<Node>(0).strength(0.005))
    // Hard boundary: a label may touch the rim but never leave the board.
    .force("bounds", () => {
      for (const n of nodes) {
        if (n.kind === "centre" || n.x === undefined || n.y === undefined) continue;
        const limit = VIEW - 6 - n.width / 2;
        const d = Math.hypot(n.x, n.y);
        if (d > limit) {
          n.x *= limit / d;
          n.y *= limit / d;
        }
      }
    })
    .alphaDecay(0.035)
    .on("tick", () => draw(g));

  const zoomer = zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 4]).on("zoom", (event) => {
    root.attr("transform", event.transform.toString());
  });
  svg.call(zoomer);
  // Until the reveal the camera is ours: wheel and drag on the background do nothing.
  svg.on("wheel.zoom", null).on("mousedown.zoom", null).on("touchstart.zoom", null).on("dblclick.zoom", null);

  const g = { key: input.key, svg: svg.node()!, root: root.node()!, sim, nodes, links: [] as Link[], zoomer, free: false };
  return g;
}

function update(g: NonNullable<typeof graph>, input: OrbitInput) {
  const shownWords = new Map<string, { orbit: number; age: number }>();
  for (let k = 0; k < input.rings; k++) {
    const band = input.hub.slice((RING_RADII.length - 1 - k) * input.per, (RING_RADII.length - k) * input.per);
    const age = input.reveal ? Math.max(0, RING_RADII.length - 1 - k) : input.rings - 1 - k;
    for (const w of band) shownWords.set(w, { orbit: RING_RADII[k]!, age });
  }
  const guessed = new Set(input.guesses.map((x) => x.word));

  // Layout zoom: the newest ring lands at NEWEST_AT; true proportions return on the reveal.
  const newest = RING_RADII[Math.min(input.rings, RING_RADII.length) - 1]!;
  const z = input.reveal ? 1 : NEWEST_AT / newest;
  const place = (trueOrbit: number, width = 0) => Math.min(RIM - width / 2, trueOrbit * z);

  // Add newly shown hub words; refresh ages and orbits on the rest.
  for (const [word, spec] of shownWords) {
    const existing = g.nodes.find((n) => n.id === word && n.kind === "hub");
    if (existing) {
      existing.age = spec.age;
      existing.hit = guessed.has(word);
      existing.orbit = place(spec.orbit, existing.width);
      continue;
    }
    const angle = Math.random() * Math.PI * 2;
    const orbit = place(spec.orbit, labelWidth(word));
    g.nodes.push({ id: word, kind: "hub", orbit, trueOrbit: spec.orbit, age: spec.age, hit: guessed.has(word), width: labelWidth(word), x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit });
  }
  // A guess that has since appeared on a ring is shown there, so its own marker goes.
  for (let i = g.nodes.length - 1; i >= 0; i--) {
    const n = g.nodes[i]!;
    if (n.kind === "guess" && shownWords.has(n.id)) g.nodes.splice(i, 1);
  }
  // Guesses sit on an orbit that matches their closeness; a cold guess sits on the rim,
  // "further than anything you can see".
  input.guesses.forEach((guess, i) => {
    if (shownWords.has(guess.word)) return; // marked on the ring instead
    const existing = g.nodes.find((n) => n.id === guess.word && n.kind === "guess");
    const age = input.guesses.length - 1 - i;
    const trueOrbit = guess.near === null ? RIM : 62 + (guess.near / 25) * 118;
    const orbit = guess.near === null ? RIM - labelWidth(guess.word) / 2 : place(trueOrbit, labelWidth(guess.word));
    if (existing) {
      existing.age = age;
      existing.orbit = orbit;
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    g.nodes.push({ id: guess.word, kind: "guess", orbit, trueOrbit, age, cold: guess.near === null, width: labelWidth(guess.word), x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit });
  });
  // Guides follow the layout, and vanish once they'd sit on the rim.
  select(g.root).select(".orbit-guides").selectAll<SVGCircleElement, unknown>("circle").each(function (_, i) {
    const r = place(RING_RADII[i]!);
    select(this).attr("r", r).attr("opacity", r >= RIM - 1 ? 0 : 0.5);
  });

  const centre = select(g.root).select<SVGGElement>(".orbit-centre-node");
  centre.select("circle").attr("fill", input.reveal ? (input.reveal.correct ? input.colors.green : input.colors.miss) : input.colors.text);
  centre.select("text").text(input.reveal ? input.reveal.answer.toUpperCase() : "?").attr("font-size", input.reveal ? 11 : 26).attr("fill", input.reveal ? "#fff" : input.colors.bg).attr("letter-spacing", input.reveal ? 1 : 0);

  // Links among words that are on the board and legible enough to matter; a guess keeps its
  // strongest edges to anything, everything else keeps only its strongest few.
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const visible = (n: Node) => n.kind === "guess" ? n.age <= 2 : n.age <= 1;
  const perWord = new Map<string, number>();
  g.links = [];
  for (const e of input.edges) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b || !visible(a) || !visible(b)) continue;
    const ca = perWord.get(a.id) ?? 0;
    const cb = perWord.get(b.id) ?? 0;
    if (ca >= EDGES_PER_WORD && cb >= EDGES_PER_WORD) continue;
    perWord.set(a.id, ca + 1);
    perWord.set(b.id, cb + 1);
    g.links.push({ source: `${a.kind}:${a.id}`, target: `${b.kind}:${b.id}`, s: e.s, mine: a.kind === "guess" || b.kind === "guess" });
  }
  g.sim.nodes(g.nodes);
  (g.sim.force("link") as ReturnType<typeof forceLink<Node, Link>>).links(g.links);
  g.sim.alpha(0.8).restart();
  draw(g, input.colors);
  bindDrag(g);
  fit(g, input);
}

let lastColors: OrbitInput["colors"] | null = null;

function draw(g: NonNullable<typeof graph>, colors?: OrbitInput["colors"]) {
  if (colors) lastColors = colors;
  const c = lastColors!;
  const lines = select(g.root).select<SVGGElement>(".orbit-links").selectAll<SVGLineElement, Link>("line").data(g.links, (l) => `${(l.source as Node).id ?? l.source}|${(l.target as Node).id ?? l.target}`);
  lines.enter().append("line").merge(lines)
    .attr("x1", (l) => (l.source as Node).x ?? 0).attr("y1", (l) => (l.source as Node).y ?? 0)
    .attr("x2", (l) => (l.target as Node).x ?? 0).attr("y2", (l) => (l.target as Node).y ?? 0)
    .attr("stroke", (l) => (l.mine ? c.miss : c.muted))
    .attr("stroke-width", (l) => (l.mine ? 1.2 + l.s : 0.6 + l.s * 0.8))
    .attr("stroke-linecap", "round")
    .attr("opacity", (l) => (l.mine ? 0.35 + l.s * 0.45 : 0.1 + l.s * 0.25));
  lines.exit().remove();
  const layer = select(g.root).select<SVGGElement>(".orbit-nodes");
  const sel = layer.selectAll<SVGGElement, Node>("g.orbit-node").data(g.nodes.filter((d) => d.kind !== "centre"), (d) => `${d.kind}:${d.id}`);
  const enter = sel.enter().append("g").attr("class", "orbit-node").style("cursor", "grab");
  enter.append("rect").attr("rx", 11).attr("ry", 11).attr("height", 22).attr("y", -11);
  enter.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central").attr("font-size", 11).attr("font-weight", 700).attr("letter-spacing", 0.8);
  const all = enter.merge(sel);
  all.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`).attr("opacity", (d) => (d.kind === "guess" ? Math.max(0.35, 1 - d.age * 0.2) : fade(d.age)));
  all.select("rect")
    .attr("width", (d) => d.width).attr("x", (d) => -d.width / 2)
    .attr("fill", c.bg)
    .attr("stroke", (d) => (d.kind === "guess" || d.hit ? c.miss : c.line))
    .attr("stroke-width", (d) => (d.hit ? 2 : 1))
    .attr("stroke-dasharray", (d) => (d.cold ? "3 3" : null));
  all.select("text").text((d) => d.id.toUpperCase()).attr("fill", (d) => (d.kind === "guess" ? c.miss : c.text));
  sel.exit().remove();
}

function bindDrag(g: NonNullable<typeof graph>) {
  const behaviour = drag<SVGGElement, Node>()
    .on("start", (event, d) => {
      if (!event.active) g.sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) g.sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
  select(g.root).selectAll<SVGGElement, Node>("g.orbit-node").call(behaviour);
}

/** The camera stays put during play (the layout zooms instead); the reveal frees it for exploring. */
function fit(g: NonNullable<typeof graph>, input: OrbitInput) {
  if (!input.reveal || g.free) return;
  g.free = true;
  const svg = select(g.svg);
  svg.call(g.zoomer); // restores wheel, drag and pinch
  svg.transition().duration(900).call(g.zoomer.transform, zoomIdentity);
}

/** Forget the current graph, e.g. when a new word starts. */
export function resetOrbitGraph(): void {
  graph?.sim.stop();
  graph = null;
}
