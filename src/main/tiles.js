import { WebContentsView, shell } from 'electron';

import { PARTITION, files } from './paths.js';

// The views, and the only place that creates, moves or destroys one. Callers hand it the whole
// desired state and it reconciles; there is no create-then-place-then-focus sequence to get
// wrong in three different callers.
export class Tiles {
  #window;
  #server;
  #views = new Map();
  #contexts = new Map();

  constructor({ window, server }) {
    this.#window = window;
    this.#server = server;
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
    const signature = JSON.stringify(context);
    if (this.#contexts.get(folder) === signature) return;
    this.#contexts.set(folder, signature);
    view.webContents.send('ct:event', { type: 'context', payload: context });
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
    // argument rather than a message. Forgetting what was sent makes the next render say it again.
    view.webContents.on('did-finish-load', () => this.#contexts.delete(project.folder));

    // A link out of a project belongs in the browser. Nothing opens a second Electron window.
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    this.#views.set(project.folder, view);
    this.#window.contentView.addChildView(view);
    view.webContents.loadURL(this.#server.urlFor(project.folder, project.profile));
    return view;
  }
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
    claudeState: project.claudeState || 'idle',
    // Which parts the app wants every window showing. A part nobody has chosen for is null, and
    // the window is left with whatever layout it remembers.
    layout: project.layout || {},
  };
}
