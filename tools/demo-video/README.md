# tools/demo-video

The demo video, filmed from the real app while you keep using the Mac. The app runs from source on
a virtual display no one can see, every window it shows opens without activating, and a take drives
it over the DevTools protocol while ScreenCaptureKit records it. Nothing appears on your screens and
nothing takes the keyboard. A narrator reads the script, and the cut comes out in 4K.

Needs Xcode's Swift toolchain, `ffmpeg`, `edge-tts` (`uv tool install edge-tts`) and the `claude`
CLI signed in to your account: the Claude takes run real sessions on it. Takes, renders, the
compiled Swift tools and the demo instance's data dir live in `.claude/work/demo-video/`, which git
ignores.

## Once

```sh
swift tools/demo-video/mock-card.swift .claude/work/demo-video/assets/fern-screenshot.png
python3 tools/demo-video/make-projects.py
ln -s ~/Library/Keychains /Users/Shared/alex/Library/Keychains
cp -c -R ~/.code-tiles-dev .claude/work/demo-video/data
```

- `make-projects.py` builds the made-up world: a home at `/Users/Shared/alex` with small projects in
  `code/`. It sits outside the repo because the picker prints the home folder's full path. Every
  project is deleted and rebuilt on each run; `make-projects.py fern` rebuilds one alone.
- **The keychain is found through `$HOME`.** Without the link, anything that touches it (Electron's
  safe storage, Claude Code's login) raises "Keychain Not Found" with a **Reset To Defaults** button,
  which wipes your real keychain: always Cancel. With the link, the demo's Claude Code uses your own
  login. Remove it when you are done: `rm /Users/Shared/alex/Library/Keychains`.
- The data dir starts as a clone of the dev instance's. The usage meter signs in from the strip's
  Connect Claude; the wrapper writes the consent URL to `data/external-url.txt` instead of opening a
  browser.

## Filming

```sh
swiftc -O -swift-version 5 -import-objc-header tools/demo-video/VirtualDisplay.h tools/demo-video/ctdemo.swift -o .claude/work/demo-video/bin/ctdemo
.claude/work/demo-video/bin/ctdemo display 1920 1200 -3272 1147 &
zsh tools/demo-video/pipeline.sh <display-id>
```

The display prints its id. Its origin puts one corner against a corner of the built-in display, so it
sits beside nothing you look at; on another arrangement pick another corner (`ctdemo displays`).

The pipeline waits for an unlocked screen, rebuilds the projects Claude edits, launches the demo
instance on that display (or keeps the one already there), films `take-basics`, `take-claude` and
`take-links`, and renders them into `out/code-tiles.mp4`; `--name <label>` writes another file
instead, leaving earlier videos where they are. Each part is drawn on every core, so a two-minute
cut takes about three minutes at 4K, and `--draft` renders at 1080p in a quarter of that.
`pipeline.sh --render [--draft]` renders the last takes again without filming; to film one take
alone, run it (`take-claude.mjs` after `prep-claude.mjs`), then `--render`.

## The script

The narration is the `say()` lines in the takes. Each is synthesized with Microsoft's neural voices
(the stack orbit's and lumen's demos use), cached in `voice/`, shown as the caption, and waited for, so
a line's length paces what happens under it: edit a line and film again. `TTS_VOICE` (default
`en-US-AndrewMultilingualNeural`) and `TTS_RATE` (e.g. `-5%`) choose the voice. `build.mjs` warns
when a line runs into the next one, which a stretch squeezed right after it can cause. The
soundtrack, voice and the app's own buzz, is brought to YouTube's -14 LUFS.

| file | what |
|---|---|
| `demo-main.mjs`, `launch.sh` | the app from source, every window shown without activating, its sounds muted and logged |
| `ctdemo.swift` | the virtual display, the recorder (the app's windows on that display, cropped to the main one) |
| `take.mjs` | what every take shares: the recorder, the marks, the narrator, handles on the app |
| `take-*.mjs` | a take as its storyboard, driven over CDP (pages on :9334, the main process on :9335); every beat is a mark, and every wait is on what the app or Claude actually does |
| `prep-claude.mjs` | the Claude take's stage, off camera |
| `voice.mjs` | the narrator |
| `build.mjs <take>` | marks to a timeline; `--part` leaves the end card off, `--draft` renders at 1080p |
| `compose.swift` | the frames: backdrop, the window under a moving camera, cursor, captions, labels, keycaps, end card; `--range <a> <b> <out>` draws one stretch, `--stills <dir> t…` single frames |
| `render.mjs <timeline>` | one timeline on every core: a compose per stretch, joined without re-encoding |
| `mux.mjs <timeline>` | the narrator and the app's own buzz, where the app played it |
| `join.mjs <out> <parts…>` | takes cross-faded into one video |
| `layout.mjs`, `review.sh`, `still.sh` | where everything clickable is; a contact sheet of a render; the window as the recorder sees it |

## Traps

- **Quit the demo by closing its window** (`window.close()` in the shell page): the wrapper's
  `demoMenu` cannot fire a native role like Quit on macOS. Then stop the display; in the other order
  the window lands on a real screen.
- **A locked screen films nothing**: no display is active, and a CDP mouse event to a page that is
  not painting is never answered.
- **A display wake rearranges the displays**; `ctdemo place <id> x y` puts the virtual one back for
  the session.
- **macOS badges a captured window** with a purple pill over its traffic lights; compose refills
  those rows from the pixels beside them and draws the lights.
- **Sign-in codes are single-use** and expire within minutes.
- **Never ffmpeg `-shortest` with padded audio**: ffmpeg 7 cuts the file at the last sound and
  reports "No space left on device".
