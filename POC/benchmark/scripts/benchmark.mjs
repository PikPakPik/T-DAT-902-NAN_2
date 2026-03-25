import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const apps = [
  {
    name: 'next',
    kind: 'maplibre',
    cwd: 'apps/next-map',
    cmd: ['npm', 'run', 'dev', '--', '--port', '3001', '--hostname', '127.0.0.1'],
    url: 'http://127.0.0.1:3001/?source=vector'
  },
  {
    name: 'nuxt',
    kind: 'maplibre',
    cwd: 'apps/nuxt-map',
    cmd: ['npm', 'run', 'dev', '--', '--port', '3002', '--host', '127.0.0.1'],
    url: 'http://127.0.0.1:3002/?source=vector'
  },
  {
    name: 'angular',
    kind: 'maplibre',
    cwd: 'apps/angular-map',
    cmd: ['npm', 'run', 'start', '--', '--port', '3003', '--host', '127.0.0.1'],
    url: 'http://127.0.0.1:3003/?source=vector'
  },
  {
    name: 'streamlit',
    kind: 'streamlit',
    cwd: 'apps/streamlit-map',
    cmd: [
      'python3',
      '-m',
      'streamlit',
      'run',
      'app.py',
      '--server.port',
      '3004',
      '--server.address',
      '127.0.0.1',
      '--server.headless',
      'true',
      '--server.fileWatcherType',
      'none',
      '--server.enableStaticServing',
      'true'
    ],
    url: 'http://127.0.0.1:3004/?source=vector'
  }
];

const REPEATS = Number.parseInt(process.env.BENCH_REPEAT ?? '3', 10);
const TRAJECTORIES = [
  { name: 'to_communes', center: [2.35, 48.86], zoom: 8, duration: 900 },
  { name: 'to_sections', center: [2.35, 48.86], zoom: 12, duration: 1200 },
  { name: 'to_batiments', center: [2.35, 48.86], zoom: 15, duration: 1500 },
  { name: 'back_france', center: [2.5, 46.7], zoom: 5.5, duration: 1300 }
];

async function waitForHttp(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await delay(1000);
  }
  throw new Error(`Server did not start in time: ${url}`);
}

