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

**A `patch` is for a switch that exists and cannot be reached.** Four so far. The side bar's
footer: the editor keeps the concept, sizes it and relayouts around it, and offers no way in from
the DOM. The welcome page's walkthrough list: the editor lays the empty state out properly and
reaches it only by hiding each card in turn, which is a user's choice, stored per profile and
offered back as a link a seam would have to keep fighting. And `dark`'s two, which are both a
FIRST PAINT: nothing in a document can act before the document exists. A patch is declared by the
seam that needs it - one seam may own several - matched by SHAPE rather than by any minified name,
refuses rather than shipping half-applied, and says in the seam what the seam degrades to on a
server that was never patched.

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

**A seam proposes a preference, it does not take one.** A setting the app's shape depends on is
`settings`; a setting that only repairs a web-only default is `defaults`, which loses to your own
file. Pinning `workbench.colorTheme` cost more than the theme: a theme-scoped
`workbench.colorCustomizations` block applies under its own theme and under no other, so every
colour tuned for the theme you actually use went silently dead with it.

**Derive rather than store.** Name from the folder, hue from the folder's favicon, order from one
list. Anything stored twice will disagree, and every stored field is a migration you owe yourself.

**A workaround dies with its cause.** Every seam that exists because of a code-server bug
names the version it was written against. `docs/ROADMAP.md` carries the bump checklist; a
bump is the moment to try deleting.

## Platform facts

**A `WebContentsView` paints above the window's page, always.** There is no z-mixing with
HTML, and a view swallows every mouse event inside its rect. Consequences, all deliberate:
anything that must appear inside a tile is a seam; the shell draws only in the gutters and the
strip; a drag that starts inside a tile (the badge) is reported by the guest and followed by main,
never tracked by the shell over the tiles; and devtools are opened DETACHED, since a
docked pane is part of the page and main sizes the tiles from a content area that docking does
not change. **[checked]**

**A `WebContentsView` composites transparently over the window's page.** Give it a zero-alpha
`setBackgroundColor` and every pixel its page leaves unpainted is the shell's. That is what
rounds a tile: the guest clips the workbench to a radius, and the corners it stops painting are
the shell's ground, or its glow when the tile is focused. A view that paints its own corner is a
square of opacity over that glow, and pinches the halo off at all four. **[checked]**

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
The grid's TILE drag takes the cursor route from the start, for a reason of its own: that press
lands inside a view, so any position it reported would be a guest's own pixels - a number across
the boundary, and a zoom factor to undo - where the cursor read off the OS is neither.

**`preventDefault` on a `pointerdown` suppresses the compatibility mouse events, and the menubar
opens on those.** So a seam can HOLD a press on the editor's menu button - which is where the
identity badge is drawn, and therefore where the tile's drag has to start - without the menu
opening under the hand: cancelling the pointerdown stops the `mousedown` and `mouseup` that would
have opened it. Two halves of the same fact make it usable. The `click` still fires, so nothing
can be hung on that; and the menu is given the press back by dispatching `mousedown` + `mouseup`
on the button, which a synthetic `click` alone does not do. Measured against 4.135.0 by driving
real input at the button: stock press opens it, held press does not, and the dispatched pair opens
it again. **[checked]**

**A pointer capture retargets the click that ends the press, and a render between the two cancels
it.** Both bite the same thing: a row that reorders live under the hand, which is what the strip's
chips are. Capture taken on `pointerdown` - the obvious place, since every render replaces the
chips and a captured chip is gone by the first reorder - sends the CLICK to the capturing row
instead of to the chip, so every chip in the strip silently stops focusing its project. And a
render on `pointerup` replaces the chip between its own press and its release, which is a click
that is never dispatched at all. So the capture is taken on the first `pointermove` past the
threshold, and a press that never became a drag leaves the row alone. **[checked]** - driven as a
real press-move-release with `sendInputEvent` against the shell page, counting what it called.

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
document it can reach. Those frames are built and rebuilt as panels open, so a frame is taken as
it appears - its parent announces the append, the frame announces its own navigation - with a
timer left only as the backstop. **[checked]**

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

**A hidden status bar keeps its entries alive.** `workbench.statusBar.visible: false` leaves the
part in the grid at 0x0 with its items still rendered and still updated by their extensions, and
a `click()` on one still runs its command - `status.scm.0` opened Checkout Branch/Tag from a part
with no size at all. So the branch pills MIRROR those entries rather than reading git, and the
editor keeps owning the label, the tooltip, the command, and whether they exist at all. **[checked]**

