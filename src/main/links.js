// Where a link out of a tile goes. Pure, so the whole policy is one function with a test rather
// than two arrows buried in the view that owns them.
//
// The discriminator is `noopener`, which is the opener's own statement about what it is doing.
// The editor passes it on every external link, and a window with no opener has nothing to hand a
// result back through - so it can never be an auth popup mid-handshake and belongs in the
// browser. Anything that KEEPS its opener stays in this session: the secret it is about to write
// lives on the code-server origin, in this partition, and the same flow run in the default
// browser writes it somewhere no tile can ever read.
const BROWSER = new Set(['http:', 'https:', 'mailto:']);

// Room for a sign-in page, which is the only thing this window is ever for.
const POPUP = { width: 900, height: 760, center: true };

// A popup the guest asked for. `deny` with an `external` is the browser; `deny` alone drops it.
export function routePopup({ url, features = '' }) {
  const protocol = protocolOf(url);
  // Every other scheme is dropped rather than handed to the OS, which would launch an app for it.
  if (!BROWSER.has(protocol)) return { action: 'deny' };
  // A mail link is a handoff to your mail client either way, so it never earns a window here.
  if (protocol === 'mailto:' || /(^|,)noopener(,|$)/.test(features)) {
    return { action: 'deny', external: url };
  }
  // The guest's own size wins where it named one: an extension that sizes its popup has a reason.
  const sized = /(^|,)(width|height)=/.test(features);
  return { action: 'allow', options: sized ? {} : { ...POPUP } };
}

// A tile is only ever the workbench. Anything else the top frame tries to become is a link that
// wanted a browser - and it cannot simply be let through, because a view is loaded once when it
// is created and nothing loads it again, so a tile that navigates away has no way back.
export function routeNavigation({ url, from }) {
  const current = originOf(from);
  // A tile is always on the server's origin, so a view that reports none is in a state this
  // cannot reason about and the editor keeps its own behaviour.
  if (!current) return { action: 'allow' };
  // The TARGET having no readable origin is the opposite: `about:blank`, a `data:` page and a
  // scheme the OS owns are each not the workbench, which is the only thing a tile may be.
  if (originOf(url) === current) return { action: 'allow' };
  return { action: 'block', external: BROWSER.has(protocolOf(url)) ? url : null };
}

function protocolOf(url) {
  try { return new URL(url).protocol; } catch { return null; }
}

// `origin` is "null" for an opaque one (a data: or blob: URL), which is not an origin two things
// can share - so it reads as unknown rather than as a match.
function originOf(url) {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? null : origin;
  } catch { return null; }
}
