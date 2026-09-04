# Constraints

Two kinds of thing: rules that keep this tree from rotting, and facts about the platform that
will bite whatever you build on it. The facts are carried over from the previous
implementation, where each was paid for; a fact this tree has re-verified is marked
**[checked]**, and one that is inherited on trust is marked *[inherited]*. Verify before you
rely on an inherited one.

## Rules

**Take the switch before the hack.** If the editor has a setting, a command or an API for
what a seam wants, the seam uses it. A setting reflows the layout the way the product
intends; CSS that fakes the same result leaves a dead band and a measurement to maintain.
Hiding the status bar is one line of `settings`; the previous version measured and clipped it.

**One place per seam, and a name.** Every change to an editor window is one file with one
name, listed in `src/guest/manifest.js`. If a change needs a rule here and a rule there and a
tweak in the host, that is one seam whose parts happen to live in different layers, and it
stays one file with those parts declared. The vice this kills is the same selector being
patched in four places, each patch correct on the day it was written.

**If you fix a thing twice, the fix is in the wrong place.** A second workaround for the same
cause is the signal to move the first one, not to add to it. The previous tree accumulated
five shapes for one badge and four rules for one corner, each defensible alone.

**No measurement crosses the boundary.** Main sizes the views; the guest lays out inside its
own document with CSS. Neither reads the other's pixels. If a seam seems to need a number
from the host, it needs a CSS variable or a container query instead.

**No `!important` without a named cause.** The style element is last in `<head>`, so cascade
order already wins. An `!important` means something specific out-argued that, and the comment
says what.

**No settle loops.** Nothing polls the workbench until two passes agree. A seam observes what
it cares about (`MutationObserver`, a workbench event) and reacts once. A loop with a pass
count is a design that could not say what it was waiting for.

**Derive rather than store.** Name from the folder, hue from the path, order from one list.
Anything stored twice will disagree, and every stored field is a migration you owe yourself.

**A workaround dies with its cause.** Every seam that exists because of a code-server bug
names the version it was written against. `docs/ROADMAP.md` carries the bump checklist; a
bump is the moment to try deleting.

## Platform facts

**A `WebContentsView` paints above the window's page, always.** There is no z-mixing with
HTML, and a view swallows every mouse event inside its rect. Consequences, all deliberate:
anything that must appear inside a tile is a seam; the shell draws only in the gutters and the
strip; and a drag that starts inside a tile (the badge) is started by the guest and mediated
by main, never tracked by the shell over the tiles. **[checked]**

**A gutter drag rests on AppKit sending the rest of a drag to the view that took the press.**
The gutter is 8px of shell page and the tiles either side of it are native views that swallow
every press inside their own rects, so a hit area wider than the gutter is not available. That is
survivable only because a drag that STARTS on the page keeps arriving there once the pointer
crosses a tile - `mouseDragged:` and `mouseUp:` go to the window's mouse-down view, which is the
same mechanism that lets any Mac splitter be dragged outside its window. If that is ever untrue
the drag freezes the moment the pointer outruns the gutter, and the fix is for main to read
`screen.getCursorScreenPoint()` between the press and the release instead of the shell reporting
it. **[unchecked]** - the machine's display sleeps when nobody is at it, and a sleeping display
takes no synthetic cursor input, so this could not be driven in the session that wrote it. What
IS checked is everything either side: the handles land on the gutters and a real press-drag-release
through the renderer reports the right gutter and the right positions.

**Adding a `WebContentsView` takes the window's focus, and reports it late.** `addChildView`
moves the native focus to the new view, and the `focus` event on its `webContents` arrives after
the reconcile that created it, so a run of them leaves the LAST view holding the keyboard whatever
the app believes. `Tiles.sync` focuses the app's focused project again whenever it
created anything. A click into a tile is reported by the `focus` seam instead, because that same
event cannot tell a click from this steal. **[checked]**

**A press inside a webview is invisible to the workbench around it.** The Claude panel, a
preview and a notebook are each an iframe holding a SANDBOXED iframe, and a press in there
reaches the workbench's document as no press, no focus and no blur - measured by injecting a
click over the panel and counting what the `focus` seam sent: one message for a press on the
workbench, none for a press in the panel. The sandbox carries `allow-same-origin`, which is how
the editor's own wrapper reaches in, so the seam walks `contentDocument` and registers on every
document it can reach. The walk repeats on a timer because those frames are built and rebuilt as
panels open, and the press has to find the listener already there. **[checked]**

**code-server keeps the GitHub session browser-side**, in IndexedDB keyed by origin, inside
the view's session partition, not in the server's user data directory. One shared login
therefore needs the same origin *and* the same partition for every tile, which is why the port
is persisted and reused. *[inherited]*

**A window's layout is remembered per workspace, in the partition, and outranks a setting.**
`workbench.auxiliaryBar.hidden` and its siblings live in an IndexedDB database per workspace
(`vscode-web-state-db-<workspace>-<profile>`) inside the tile partition, not in the server's user
data directory and not in `workspaceStorage`. A settings entry such as
`workbench.secondarySideBar.defaultVisibility` therefore sets the default for a workspace that has
nothing stored, and a workspace opened before that setting existed keeps what it stored. A layout
switch added later needs its stale key dropped once; drop that key alone, because the GitHub
session lives in the same partition. **[checked]**