**A part's footer is real room, and only JS can ask for it.** `PartLayout` subtracts a footer's
height (32px under the modern design, 35 without it) from the content area, so a footer shortens
the pane view instead of covering it - and the panes inside are placed from JS-written heights,
which is why a stylesheet can only ever overlay them. The flag is set by `Part.setFooterArea`, and
the one setting that calls it - `workbench.activityBar.location: bottom` - moves the whole activity
bar into that footer, taking the badge's row with it. So `branch`'s patch teaches `Part.create` to
adopt a `.ct-footer` the guest puts in its parent: the editor then does the classes, the height and
the relayout, and takes the room back when the element goes. **[checked]**

**A codicon's glyph is set by the product icon theme, with `!important`.** Not by the
`.codicon-*` class a seam would think to outrank: the menu button's is
`content: var(--vscode-icon-menu-content) !important` on `.menubar.compact .toolbar-toggle-more`,
so a plain `content: ""` loses and the glyph paints on top of whatever the seam drew - a hamburger
across the badge's favicon. Any seam replacing an icon pays one `!important` for this, and says so.
The other half of the same fact: a codicon IS its `::before`, so a rule that gives one a
`content: ""` of its own - a pill behind it, say - blanks the glyph and leaves an empty slot.
Anything drawn behind a codicon goes on `::after`. A codicon class the theme has no icon for is
the same empty slot with nothing to blame: `codicon-panel-restore` resolves
`--vscode-icon-panel-restore-content` to nothing at all, so the `maximize` seam wears
`screen-normal` - the same `\eb4d` - for its lit half. Read the variable before taking a name.
**[checked]**

**The workbench's product name is a code-server FLAG, not its `product.json`.** `--app-name` is
served to the page as `nameShort` and `nameLong`, so one flag names the welcome page's heading, the
document title and the About dialog at once - while the file on disk still reads code-server, which
is what makes the name look unreachable from anywhere but a patch. Its own help text mentions only
the title bar and the login page. **[checked]**

**The workbench bundle is cached for a year, under a URL keyed on the server's commit.**
`Cache-Control: public, max-age=31536000`, no ETag, and the path carries the code-server commit -
so patching that file changes nothing for a window whose partition already fetched it, and the
patch would look like it had failed. The start that applies one clears the partition's HTTP cache,
and only that: the login and every window's layout live in the same partition's storage. **[checked]**

**The modern UI paints a part from the theme's own variable, with an `!important` of its own.**
`.monaco-workbench.floating-panels .part.sidebar` - and the same for the secondary side bar and
the panel - is painted `var(--vscode-sideBar-background) !important` by the editor's own sheet, so
tinting a part is that variable rewritten and no selector at all, and every pane header, section
header and list row inside follows because they read the same names. Three things are outside it.
The editor part, whose `.content` and `.editor-container` carry an inline literal written from JS
that only `!important` outranks. The activity bar, which is SHELL rather than a card: it wears
`--modern-ui-shell-background`, and a theme with an `activityBar.background` of its own makes it
opaque and drops it out of that ground, leaving a black column beside tinted parts - restore it by
painting the ground, never by tinting the part, because the veil is 7% of a hue and invisible over
the near-blacks a theme puts there. And the terminal, where no variable arrives at all - xterm
resolves its colours in JS at construction and paints them into an opaque canvas - so the tint goes
on top of that canvas as an overlay blended with `lighten`, a per-channel max that leaves every
pixel brighter than a 7% hue over a near-black byte-identical. Rewriting one of those variables also
has to CAPTURE it on an ancestor first: a custom property cannot reference itself on one element,
that is a cycle, and it computes to nothing. **[checked]**

**An activity bar icon is written INLINE on its label from JS**, by `CompositeBarActionViewItem`,
so no variable reaches the resting ones - only `!important` does. A codicon paints with `color`;
an extension's own icon is a mask and paints with `background-color`, so both are needed. Keep the
rule at (0,7,0): the editor's own checked and hover rules sit at (0,9,0), and out-ranking those
takes the theme's colour off the view you are in. `activityBar.inactiveForeground` still reaches
the menubar's glyph as a variable, since that one is CSS. **[checked]**

