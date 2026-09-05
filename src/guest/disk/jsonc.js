// VS Code writes JSONC, and JSON.parse accepts neither half of it: a real settings or keybindings
// file has comments AND a trailing comma before its last brace. Regexes are not enough - a `//`
// inside a value is not a comment, and a `,` inside a string is not a trailing one - so the text
// is walked once with strings copied whole, which is the only state that matters here.
//
// Getting this wrong is silent and total: the parse throws, the caller's catch hands back an
// empty model, and every profile is mirrored with none of your file in it.
export function parseJsonc(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char === '"') {
      let end = i + 1;
      while (end < raw.length && raw[end] !== '"') end += raw[end] === '\\' ? 2 : 1;
      out += raw.slice(i, end + 1);
      i = end + 1;
    } else if (char === '/' && raw[i + 1] === '/') {
      const newline = raw.indexOf('\n', i);
      i = newline < 0 ? raw.length : newline;
    } else if (char === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      i = end < 0 ? raw.length : end + 2;
    } else {
      // A comma is only trailing once its closer arrives, so it is dropped from behind.
      if (char === '}' || char === ']') out = out.replace(/,\s*$/, '');
      out += char;
      i += 1;
    }
  }
  return JSON.parse(out);
}
