import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { Activity } from '../src/main/activity.js';
import { hooksWriteInto } from '../src/main/activity-hooks.js';
import { pythonCandidates } from '../src/main/platform.js';

// A live session is one marker file, so a state is a fixture: this writes the markers a hook
// would have written and reads back what the app would have drawn.
function bench(markers = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-activity-'));
  const dir = path.join(base, 'activity');
  fs.mkdirSync(dir);
  for (const [session, record] of Object.entries(markers)) {
    fs.writeFileSync(path.join(dir, `${session}.json`), JSON.stringify({
      ts: Date.now() / 1000, transcript: '', ...record,
    }));
  }
  const activity = new Activity({
    dir,
    script: path.join(base, 'activity-hook.py'),
    settings: path.join(base, 'settings.json'),
  });
  activity.start();
  return { base, dir, activity, project: path.join(base, 'project') };
}

test('a project wears the loudest state of the sessions inside it', (t) => {
  const project = path.join(os.tmpdir(), 'x');
  for (const [name, states, expected] of [
    ['working outranks everything', ['finished', 'attention', 'working'], 'working'],
    ['a question outranks a finished turn', ['finished', 'attention'], 'attention'],
    ['a finished turn outranks an open session', ['active', 'finished'], 'finished'],
    ['an open session with nothing to say', ['active'], 'active'],
  ]) {
    const markers = Object.fromEntries(states.map((state, index) => [`s${index}`, { state, cwd: project }]));
    const { activity } = bench(markers);
    t.after(() => activity.stop());
    assert.equal(activity.states([project])[project], expected, name);
  }
});

test('a project with no session has no state at all', (t) => {
  const { activity, project } = bench({ elsewhere: { state: 'working', cwd: '/tmp/some-other-place' } });
  t.after(() => activity.stop());
  assert.deepEqual(activity.states([project]), {});
});

test('a session belongs to the deepest project that holds it', (t) => {
  const outer = path.join(os.tmpdir(), 'ct-nested');
  const inner = path.join(outer, 'api');
  const { activity } = bench({ deep: { state: 'working', cwd: path.join(inner, 'src') } });
  t.after(() => activity.stop());

  const states = activity.states([outer, inner]);
  assert.equal(states[inner], 'working');
  assert.equal(states[outer], undefined, 'a project wore the state of a session in the one nested inside it');
});

test('a marker nothing has refreshed stops being believed', (t) => {
  const hour = 60 * 60 * 1000;
  const project = path.join(os.tmpdir(), 'y');
  const { activity } = bench({
    stopped: { state: 'working', cwd: project, ts: (Date.now() - 2 * hour) / 1000 },
    idle: { state: 'active', cwd: project, ts: (Date.now() - 20 * 60 * 1000) / 1000 },
  });
  t.after(() => activity.stop());
  assert.deepEqual(activity.states([project]), {}, 'a crashed session kept a tile spinning');
});

test('focusing a project clears a finished turn but never a question', (t) => {
  const project = path.join(os.tmpdir(), 'z');
  const { activity } = bench({ one: { state: 'finished', cwd: project } });
  t.after(() => activity.stop());

  assert.equal(activity.states([project])[project], 'finished');
  activity.seen(project);
  assert.equal(activity.states([project])[project], 'active');

  const asking = bench({ one: { state: 'attention', cwd: project } });
  t.after(() => asking.activity.stop());
  asking.activity.seen(project);
  assert.equal(asking.activity.states([project])[project], 'attention', 'a question was answered by looking at it');
});

test('a turn you interrupted is over, though no hook ever said so', (t) => {
  const { base, dir, activity, project } = bench();
  t.after(() => activity.stop());
  const transcript = path.join(base, 'session.jsonl');
  const record = (text, at) => `${JSON.stringify({ type: 'user', timestamp: new Date(at).toISOString(), message: { content: [{ type: 'text', text }] } })}\n`;
  const started = Date.now();
  fs.writeFileSync(transcript, record('quoting "[Request interrupted by user]" is not one', started - 1000));
  fs.writeFileSync(path.join(dir, 'one.json'), JSON.stringify({ state: 'working', cwd: project, ts: started / 1000, transcript }));

  activity.stop();
  activity.start();
  assert.equal(activity.states([project])[project], 'working', 'a transcript that only mentions it stopped the ring');

  fs.appendFileSync(transcript, record('[Request interrupted by user]', started + 1000));
  activity.stop();
  activity.start();
  assert.equal(activity.states([project])[project], 'active', 'ESC left the ring turning');
});

test('installing the hooks keeps every hook that is not ours', (t) => {
  const { base, activity } = bench();
  t.after(() => activity.stop());
  const settings = path.join(base, 'settings.json');
  const yours = {
    permissions: { allow: ['Grep'] },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: '~/.claude/keep-awake.sh' }] }],
      PostToolUse: [{ hooks: [
        { type: 'command', command: '~/.claude/notify.sh' },
        { type: 'command', command: '/usr/bin/python3 "/an/older/checkout/activity-hook.py" working' },
      ] }],
    },
  };
  fs.writeFileSync(settings, JSON.stringify(yours, null, 2));

  const installing = new Activity({ dir: path.join(base, 'activity'), script: path.join(base, 'activity-hook.py'), settings });
  installing.start();
  t.after(() => installing.stop());

  const written = JSON.parse(fs.readFileSync(settings, 'utf8'));
  const commands = Object.values(written.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command)));
  assert.deepEqual(written.permissions, yours.permissions, 'the rest of the file did not survive');
  assert.ok(commands.includes('~/.claude/keep-awake.sh'), 'a hook of yours was dropped');
  assert.ok(commands.includes('~/.claude/notify.sh'), 'a hook of yours sharing a group with ours was dropped');
  // Matched by basename, so the entries another checkout wrote are replaced rather than joined.
  assert.ok(!commands.some((command) => command.includes('/an/older/checkout/')), 'a second live copy of our hooks');
  assert.equal(commands.filter((command) => command.includes('activity-hook.py')).length, 8);
  assert.equal(fs.readFileSync(`${settings}.ct-backup`, 'utf8'), JSON.stringify(yours, null, 2));

  const after = fs.readFileSync(settings, 'utf8');
  installing.stop();
  installing.start();
  assert.equal(fs.readFileSync(settings, 'utf8'), after, 'a second start rewrote a file that was already in sync');
});