**The workbench says which parts it is showing, on itself.** `nosidebar`, `nopanel` and
`noauxiliarybar` are classes on the workbench container, so a seam reads the layout from one
attribute and observes all three with one `MutationObserver` on `class`. There is nothing to
measure and no rect to consult. **[checked]**

**A menu accelerator loses to a chord the editor binds.** The workbench's dispatcher sees the
key first and stops it, so the menu item never fires: Ctrl+Cmd+I opened Chat rather than
devtools, which is why devtools now sit on Alt+Cmd+I. Ctrl+Cmd is not a free family - the editor
also holds Ctrl+Cmd+1 and Ctrl+Cmd+9 on macOS. Check a chord in the bundle before taking it: it
is stored as a sum, `mac:{primary:N}` with CtrlCmd 2048, Shift 1024, Alt 512, WinCtrl 256,
KeyA 31 (so KeyI 39) and Digit0 21. A chord worth more than the workaround is taken back rather
than worked around: a seam's `keybindings` write `-command` into every profile's file, which the
web build honours for DEFAULT bindings, and the menu then sees the key. That is how Actual Size
holds Cmd+0, which the editor binds to Focus into Primary Side Bar. The check also comes back
NEGATIVE sometimes, which is the cheap outcome: Cmd+, is 2048|82 = 2130, and neither that number
nor that expression is anywhere in the bundle - the web build binds Preferences to nothing, so the
app's own item fires from inside a tile with no chord to take back. **[checked]**

**Chromium keeps a zoom level per HOST, and every tile is one host.** Setting it on any tile
sets it on every other, and a project opened later comes up already at it, so the app zooms as one
thing and holds no level of its own - `webContents.getZoomLevel()` on any view is the answer. A
`persist:` partition writes it to `per_host_zoom_levels` in its `Preferences`, keyed by HOST with
no port, so it also survives a restart and a server that came up on another port.
Two things follow: the shell is a `file://` origin and does not move, which is what keeps its
gutters and glow over the rects main placed the tiles from; and nothing clamps either end, so a
`Tiles.zoom` without a ceiling reaches 3834% on a held key. **[checked]**

**The terminal `<select>` is rebuilt on every change, including which terminal is ACTIVE.** Which
one is active is a `selectedIndex` write that mutates nothing, but the editor re-renders the
options around it, so a `childList` observer over the panel's title sees the switch and the
`terminals` seam needs no poll. Measured against 4.135: 22 mutations on one switch, `class` on
the terminal wrappers and a `childList` on the select. **[checked]**

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

**The theme's `--vscode-*` variables are scoped to the workbench element.** They are written
into a rule on `.monaco-workbench`, so `:root` and `body` read none of them: a rule on the
document that wants a theme colour gets nothing, silently. **[checked]**

**A webview paints a white canvas through whatever its page leaves uncovered.** The editor's own
default styles make a webview's `body` transparent, and a frame whose `color-scheme` is `normal`
paints Chromium's white base behind it. The Claude panel is where that shows: it keeps an empty
1px flex item at the left of a row body as a test sentinel, so the white reads as a column down
the panel and as a bright arc where the rounded design clips it. Nothing outside the frame
decides this - not `color-scheme` on the workbench document, not on the iframe element, not the
view's `setBackgroundColor`, none of which propagate in - so the `dark` seam walks to each
document and sets it there. That canvas is also the whole SURFACE a panel shows, not a fallback
behind one: neither the editor nor the Claude panel's own page paints a background on `body` or
its root, so a webview has to be given the theme's colour rather than only its scheme. **[checked]**

**A webview REWRITES its own document, which wipes every listener a seam put on it.** The frame's
`document.open()` keeps the Document OBJECT and replaces its `documentElement`, and the spec has it
remove every event listener registered on the document with it. Measured on the Claude panel's outer
frame: the document appears at 1098 ms of the tile's load and its `documentElement` is a different
element by 1138 ms, the object unchanged throughout. So a seam that remembers having been inside a
document - a `WeakSet` keyed by the document - registers once, 40 ms before the wipe, and is deaf
for the rest of the window's life while the sweep goes on visiting that document (41 times in one
20 s run) and finding nothing to do. The seam that hooks it says its piece on EVERY sweep instead;
the DOM drops a repeat whose type, callback and capture flag all match, so the repeat costs nothing.
Nothing announces the rewrite, and nothing about the failure is visible: the panel simply stops
claiming focus. **[checked]**

