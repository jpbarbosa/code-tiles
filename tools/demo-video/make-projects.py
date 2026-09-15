#!/usr/bin/env python3
"""The made-up world the demo films: a HOME with six small projects in it.

Rerunnable. Every project is deleted and rebuilt, so its git history always has the same shape.
The HOME is the demo instance's own $HOME, which is what keeps real paths, the real username and
the real Claude hooks out of every frame.
"""
import json
import os
import shutil
import subprocess
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(REPO, ".claude", "work", "demo-video")
# Outside the repo on purpose, and the same as world.mjs: the picker prints the home folder's
# full path, so it has to look like a home.
HOME = "/Users/Shared/alex"
DATA = os.path.join(WORK, "data")
CODE = os.path.join(HOME, "code")
REAL_HOME = os.path.expanduser("~")

AUTHOR = ("Alex Kim", "alex@example.com")
NOW = time.time()
# Named projects only, and no HOME setup, when given: `make-projects.py ledger` adds one to a world
# that already exists without rebuilding the rest.
ONLY = set(sys.argv[1:])


def write(root, files):
    for name, content in files.items():
        path = os.path.join(root, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as handle:
            handle.write(content.lstrip("\n"))


def git(root, *args, days_ago=0.0):
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(NOW - days_ago * 86400))
    env = dict(os.environ, GIT_AUTHOR_NAME=AUTHOR[0], GIT_AUTHOR_EMAIL=AUTHOR[1],
               GIT_COMMITTER_NAME=AUTHOR[0], GIT_COMMITTER_EMAIL=AUTHOR[1],
               GIT_AUTHOR_DATE=stamp, GIT_COMMITTER_DATE=stamp, GIT_CONFIG_GLOBAL="/dev/null")
    subprocess.run(["git", *args], cwd=root, env=env, check=True, capture_output=True)


def project(name, commits, branch="main", branch_at=None, dirty=None):
    """commits: [(days_ago, message, files)], oldest first. From index `branch_at` on, commits
    land on `branch`; `dirty` is written last and left uncommitted."""
    if ONLY and name not in ONLY:
        return
    root = os.path.join(CODE, name)
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    git(root, "init", "-q", "-b", "main")
    for index, (days_ago, message, files) in enumerate(commits):
        if index == branch_at:
            git(root, "checkout", "-q", "-b", branch, days_ago=days_ago)
        write(root, files)
        git(root, "add", "-A", days_ago=days_ago)
        git(root, "commit", "-q", "--allow-empty", "-m", message, days_ago=days_ago)
    if branch != "main" and branch_at is None:
        git(root, "checkout", "-q", "-b", branch)
    write(root, dirty or {})


# ---------------------------------------------------------------------------------------- orbit

ORBIT_ICON = r'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="18" fill="#f97316"/>
  <ellipse cx="32" cy="32" rx="29" ry="9" fill="none" stroke="#fdba74" stroke-width="4" transform="rotate(-24 32 32)"/>
</svg>
'''

ORBIT_SERVER_V1 = r'''
import Fastify from 'fastify';

import { health } from './routes/health.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(health, { prefix: '/health' });

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
'''

ORBIT_SERVER_V2 = r'''
import Fastify from 'fastify';

import { accounts } from './routes/accounts.ts';
import { health } from './routes/health.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(health, { prefix: '/health' });
await app.register(accounts, { prefix: '/v1/accounts' });

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
'''

ORBIT_SERVER_V3 = r'''
import Fastify from 'fastify';

import { rateLimit } from './rate-limit.ts';
import { accounts } from './routes/accounts.ts';
import { health } from './routes/health.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

app.addHook('onRequest', rateLimit({ limit: 120, windowMs: 60_000 }));
await app.register(health, { prefix: '/health' });
await app.register(accounts, { prefix: '/v1/accounts' });

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
'''

ORBIT_RATE_LIMIT_V1 = r'''
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  key?: (request: FastifyRequest) => string;
}

export class FixedWindow {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, { count: number; resetAt: number }>();

  constructor({ limit, windowMs }: RateLimitOptions) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  take(key: string, now = Date.now()) {
    const entry = this.#hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.#hits.set(key, { count: 1, resetAt: now + this.#windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.#limit;
  }
}

export function rateLimit(options: RateLimitOptions) {
  const window = new FixedWindow(options);
  const keyOf = options.key ?? ((request: FastifyRequest) => request.ip);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!window.take(keyOf(request))) return reply.code(429).send({ error: 'rate_limited' });
  };
}
'''

ORBIT_RATE_LIMIT_V2 = r'''
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Extra requests a quiet client may spend at once. */
  burst?: number;
  key?: (request: FastifyRequest) => string;
}