**A profile does not inherit the default profile's settings.** It reads its own
`settings.json` or it is handed an EMPTY model - `useDefaultFlags` is ignored by the web build.
So anything the app needs true in a window has to be written into every profile it mirrors, not
just into the server's own settings file, and every fallback a profile declares has to be
resolved into a real file before the window asks. **[checked]**

**A real `settings.json` is JSONC, and failing to read one is silent and total.** Comments and a
trailing comma before the last brace are both legal and both make `JSON.parse` throw; the throw
becomes an empty object, and the window comes up with none of your settings rather than with an
error. `src/guest/disk/settings.js` walks the text instead, and `test/settings.test.js` holds the
shapes that broke it. **[checked]**

**The list of which profiles exist is browser state, not a file.** It lives in `userDataProfiles`
in the tiles' partition, so it is seeded by loading the server's origin in a throwaway window
before any tile loads. Three things follow, and each one is a dead window rather than a warning:
a tile naming a profile the registry does not know tries to CREATE it, writes before the remote
filesystem provider exists, and renders blank; the stored `location` must be a URI object with
**no authority**, because a plain string throws inside `dirname` and an authority-bearing one
compares unequal to everything; and the workbench deletes every directory under `profilesHome`
that no registered profile claims, in every window, so a registry that goes missing takes the
mirror with it. **[checked]**

**Workspace trust disables extensions without saying so.** An extension declaring
`untrustedWorkspaces.supported: false` - Claude Code is one - is simply absent from a window
whose folder was never trusted, and the prompt that would fix it is a modal in a window with no
title bar to raise it from. The `trust` seam is why every tile has its extensions. **[checked]**

**Electron quits when the last window closes unless something is listening.** Not subscribing to
`window-all-closed` is not the same as ignoring it, and the profile registry's throwaway window
is opened before the real one exists - so an unsubscribed app ends during its own startup, with
no error anywhere. **[checked]**

**The workbench says which parts it is showing, on itself.** `nosidebar`, `nopanel` and
`noauxiliarybar` are classes on the workbench container, so a seam reads the layout from one
attribute and observes all three with one `MutationObserver` on `class`. There is nothing to
measure and no rect to consult. **[checked]**

**A synthetic `KeyboardEvent` drives the workbench's keybindings, from the preload's isolated
world.** The editor exposes no page-level way to run a command, so a seam that needs one
dispatches the command's own keybinding, and the event reaches the workbench's dispatcher
through the shared DOM with no `executeJavaScript` anywhere. What makes it match is the LEGACY
`keyCode`, which the workbench reads and which belongs in the CONSTRUCTOR's init member: an
expando defined on the event afterwards lands on the isolated world's own wrapper, not on the
one the page sees. Cmd+B, Cmd+J and Alt+Cmd+B were driven this way against code-server 4.135.0,
each flipping its part. **[checked]**

**Injected CSS lands before the workbench's own styles.** `webContents.insertCSS` cannot be
made to land after them, which is what forced `!important` on every rule in the previous
tree. A `<style>` element the runtime appends to `<head>` and keeps last does not have that
problem. **[checked]**

**A sheet dies with its document.** Anything applied to a document is gone after a reload or a
navigation. This is why the runtime is a preload rather than a push from the host: a preload
is present in the next document too, with no bookkeeping. **[checked]**

**Injected CSS stops at a VS Code webview's iframe boundary** (the chat panel, a Markdown
preview), and the iframe builds its own `--vscode-*` block from the theme service rather than
from the workbench DOM, so a variable rewritten outside is invisible in there twice over. The
frames are same-origin in code-server, so a seam can reach them, deliberately, by walking the
frame chain. *[inherited]*

**A webview paints a white canvas through whatever its page leaves uncovered.** The editor's own
default styles make a webview's `body` transparent, and a frame whose `color-scheme` is `normal`
paints Chromium's white base behind it. The Claude panel is where that shows: it keeps an empty
1px flex item at the left of a row body as a test sentinel, so the white reads as a column down
the panel and as a bright arc where the rounded design clips it. Nothing outside the frame
decides this - not `color-scheme` on the workbench document, not on the iframe element, not the
view's `setBackgroundColor`, none of which propagate in - so the `dark` seam walks to each
document and sets it there. **[checked]**

**The editor's own frame moves between versions.** The inset it floats its parts in was 4px on
every side in one release and flush left and top with 8px on the right in the next. Nothing
here may depend on that number: the app's gutter is its own, and the seam that neutralises the
editor's is the only place aware such a number exists. *[inherited]*

**One `--user-data-dir` is one settings file for every tile**, so a per-project difference
cannot be a setting. It has to be a seam, or a profile. *[inherited]*

**Terminals live in the server, not the window.** Reloading a window keeps its terminals and
its agent session; killing the server does not. Restarting the app for a main-process change
is therefore cheap for the window and expensive for the sessions. *[inherited]*
