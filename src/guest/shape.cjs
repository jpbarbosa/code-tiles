'use strict';

// How many times a shape appears in a bundle. The regex is rebuilt with `g` because a match
// against a non-global one answers 1 for any number of hits, which is the wrong answer in the one
// direction that matters: a patch is refused unless its shape appears EXACTLY once, and a silent
// 1 turns "this matched three places, I do not know which you meant" into "applied".
function matchCount(source, re) {
  return (source.match(new RegExp(re.source, 'g')) || []).length;
}

module.exports = { matchCount };