**A frame's own `load` is the FIRST moment its document can be reached, and it paints before that.**
The runtime takes a frame at its append and at its load; the append is the `about:blank` the real
document replaces, so the write dies with it, and nothing between the two announces anything. On a
warm partition the Claude panel's outer frame committed at 1089 ms of the tile's load and turned
dark at 1120 ms - 31 ms in which a fifth of the tile was Chromium's white canvas, with the workbench
around it already painted and themed. Measured at 21% of the tile's pixels over 200 luminance,
twice, and 0% with the same partition patched. So a frame that is SERVED from disk takes its scheme
from the file - `dark` patches the webview's `pre/index.html` - and the seam's walk is left to the
documents no file reaches: the inner frame, which the editor keeps hidden until it is ready and
which therefore never shows its own 145 ms. **[checked]**

**The web build's placeholder theme is LIGHT, and only the bundle can change it.** Until a
profile has a theme in storage the service falls through `fromStorageData` and the workbench's
`initialColorTheme` option to `getPreferredColorScheme() ?? (isWeb ? 'light' : 'dark')`, so a
profile's FIRST window wears light while extensions are scanned for the real theme - measured on
a fresh partition as `vs` at 773 ms and `vs-dark` at 2274 ms, with `color-scheme` already dark and
the document's own background transparent throughout. No stylesheet can act on it: the
placeholder's class is plain `vs`, the same one a light theme someone chose would carry. The cache
is discarded when the theme's name in settings changes, so a theme switch costs the blink once
more. **[checked]**

**A webview is HOISTED out of the part it belongs to**, so a tab switch neither reloads it nor
loses its state: the iframe sits in `.webview-overlay-content` two levels under `.monaco-workbench`
and `closest('.part')` on it is null. What points back is CSS anchor positioning - its holder
carries `position-anchor: --overlay-anchor-<uuid>` and the part declares that name in an inline
`anchor-name` - which is how the `tint` seam knows which surface a frame is drawn over. **[checked]**

**A webview's `--vscode-*` are written INLINE on its `documentElement`**, cleared and rewritten
there on every theme change, and an extension resolves its own names from them at `:root` - the
Claude panel's page is `--app-primary-background: var(--vscode-sideBar-background)`, declared on
`html`. So a rewrite one element down is inherited by nothing that matters, and the tint has to
land on `:root` itself with `!important`. A property cannot reference itself on one element, so
the mix is said against the inline value read back off the root, never against `var()` of the
name being rewritten - which is also what stops the second sweep tinting its own answer.
**[checked]**

**A webview's page resolves the theme one name at a time**, so the three backgrounds the
workbench rewrites are not enough in there: a part's panes read those three and follow, while the
chat input is `--app-input-background: var(--vscode-input-background)` and stays put. Every inline
`--vscode-*background*` is tinted instead, 277 of them in Dark 2026, minus the ground. What that
still cannot do is SEPARATE two surfaces a theme shipped equal - `input.background` and
`sideBar.background` are both `#191a1b` here, and `#222222` in Monokai Pro - because one veil over
both keeps them equal. A surface that has to read as lifted has to be painted, not tinted - and
the way to paint one without a selector on a background is to redefine the EXTENSION'S own
variable on that element. Its own rule then spends the new value, and so does everything that
reads the variable rather than the element: a collapsed turn's truncation fade ends on it, an
attachment pill mixes 85% of it, and a `background-color` of ours would have left both a full step
behind the block they sit in.
**[checked]**

**The editor's own frame moves between versions.** The inset it floats its parts in was 4px on
every side in one release and flush left and top with 8px on the right in the next. Nothing
here may depend on that number: the app's gutter is its own, and the `frame` seam is the only
place aware such a number exists. *[inherited]*

**That frame is kept TWICE, and the two halves are not equivalent.** A margin says where a part's
box sits; the layout service sizes the part from a constant in the bundle. Widths reflow on their
own, so left and right move with a stylesheet alone - heights do not, and halving the top margin
by itself slid the editor up and stranded its bottom at 12px. Vertical needs the patch. It is why
`frame` is the one seam that is a stylesheet AND a patch - twice over, since the gap above the
panel is vertical too: restoring it took the margin and the reservation behind it, or the panel
hung 2px past the frame's bottom. **[checked]**

