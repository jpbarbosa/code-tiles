'use strict';

// The Claude chat tab's icon, animated for as long as the session is: a ring that turns while
// Claude works, a dot that pulses while it waits on you, the same dot held still and breathing
// once it is done. Three states at one width, so only the motion tells them apart - the language
// the project badge's ring speaks in `identity`, said again where your eye already is.
//
// The extension picks the icon that tab wears and hands it to `panelTab.iconPath`, which is a
// still image: VS Code has no notion of an animated tab icon. So the patch points that path at
// SVGs that animate THEMSELVES, written into the version's own resources/ where iconPath reaches
// them. The obvious alternative - swapping iconPath through numbered frames on a timer - blinks
// in code-server, because every swap is a fresh URL over http decoded and painted by a workbench
// that re-renders the tab around it.
//
// Two edits, each anchored by SHAPE and required to match exactly once, since every name around
// them is minifier output. Refused rather than half-applied: the tab then keeps the extension's
// own still logo, which is what a machine that never ran this app shows. [claude-code 2.1.260]
const MARKER = '__CT_CHAT_ICON_1__';

const WORKING = 'ct-claude-working.svg';
const WAITING = 'ct-claude-waiting.svg';
const FINISHED = 'ct-claude-finished.svg';

// One hue for all three, the same #d97757 the shell's usage bar and the badge's ring wear.
const HUE = '#d97757';

// Claude's own ring - 10.2 outer, 7.14 inner on a 24px box - as three quarters of a turn. The
// resting states are a dot at that same outer radius, so nothing changes width between them.
const ARC = 'M22.200 12.000 A10.2 10.2 0 1 1 12.000 1.800 '
  + 'L12.000 4.860 A7.14 7.14 0 1 0 19.140 12.000 Z';

const svg = (title, body) => '<svg height="1em" width="1em" viewBox="0 0 24 24" '
  + `xmlns="http://www.w3.org/2000/svg"><title>Claude (${title})</title>${body}</svg>`;

const dot = (body) => `<circle cx="12" cy="12" r="10.2" fill="${HUE}">${body}</circle>`;

const fade = (values, seconds) => `<animate attributeName="fill-opacity" values="${values}" `
  + `calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" dur="${seconds}s" `
  + 'repeatCount="indefinite"/>';

const ICONS = {
  [WORKING]: svg('working', `<path d="${ARC}" fill="${HUE}" fill-rule="evenodd">`
    + '<animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" '
    + 'dur="1.8s" repeatCount="indefinite"/></path>'),
  [WAITING]: svg('needs you', dot(fade('1;0.28;1', 2.4))),
  [FINISHED]: svg('done', dot(fade('1;0.34;1', 4.8))),
};

// The extension already works out which resting icon the tab should wear - its -pending and -done
// are exactly "waiting on you" and "finished" - so the patch swaps what it settles on and never
// has to derive either state itself.
const REST = {
  'claude-logo-pending.svg': WAITING,
  'claude-logo-done.svg': FINISHED,
};

// The three-way pick of a resting icon, down to the assignment it ends with. The two aliases it
// hands over - the vscode module and node's path - are the ones the injected function needs, and
// they are named differently in every build; the backreference ties the variable the pick settles
// on to the one the assignment reads. Every identifier class is [\w$], never \w: $ is a legal
// identifier character and this minifier does use it (2.1.245 named the path alias `d$`).
const ICON_RE = /(else ([\w$]+)="claude-logo\.svg";)(this\.panelTab\.iconPath=([\w$]+)\.Uri\.file\(([\w$]+)\.join\(this\.context\.extensionPath,"resources",\2\)\))/;

// The update_session_state branch, newest spelling first. 2.1.238 rewrote it from a comma
// expression into a block that decodes the request into a local, which moved the state to read;
// 2.1.258 then grew a body between that decode and the call, which the first shape spans lazily.
// Both end at this.onSessionStateChanged, which is where the call goes.
const STATE_SHAPES = [
  { re: /([\w$]+)\.request\.type==="update_session_state"\)\{let ([\w$]+)=[\w$]+\(\1\.request\);if\(\2\)\{?[\s\S]{0,600}?this\.onSessionStateChanged/,
    state: (match) => `${match[2]}.state` },
  { re: /([\w$]+)\.request\.type==="update_session_state"\)return this\.onSessionStateChanged/,
    state: (match) => `${match[1]}.request.state` },
];

// Assigned to the instance on first use rather than declared as a class field: the class head is
// minified past recognition and this hook site is not. __ctIcon doubles as the "an animated icon
// is up" flag the resting pick reads, which is what stops a title change stamping the still logo
// over the spin - and Claude renames that tab constantly while it generates.
function inject(vscode, join) {
  return `function(st){/*${MARKER}*/var s=this;if(!s.panelTab)return;`
    + `var n=(st==="running"||st==="working")?${JSON.stringify(WORKING)}:`
    + `(st==="waiting_input"||st==="input_required")?${JSON.stringify(WAITING)}:null;`
    + 'if(n===s.__ctIcon)return;s.__ctIcon=n;'
    + `try{s.panelTab.iconPath=${vscode}.Uri.file(${join}.join(s.context.extensionPath,"resources",`
    + 'n||s.__ctRest||"claude-logo.svg"))}catch(_){}}';
}

const hits = (source, re) => (source.match(new RegExp(re.source, 'g')) || []).length;

function apply(source) {
  const icon = ICON_RE.exec(source);
  if (!icon) return { refused: 'the resting-icon pick has moved' };
  if (hits(source, ICON_RE) !== 1) return { refused: 'the resting-icon pick matches more than once' };

  const shape = STATE_SHAPES.find((candidate) => candidate.re.test(source));
  if (!shape) return { refused: 'the update_session_state branch has moved' };
  if (hits(source, shape.re) !== 1) return { refused: 'the update_session_state branch matches more than once' };

  const [, head, variable, assign, vscode, join] = icon;
  const branch = shape.re.exec(source);
  const call = `(this.__ctSpin=this.__ctSpin||${inject(vscode, join)}).call(this,${shape.state(branch)}),`;
  const rest = `${variable}=${JSON.stringify(REST)}[${variable}]||${variable}`;

  // Every replacement is a function: the anchors are minified source, and a bare $ in one would
  // be read as a $& / $' substitution.
  const patched = source
    .replace(icon[0], () => `${head}this.__ctRest=${rest};if(!this.__ctIcon)${assign}`)
    .replace(branch[0], () => branch[0].replace(/this\.onSessionStateChanged$/, () => `${call}this.onSessionStateChanged`));

  return { source: patched };
}

module.exports = {
  name: 'chat-icon',
  extension: {
    id: /^anthropic\.claude-code-/,
    file: 'extension.js',
    marker: MARKER,
    stamp: /__CT_CHAT_ICON_\d+__/,
    degrades: 'the chat tab keeps the extension\'s still logo',
    resources: Object.fromEntries(Object.entries(ICONS)
      .map(([name, body]) => [`resources/${name}`, body])),
    apply,
  },
};
