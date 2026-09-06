// Set 0 to bring every window up at once again, or raise it if a tile still comes up
// unauthorized. The default is the gap the previous tree settled on.
const GAP_MS = 1500;

const gapFromEnv = () => {
  const raw = Number(process.env.CODE_TILES_STAGGER_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : GAP_MS;
};

// Why the windows do not all load at once. Every tile is a separate `claude`, and they all read
// and write ONE login. Six brought up in the same instant put six sessions on that credential
// together, and the OAuth refreshes they fire rotate the single-use refresh token out from under
// each other - one wins, the rest come back "Remote credentials fetch failed". The CLI takes a
// cross-process lock for exactly this, and a lock only serializes arrivals already spread out.
// What is spaced is the STARTS: what follows a start is the session reaching for the credential.
export class BringUp {
  #gap;
  #now;
  #wait;
  #last = 0;
  #queue = Promise.resolve();

  constructor({ gap = gapFromEnv(), now = Date.now, wait = defaultWait } = {}) {
    this.#gap = gap;
    this.#now = now;
    this.#wait = wait;
  }

  // `first` is the tile you are looking at, which never waits behind the ones you are not. It
  // stamps the clock as it goes, so the first background window spaces off it rather than off
  // whatever the last launch left here.
  take(start, { first = false } = {}) {
    if (first || !this.#gap) {
      this.#last = this.#now();
      run(start);
      return;
    }
    this.#queue = this.#queue.then(async () => {
      // A bring-up arriving long after the last is not part of a burst, and waits for nothing.
      const since = this.#now() - this.#last;
      if (since < this.#gap) await this.#wait(this.#gap - since);
      this.#last = this.#now();
      run(start);
    });
  }
}

// A turn that threw is one window that did not open, and it is the only one: on the queue it
// would wedge every window behind it, and off the queue it would take down the render that placed
// the tile.
function run(start) {
  try { start(); } catch (error) { console.error('[bring-up]', error?.message ?? error); }
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
