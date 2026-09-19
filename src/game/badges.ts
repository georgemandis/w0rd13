import type { Clock, Difficulty, Kind, Mode, Vocab } from "./config";

/** What a badge can look at. Everything the game knows when a run ends. */
export interface BadgeRound {
  correct: boolean;
  ms: number;
  tries?: number;
  gaveUp?: boolean;
  exploded?: boolean;
  guess?: string;
  answer?: string;
}

export interface BadgeContext {
  results: BadgeRound[];
  /** When the run finished, local time. */
  finishedAt: Date;
  settings: { mode: Mode; length: number; difficulty: Difficulty; clock: Clock; pack: string; vocab: Vocab; kind: Kind };
  /** Colour theme id in use. */
  theme: string;
  /** Streak including today, and days ever played, as of this finish. */
  streak: number;
  daysPlayed: number;
  /** Games already finished today before this one. */
  gamesTodayBefore: number;
  /** The puzzle was from an earlier day, played late. */
  late: boolean;
  /** Whether the player has ever opened the bug or feature form from the app. */
  filedBug: boolean;
  filedFeature: boolean;
}

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  /** The lore. Short, odd, and delivered with complete confidence. */
  blurb: string;
  when: (c: BadgeContext) => boolean;
}

const solved = (c: BadgeContext) => c.results.filter((r) => r.correct);
const clean = (c: BadgeContext) => !c.results.some((r) => r.gaveUp || r.exploded);
const full = (c: BadgeContext) => c.results.length === 5 && clean(c);
const perfect = (c: BadgeContext) => full(c) && c.results.every((r) => r.correct);
const total = (c: BadgeContext) => c.results.reduce((s, r) => s + r.ms, 0);
const hour = (c: BadgeContext) => c.finishedAt.getHours();
const day = (c: BadgeContext) => c.finishedAt.getDay();
const answers = (c: BadgeContext) => c.results.map((r) => r.answer ?? "").filter(Boolean);
const vowels = (w: string) => (w.match(/[aeiou]/g) ?? []).length;
const pattern = (c: BadgeContext) => c.results.map((r) => (r.correct ? "g" : "x")).join("");
const seconds = (c: BadgeContext) => Math.floor(total(c) / 1000);
const mmss = (c: BadgeContext) => `${Math.floor(seconds(c) / 60)}${String(seconds(c) % 60).padStart(2, "0")}`;

