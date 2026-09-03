import { WebContentsView, shell } from 'electron';

import { files } from './paths.js';

const PARTITION = 'persist:projects';   // one partition for every tile: one GitHub login

// The views, and the only place that creates, moves or destroys one. Callers hand it the whole
// desired state and it reconciles; there is no create-then-place-then-focus sequence to get
// wrong in three different callers.
export class Tiles {
  #window;
  #server;
  #views = new Map();

  constructor({ window, server }) {
    this.#window = window;
    this.#server = server;
  }

  sync(projects, rects) {
    const wanted = new Set(projects.map((project) => project.folder));
    for (const folder of [...this.#views.keys()]) if (!wanted.has(folder)) this.destroy(folder);

    projects.forEach((project, index) => {
      const view = this.#ensure(project);
      const rect = rects[index];
      view.setVisible(rect.visible);
      if (rect.visible) view.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      this.setContext(project.folder, project);
    });
  }

  focus(folder) {
    this.#views.get(folder)?.webContents.focus();
  }

  destroy(folder) {
    const view = this.#views.get(folder);
    if (!view) return;
    this.#views.delete(folder);
    this.#window.contentView.removeChildView(view);
    view.webContents.close();
  }

  setContext(folder, patch) {
    const view = this.#views.get(folder);
    if (!view || view.webContents.isDestroyed()) return;
    view.webContents.send('ct:event', { type: 'context', payload: contextOf(patch) });
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

    // A link out of a project belongs in the browser. Nothing opens a second Electron window.
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    this.#views.set(project.folder, view);
    this.#window.contentView.addChildView(view);
    view.webContents.loadURL(this.#server.urlFor(project.folder));
    return view;
  }
}

// What a window is told about itself: meaning, never measurements.
function contextOf(project) {
  return {
    folder: project.folder,
    name: project.name,
    hue: project.hue,
    focused: Boolean(project.focused),
    claudeState: project.claudeState || 'idle',
  };
}
