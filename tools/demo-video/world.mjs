// Where the demo's made-up world lives. HOME sits outside this repo on purpose: the picker prints
// the home folder's full path, and a home that looks like one keeps the take from showing where
// it was staged. Takes, renders, the compiled tools and the demo instance's data dir go in the
// repo's ignored .claude/work.
export const REPO = new URL('../../', import.meta.url).pathname;
export const WORK = `${REPO}.claude/work/demo-video/`;
export const HOME = '/Users/Shared/alex';
export const CODE = `${HOME}/code/`;
export const ACTIVITY = `${WORK}data/activity/`;