export const BADGES: readonly Badge[] = [
  // Time of day and week
  { id: "early-bird", emoji: "🐦", name: "The Early Bird", blurb: "This is her. Her name is Tina. Congrats.", when: (c) => hour(c) >= 5 && hour(c) < 8 },
  { id: "second-coffee", emoji: "☕", name: "Second Coffee", blurb: "The first coffee did nothing. This is the one that counts.", when: (c) => hour(c) >= 9 && hour(c) < 11 },
  { id: "lunch-break", emoji: "🥪", name: "Lunch Break", blurb: "Half a sandwich was harmed in the making of this score.", when: (c) => hour(c) === 12 },
  { id: "golden-hour", emoji: "🌇", name: "Golden Hour", blurb: "Doug the photographer says the light was \"acceptable.\" High praise, from Doug.", when: (c) => hour(c) >= 18 && hour(c) < 20 },
  { id: "night-owl", emoji: "🦉", name: "Night Owl", blurb: "Gerald has been awake since 1997. He does not recommend it.", when: (c) => hour(c) === 23 },
  { id: "witching-hour", emoji: "🕯️", name: "The Witching Hour", blurb: "Something in the walls is also playing. Say hi.", when: (c) => hour(c) >= 0 && hour(c) < 3 },
  { id: "monday", emoji: "😩", name: "It's Monday", blurb: "Nobody chose this. Least of all you.", when: (c) => day(c) === 1 },
  { id: "hump-day", emoji: "🐪", name: "Hump Day", blurb: "Humphrey the camel has two humps and no opinions.", when: (c) => day(c) === 3 },
  { id: "friday-feeling", emoji: "🪩", name: "Friday Feeling", blurb: "The disco ball is named Patrice. She only comes out on Fridays.", when: (c) => day(c) === 5 },
  { id: "weekend-warrior", emoji: "🛡️", name: "Weekend Warrior", blurb: "Brenda from accounting battles only on weekends. Brenda is a legend.", when: (c) => day(c) === 0 || day(c) === 6 },
  { id: "the-first", emoji: "🥇", name: "The First", blurb: "New month, new you. Same word game.", when: (c) => c.finishedAt.getDate() === 1 },
  { id: "leap-of-faith", emoji: "🐸", name: "Leap of Faith", blurb: "Fernando jumps on the 29th. Nobody knows why. Nobody asks.", when: (c) => c.finishedAt.getDate() === 29 },

  // Speed
  { id: "harold", emoji: "🦔", name: "Harold the Hedgie", blurb: "A word in under five seconds. Harold approves. Harold does not approve of much.", when: (c) => solved(c).some((r) => r.ms < 5_000) },
  { id: "beatrice", emoji: "🐝", name: "Beatrice Has a Schedule", blurb: "Every word under fifteen seconds. Beatrice the bee has a schedule. You are now on it.", when: (c) => perfect(c) && c.results.every((r) => r.ms < 15_000) },
  { id: "sheila", emoji: "🦥", name: "Sheila", blurb: "A word took over two minutes. Slow is smooth. Smooth is Sheila. Sheila is a sloth.", when: (c) => clean(c) && c.results.some((r) => r.ms > 120_000) },
  { id: "reginald", emoji: "🎩", name: "Fashionably Late", blurb: "All five, in over five minutes. Reginald arrived late to his own wedding. Twice.", when: (c) => perfect(c) && total(c) > 300_000 },
  { id: "photo-finish", emoji: "📸", name: "Photo Finish", blurb: "Two words within a second of each other. The judges have reviewed the tape. The tape is inconclusive.", when: (c) => clean(c) && c.results.some((a, i) => c.results.some((b, j) => i < j && Math.abs(a.ms - b.ms) < 1_000)) },
  { id: "getting-warmer", emoji: "🌡️", name: "Getting Warmer", blurb: "Each word faster than the last. Marcus the thermometer says you peaked. He means it nicely.", when: (c) => full(c) && c.results.every((r, i) => i === 0 || r.ms < c.results[i - 1]!.ms) },
  { id: "nigel", emoji: "🐧", name: "Nigel Took a Moment", blurb: "First word slowest, then you flew. Penguins can't fly. Nigel didn't know that.", when: (c) => full(c) && c.results.slice(1).every((r) => r.ms < c.results[0]!.ms) },
  { id: "big-finish", emoji: "🎆", name: "Big Finish", blurb: "Last word fastest. Firework technician Lou says save the best for last. Lou has three fingers.", when: (c) => full(c) && c.results[4]!.correct && c.results.slice(0, 4).every((r) => r.ms > c.results[4]!.ms) },

  // Accuracy and shape
  { id: "sponge-ian", emoji: "🧽", name: "Clean Sheet", blurb: "Every word first time. Sponge Ian has been waiting for this. Sponge Ian is very clean.", when: (c) => perfect(c) && c.results.every((r) => !r.tries || r.tries === 1) },
  { id: "denise", emoji: "🐛", name: "Nearly", blurb: "Four of five. So close that Denise the inchworm measured it. She said \"ugh.\"", when: (c) => full(c) && solved(c).length === 4 },
  { id: "coach-terry", emoji: "🏀", name: "Bounce Back", blurb: "A miss, then three in a row. Coach Terry saw that. Coach Terry cried. Manly tears.", when: (c) => clean(c) && /xggg/.test(pattern(c)) },
  { id: "gwen", emoji: "🌧️", name: "Rough Start", blurb: "First word wrong, rest right. Meteorologist Gwen apologizes. She always apologizes.", when: (c) => full(c) && pattern(c) === "xgggg" },
  { id: "rocco", emoji: "🍔", name: "The Burger", blurb: "A miss in a bun. Chef Rocco calls it \"a special.\"", when: (c) => full(c) && pattern(c) === "ggxgg" },
  { id: "zed", emoji: "🦓", name: "Zed Stands By It", blurb: "Alternating hits and misses. Zebra Zed stands by his choices. All of them.", when: (c) => full(c) && (pattern(c) === "gxgxg" || pattern(c) === "xgxgx") },
  { id: "biscuit", emoji: "🐕", name: "Biscuit", blurb: "Three misses, then the last one landed. His name is Biscuit. He never gave up. Neither did you. Mostly.", when: (c) => full(c) && solved(c).length <= 2 && c.results[4]!.correct },
  { id: "bookends", emoji: "📚", name: "Bookends", blurb: "First and last right, the middle went missing. Librarian Horace has questions about the middle.", when: (c) => full(c) && pattern(c) === "gxxxg" },

  // Letters
  { id: "priya", emoji: "🔤", name: "Vowel Movement", blurb: "A guess with three or more vowels. Linguist Priya has thoughts. They are all vowels.", when: (c) => c.results.some((r) => r.guess && vowels(r.guess) >= 3) },
  { id: "quentin", emoji: "🤔", name: "Quentin's Cousin", blurb: "An answer with a Q. Quentin sends regards. He is still trapped in the U.", when: (c) => answers(c).some((w) => w.includes("q")) },
  { id: "the-lisas", emoji: "👯", name: "Double Trouble", blurb: "An answer with a repeated letter. The twins, Lisa and Lisa, insist they are different people.", when: (c) => answers(c).some((w) => new Set(w).size < w.length) },
  { id: "alan", emoji: "🧟", name: "Z Is for Zed", blurb: "An answer with a Z. The zombie's name is Alan. He is tired. He is always tired.", when: (c) => answers(c).some((w) => w.includes("z")) },
  { id: "ruth", emoji: "🍲", name: "Alphabet Soup", blurb: "Five answers, five different first letters. Grandma Ruth's soup. Don't ask what's in it.", when: (c) => answers(c).length === 5 && new Set(answers(c).map((w) => w[0])).size === 5 },
  { id: "the-kevins", emoji: "🎭", name: "Understudies", blurb: "Two answers with the same first letter. Kevin and Kevin. Only one gets the part.", when: (c) => answers(c).length >= 2 && new Set(answers(c).map((w) => w[0])).size < answers(c).length },
  { id: "no-vowels-guess", emoji: "🪨", name: "Rocks in a Row", blurb: "A guess with one vowel or fewer. Geologist Bram says that's a rock. Bram says that about everything.", when: (c) => c.results.some((r) => r.guess && r.guess.length >= 4 && vowels(r.guess) <= 1) },

  // Orbit
  { id: "pam", emoji: "🛰️", name: "Deep Space", blurb: "An Orbit word on the first try. Satellite Pam has seen things. She won't say what.", when: (c) => c.settings.kind === "orbit" && c.results.some((r) => r.correct && r.tries === 1) },
  { id: "sven", emoji: "🥶", name: "Cold Front", blurb: "Solved after a cold guess. Explorer Sven brought a coat. He did not bring a map.", when: (c) => c.settings.kind === "orbit" && c.results.some((r) => r.correct && (r.tries ?? 1) >= 3) },
  { id: "doreen", emoji: "🐢", name: "The Long Way Round", blurb: "Solved on the last possible guess. Turtle Doreen took the scenic route. Doreen always does.", when: (c) => c.settings.kind === "orbit" && c.results.some((r) => r.correct && r.tries === 5) },

  // Settings
  { id: "horace", emoji: "📖", name: "Big Words", blurb: "Eight letters or more. Librarian Horace has a special shelf. This is that shelf.", when: (c) => c.settings.kind !== "orbit" && c.settings.length >= 8 },
  { id: "colin", emoji: "🐜", name: "Tiny Words", blurb: "Three letters. Ant Colin carries fifty times his weight in vocabulary.", when: (c) => c.settings.kind !== "orbit" && c.settings.length === 3 },
  { id: "cliff", emoji: "🧗", name: "Extreme Sports", blurb: "Extreme difficulty. Cliff (a person) climbs cliffs (not a person). This confuses everyone.", when: (c) => c.settings.difficulty === "extreme" },
  { id: "marguerite", emoji: "🛋️", name: "Easy Does It", blurb: "Easy mode, all five. Sofa Marguerite fully supports you. Literally.", when: (c) => c.settings.difficulty === "easy" && perfect(c) },
  { id: "yuki", emoji: "💣", name: "Bomb Disposal", blurb: "All five on a countdown. Expert Yuki cut the red wire. There was no red wire.", when: (c) => c.settings.clock === "countdown" && perfect(c) },
  { id: "bartholomew", emoji: "🔌", name: "Unplugged", blurb: "No clock. Timekeeper Bartholomew was told to go home. He is still in the car park.", when: (c) => c.settings.clock === "off" },
  { id: "odette", emoji: "🎨", name: "Thematic", blurb: "A word theme. Curator Odette hung this crooked. On purpose. It's art.", when: (c) => Boolean(c.settings.pack) },
  { id: "gordon", emoji: "🎁", name: "Bonus Round", blurb: "It's not your birthday. Gordon wrapped it anyway.", when: (c) => c.settings.mode === "bonus" },
  { id: "captain-regular", emoji: "🦸", name: "Everyday Hero", blurb: "Everyday words, all five. Captain Regular saves the day, then does the dishes.", when: (c) => c.settings.vocab === "everyday" && perfect(c) },
  { id: "purple-reign", emoji: "👑", name: "Purple Reign", blurb: "The party's in 1999. Dress accordingly.", when: (c) => c.theme === "prince" },
  { id: "honk", emoji: "🤡", name: "Honk", blurb: "You played this in the clown theme. On purpose. Marjorie the clown is proud. Marjorie is always proud.", when: (c) => c.theme === "clown" },
  { id: "smart-brevity", emoji: "📰", name: "Smart Brevity", blurb: "Why it matters: you finished. Go deeper: no. The bottom line: nice.", when: (c) => c.theme === "bottomline" },

  // Streaks and habits
  { id: "ines", emoji: "🥐", name: "On a Roll", blurb: "Three days running. Baker Ines rolls one croissant per day. Today she rolled three.", when: (c) => c.streak >= 3 && c.streak < 7 },
  { id: "calendar-pete", emoji: "📅", name: "Week Strong", blurb: "Seven days running. Calendar Pete has ticked them all. Calendar Pete is a calendar.", when: (c) => c.streak >= 7 },
  { id: "ethel", emoji: "🧓", name: "Old Timer", blurb: "Thirty days played. Ethel remembers when this was a field. It was never a field.", when: (c) => c.daysPlayed >= 30 },
  { id: "salvatore", emoji: "🍦", name: "Double Dip", blurb: "A second game today. Two scoops. Gelato man Salvatore judges nobody.", when: (c) => c.gamesTodayBefore === 1 },
  { id: "dice", emoji: "🎲", name: "Triple Threat", blurb: "A third game today. Dice, whose name is Dice, does not approve of gambling.", when: (c) => c.gamesTodayBefore >= 2 },

  // Historical figures
  { id: "amelia", emoji: "🛩️", name: "Amelia Earhart", blurb: "You went back for a day you missed. Yup, we found her. Don't lose her again.", when: (c) => c.late },
  { id: "tesla", emoji: "🥸", name: "Nikola Tesla", blurb: "Three of five. Or Freddie Mercury. Or Burt Reynolds. It's a little unclear.", when: (c) => full(c) && solved(c).length === 3 },

  // Endings
  { id: "montgomery", emoji: "🪿", name: "Strategic Retreat", blurb: "General Montgomery called it a tactical repositioning. Montgomery is a goose.", when: (c) => c.results.some((r) => r.gaveUp) },
  { id: "kathy", emoji: "💥", name: "Kaboom Kathy", blurb: "Kathy hears it too. She lives for it.", when: (c) => c.results.some((r) => r.exploded) },

  // Numbers
  { id: "fitz", emoji: "🍀", name: "Lucky Seven", blurb: "A seven in your time. Leprechaun Fitz says sevens are lucky. Fitz owes money to a lot of people.", when: (c) => clean(c) && seconds(c) > 0 && mmss(c).includes("7") },
  { id: "gary", emoji: "🔟", name: "Round Number", blurb: "A time on the exact minute. Accountant Gary loves a round number. Gary has never loved anything else.", when: (c) => clean(c) && seconds(c) > 0 && seconds(c) % 60 === 0 },
  { id: "hannah", emoji: "🔁", name: "Hannah", blurb: "Your time reads the same backwards. So does Hannah. Hannah is a palindrome.", when: (c) => clean(c) && seconds(c) >= 60 && mmss(c) === [...mmss(c)].reverse().join("") },

  // Filing
  { id: "wanda", emoji: "🔍", name: "Bug Hunter", blurb: "You reported a bug. Entomologist Wanda thanks you. The bug's name was Steve.", when: (c) => c.filedBug },
  { id: "edison", emoji: "💡", name: "Big Ideas", blurb: "You suggested a feature. The bulb is named Edison. Not the famous one. He's more upset about that than you'd think.", when: (c) => c.filedFeature },
  { id: "ernie", emoji: "🦅", name: "Eagle Eye", blurb: "A bug and a feature. Ernie the eagle sees everything. He mostly sees you. Hi.", when: (c) => c.filedBug && c.filedFeature },
];

export function badgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}

/** Every badge this run qualifies for. */
export function qualifyingBadges(c: BadgeContext): Badge[] {
  return BADGES.filter((b) => {
    try {
      return b.when(c);
    } catch {
      return false;
    }
  });
}

/**
 * One badge for the run: a random pick among those qualifying, preferring ones
 * the player has never earned so the pool stays surprising. "" if none apply.
 */
export function pickBadge(c: BadgeContext, earned: readonly string[] = [], rand: () => number = Math.random): string {
  const all = qualifyingBadges(c);
  if (all.length === 0) return "";
  const fresh = all.filter((b) => !earned.includes(b.id));
  const pool = fresh.length ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!.id;
}

/** "🦔 Harold the Hedgie", for the share text. */
export function badgeLine(id: string): string {
  const b = badgeById(id);
  return b ? `${b.emoji} ${b.name}` : "";
}