export interface Decision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

// A token bucket refills continuously, so a client that pauses earns its burst back.
export class TokenBucket {
  readonly #capacity: number;
  readonly #refillPerMs: number;
  readonly #buckets = new Map<string, { tokens: number; at: number }>();

  constructor({ limit, windowMs, burst = 0 }: RateLimitOptions) {
    this.#capacity = limit + burst;
    this.#refillPerMs = limit / windowMs;
  }

  take(key: string, now = Date.now()): Decision {
    const bucket = this.#buckets.get(key) ?? { tokens: this.#capacity, at: now };
    bucket.tokens = Math.min(this.#capacity, bucket.tokens + (now - bucket.at) * this.#refillPerMs);
    bucket.at = now;
    this.#buckets.set(key, bucket);

    if (bucket.tokens < 1) {
      const retryAfterMs = Math.ceil((1 - bucket.tokens) / this.#refillPerMs);
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
  }
}

export function rateLimit(options: RateLimitOptions) {
  const bucket = new TokenBucket(options);
  const keyOf = options.key ?? ((request: FastifyRequest) => request.ip);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const decision = bucket.take(keyOf(request));
    reply.header('RateLimit-Remaining', decision.remaining);
    if (!decision.allowed) {
      reply.header('Retry-After', Math.ceil(decision.retryAfterMs / 1000));
      return reply.code(429).send({ error: 'rate_limited', retryAfterMs: decision.retryAfterMs });
    }
  };
}
'''

ORBIT_RATE_TEST_V1 = r'''
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FixedWindow } from '../src/rate-limit.ts';

describe('FixedWindow', () => {
  it('allows up to the limit in one window', () => {
    const window = new FixedWindow({ limit: 3, windowMs: 1000 });
    assert.deepEqual([0, 1, 2, 3].map(() => window.take('a', 0)), [true, true, true, false]);
  });

  it('starts over when the window ends', () => {
    const window = new FixedWindow({ limit: 1, windowMs: 1000 });
    window.take('a', 0);
    assert.equal(window.take('a', 1000), true);
  });
});
'''

ORBIT_RATE_TEST_V2 = r'''
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TokenBucket } from '../src/rate-limit.ts';

describe('TokenBucket', () => {
  it('allows up to the limit at once', () => {
    const bucket = new TokenBucket({ limit: 3, windowMs: 1000 });
    const allowed = [0, 1, 2, 3].map(() => bucket.take('a', 0).allowed);
    assert.deepEqual(allowed, [true, true, true, false]);
  });

  it('refills continuously', () => {
    const bucket = new TokenBucket({ limit: 2, windowMs: 1000 });
    bucket.take('a', 0);
    bucket.take('a', 0);
    assert.equal(bucket.take('a', 0).allowed, false);
    assert.equal(bucket.take('a', 500).allowed, true);
  });

  it('lets a quiet client spend its burst', () => {
    const bucket = new TokenBucket({ limit: 2, windowMs: 1000, burst: 3 });
    const allowed = Array.from({ length: 6 }, () => bucket.take('a', 0).allowed);
    assert.equal(allowed.filter(Boolean).length, 5);
  });

  it('says when to retry', () => {
    const bucket = new TokenBucket({ limit: 1, windowMs: 2000 });
    bucket.take('a', 0);
    assert.equal(bucket.take('a', 0).retryAfterMs, 2000);
  });

  it('keeps clients apart', () => {
    const bucket = new TokenBucket({ limit: 1, windowMs: 1000 });
    assert.equal(bucket.take('a', 0).allowed, true);
    assert.equal(bucket.take('b', 0).allowed, true);
  });
});
'''

ORBIT_README_V1 = r'''
# orbit

Accounts and billing API.

## Development

    npm install
    npm run dev

The server listens on `PORT`, 4000 by default. `npm test` runs the unit tests.
'''

ORBIT_README_V2 = ORBIT_README_V1 + r'''
## Rate limits

