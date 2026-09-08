'use strict';

// What a rung's NAME is worth. The app stores and passes a name - `subtle`, `medium`, `strong` -
// and this is the only place one becomes a number, so a window and the ground painted under it
// before that window exists cannot disagree about a colour.
//
// Each rung is 0.55 of the one above rather than an even step down: the same 0.45 is half the
// colour off 1 and nearly all of it off 0.55.
const RUNGS = { subtle: 0.3, medium: 0.55, strong: 1 };

// The project's share of the ground at `strong`, the rung of 1. The gaps the parts float in are
// the surface focus is read off, so this is the one amount that is already two before a dial
// moves it. `color-mix` is written the other way round - how much of the THEME survives - so it
// is spent as its complement.
const GROUND = { focused: 38, quiet: 15 };

const rungOf = (context) => RUNGS[context.tint] || RUNGS.medium;
const stateOf = (context) => (context.focused ? 'focused' : 'quiet');
// What is left of the theme once the project's colour has taken its share.
const survives = (share, rung) => `${Math.round((100 - share * rung) * 100) / 100}%`;
const groundShare = (context) => survives(GROUND[stateOf(context)], rungOf(context));

module.exports = { RUNGS, GROUND, rungOf, stateOf, survives, groundShare };