function startApp(app) {
  const [command, ...args] = app.cmd;
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const proc = spawn(command, args, {
    cwd: path.join(rootDir, app.cwd),
    env: {
      ...process.env,
      PATH: `${path.join(rootDir, '.venv/bin')}:${process.env.PATH || ''}`
    },
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  proc.stdout.on('data', (chunk) => {
    process.stdout.write(`[${app.name}] ${chunk}`);
  });
  proc.stderr.on('data', (chunk) => {
    process.stderr.write(`[${app.name}] ${chunk}`);
  });

  return proc;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  const weight = pos - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function aggregateRuns(framework, runs) {
  const pick = (key) => runs.map((r) => r[key]).filter((v) => v != null);
  const interactionSamples = [];
  const byTrajectory = {};

  for (const run of runs) {
    if (!run.trajectoryDurations) continue;
    for (const [name, value] of Object.entries(run.trajectoryDurations)) {
      if (value == null) continue;
      interactionSamples.push(value);
      byTrajectory[name] = byTrajectory[name] || [];
      byTrajectory[name].push(value);
    }
  }

  const metricStats = (key) => {
    const vals = pick(key);
    return {
      p50: percentile(vals, 0.5),
      p95: percentile(vals, 0.95)
    };
  };

  const trajStats = Object.fromEntries(
    Object.entries(byTrajectory).map(([name, values]) => [
      name,
      { p50: percentile(values, 0.5), p95: percentile(values, 0.95), n: values.length }
    ])
  );

  return {
    framework,
    status: runs.some((r) => r.status !== 'ok') ? 'partial' : 'ok',
    runs: runs.length,
    mapLoadedP50: metricStats('mapLoadedMs').p50,
    mapLoadedP95: metricStats('mapLoadedMs').p95,
    sourceLoadedP50: metricStats('sourceLoadedMs').p50,
    sourceLoadedP95: metricStats('sourceLoadedMs').p95,
    firstIdleP50: metricStats('firstIdleMs').p50,
    firstIdleP95: metricStats('firstIdleMs').p95,
    interactionP50: percentile(interactionSamples, 0.5),
    interactionP95: percentile(interactionSamples, 0.95),
    usedJSHeapP50: percentile(pick('usedJSHeapSize'), 0.5),
    trajectoryStats: trajStats
  };
}

async function runScenario(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__MAP_READY === true || (window.__MAP_STATS && window.__MAP_STATS.mapLoadedMs != null),
    { timeout: 90000 }
  );

  const stats = await page.evaluate(async (trajectories) => {
    const baseline = window.__MAP_STATS || {};
    const map = window.__MAP_INSTANCE;
    const trajectoryDurations = {};

    if (map) {
      for (const t of trajectories) {
        const start = performance.now();
        map.easeTo({ center: t.center, zoom: t.zoom, duration: t.duration });
        await new Promise((resolve) => map.once('idle', resolve));
        trajectoryDurations[t.name] = performance.now() - start;
      }
    }

    const memory = performance?.memory?.usedJSHeapSize ?? null;

    return {
      mapLoadedMs: baseline.mapLoadedMs ?? null,
      sourceLoadedMs: baseline.sourceLoadedMs ?? null,
      firstIdleMs: baseline.firstIdleMs ?? null,
      interactionMs: null,
      trajectoryDurations,
      usedJSHeapSize: memory
    };
  }, TRAJECTORIES);

  return stats;
}

async function runScenarioStreamlit(page, url) {
  const startedAt = Date.now();
  let sourceLoadedMs = null;

  page.on('response', (response) => {
    if (sourceLoadedMs !== null) return;
    const u = response.url();
    if (u.includes('cadastre-batiments.json') || u.includes('/data/cadastre/')) {
      sourceLoadedMs = Date.now() - startedAt;
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.stDeckGlJsonChart canvas', { timeout: 90000 });

  if (sourceLoadedMs === null) {
    try {
      await page.waitForResponse(
        (response) =>
          response.url().includes('cadastre-batiments.json') || response.url().includes('/data/cadastre/'),
        { timeout: 45000 }
      );
      sourceLoadedMs = Date.now() - startedAt;
    } catch {
      sourceLoadedMs = null;
    }
  }

  const usedJSHeapSize = await page.evaluate(() => performance?.memory?.usedJSHeapSize ?? null);
  const mapLoadedMs = Date.now() - startedAt;

  return {
    mapLoadedMs,
    sourceLoadedMs,
    firstIdleMs: null,
    interactionMs: null,
    trajectoryDurations: {},
    usedJSHeapSize
  };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader'
    ]
  });
  const summary = [];
  const raw = {};

  for (const app of apps) {
    console.log(`\n=== ${app.name.toUpperCase()} ===`);
    const proc = startApp(app);
    raw[app.name] = [];

    try {
      await waitForHttp(app.url);
      for (let i = 0; i < REPEATS; i += 1) {
        const page = await browser.newPage();
        page.setDefaultTimeout(240000);
        try {
          const stats =
            app.kind === 'streamlit'
              ? await runScenarioStreamlit(page, app.url)
              : await runScenario(page, app.url);
          raw[app.name].push({ status: 'ok', ...stats });
        } catch (err) {
          raw[app.name].push({
            status: 'timeout_or_error',
            mapLoadedMs: null,
            sourceLoadedMs: null,
            firstIdleMs: null,
            interactionMs: null,
            trajectoryDurations: {},
            usedJSHeapSize: null,
            error: err instanceof Error ? err.message : String(err)
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      proc.kill('SIGTERM');
      await delay(1500);
    }

    summary.push(aggregateRuns(app.name, raw[app.name]));
  }

  await browser.close();

  console.table(summary);
  console.log('\nTrajectory p50/p95 (ms):');
  for (const row of summary) {
    if (!row.trajectoryStats || Object.keys(row.trajectoryStats).length === 0) continue;
    console.log(`- ${row.framework}`);
    for (const [name, st] of Object.entries(row.trajectoryStats)) {
      console.log(`  - ${name}: p50=${st.p50?.toFixed?.(1) ?? 'n/a'} p95=${st.p95?.toFixed?.(1) ?? 'n/a'} (n=${st.n})`);
    }
  }

  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `latest-${Date.now()}.json`),
    JSON.stringify({ repeats: REPEATS, trajectories: TRAJECTORIES, summary, raw }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
