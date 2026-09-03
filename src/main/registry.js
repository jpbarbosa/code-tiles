import { BrowserWindow } from 'electron';

import { PARTITION } from './paths.js';

// The other half of a profile. Its files are on the server's disk; the list of which profiles
// exist is in the BROWSER, in localStorage, in the tiles' partition - so this app has to be a
// browser to write it. A throwaway window on the server's own origin, one script, closed again.
//
// It has to happen before any tile loads. A window told to open a profile the registry does not
// know does not fall back: it tries to CREATE that profile, writes to the profile directory
// before the remote filesystem provider is registered, and renders blank. The same list is what
// stops the workbench deleting the mirror out from under itself, since it removes every
// directory no registered profile claims.
export async function seedProfileRegistry({ port, home, profiles }) {
  const stored = profiles.map((profile) => ({
    // A URI object, not the plain basename the desktop stores: the browser service runs this
    // through `dirname` and a string throws there, which drops the profile silently and lands
    // the window back on the create-and-blank path.
    //
    // No `authority`. profilesHome carries none, and the cleanup above compares locations for
    // equality - an authority-bearing URI compares unequal to every registered profile, so the
    // workbench would delete the entire mirror. It also means nothing here knows the port.
    location: { $mid: 1, scheme: 'vscode-remote', path: `${home}/${profile.location}` },
    name: profile.name,
    ...(profile.icon ? { icon: profile.icon } : {}),
    // Deliberately no useDefaultFlags: the web build ignores them, and every fallback they
    // describe has already been resolved into a real file in the profile's own directory.
  }));

  // Merge, never replace: a profile made inside code-server itself is someone's, not ours.
  const script = `(() => {
    const mine = ${JSON.stringify(stored)};
    const names = new Set(mine.map((profile) => profile.name));
    let existing = [];
    try { existing = JSON.parse(localStorage.getItem('userDataProfiles') || '[]'); } catch {}
    const merged = [...mine, ...existing.filter((profile) => profile && !names.has(profile.name))];
    localStorage.setItem('userDataProfiles', JSON.stringify(merged));
    return merged.length;
  })()`;

  const window = new BrowserWindow({
    show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
  });
  try {
    // /healthz is the server's JSON stub, so this costs a round trip rather than a workbench.
    await window.loadURL(`http://127.0.0.1:${port}/healthz`);
    return await window.webContents.executeJavaScript(script);
  } finally {
    window.destroy();
  }
}
