import { WebContentsView, shell } from 'electron';

import { BringUp } from './bringup.js';
import { PARTITION, files } from './paths.js';
import { routeNavigation, routePopup } from './links.js';

// Half a level per press, as every browser's zoom steps, and a ceiling either side of actual
// size: Chromium clamps neither end, so a held key reaches 3834%.
const ZOOM_STEP = 0.5;
const ZOOM_LIMIT = 8;

// The views, and the only place that creates, moves or destroys one. Callers hand it the whole
// desired state and it reconciles; there is no create-then-place-then-focus sequence to get
// wrong in three different callers.
export class Tiles {
  #window;
  #server;
  #onFollow;
  #bringUp = new BringUp();
  #views = new Map();
  // The last context each window was told, so a document that arrives after it was sent can be
  // told again. Compared before sending, which is what keeps a render from saying it twice.
  #contexts = new Map();

  constructor({ window, server, onFollow = () => {} }) {
    this.#window = window;
    this.#server = server;
    this.#onFollow = onFollow;
  }

  sync(projects, rects) {
    const wanted = new Set(projects.map((project) => project.folder));
    for (const folder of [...this.#views.keys()]) if (!wanted.has(folder)) this.destroy(folder);

    let added = false;
    projects.forEach((project, index) => {
      added ||= !this.#views.has(project.folder);
      const view = this.#ensure(project);
      const rect = rects[index];
      view.setVisible(rect.visible);
      if (rect.visible) view.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      this.setContext(project.folder, project);
    });

    // Adding a view takes the window's focus, so the last one added would hold the keyboard
    // while the glow sits on another tile. Put it back where the app says focus is.
    if (added) this.focus(projects.find((project) => project.focused)?.folder);
  }

  focus(folder) {
    this.#views.get(folder)?.webContents.focus();
  }

  // Every tile at once, and a step of 0 is back to actual size. Chromium keeps zoom per HOST and
  // every tile is a window of the one server, so a project opened later comes up already at it
  // and the partition remembers it across launches - there is no level to store here. The shell
  // is a file:// page and stays put, which is what keeps its gutters over main's rects.
  zoom(step) {
    const contents = [...this.#views.values()]
      .map((view) => view.webContents)
      .filter((webContents) => !webContents.isDestroyed());
    if (!contents.length) return;
    const stepped = contents[0].getZoomLevel() + step * ZOOM_STEP;
    const level = step === 0 ? 0 : Math.max(-ZOOM_LIMIT, Math.min(ZOOM_LIMIT, stepped));
    for (const webContents of contents) webContents.setZoomLevel(level);
  }

  // The one thing a caller may take out of a view, and only to point devtools at it.
  contentsFor(folder) {
    const view = this.#views.get(folder);
    if (!view || view.webContents.isDestroyed()) return null;
    return view.webContents;
  }

  destroy(folder) {
    const view = this.#views.get(folder);
    if (!view) return;
    this.#views.delete(folder);
    this.#contexts.delete(folder);
    this.#window.contentView.removeChildView(view);
    view.webContents.close();
  }

  // Sent on CHANGE only. A gutter drag re-renders the desk sixty times a second and a window's
  // context is the same every time; a window told nothing new rebuilds nothing.
  setContext(folder, patch) {
    const view = this.#views.get(folder);
    if (!view || view.webContents.isDestroyed()) return;
    const context = contextOf(patch);
    if (JSON.stringify(this.#contexts.get(folder)) === JSON.stringify(context)) return;
    this.#contexts.set(folder, context);
    view.webContents.send('ct:event', { type: 'context', payload: context });
  }

  // The window stays and only the slot it answers to moves, so the next sync finds this view
  // already standing in the new folder's place rather than tearing down the tile that just
  // navigated and building another. Called by the desk once the list has agreed to the move.
  rekey(from, to) {
    const view = this.#views.get(from);
    if (!view) return;
    this.#views.delete(from);
    this.#contexts.delete(from);
    this.#views.set(to, view);
  }

  // Back onto the folder its tile holds, after a move the list refused. The window's own workbench
  // is already gone - the navigation completed before anything here heard of it - so there is
  // nothing left to spare by being gentler than a load.
  reload(project) {
    const view = project && this.#views.get(project.folder);
    if (!view || view.webContents.isDestroyed()) return;
    load(view, this.#server.urlFor(project.folder, project.profile));
  }

  // Which folder a view is the tile for. Read off the map rather than kept on the view, so a
  // window that re-points itself has one place to change.
  #folderOf(view) {
    for (const [folder, held] of this.#views) if (held === view) return folder;
    return null;
  }

  #ensure(project) {
    const existing = this.#views.get(project.folder);
    if (existing) return existing;

    const view = new WebContentsView({
      webPreferences: {
        preload: files.guestRuntime,
        partition: PARTITION,
        contextIsolation: true,
        // The preload requires the seam modules off disk, which a sandboxed one cannot do.
        sandbox: false,
        // The context is an argument rather than a message, so the first document is already
        // branded: a message would arrive after the workbench has painted.
        additionalArguments: [`--ct-context=${encodeURIComponent(JSON.stringify(contextOf(project)))}`],
      },
    });

    // The corners the card seam rounds off are left unpainted by the window, so the view has to
    // let them through: an opaque view is a square of colour over the glow the shell draws under
    // it. What shows there is the shell's own ground, which is the colour a tile would have
    // painted anyway - and the glow when the tile is focused.
    view.setBackgroundColor('#00000000');

    // A reloaded document is back on the context it was CREATED with, since that one is an
    // argument rather than a message - and a message sent while it was loading reached the
    // document it was leaving. So the last one is said again once there is something to hear it.
    view.webContents.on('did-finish-load', () => {
      const context = this.#contexts.get(this.#folderOf(view));
      if (context) view.webContents.send('ct:event', { type: 'context', payload: context });
    });

    // A tile is a WINDOW, and a window can re-point itself: File > Open Folder, or a row of the
    // welcome page's Recent list, is a navigation to another `?folder=` on this same origin, which
    // links.js allows because it is the workbench going where the workbench may go. What arrives
    // is this project standing on another folder. Unheard, the name, the hue and every Claude
    // session in this tile would go on describing the folder it left.
    view.webContents.on('did-navigate', (_event, url) => {
      const from = this.#folderOf(view);
      const to = this.#server.folderOf(url);
      if (from && to && to !== from) this.#onFollow(from, to);
    });

    // Where a link out of this project goes - src/main/links.js is the whole policy. An auth
    // popup keeps its opener and so stays HERE, on the server's origin in this partition, which
    // is where the secret it writes has to land. The child inherits this view's session and not
    // its preload, so no seam runs on a sign-in page. [Electron 44]
    view.webContents.setWindowOpenHandler((details) => {
      const routed = routePopup(details);
      if (routed.external) openExternal(routed.external);
      if (routed.action !== 'allow') return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: routed.options };
    });

    // The top frame only, by construction: a subframe raises `will-frame-navigate` instead, so
    // the editor's own webviews still navigate themselves freely.
    view.webContents.on('will-navigate', (event, url) => {
      const routed = routeNavigation({ url, from: view.webContents.getURL() });
      if (routed.action === 'allow') return;
      event.preventDefault();
      if (routed.external) openExternal(routed.external);
    });

    this.#views.set(project.folder, view);
    this.#window.contentView.addChildView(view);
    // Up a staircase rather than all at once - src/main/bringup.js is why. Placed first, so a
    // window waiting its turn is a tile in the grid rather than a hole in it.
    this.#bringUp.take(() => {
      if (view.webContents.isDestroyed()) return;
      load(view, this.#server.urlFor(project.folder, project.profile));
    }, { first: project.focused });
    return view;
  }
}

// A load superseded by another is ERR_ABORTED - a navigation someone made, not a failure - and
// `reload` races one deliberately. Matched on `errno`, because the rejection's `code` carries
// Chromium's description of the error and that arrives empty for exactly this one. [Electron 44]
const ABORTED = -3;
function load(view, url) {
  view.webContents.loadURL(url).catch((error) => {
    if (error?.errno !== ABORTED) console.error('[tile]', error?.message ?? error);
  });
}

function openExternal(url) {
  shell.openExternal(url).catch((error) => console.error('[link] openExternal:', error.message));
}

// What a window is told about itself: meaning, never measurements.
function contextOf(project) {
  return {
    folder: project.folder,
    name: project.name,
    hue: project.hue,
    // The project's own favicon, or null. Meaning, like the name and the hue: which project this
    // window is, said in the one place inside it that a glance lands on.
    icon: project.icon || null,
    focused: Boolean(project.focused),
    // How much of that hue to wear, from the app's own preference: the rung for the state this
    // window is IN, never both. A window with none takes the seam's own middle rung.
    tint: project.tint || 'medium',
    // Whether this window is one of SEVERAL tiles, which is what both of the app's own controls
    // inside it hang on: the item that widens it, and the grip that moves it among the rest.
    tiled: Boolean(project.tiled),
    // Whether it is the one holding the master cell. Says nothing while it is not tiled.
    maximized: Boolean(project.maximized),
    claudeState: project.claudeState || 'idle',
    // Which parts the app wants every window showing, as the strip's last press on each: whether,
    // and when. A part nobody has pressed for is null, and the window keeps the layout it remembers.
    layout: project.layout || {},
    // The shape of its corners, from the app's Corners preference, which the card seam draws.
    corners: project.corners || null,
  };
}