**The browser runs `out/vs/code/browser/workbench/workbench.js`, not
`out/vs/workbench/workbench.web.main.internal.js`.** Both are ~18MB of the same minified code, so
a patch on the second matches its shape, reports success and is served - and never executes,
because no script tag asks for it. A patch that seems to do nothing is this before it is anything
else: check `performance.getEntriesByType('resource')` in a live window, not the file on disk.
**[checked]**

**A patch outlives every `git checkout`,** because it is written into `vendor/`, which is
gitignored and holds no tracked files. Reverting a seam leaves its patch applied, and only
`npm run fetch-code-server` or reversing the edit by hand takes it back out. `ct:dark-first` sits
in `workbench.js` today for exactly this reason, put there by a seam version that no longer names
that file. **[checked]**

**One `--user-data-dir` is one settings file for every tile**, so a per-project difference
cannot be a setting. It has to be a seam, or a profile. *[inherited]*

**Terminals live in the server, not the window.** Reloading a window keeps its terminals and
its agent session; killing the server does not. Restarting the app for a main-process change
is therefore cheap for the window and expensive for the sessions. *[inherited]*

**A mask turns with the element it masks, and a stepped repaint is cheaper than that sounds.** A
ring that is a rounded rectangle therefore cannot be spun by `transform` - the shape rotates with
the gradient and the corners wobble round - so the comet turns by an angle inside its own
`conic-gradient`, registered with `@property`. That cannot be composited, which the previous tree
measured at **24.6% of a core for two rings** and answered with a masked box holding a rotating
CHILD, a node and an observer to keep it alive. Re-measured here at `steps(36)`, four rings on
screen, two rounds: **0.5-0.6% of a core against 0.1-0.2%** for that child, and 0% for no ring at
all. The 24.6% was smooth interpolation; stepping to 20fps is what makes the pseudo-element
affordable, and 20fps is indistinguishable from 60 on a 27px shape. **[checked]**

**A tab icon is a still image, but an SVG rendered as one animates ITSELF.** VS Code has no
animated `iconPath` and no API for one, and the obvious way round it - swapping the path through
numbered frames on a timer - blinks in code-server, where every swap is a fresh URL over http
decoded and painted by a workbench that re-renders the tab around it. Desktop VS Code hides that
behind instant `file://` reads. One SVG set once has no tick to miss and animates at display rate
rather than at the timer's. *[inherited]*

**Claude Code fires no hook when you interrupt a turn.** ESC is documented as an exclusion and
there is no interrupt event, so the last marker a session wrote says `working` and goes on saying
it - for the hour its own staleness cap allows. The only trace is the transcript, where the turn
ends in a **user** record whose text is exactly `[Request interrupted by user]`, and matching
anything looser is worse than not matching: in one real 2.1 MB transcript **17 lines mention that
sentence and exactly one is the record**, the rest being a conversation about this very feature.
Anything that resumes the session writes a newer marker, so reading it un-latches on its own. The
other half of the same file: a hook's stdout is fed BACK to Claude on some events, so a hook that
prints anything is a hook that talks. **[checked]**

**A page paints itself dark; `color-scheme` is what tells Chromium so.** The shell's ground is
hand-painted `--bg`, and that says nothing to the browser: without `color-scheme: dark` the
document is a LIGHT one, and `-webkit-focus-ring-color` resolves to `rgb(229, 151, 0)` rather
than `rgb(153, 200, 255)`. So the first keyboard focus in the strip put a white-and-orange ring
round a segment - the UA's own two-tone ring, in a colour nothing in the tree owns. `:focus-visible`
is why it looks intermittent: a click focuses a button without the ring, and the ring arrives on
the next key pressed while that button still holds focus. The declaration and a mark of the app's
own are both in `shell.css`; `picker.html` and `usage.html` always had the declaration. **[checked]**
- measured by reading the colour out of a light and a dark document, and by forcing the pseudo-class
over CDP and dumping the pixels: `#e5972d` + `#ffffff` before, neither after.

**The app writes Claude Code's hooks into `~/.claude/settings.json` with the absolute path of its
own data directory**, and replaces its own entries rather than appending. So a second instance
started on a throwaway `--user-data-dir` - which is how a packaged build is tried while the source
one is up - repoints the machine's hooks at that directory, and deleting it afterwards leaves
every hook failing on every tool call. Put the path back by hand, or start the real app once.
**[checked]**
