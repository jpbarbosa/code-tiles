import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import seams from '../src/guest/manifest-settings.js';
import { declaredPatches, serverRoot } from '../src/guest/disk/patch.js';

// Not src/main/paths.js: that one imports electron, which a plain node test cannot resolve.
// `fileURLToPath`, not `.pathname`: a URL's path is not a path on disk anywhere a drive letter
// exists, and the difference here is a check that skips itself for the life of the platform.
const ROOT = fileURLToPath(new URL('../', import.meta.url));

const patches = declaredPatches(seams);

// The served file as it is written today, minus the 18MB either side: the shape each patch
// matches, keyed by the marker it writes, since a seam may own more than one. A patch with no
// shape here is a patch nobody can re-derive, so the loop below fails rather than skipping it.
// The bar's own arithmetic, down to the two places an id can reach the column: the list it is
// about to show, and the active item it pushes back into that list afterwards.
const BAR = 'class CompositeBar extends Widget{'
  + 'updateCompositeSwitcher(){'
  + 'const bar=this.compositeSwitcherBar;if(!bar||!this.dimension)return;'
  + 'let toShow=this.model.visibleItems.filter(c=>c.pinned||this.model.activeItem'
  + '&&this.model.activeItem.id===c.id).map(c=>c.id),'
  + 'maxVisible=toShow.length,total=toShow.length,size=0,'
  + 'limit=this.options.orientation===1?this.dimension.height:this.dimension.width;'
  + 'for(let i=0;i<toShow.length;i++){const s=this.compositeSizeInBar.get(toShow[i]);'
  + 'if(size+s>limit){maxVisible=i;break}size+=s}'
  + 'for(total>maxVisible&&(toShow=toShow.slice(0,maxVisible)),'
  + 'this.model.activeItem&&toShow.every(c=>!!this.model.activeItem&&c!==this.model.activeItem.id)'
  + '&&(size+=this.compositeSizeInBar.get(this.model.activeItem.id),'
  + 'toShow.push(this.model.activeItem.id));size>limit&&toShow.length;)toShow.pop();'
  + 'return{toShow,total,maxVisible}}}';

const SHAPES = {
  ':scope > .ct-footer': 'class Part extends Component{'
    + 'create(e,t){this.parent=e,this.titleArea=this.createTitleArea(e,t),'
    + 'this.contentArea=this.createContentArea(e,t),'
    + 'this.partLayout=new PartLayout(this.options,this.contentArea,this.layoutService),'
    + 'this.updateStyles()}}',
  'ct:dark-first': 'class WorkbenchThemeService{'
    + 'initialize(){'
    + 'let theme=ColorThemeData.fromStorageData(this.storageService);'
    + 'const initial=this.options?.initialColorTheme;'
    + 'if(!theme&&initial)theme=ColorThemeData.createUnloadedThemeForThemeType(initial.themeType);'
    + 'if(!theme){const scheme=this.settings.getPreferredColorScheme()??(isWeb?"light":"dark");'
    + 'theme=ColorThemeData.createUnloadedThemeForThemeType(scheme)}'
    + 'return this.applyTheme(theme,void 0,!0)}}',
  'ct:webview-dark': '<html lang="en" style="width: 100%; height: 100%;">',
  'ct:frame-share': 'var FLOATING_MARGIN=4,NO_MARGIN=0;'
    + 'function isHorizontal(position){return position===2||position===3}',
  'ct:frame-seam': 'function floatingGutters(layoutService,partId,window){'
    + 'return{top:sideBarUnderPanel||panelUnderEditor?FLOATING_MARGIN:'
    + 'topWindowEdge?FLOATING_MARGIN*2:NO_MARGIN,'
    + 'bottom:hasNeighbourBelow?statusBar?FLOATING_MARGIN:FLOATING_MARGIN*2:NO_MARGIN}}',
  'ct:secret-merge': 'class LocalStorageSecretStorageProvider{'
    + 'async get(key){return(await this.secretsPromise)[key]}'
    + 'async set(key,value){let all=await this.secretsPromise;'
    + 'all[key]=value,this.secretsPromise=Promise.resolve(all),this.save()}'
    + 'async delete(key){let all=await this.secretsPromise;'
    + 'delete all[key],this.secretsPromise=Promise.resolve(all),this.save()}}',
  'ct:secret-fresh': 'class LocalStorageSecretStorageProvider{'
    + 'constructor(crypto){this.crypto=crypto;this.storageKey="secrets.provider";'
    + 'this.type="persisted";this.secretsPromise=this.load()}}',
  // One shape for the chrome seam's two patches, because they are two clauses of one method and a
  // fixture that held only the first could not show that the second undoes it.
  'ct:bar-views': BAR,
  'ct:bar-active': BAR,
  'ct:no-walkthroughs': 'class GettingStartedPage extends EditorPane{'
    + 'buildGettingStartedWalkthroughsList(){'
    + 'const list=this.gettingStartedList.value=new Index({klass:"getting-started",limit:5});'
    + 'return list.setEntries(this.gettingStartedCategories),list}}',
};