Every client gets 120 requests a minute, plus a burst of 30 that it earns back by staying
quiet. A limited request answers `429` with a `Retry-After` header.
'''

project("orbit", branch="feat/rate-limits", branch_at=3, commits=[
    (12.2, "Scaffold the API", {
        "package.json": json.dumps({
            "name": "orbit", "version": "0.8.2", "description": "Accounts and billing API",
            "private": True, "type": "module",
            "scripts": {"dev": "node --watch src/server.ts", "test": "node --test test/*.test.ts",
                        "typecheck": "tsc --noEmit"},
            "dependencies": {"fastify": "^5.2.1", "zod": "^3.24.1"},
            "devDependencies": {"@types/node": "^24.0.0", "typescript": "^5.8.2"},
        }, indent=2) + "\n",
        "tsconfig.json": json.dumps({"compilerOptions": {
            "target": "es2024", "module": "nodenext", "strict": True, "noEmit": True,
            "allowImportingTsExtensions": True, "verbatimModuleSyntax": True}}, indent=2) + "\n",
        ".gitignore": "node_modules/\ndist/\n.env\n",
        "assets/icon.svg": ORBIT_ICON,
        "README.md": ORBIT_README_V1,
        "src/server.ts": ORBIT_SERVER_V1,
        "src/routes/health.ts": r'''
import type { FastifyPluginAsync } from 'fastify';

export const health: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ status: 'ok', uptime: Math.round(process.uptime()) }));
};
''',
    }),
    (9.1, "Add accounts routes with validation", {
        "src/server.ts": ORBIT_SERVER_V2,
        "src/routes/accounts.ts": r'''
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const Account = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  plan: z.enum(['free', 'team', 'business']).default('free'),
});

export const accounts: FastifyPluginAsync = async (app) => {
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await app.db.accounts.find(id);
    return account ?? reply.code(404).send({ error: 'not_found' });
  });

  app.post('/', async (request, reply) => {
    const parsed = Account.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: 'invalid', issues: parsed.error.issues });
    }
    const account = await app.db.accounts.create(parsed.data);
    return reply.code(201).send(account);
  });
};
''',
    }),
    (6.3, "Add money helpers", {
        "src/money.ts": r'''
export function formatCents(cents: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

// The remainder goes to the first parts, so the pieces always add back up.
export function splitEvenly(cents: number, parts: number): number[] {
  const base = Math.floor(cents / parts);
  const extra = cents - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
}
''',
        "test/money.test.ts": r'''
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatCents, splitEvenly } from '../src/money.ts';

describe('money', () => {
  it('formats cents as currency', () => {
    assert.equal(formatCents(123456), '$1,234.56');
  });

  it('splits without losing a cent', () => {
    assert.deepEqual(splitEvenly(1000, 3), [334, 333, 333]);
  });

  it('splits zero', () => {
    assert.deepEqual(splitEvenly(0, 4), [0, 0, 0, 0]);
  });
});
''',
    }),
    (1.2, "Add a fixed-window rate limiter", {
        "src/server.ts": ORBIT_SERVER_V3,
        "src/rate-limit.ts": ORBIT_RATE_LIMIT_V1,
        "test/rate-limit.test.ts": ORBIT_RATE_TEST_V1,
    }),
], dirty={
    "src/rate-limit.ts": ORBIT_RATE_LIMIT_V2,
    "test/rate-limit.test.ts": ORBIT_RATE_TEST_V2,
    "README.md": ORBIT_README_V2,
})

# ----------------------------------------------------------------------------------------- fern

FERN_ICON = r'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M54 8C28 8 10 22 10 42c0 6 2 10 4 14 4-14 14-26 28-32-12 8-20 18-24 32 30 2 40-24 36-48z" fill="#22c55e"/>
</svg>
'''

FERN_CARD_V1 = r'''
import type { Plant } from '../plants';
import { useWatering } from '../hooks/useWatering';

interface Props {
  plant: Plant;
  onWater: () => void;
}

export function PlantCard({ plant, onWater }: Props) {
  const { due, label } = useWatering(plant);

  return (
    <article className="card">
      <img src={plant.photo} alt="" loading="lazy" />
      <div>
        <h2>{plant.name}</h2>
        <p className="species">{plant.species}</p>
        <p className="next">{label}</p>
      </div>
      <button onClick={onWater} disabled={!due}>
        Water
      </button>
    </article>
  );
}
'''

FERN_CARD_V2 = r'''
import type { Plant } from '../plants';
import { useWatering } from '../hooks/useWatering';

interface Props {
  plant: Plant;
  onWater: () => void;
}

export function PlantCard({ plant, onWater }: Props) {
  const { due, overdue, label } = useWatering(plant);

  return (
    <article className={overdue ? 'card overdue' : due ? 'card due' : 'card'}>
      <img src={plant.photo} alt="" loading="lazy" />
      <div>
        <h2>{plant.name}</h2>
        <p className="species">{plant.species}</p>
        <p className="next" role={overdue ? 'alert' : undefined}>
          {label}
        </p>
      </div>
      <button onClick={onWater} disabled={!due} aria-label={`Water ${plant.name}`}>
        Water
      </button>
    </article>
  );
}
'''