test('a settings file that is not plain JSON is left alone', (t) => {
  const { base, activity } = bench();
  t.after(() => activity.stop());
  const settings = path.join(base, 'commented.json');
  const yours = '{\n  // yours, with a comment in it\n  "hooks": {}\n}\n';
  fs.writeFileSync(settings, yours);

  const refusing = new Activity({ dir: path.join(base, 'activity'), script: path.join(base, 'activity-hook.py'), settings });
  refusing.start();
  t.after(() => refusing.stop());
  assert.equal(fs.readFileSync(settings, 'utf8'), yours);
});

test('the hook script pins a session to the folder it started in', (t) => {
  // The same interpreter the hooks are written against, so this runs on whichever host it is on
  // rather than only on the two that keep one at a fixed place.
  const python = pythonCandidates().find((candidate) => fs.existsSync(candidate));
  if (!python) return t.skip('no python3 where this host keeps one');
  const { base, dir, activity, project } = bench();
  t.after(() => activity.stop());
  const script = path.join(base, 'activity-hook.py');
  const fire = (mode, event) => execFileSync(python, [script, mode], { input: JSON.stringify(event) });

  fire('active', { session_id: 'one', cwd: project, transcript_path: '/nowhere.jsonl' });
  // A Bash `cd` moves a session's cwd for the rest of its life; the project it belongs to does
  // not move with it.
  fire('working', { session_id: 'one', cwd: '/somewhere/else' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'one.json'), 'utf8')).cwd, project);

  fire('end', { session_id: 'one', cwd: project });
  assert.ok(!fs.existsSync(path.join(dir, 'one.json')), 'SessionEnd left the marker behind');
  // A session id is used as a filename, so it is what a hostile one would travel through.
  fire('working', { session_id: '../escaped', cwd: project });
  assert.ok(!fs.existsSync(path.join(base, 'escaped.json')));
});

// ~/.claude/settings.json is the one path this app writes outside its own data directory, so a
// second instance on its own --user-data-dir shares it with the first. Told it does not own the
// hooks, it must leave that file exactly as it found it: whichever instance started last would
// otherwise point every hook at its own script and take the other's Claude rings away silently.
// Its own fixture rather than bench(), which installs hooks of its own on the way in.
test('an instance that does not own the hooks leaves your settings alone', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-unowned-'));
  const settings = path.join(base, 'settings.json');
  const script = path.join(base, 'activity-hook.py');
  const yours = { hooks: { Stop: [{ hooks: [{ type: 'command', command: '/other/activity-hook.py end' }] }] } };
  fs.writeFileSync(settings, JSON.stringify(yours, null, 2));

  const quiet = new Activity({ dir: path.join(base, 'activity'), script, settings: null });
  quiet.start();
  t.after(() => quiet.stop());

  assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), yours, 'it rewrote a file it does not own');
  assert.ok(!fs.existsSync(`${settings}.ct-backup`), 'it backed up a file it never meant to touch');
  assert.ok(!fs.existsSync(script), 'it wrote a hook script nothing points at');
});

// The other side of the same switch, so the guard cannot be satisfied by never installing at all.
test('an instance that does own them still installs', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-owned-'));
  const settings = path.join(base, 'settings.json');
  const owner = new Activity({
    dir: path.join(base, 'activity'), script: path.join(base, 'activity-hook.py'), settings,
  });
  owner.start();
  t.after(() => owner.stop());
  assert.ok(fs.existsSync(settings), 'no settings file was written');
  assert.match(fs.readFileSync(settings, 'utf8'), /activity-hook\.py/);
});

test('a guest finds the owner\'s markers in the settings file, and writes nothing', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-owner-'));
  const file = path.join(base, 'settings.json');
  const owner = path.join(base, 'Code Tiles');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  assert.equal(hooksWriteInto(file), null, 'nothing installed is nobody to read');

  fs.writeFileSync(file, JSON.stringify({
    hooks: {
      // A hook of your own first, so the search is not just taking the first command it sees.
      SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
      Stop: [{ hooks: [{ type: 'command',
        command: `"/usr/bin/python3" ${JSON.stringify(path.join(owner, 'activity-hook.py'))} finished` }] }],
    },
  }));
  assert.equal(hooksWriteInto(file), path.join(owner, 'activity'));

  // And it reads that directory without touching it: the expired marker a sweep would drop stays.
  const dir = path.join(owner, 'activity');
  fs.mkdirSync(dir, { recursive: true });
  const stale = path.join(dir, 'old.json');
  fs.writeFileSync(stale, JSON.stringify({ state: 'active', cwd: base, ts: 0 }));
  const guest = new Activity({ dir, script: path.join(base, 'activity-hook.py'), settings: null });
  guest.start();
  t.after(() => guest.stop());
  assert.ok(fs.existsSync(stale), 'a guest never sweeps a directory it does not own');
});
