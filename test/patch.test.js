import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import seams from '../src/guest/manifest-settings.js';

// Not src/main/paths.js: that one imports electron, which a plain node test cannot resolve.
const ROOT = new URL('../', import.meta.url).pathname;

const patches = seams.filter((seam) => seam.patch);

// The bundle as it is written today, minus the 18MB either side: the shape each patch matches,
// in the source order the build emits it in. A patch with no shape here is a patch nobody can
// re-derive, so the loop below fails rather than skipping it.
const SHAPES = {
  branch: 'class Part extends Component{'
    + 'create(e,t){this.parent=e,this.titleArea=this.createTitleArea(e,t),'
    + 'this.contentArea=this.createContentArea(e,t),'
    + 'this.partLayout=new PartLayout(this.options,this.contentArea,this.layoutService),'
    + 'this.updateStyles()}}',
  dark: 'class WorkbenchThemeService{'
    + 'initialize(){'
    + 'let theme=ColorThemeData.fromStorageData(this.storageService);'
    + 'const initial=this.options?.initialColorTheme;'
    + 'if(!theme&&initial)theme=ColorThemeData.createUnloadedThemeForThemeType(initial.themeType);'
    + 'if(!theme){const scheme=this.settings.getPreferredColorScheme()??(isWeb?"light":"dark");'
    + 'theme=ColorThemeData.createUnloadedThemeForThemeType(scheme)}'
    + 'return this.applyTheme(theme,void 0,!0)}}',
  welcome: 'class GettingStartedPage extends EditorPane{'
    + 'buildGettingStartedWalkthroughsList(){'
    + 'const list=this.gettingStartedList.value=new Index({klass:"getting-started",limit:5});'
    + 'return list.setEntries(this.gettingStartedCategories),list}}',
};

test('every patch rewrites its shape once, into code that parses', () => {
  for (const { name, patch } of patches) {
    const shape = SHAPES[name];
    assert.ok(shape, `${name}: no shape to rewrite - add the one the bundle carries`);
    const hits = shape.match(new RegExp(patch.find.source, 'g')) || [];
    assert.equal(hits.length, 1, `${name}: matched ${hits.length} times in the shape it targets`);

    const patched = shape.replace(patch.find, patch.replace);
    assert.ok(patched.includes(patch.marker), `${name}: patched source carries no marker`);
    assert.doesNotThrow(() => new Function(patched), `${name}: patched source does not parse`);
    // Idempotence is the marker's job, and the marker has to survive its own patch.
    assert.ok(patched.includes(patch.marker) && !shape.includes(patch.marker));
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