FERN_HOOK_V1 = r'''
import { useMemo } from 'react';

import type { Plant } from '../plants';

const DAY = 86_400_000;

export function useWatering(plant: Plant, now = Date.now()) {
  return useMemo(() => {
    const next = Date.parse(plant.wateredAt) + plant.everyDays * DAY;
    const days = Math.ceil((next - now) / DAY);
    if (days <= 0) return { due: true, label: days === 0 ? 'Water today' : `${-days} days overdue` };
    return { due: false, label: days === 1 ? 'Tomorrow' : `In ${days} days` };
  }, [plant.wateredAt, plant.everyDays, now]);
}
'''

FERN_HOOK_V2 = r'''
import { useMemo } from 'react';

import type { Plant } from '../plants';

const DAY = 86_400_000;

export function useWatering(plant: Plant, now = Date.now()) {
  return useMemo(() => {
    const next = Date.parse(plant.wateredAt) + plant.everyDays * DAY;
    const days = Math.ceil((next - now) / DAY);
    if (days < 0) return { due: true, overdue: true, label: `${-days} days overdue` };
    if (days === 0) return { due: true, overdue: false, label: 'Water today' };
    return { due: false, overdue: false, label: days === 1 ? 'Tomorrow' : `In ${days} days` };
  }, [plant.wateredAt, plant.everyDays, now]);
}
'''

project("fern", commits=[
    (21.0, "Create the Vite app", {
        "package.json": json.dumps({
            "name": "fern", "private": True, "version": "1.4.0", "type": "module",
            "scripts": {"dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview"},
            "dependencies": {"react": "^19.1.0", "react-dom": "^19.1.0"},
            "devDependencies": {"@vitejs/plugin-react": "^4.4.1", "typescript": "^5.8.2", "vite": "^6.3.0"},
        }, indent=2) + "\n",
        ".gitignore": "node_modules/\ndist/\n",
        "public/favicon.svg": FERN_ICON,
        "index.html": r'''
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fern</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
''',
        "src/main.tsx": r'''
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
''',
        "README.md": "# Fern\n\nKeeps your houseplants alive: who needs water, and when.\n",
    }),
    (14.5, "Plant list and watering schedule", {
        "src/plants.ts": r'''
export interface Plant {
  id: string;
  name: string;
  species: string;
  everyDays: number;
  wateredAt: string;
  photo: string;
}

export const plants: Plant[] = [
  { id: 'monstera', name: 'Monty', species: 'Monstera deliciosa', everyDays: 7, wateredAt: '2026-09-09', photo: '/plants/monstera.jpg' },
  { id: 'pothos', name: 'Goldie', species: 'Epipremnum aureum', everyDays: 5, wateredAt: '2026-09-12', photo: '/plants/pothos.jpg' },
  { id: 'fern', name: 'Boston', species: 'Nephrolepis exaltata', everyDays: 3, wateredAt: '2026-09-13', photo: '/plants/fern.jpg' },
  { id: 'cactus', name: 'Spike', species: 'Echinopsis', everyDays: 21, wateredAt: '2026-08-30', photo: '/plants/cactus.jpg' },
];
''',
        "src/hooks/useWatering.ts": FERN_HOOK_V1,
        "src/components/PlantCard.tsx": FERN_CARD_V1,
        "src/App.tsx": r'''
import { useMemo, useState } from 'react';

import { PlantCard } from './components/PlantCard';
import { plants as seed, type Plant } from './plants';

const DAY = 86_400_000;
const thirsty = (plant: Plant) => Date.now() - Date.parse(plant.wateredAt) >= plant.everyDays * DAY;

export function App() {
  const [plants, setPlants] = useState<Plant[]>(seed);
  const [filter, setFilter] = useState<'all' | 'thirsty'>('all');

  const shown = useMemo(() => (filter === 'thirsty' ? plants.filter(thirsty) : plants), [plants, filter]);

  const water = (id: string) =>
    setPlants((current) =>
      current.map((plant) => (plant.id === id ? { ...plant, wateredAt: new Date().toISOString() } : plant)),
    );

  return (
    <main className="app">
      <header>
        <h1>Fern</h1>
        <nav>
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          <button aria-pressed={filter === 'thirsty'} onClick={() => setFilter('thirsty')}>Thirsty</button>
        </nav>
      </header>
      <section className="grid">
        {shown.map((plant) => (
          <PlantCard key={plant.id} plant={plant} onWater={() => water(plant.id)} />
        ))}
      </section>
    </main>
  );
}
''',
        "src/styles.css": r'''
:root {
  --leaf: #22c55e;
  --soil: #3f2a1e;
  font-family: system-ui, sans-serif;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #fff;

  &.due {
    outline: 2px solid var(--leaf);
  }
}
''',
    }),
    (4.0, "Filter for thirsty plants", {}),
], dirty={
    "src/components/PlantCard.tsx": FERN_CARD_V2,
    "src/hooks/useWatering.ts": FERN_HOOK_V2,
})

