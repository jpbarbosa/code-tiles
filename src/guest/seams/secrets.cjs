'use strict';

// An extension's secret survives another tile writing one of its own.
//
// code-server keeps EVERY extension secret in one localStorage blob under `secrets.provider`,
// read into memory when a window loads and rewritten whole on each write. With one window that
// is fine. With several windows on one origin - which is what this whole app is - the last
// writer wins with the snapshot it took at load, so a secret written in tile A disappears the
// moment tile B writes any secret at all. It presents as an extension bug: a theme whose
// registration keeps vanishing, an account that has to be connected again for no reason.
//
// Two edits, each anchored by SHAPE and required to hit exactly once, because every name in that
// bundle is minifier output. [code-server 4.135.0]
//
// Unpatched, a window is exactly the stock provider: correct alone, lossy beside another.
const MERGE = 'ct:secret-merge';
const FRESH = 'ct:secret-fresh';

// The write is a read-modify-write that RE-READS rather than trusting the snapshot, and the
// re-read happens inside a per-window queue so two writes in one window cannot interleave
// either. `load()` is the provider's own reader, so the auth session the page was served with is
// still merged under whatever localStorage holds.
const MERGING = `async set(k,v){await this.__ctMerge(m=>{m[k]=v})}`
  + `async delete(k){await this.__ctMerge(m=>{delete m[k]})}`
  + `__ctMerge(f){/*${MERGE}*/return this.__ctQueue=Promise.resolve(this.__ctQueue)`
  + `.catch(()=>{}).then(async()=>{let m=await this.load();f(m),`
  + `this.secretsPromise=Promise.resolve(m),await this.save()})}`;

module.exports = {
  name: 'secrets',
  patch: [{
    file: 'lib/vscode/out/vs/code/browser/workbench/workbench.js',
    marker: MERGE,
    find: /async set\(([\w$]+),([\w$]+)\)\{let ([\w$]+)=await this\.secretsPromise;\3\[\1\]=\2,this\.secretsPromise=Promise\.resolve\(\3\),this\.save\(\)\}async delete\(([\w$]+)\)\{let ([\w$]+)=await this\.secretsPromise;delete \5\[\4\],this\.secretsPromise=Promise\.resolve\(\5\),this\.save\(\)\}/,
    replace: MERGING,
  }, {
    // Merging fixes the WRITE. This is the read: a window that got a secret before another
    // window changed it would otherwise hold the old value until it reloaded, and every tile
    // here is a long-lived window. The storage event is the browser's own notice that the blob
    // moved under it, and it never fires in the window that did the writing.
    file: 'lib/vscode/out/vs/code/browser/workbench/workbench.js',
    marker: FRESH,
    find: /this\.storageKey="secrets\.provider";this\.type="persisted";this\.secretsPromise=this\.load\(\)/,
    // The marker goes INSIDE the matched text rather than after it. A patch has to erase the
    // shape it matched, or the anchor is still there afterwards and only the marker guard stands
    // between the bundle and a second listener - which is a `find` that can never be trusted to
    // say whether a bundle is patched.
    replace: `this.storageKey="secrets.provider";this.type="persisted";/*${FRESH}*/`
      + 'this.secretsPromise=this.load();try{window.addEventListener("storage",(e)=>{'
      + 'if(e.key===this.storageKey)this.secretsPromise=this.load()})}catch{}',
  }],
};
