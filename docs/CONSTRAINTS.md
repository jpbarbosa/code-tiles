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

**code-server keeps the GitHub session browser-side**, in IndexedDB keyed by origin, inside
the view's session partition, not in the server's user data directory. One shared login
therefore needs the same origin *and* the same partition for every tile, which is why the port
is persisted and reused. *[inherited]*

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

**The editor's own frame moves between versions.** The inset it floats its parts in was 4px on
every side in one release and flush left and top with 8px on the right in the next. Nothing
here may depend on that number: the app's gutter is its own, and the seam that neutralises the
editor's is the only place aware such a number exists. *[inherited]*

**One `--user-data-dir` is one settings file for every tile**, so a per-project difference
cannot be a setting. It has to be a seam, or a profile. *[inherited]*

**Terminals live in the server, not the window.** Reloading a window keeps its terminals and
its agent session; killing the server does not. Restarting the app for a main-process change
is therefore cheap for the window and expensive for the sessions. *[inherited]*