# ------------------------------------------------------------------------------------- tidepool

TIDEPOOL_ICON = r'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0ea5e9"/>
  <path d="M8 28c6-6 10-6 16 0s10 6 16 0 10-6 16 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <path d="M8 42c6-6 10-6 16 0s10 6 16 0 10-6 16 0" fill="none" stroke="#e0f2fe" stroke-width="5" stroke-linecap="round"/>
</svg>
'''

TIDEPOOL_INGEST_V1 = r'''
"""Pulls readings from the public gauge API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import polars as pl

from .stations import Station

API = "https://api.tides.example.org/v2/readings"


async def fetch(client: httpx.AsyncClient, station: Station, hours: int = 48) -> pl.DataFrame:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    response = await client.get(API, params={"station": station.id, "since": since.isoformat()})
    response.raise_for_status()
    rows = response.json()["readings"]
    return pl.DataFrame(
        {
            "station": [station.id] * len(rows),
            "observed_at": [datetime.fromisoformat(row["t"]) for row in rows],
            "level_m": [float(row["v"]) for row in rows],
        }
    )
'''

TIDEPOOL_INGEST_V2 = r'''
"""Pulls readings from the public gauge API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import polars as pl

from .stations import Station

API = "https://api.tides.example.org/v2/readings"


async def fetch(client: httpx.AsyncClient, station: Station, hours: int = 48) -> pl.DataFrame:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    response = await client.get(API, params={"station": station.id, "since": since.isoformat()})
    response.raise_for_status()
    rows = response.json()["readings"]
    # A gauge that is down reports null rather than skipping the sample, so a gap stays a gap.
    return pl.DataFrame(
        {
            "station": [station.id] * len(rows),
            "observed_at": [datetime.fromisoformat(row["t"]) for row in rows],
            "level_m": [None if row["v"] is None else float(row["v"]) for row in rows],
        },
        schema_overrides={"level_m": pl.Float64},
    )
'''

project("tidepool", branch="fix/null-readings", branch_at=3, commits=[
    (30.0, "Package skeleton", {
        "pyproject.toml": r'''
[project]
name = "tidepool"
version = "0.3.0"
description = "Tide gauge ingestion and cleanup"
requires-python = ">=3.12"
dependencies = ["httpx>=0.28", "polars>=1.20"]

[project.optional-dependencies]
dev = ["pytest>=8.3", "ruff>=0.9"]

[tool.ruff]
line-length = 100
''',
        ".gitignore": "__pycache__/\n.venv/\n*.parquet\n",
        "assets/icon.svg": TIDEPOOL_ICON,
        "README.md": "# tidepool\n\nIngests tide gauge readings and cleans them for analysis.\n",
        "tidepool/__init__.py": '__version__ = "0.3.0"\n',
        "tidepool/stations.py": r'''
from dataclasses import dataclass


@dataclass(frozen=True)
class Station:
    id: str
    name: str
    lat: float
    lon: float


STATIONS = [
    Station("9414290", "San Francisco", 37.8063, -122.4659),
    Station("8518750", "The Battery", 40.7006, -74.0142),
    Station("8443970", "Boston", 42.3548, -71.0534),
    Station("9447130", "Seattle", 47.6026, -122.3393),
]
''',
    }),
    (18.0, "Fetch readings per station", {"tidepool/ingest.py": TIDEPOOL_INGEST_V1}),
    (11.0, "Cleanup and daily ranges", {
        "tidepool/transform.py": r'''
"""Cleanup for raw tide gauge readings."""

from __future__ import annotations

import polars as pl

SENTINELS = (-999.0, 9999.0)