// The shape above is arithmetic, so it can be RUN - which is the only way to see that the two
// chrome patches answer the same question at both doors. What a bar with five pinned views draws
// after each of them, at a height where all five would fit.
function drawn(markers, activeId) {
  let source = BAR;
  for (const { patch } of declaredPatches(seams)) {
    if (markers.includes(patch.marker)) source = source.replace(patch.find, patch.replace);
  }
  const ids = [
    'workbench.view.explorer', 'workbench.view.search', 'workbench.view.scm',
    'workbench.view.extensions', 'workbench.view.debug',
  ];
  const activeItem = activeId ? { id: activeId, pinned: true } : undefined;
  const bar = new (new Function('Widget', `return ${source}`)(class {}))();
  return Object.getPrototypeOf(bar).updateCompositeSwitcher.call({
    compositeSwitcherBar: {},
    dimension: { height: 400, width: 48 },
    options: { orientation: 1 },
    compositeSizeInBar: new Map(ids.map((id) => [id, 22])),
    model: { visibleItems: ids.map((id) => ({ id, pinned: true })), activeItem },
  });
}

const LIVED_IN = ['workbench.view.explorer', 'workbench.view.search', 'workbench.view.scm'];

test('the bar draws the views a project is worked in, and no others', () => {
  const { toShow, total } = drawn(['ct:bar-views', 'ct:bar-active'], 'workbench.view.explorer');
  assert.deepEqual(toShow, LIVED_IN);
  // The count the overflow is decided by is left whole, or there is no Additional Views button
  // for the two it dropped to appear under.
  assert.equal(total, 5);
});

test('a view in the overflow stays there while it is the one you are in', () => {
  for (const id of ['workbench.view.extensions', 'workbench.view.debug']) {
    assert.deepEqual(drawn(['ct:bar-views', 'ct:bar-active'], id).toShow, LIVED_IN);
  }
});

// Without the second patch the first one is undone for exactly one item, which is the state this
// pair replaced: Extensions took a place in the column for as long as it was open.
test('bar-views alone lets the open view back into the column', () => {
  const { toShow } = drawn(['ct:bar-views'], 'workbench.view.extensions');
  assert.deepEqual(toShow, [...LIVED_IN, 'workbench.view.extensions']);
});

test('every patch rewrites its shape once, into code that parses', () => {
  for (const { name, patch } of patches) {
    const shape = SHAPES[patch.marker];
    assert.ok(shape, `${name}: no shape to rewrite - add the one the bundle carries`);
    const hits = shape.match(new RegExp(patch.find.source, 'g')) || [];
    assert.equal(hits.length, 1, `${name}: matched ${hits.length} times in the shape it targets`);

    const patched = shape.replace(patch.find, patch.replace);
    assert.ok(patched.includes(patch.marker), `${name}: patched source carries no marker`);
    if (patch.file.endsWith('.js')) {
      assert.doesNotThrow(() => new Function(patched), `${name}: patched source does not parse`);
    }
    // Idempotence is the marker's job, and the marker has to survive its own patch.
    assert.ok(patched.includes(patch.marker) && !shape.includes(patch.marker));
    // And the patch has to ERASE the shape it matched. A replacement that re-emits its own
    // anchor leaves `find` matching forever, so nothing but the marker can tell a patched
    // bundle from an unpatched one - and the check below, against the bundle that ships,
    // stops meaning anything the moment the app has run once.
    assert.equal((patched.match(new RegExp(patch.find.source, 'g')) || []).length, 0,
      `${name}: the replacement still carries the shape it matched`);
  }
});

// The server is a dependency, so it arrives in whatever shape its installer chose, and only one
// of the three is the one this tree has ever run from. Each is built here rather than described:
// finding the root is a walk over real directories, and a described one would prove nothing.
function layout(...dirs) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-root-'));
  for (const dir of dirs) fs.mkdirSync(path.join(base, ...dir), { recursive: true });
  return base;
}

function touch(base, ...file) {
  const full = path.join(base, ...file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '');
  return full;
}

test("coder's own release: the binary two levels under the tree", () => {
  const base = layout(['lib', 'vscode', 'out']);
  assert.equal(serverRoot(touch(base, 'bin', 'code-server')), base);
});

// npm points its link at the package's entry point, so what the app spawns RESOLVES to a path
// inside the tree - deeper than the release's, and the reason counting two levels ever worked on
// macOS and Linux at all.
test('npm off Windows: the bin resolves to a path inside the tree', () => {
  const base = layout(['lib', 'vscode', 'out']);
  assert.equal(serverRoot(touch(base, 'out', 'node', 'entry.js')), base);
});

// The shape counting got wrong. There are no symlinks, so npm writes a real `.cmd` beside the
// `node_modules` that holds the tree: two levels up from it is the npm prefix's own parent.
test('npm on Windows: the shim sits beside the tree rather than inside it', () => {
  const prefix = layout(['node_modules', 'code-server', 'lib', 'vscode', 'out']);
  assert.equal(
    serverRoot(touch(prefix, 'code-server.cmd')),
    path.join(prefix, 'node_modules', 'code-server'),
  );
});

// A binary with no bundle under it is not one any patch can be written into, and saying so beats
// walking off the top of the filesystem to find out.
test('a binary with no tree under it answers with nothing', () => {
  const base = layout(['bin']);
  assert.equal(serverRoot(touch(base, 'bin', 'code-server')), null);
});

// The one check a version bump actually needs: the shape is still in the bundle that ships.
// Skipped when nothing is vendored, since the server is a dependency and not part of the tree.
const bundles = patches.map(({ patch }) => path.join(ROOT, 'vendor/code-server', patch.file));
test('the vendored bundle still has the shape', { skip: !bundles.every((file) => fs.existsSync(file)) }, () => {
  patches.forEach(({ name, patch }, index) => {
    const source = fs.readFileSync(bundles[index], 'utf8');
    const hits = source.match(new RegExp(patch.find.source, 'g')) || [];
    assert.equal(hits.length + (source.includes(patch.marker) ? 1 : 0), 1,
      `${name}: matched ${hits.length} times in the vendored bundle`);
  });
});
