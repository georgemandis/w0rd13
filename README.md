# w0rd13

Five words a day. Each word comes with a few Wordle guesses already played; read the colours, work out the only word that fits, and type it. One guess per word, and the clock runs the whole time.

Pick a word length from 3 to 10 letters and a difficulty from Easy (4 clues) to Extreme (1 clue). A Vocabulary setting switches between Standard (the full answer list) and Everyday, which limits answers to the most common spoken words by OpenSubtitles frequency, which makes puzzles easier and is shared in links as `vocab=everyday`. Word themes (twenty of them: Animals, Food & drink, Body parts, Music, The outdoors, Colours, Sports, Space, Spooky, Weather, Jobs, Games, Ocean, Feelings, Tech, Fashion, Home, Drinks, plus Purple Rain and Swiftie built from song titles) draw the five answers from a curated pack and show the theme on the board. Purple Rain is built from Prince song and album titles and is a "loose" pack: it includes names like NIKKI and Prince spellings like DIE4U, the keyboard grows a digit row, and pack words are always accepted as guesses. The theme narrows the field, so the clues only need to separate the answer from the rest of the pack, which makes Hard and Extreme far more playable. Switch the clock to Countdown for a 3:00 fuse across all five words: a wrong guess burns 15 seconds, zero means the run explodes, and the share text reports how much time you had left (add `?budget=<seconds>` to the URL to shorten the fuse). Every combination is still uniquely solvable: the generator searches for clues whose feedback rules out every other word in the answer list.

## Run it

```sh
bun install
bun dev        # http://localhost:3000, hot reload
bun start      # production mode
bun test
bun scripts/build-words.ts   # regenerate the 3-10 letter word lists
```

## Orbit (secret mode, in progress)

Open `/?game=orbit` for a second game built on word meaning. Words related to a secret word orbit it, farthest first; each miss reveals a closer ring, colours the letters you guessed, and lands your guess on the orbit at its own distance. You're told the category, and get five guesses per word. Neighbours come from `src/words/hubs.ts`, precomputed once by `proto/orbit/build-hubs.ts` from a rank-averaged blend of GloVe and a BGE embedding (see `proto/orbit/` for the scripts; the vector files are not committed). The Game control in settings only appears once you've arrived via that link.

## Deploy to Cloudflare

Live at https://w0rd13.lol (and https://w0rd13.george-mandis.workers.dev). The game runs as a Cloudflare Worker with static assets: the client is built into `dist/` and served by the platform, and only `/api/*` reaches the Worker (`src/worker.ts`), which shares its request handling with the Bun server via `src/api.ts`. Puzzle responses are cached at the edge for an hour.

```sh
bunx wrangler login       # once
bun run cf:dev            # local Workers runtime at http://localhost:8787
bun run deploy            # build and publish
```

`wrangler.jsonc` attaches `w0rd13.lol` and `www.w0rd13.lol` as custom domains; Cloudflare manages their DNS records and certificates.

Puzzle generation takes up to about a second of CPU per new puzzle. That fits the Workers Paid plan (30 s CPU per request) but not the Free plan's 10 ms, so deploy on Paid, or expect "Worker exceeded resource limits" errors on the first request for each day's puzzle.

## How it works

- `src/api.ts` is the game API written against standard Request and Response, used by both `src/server.ts` (Bun, serves the client via HTML imports) and `src/worker.ts` (Cloudflare). It exposes three endpoints. `/api/puzzle` returns the clues for the daily or bonus puzzle (answers stay on the server). `/api/guess` validates a guess against the word list and returns the answer and feedback.
- `src/game/puzzle.ts` generates puzzles deterministically from the date, mode, length and difficulty, so everyone gets the same words. Early clues split the candidates greedily; the final clue is searched for specifically so that exactly one word in the answer list fits all of them.
- `src/words/` holds the official Wordle answer and guess lists for 5 letters. Other lengths are built by `scripts/build-words.ts`: a word must be common in both web text (Norvig's Google unigram counts) and speech (OpenSubtitles frequencies), be a lowercase entry in `/usr/share/dict/words`, and not be a proper name (the system propernames file plus a blocklist, with an allowlist for names that are ordinary words like "will" and "mark"). The top few hundred to twelve hundred per length are kept.
- `src/game/feedback.ts` is standard Wordle scoring for any word length with correct repeated-letter handling.
- `src/game/share.ts` builds the shareable score. The first three lines match the classic format; a per-word breakdown follows so you can see which word got you. A perfect run earns a random good award emoji on the summary line and a rough one (two or fewer right) earns a random bad one.

```
w0rd13
Bonus September 9, 2026
🟩🟩🟩🟩🟩 2:55 🦄

🟩 0:07
🟩 0:34
🟩 1:44
🟩 0:16
🟩 0:14
```

Bonus is simply a second puzzle for the same day with a different seed; nothing else changes. Correct words set off confetti that grows with each solve, misses get a rain of teardrops, a clean sweep gets fireworks, giving up gets a heavier rain and exploding a fiery burst (canvas-confetti, skipped under reduced motion). Plausible tracks page views plus a few custom events (game started, game finished with outcome, gave up, exploded, score copied). A "Give up" button under the board asks for confirmation, then ends the run: forfeited words show as 🏳️ in the share text, their answers are revealed, and the results screen shows one of a few playful, sad lines. Each finished game is saved in the browser under its date and full setup, so you can play several setups a day. The intro lists what you've played today with scores, tapping one revisits its results, and the results screen has a "Play another setup" button. Below that, "Your week" shows days played, current streak, perfect runs, and best standard time, then one row per day for the past week (and any older days played): tap a played day to revisit it, or an unplayed one to play it late. Any date can be loaded with `?date=YYYY-MM-DD`; future dates are refused. Settings live in the URL so a setup can be shared, for example `/?letters=7&difficulty=extreme` or `/?pack=animals&clock=countdown&mode=bonus`. A bare URL is always the standard game: 5 letters, 3 clues. Colour themes (Classic, Slate, Noir, Bubblegum, Citrus, Game Boy, Terminal, the very purple "I Would Die 4 u", and the obnoxious circus "Down to Clown", each with its own colour names in the legend) are picked with the button in the header and remembered in the browser. Results are saved in the browser per puzzle, so a refresh shows your score instead of letting you replay.