def clean(readings: pl.DataFrame) -> pl.DataFrame:
    """Drop sensor sentinels and duplicate timestamps, then sort by time."""
    return (
        readings.filter(~pl.col("level_m").is_in(SENTINELS))
        .unique(subset=["station", "observed_at"], keep="last")
        .sort("observed_at")
    )


def fill_gaps(readings: pl.DataFrame, every: str = "6m") -> pl.DataFrame:
    """Interpolate short gaps between samples, station by station."""
    return (
        readings.upsample(time_column="observed_at", every=every, group_by="station")
        .with_columns(pl.col("level_m").interpolate().over("station"))
        .with_columns(pl.col("station").forward_fill())
    )


def daily_range(readings: pl.DataFrame) -> pl.DataFrame:
    return (
        readings.group_by("station", pl.col("observed_at").dt.date().alias("day"))
        .agg(pl.col("level_m").max().alias("high_m"), pl.col("level_m").min().alias("low_m"))
        .with_columns((pl.col("high_m") - pl.col("low_m")).alias("range_m"))
        .sort("station", "day")
    )
''',
        "tests/test_transform.py": r'''
from datetime import datetime

import polars as pl

from tidepool.transform import clean, daily_range


def frame(levels):
    return pl.DataFrame(
        {
            "station": ["9414290"] * len(levels),
            "observed_at": [datetime(2026, 9, 1, hour) for hour in range(len(levels))],
            "level_m": levels,
        }
    )


def test_clean_drops_sentinels():
    assert clean(frame([1.2, -999.0, 1.4]))["level_m"].to_list() == [1.2, 1.4]


def test_daily_range():
    assert daily_range(frame([0.4, 1.9, 1.1]))["range_m"].round(2).to_list() == [1.5]
''',
    }),
    (2.0, "Reproduce the crash on a gauge outage", {
        "tests/test_ingest.py": r'''
import polars as pl

from tidepool.transform import clean


def test_outage_rows_survive_cleanup():
    readings = pl.DataFrame({"station": ["9414290"] * 3, "observed_at": [1, 2, 3], "level_m": [1.0, None, 1.2]})
    assert clean(readings).height == 3
''',
    }),
], dirty={"tidepool/ingest.py": TIDEPOOL_INGEST_V2})

# ---------------------------------------------------------------------------------------- atlas

ATLAS_ICON = r'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#8b5cf6"/>
  <path d="M32 10l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="#fff"/>
</svg>
'''

ATLAS_START_V1 = r'''
---
title: Getting started
description: Make your first request to the Orbit API in five minutes.
---

Orbit is a REST API for accounts and billing. Every request is authenticated with a key
you create in the dashboard.

## Create a key

1. Open **Settings > API keys**.
2. Choose **New key**, name it, and copy the secret. It is shown once.

## Make a request

```bash
curl https://api.orbit.example.com/v1/accounts/acc_42 \
  -H "Authorization: Bearer $ORBIT_KEY"
```

A successful call answers `200` with the account as JSON.
'''

ATLAS_START_V2 = ATLAS_START_V1 + r'''
## Rate limits

Each key may make 120 requests a minute, and a key that has been quiet can spend a burst of
30 more at once. Past that, a request answers `429` with a `Retry-After` header saying how
many seconds to wait.
'''

project("atlas", branch="docs/v2", branch_at=2, commits=[
    (40.0, "Starlight docs site", {
        "package.json": json.dumps({
            "name": "atlas", "type": "module", "version": "2.0.0-beta.3", "private": True,
            "scripts": {"dev": "astro dev", "build": "astro build", "preview": "astro preview"},
            "dependencies": {"@astrojs/starlight": "^0.34.0", "astro": "^5.7.0"},
        }, indent=2) + "\n",
        ".gitignore": "node_modules/\ndist/\n.astro/\n",
        "public/favicon.svg": ATLAS_ICON,
        "astro.config.mjs": r'''
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.orbit.example.com',
  integrations: [
    starlight({
      title: 'Orbit Docs',
      logo: { src: './public/favicon.svg' },
      sidebar: [
        { label: 'Start here', items: ['getting-started', 'authentication'] },
        { label: 'Guides', autogenerate: { directory: 'guides' } },
        { label: 'Reference', autogenerate: { directory: 'reference' } },
      ],
    }),
  ],
});
''',
        "README.md": "# atlas\n\nThe Orbit documentation site, built with Starlight.\n",
    }),
    (20.0, "Getting started and authentication", {
        "src/content/docs/getting-started.md": ATLAS_START_V1,
        "src/content/docs/authentication.md": r'''
---
title: Authentication
---

Send your key as a bearer token. Keys are scoped to one workspace and can be revoked at
any time from **Settings > API keys**.
''',
    }),
    (3.0, "Deploy guide for v2", {
        "src/content/docs/guides/deploy.md": r'''
---
title: Deploying
---

Orbit v2 runs as a single container. Set `DATABASE_URL` and `PORT`, then start it with
`node src/server.ts`.
''',
    }),
], dirty={"src/content/docs/getting-started.md": ATLAS_START_V2})

