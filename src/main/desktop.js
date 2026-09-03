import fs from 'node:fs';
import path from 'node:path';

// Your own VS Code install, read and never written. Everything a profile is - its name, its
// files, which extensions it enables, which folder uses it - is a fact about that install, so
// this app stores none of it and re-derives all of it on every start.
//
// The one thing invented here is `Desktop`. VS Code's default profile has no extension subset
// of its own: its set IS whatever is installed, so a tile on it shows every extension every
// other profile needed. It is mirrored as an ordinary named profile instead, and the folders
// the desktop marks `__default__profile__` are pointed at that. It cannot be called `Default`,
// which is the built-in's name.
const DEFAULT_MIRROR = { location: 'desktop-default', name: 'Desktop' };
const DESKTOP_DEFAULT = '__default__profile__';

const RESOURCES = [
  { name: 'settings.json', flag: 'settings', kind: 'file' },
  { name: 'keybindings.json', flag: 'keybindings', kind: 'file' },
  { name: 'snippets', flag: 'snippets', kind: 'dir' },
];

export function readDesktop({ user, extensions }) {
  // No VS Code of your own to mirror: every tile runs on the default profile, which is exactly
  // what this app did before profiles existed.
  if (!fs.existsSync(user)) return { profiles: [], wantedIds: new Set(), profileFor: () => null };

  const state = readJson(path.join(user, 'globalStorage', 'storage.json'), {});
  const profilesHome = path.join(user, 'profiles');
  const entries = readJson(extensions, []);

  const installedIds = idsOf(entries);
  const applicationScoped = idsOf(entries.filter((entry) => entry?.metadata?.isApplicationScoped));

  const listed = Array.isArray(state.userDataProfiles) ? state.userDataProfiles : [];
  const mirrored = listed.filter((profile) => (
    profile?.name && typeof profile.location === 'string'
    // 'builtin/*' entries are VS Code's own (Agents); there is no directory to mirror.
    && !profile.location.startsWith('builtin/')
    && fs.existsSync(path.join(profilesHome, profile.location))
  ));

  const profiles = [...mirrored, { ...DEFAULT_MIRROR, useDefaultFlags: everyResource() }]
    .map((profile) => describe(profile, { user, profilesHome, installedIds, applicationScoped }));

  const byFolder = associations(state, profiles);

  return {
    profiles,
    // Every extension id any mirrored profile asks for: what the shared dir has to hold, and
    // the only honest answer to "is this one still wanted".
    wantedIds: new Set(profiles.flatMap((profile) => [...profile.extensionIds])),
    // The profile a tile should open a folder under. Anything the desktop has not placed goes
    // to the mirror rather than to the default profile, whose set cannot be curated.
    profileFor: (folder) => byFolder.get(folder) || DEFAULT_MIRROR.name,
  };
}

function describe(profile, { user, profilesHome, installedIds, applicationScoped }) {
  const flags = profile.useDefaultFlags || {};
  const home = profile.location === DEFAULT_MIRROR.location
    ? user
    : path.join(profilesHome, profile.location);

  // A profile that reads the default's copy of a file says so with a flag. The fallback is
  // resolved here rather than passed on: code-server's web build ignores the flag, looks for
  // the profile's own file, finds none and hands the window an EMPTY settings model.
  const sources = {};
  for (const { name, flag, kind } of RESOURCES) {
    const from = flags[flag] ? path.join(user, name) : path.join(home, name);
    sources[flag] = exists(from, kind) ? from : null;
  }

  // A profile with no list of its own enables whatever is installed - which is what the
  // default profile means by "its extensions", and what `useDefaultFlags.extensions` asks for.
  const own = idsOf(readJson(path.join(home, 'extensions.json'), null));
  const enabled = own && !flags.extensions ? own : new Set(installedIds);

  // Themes are application-scoped: VS Code shares them across every profile, so they are
  // deliberately absent from a profile's own list. Leave them out and the profile inherits a
  // `workbench.colorTheme` with no extension behind it, which reads as "my settings are gone".
  for (const id of applicationScoped) enabled.add(id);

  return {
    location: profile.location,
    name: profile.name,
    icon: profile.icon,
    sources,
    extensionIds: enabled,
  };
}

// folder path -> profile name. Desktop keys are file:// URIs; anything remote cannot name a
// local folder, and a profile this app does not mirror is left to the caller's fallback.
function associations(state, profiles) {
  const byLocation = new Map(profiles.map((profile) => [profile.location, profile.name]));
  const out = new Map();
  for (const [uri, location] of Object.entries(state.profileAssociations?.workspaces || {})) {
    if (!uri.startsWith('file://')) continue;
    const name = byLocation.get(location === DESKTOP_DEFAULT ? DEFAULT_MIRROR.location : location);
    if (!name) continue;
    try { out.set(decodeURIComponent(new URL(uri).pathname), name); } catch { /* skip */ }
  }
  return out;
}

function everyResource() {
  return Object.fromEntries(RESOURCES.map(({ flag }) => [flag, true]));
}

function idsOf(entries) {
  if (!Array.isArray(entries)) return null;
  return new Set(entries.map((entry) => entry?.identifier?.id).filter(Boolean));
}

function exists(target, kind) {
  try {
    const stat = fs.statSync(target);
    return kind === 'dir' ? stat.isDirectory() : stat.isFile();
  } catch {
    return false;
  }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
