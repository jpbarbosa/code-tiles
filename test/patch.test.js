import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import seams from '../src/guest/manifest-settings.js';
import { declaredPatches } from '../src/guest/disk/patch.js';

// Not src/main/paths.js: that one imports electron, which a plain node test cannot resolve.
const ROOT = new URL('../', import.meta.url).pathname;

const patches = declaredPatches(seams);

// The served file as it is written today, minus the 18MB either side: the shape each patch
// matches, keyed by the marker it writes, since a seam may own more than one. A patch with no
// shape here is a patch nobody can re-derive, so the loop below fails rather than skipping it.
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
  'ct:secret-merge': 'class LocalStorageSecretStorageProvider{'
    + 'async get(key){return(await this.secretsPromise)[key]}'
    + 'async set(key,value){let all=await this.secretsPromise;'
    + 'all[key]=value,this.secretsPromise=Promise.resolve(all),this.save()}'
    + 'async delete(key){let all=await this.secretsPromise;'
    + 'delete all[key],this.secretsPromise=Promise.resolve(all),this.save()}}',
  'ct:secret-fresh': 'class LocalStorageSecretStorageProvider{'
    + 'constructor(crypto){this.crypto=crypto;this.storageKey="secrets.provider";'
    + 'this.type="persisted";this.secretsPromise=this.load()}}',
  'ct:no-walkthroughs': 'class GettingStartedPage extends EditorPane{'
    + 'buildGettingStartedWalkthroughsList(){'
    + 'const list=this.gettingStartedList.value=new Index({klass:"getting-started",limit:5});'
    + 'return list.setEntries(this.gettingStartedCategories),list}}',
};

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