# ---------------------------------------------------------------------------------------- quill

QUILL_ICON = r'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#f43f5e"/>
  <path d="M46 12C28 14 18 26 18 44l-4 8 8-4c16 0 26-12 24-36z" fill="#fff"/>
</svg>
'''

project("quill", commits=[
    (25.0, "Draft service", {
        "go.mod": "module example.com/quill\n\ngo 1.25\n",
        "public/favicon.svg": QUILL_ICON,
        "README.md": "# quill\n\nA small service that autosaves drafts.\n",
        "main.go": r'''
package main

import (
	"log"
	"net/http"

	"example.com/quill/internal/draft"
)

func main() {
	store := draft.NewStore()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /drafts/{id}", store.Get)
	mux.HandleFunc("PUT /drafts/{id}", store.Put)
	mux.Handle("/", http.FileServer(http.Dir("public")))
	log.Fatal(http.ListenAndServe(":8090", mux))
}
''',
        "internal/draft/draft.go": r'''
package draft

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type Draft struct {
	ID      string    `json:"id"`
	Body    string    `json:"body"`
	SavedAt time.Time `json:"savedAt"`
}

type Store struct {
	mu     sync.RWMutex
	drafts map[string]Draft
}

func NewStore() *Store { return &Store{drafts: map[string]Draft{}} }

func (s *Store) Get(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.drafts[r.PathValue("id")]
	if !ok {
		http.NotFound(w, r)
		return
	}
	json.NewEncoder(w).Encode(d)
}

func (s *Store) Put(w http.ResponseWriter, r *http.Request) {
	var d Draft
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	d.ID, d.SavedAt = r.PathValue("id"), time.Now()
	s.mu.Lock()
	s.drafts[d.ID] = d
	s.mu.Unlock()
	json.NewEncoder(w).Encode(d)
}
''',
    }),
])

# ---------------------------------------------------------------------------------------- lumen

LUMEN_ICON = r'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="13" fill="#facc15"/>
  <path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6" stroke="#facc15" stroke-width="5" stroke-linecap="round"/>
</svg>
'''

project("lumen", commits=[
    (60.0, "Render Markdown to the terminal", {
        "Cargo.toml": r'''
[package]
name = "lumen"
version = "0.5.1"
edition = "2024"
description = "Render Markdown to the terminal, with themes"

[dependencies]
anyhow = "1"
clap = { version = "4", features = ["derive"] }
pulldown-cmark = "0.13"
''',
        ".gitignore": "/target\n",
        "assets/icon.svg": LUMEN_ICON,
        "README.md": "# lumen\n\n`lumen README.md` renders Markdown in your terminal.\n",
        "src/main.rs": r'''
use std::{fs, io::Read, path::PathBuf};

use anyhow::Context;
use clap::Parser;

mod render;
mod theme;

/// Render Markdown to the terminal.
#[derive(Parser)]
#[command(version, about)]
struct Args {
    /// File to render; reads stdin when absent.
    file: Option<PathBuf>,
    /// Colour theme.
    #[arg(long, default_value = "dusk")]
    theme: String,
    /// Wrap at this many columns.
    #[arg(long, default_value_t = 88)]
    width: usize,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let source = match &args.file {
        Some(path) => fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?,
        None => {
            let mut text = String::new();
            std::io::stdin().read_to_string(&mut text)?;
            text
        }
    };
    let theme = theme::by_name(&args.theme).with_context(|| format!("no theme called {}", args.theme))?;
    print!("{}", render::render(&source, &theme, args.width));
    Ok(())
}
''',
        "src/theme.rs": r'''
pub struct Theme {
    pub heading: &'static str,
    pub emphasis: &'static str,
    pub code: &'static str,
}

pub fn by_name(name: &str) -> Option<Theme> {
    match name {
        "dusk" => Some(Theme { heading: "\x1b[1;38;5;215m", emphasis: "\x1b[3m", code: "\x1b[38;5;110m" }),
        "paper" => Some(Theme { heading: "\x1b[1;38;5;24m", emphasis: "\x1b[3m", code: "\x1b[38;5;88m" }),
        _ => None,
    }
}
''',
        "src/render.rs": r'''
use pulldown_cmark::{Event, Parser, Tag, TagEnd};

use crate::theme::Theme;

const RESET: &str = "\x1b[0m";

pub fn render(source: &str, theme: &Theme, width: usize) -> String {
    let mut out = String::new();
    let mut column = 0;
    for event in Parser::new(source) {
        match event {
            Event::Start(Tag::Heading { .. }) => out.push_str(theme.heading),
            Event::End(TagEnd::Heading(_)) => out.push_str(&format!("{RESET}\n\n")),
            Event::Start(Tag::Emphasis) => out.push_str(theme.emphasis),
            Event::End(TagEnd::Emphasis) => out.push_str(RESET),
            Event::Code(code) => out.push_str(&format!("{}{code}{RESET}", theme.code)),
            Event::Text(text) => {
                for word in text.split_whitespace() {
                    if column + word.len() > width {
                        out.push('\n');
                        column = 0;
                    }
                    out.push_str(word);
                    out.push(' ');
                    column += word.len() + 1;
                }
            }
            Event::End(TagEnd::Paragraph) => {
                out.push_str("\n\n");
                column = 0;
            }
            _ => {}
        }
    }
    out
}
''',
    }),
    (8.0, "Add the paper theme", {}),
])

