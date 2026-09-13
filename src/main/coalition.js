import { execFileSync } from 'node:child_process';

import { IS_MAC, pythonCandidates } from './platform.js';
import { descendants } from './server.js';

// Every process in the coalition of whoever runs it, one "pid ppid start path" line each, start in
// microseconds. Python because only libproc knows a coalition and node cannot call it; passed as
// source because the app ships as an asar, and no interpreter reads a script out of one.
const READER = `
import ctypes, os

libproc = ctypes.CDLL('/usr/lib/libproc.dylib')
libproc.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int]
libproc.proc_listallpids.argtypes = [ctypes.c_void_p, ctypes.c_int]
libproc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]

PROC_PIDTBSDINFO = 3
# Private: sys/proc_info.h declares it only under PRIVATE. Resource id, then jetsam id - and the
# jetsam one is what LaunchServices reports as an app's coalition.
PROC_PIDCOALITIONINFO = 20

class Coalition(ctypes.Structure):
    _fields_ = [('ids', ctypes.c_uint64 * 2), ('reserved', ctypes.c_uint64 * 3)]

# struct proc_bsdinfo, 136 bytes, named only as far as the fields read.
class Process(ctypes.Structure):
    _fields_ = [
        ('head', ctypes.c_uint32 * 4), ('ppid', ctypes.c_uint32),
        ('ids', ctypes.c_uint32 * 7), ('names', ctypes.c_char * 48),
        ('counts', ctypes.c_uint32 * 5), ('nice', ctypes.c_int32),
        ('start_sec', ctypes.c_uint64), ('start_usec', ctypes.c_uint64),
    ]

def read(pid, flavor, into):
    size = ctypes.sizeof(into)
    return libproc.proc_pidinfo(pid, flavor, 0, ctypes.byref(into), size) == size

def jetsam(pid):
    coalition = Coalition()
    return coalition.ids[1] if read(pid, PROC_PIDCOALITIONINFO, coalition) else None

own = jetsam(os.getpid())
if own is not None:
    count = libproc.proc_listallpids(None, 0)
    pids = (ctypes.c_int * (count + 64))()
    count = libproc.proc_listallpids(pids, ctypes.sizeof(pids))
    path = ctypes.create_string_buffer(4096)
    for pid in pids[:count]:
        process = Process()
        if pid > 0 and jetsam(pid) == own and read(pid, PROC_PIDTBSDINFO, process):
            length = libproc.proc_pidpath(pid, path, len(path))
            where = path.raw[:max(length, 0)].decode('utf-8', 'replace')
            print(pid, process.ppid, process.start_sec * 1000000 + process.start_usec, where)
`;

// What the app's coalition holds outside the app's own tree: whatever detached from a tile. Not
// Apple's services, which join an app's coalition on its behalf, nor Electron's own helpers, whose
// crash handler detaches by design. And nothing at all when the app does not LEAD the coalition:
// started from a terminal, it joined that terminal's, and everything in it is someone else's.
export function stragglers(table, appPid) {
  const members = table.trim().split('\n').filter(Boolean).map((line) => {
    const [pid, ppid, start, ...path] = line.trim().split(' ');
    return { pid: Number(pid), ppid: Number(ppid), start: Number(start), path: path.join(' ') };
  });
  const app = members.find((member) => member.pid === appPid);
  if (!app || members.some((member) => member.start < app.start)) return [];
  const bundle = app.path.match(/^.*?\.app\//)?.[0];
  const helpers = bundle ? `${bundle}Contents/Frameworks/` : null;
  const ours = new Set([appPid, ...descendants(table, appPid)]);
  return members
    .filter(({ pid, path }) => !ours.has(pid) && !path.startsWith('/System/') && !(helpers && path.startsWith(helpers)))
    .map(({ pid }) => pid);
}

// The walk at quit takes the server's tree, and this takes what had already left it. SIGKILL for
// the walk's reason: the app is gone before a SIGTERM is sure to land, and one survivor keeps the
// bundle's Dock record - "Running in Background", and a first click spent reaping it.
export function killStragglers() {
  if (!IS_MAC) return;
  let table;
  try {
    table = execFileSync(pythonCandidates()[0], ['-c', READER], { encoding: 'utf8', timeout: 5000 });
  } catch { return; }
  const pids = stragglers(table, process.pid);
  for (const pid of pids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  if (pids.length) console.log(`[coalition] killed ${pids.join(', ')}`);
}