# --------------------------------------------------------------------------------------- ledger

# No favicon on purpose: its tile wears the steady colour the app derives from its path.
project("ledger", commits=[
    (9.0, "Settle shared expenses in the fewest payments", {
        "package.json": json.dumps({
            "name": "ledger", "version": "0.2.0", "private": True, "type": "module",
            "scripts": {"test": "node --test test/*.test.ts"},
        }, indent=2) + "\n",
        "README.md": "# ledger\n\nSplits shared expenses and settles up with the fewest payments.\n",
        "src/settle.ts": r'''
export interface Balance {
  person: string;
  cents: number;
}

// Largest debtor pays largest creditor until everyone is square, which is never more than n-1 payments.
export function settle(balances: Balance[]) {
  const owed = balances.filter((b) => b.cents > 0).sort((a, b) => b.cents - a.cents).map((b) => ({ ...b }));
  const owing = balances.filter((b) => b.cents < 0).sort((a, b) => a.cents - b.cents).map((b) => ({ ...b }));
  const payments: { from: string; to: string; cents: number }[] = [];
  while (owed.length && owing.length) {
    const cents = Math.min(owed[0].cents, -owing[0].cents);
    payments.push({ from: owing[0].person, to: owed[0].person, cents });
    owed[0].cents -= cents;
    owing[0].cents += cents;
    if (!owed[0].cents) owed.shift();
    if (!owing[0].cents) owing.shift();
  }
  return payments;
}
''',
    }),
])

# ----------------------------------------------------------------------------------------- HOME

if ONLY:
    print("projects:", ", ".join(sorted(ONLY)))
    sys.exit(0)

write(HOME, {
    ".zshrc": "PROMPT='%F{245}%1~%f %F{green}>%f '\nexport CLICOLOR=1\n",
    ".gitconfig": f"[user]\n\tname = {AUTHOR[0]}\n\temail = {AUTHOR[1]}\n[init]\n\tdefaultBranch = main\n",
    # Claude Code's own config, just past onboarding. The login is not here: it is the keychain's,
    # which belongs to the macOS user rather than to $HOME.
    ".claude.json": json.dumps({"hasCompletedOnboarding": True, "theme": "dark"}, indent=2) + "\n",
    # Read by the demo instance only to find where its markers live: an instance that does not own
    # the hooks watches the directory the installed hook writes into. Nothing ever runs it.
    ".claude/settings.json": json.dumps({"hooks": {"Stop": [{"hooks": [{
        "type": "command",
        "command": f'"/usr/bin/python3" "{os.path.join(DATA, "activity-hook.py")}" finished',
    }]}]}}, indent=2) + "\n",
})

# Your desktop VS Code, read (never written) by the profile mirror, so every tile wears your setup.
for name, target in [("Library/Application Support/Code", "Library/Application Support/Code"), (".vscode", ".vscode")]:
    link = os.path.join(HOME, name)
    os.makedirs(os.path.dirname(link), exist_ok=True)
    if not os.path.islink(link):
        os.symlink(os.path.join(REAL_HOME, target), link)

print("projects:", ", ".join(sorted(os.listdir(CODE))))
