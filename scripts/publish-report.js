#!/usr/bin/env node
/**
 * Builds a browsable regression report bundle and updates run history metadata.
 * Used by the GitHub Actions workflow before pushing to the regression-reports branch.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT_SRC = path.join(ROOT, 'playwright-report');
const RESULTS_JSON = path.join(ROOT, 'test-results', 'results.json');
const OUT_ROOT = path.join(ROOT, 'report-bundle');
const HISTORY_PATH = path.join(OUT_ROOT, 'history.json');
const PRIOR_HISTORY = path.join(ROOT, 'prior-history.json');

const runId = process.env.GITHUB_RUN_ID || 'local';
const runNumber = process.env.GITHUB_RUN_NUMBER || '0';
const sha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
const ref = process.env.GITHUB_REF_NAME || 'local';
const timestamp = new Date().toISOString();
const stamp = timestamp.replace(/[:.]/g, '-');

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function summarizePlaywright(json) {
  if (!json || !Array.isArray(json.suites)) {
    return { passed: 0, failed: 0, skipped: 0, total: 0, durationMs: 0, status: 'unknown' };
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;

  /** @param {any[]} suites */
  function walkSuites(suites) {
    for (const suite of suites) {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const test of spec.tests || []) {
            for (const result of test.results || []) {
              durationMs += result.duration || 0;
              if (result.status === 'passed') passed += 1;
              else if (result.status === 'skipped') skipped += 1;
              else failed += 1;
            }
          }
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }

  walkSuites(json.suites);
  const total = passed + failed + skipped;
  const status = failed > 0 ? 'failed' : total > 0 ? 'passed' : 'unknown';
  return { passed, failed, skipped, total, durationMs, status };
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function writeLandingPage(summary, latestRun) {
  const statusColor = summary.status === 'passed' ? '#22c55e' : summary.status === 'failed' ? '#ef4444' : '#f59e0b';
  const history = readJson(HISTORY_PATH) || { runs: [] };

  const rows = history.runs.slice(0, 20).map((run) => {
    const color = run.status === 'passed' ? '#22c55e' : '#ef4444';
    return `<tr>
      <td><a href="./runs/${run.id}/index.html">${run.timestamp}</a></td>
      <td style="color:${color};font-weight:600">${run.status.toUpperCase()}</td>
      <td>${run.passed}/${run.total}</td>
      <td>${run.ref}</td>
      <td><code>${run.sha}</code></td>
      <td><a href="https://github.com/${process.env.GITHUB_REPOSITORY || 'JoeyLovesPizza/Bitmania'}/actions/runs/${run.runId}">#${run.runNumber}</a></td>
    </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitmania Regression Reports</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0c0c0e; color: #e2e2e8; margin: 0; padding: 32px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: #9ca3af; }
    .card { background: #161618; border: 1px solid #2a2a32; border-radius: 10px; padding: 20px; margin: 20px 0; }
    .status { font-size: 28px; font-weight: 700; color: ${statusColor}; }
    a { color: #60a5fa; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #2a2a32; font-size: 14px; }
    th { color: #9ca3af; font-weight: 600; }
    code { background: #1e1e22; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Bitmania Regression Reports</h1>
  <p>Automated weekly smoke tests for the Halftone Playground.</p>

  <div class="card">
    <div class="status">${summary.status.toUpperCase()}</div>
    <p>Latest run: <strong>${latestRun.timestamp}</strong> · ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped (${Math.round(summary.durationMs)} ms)</p>
    <p>
      <a href="./latest/index.html">Open latest Playwright report</a>
      ·
      <a href="./runs/${latestRun.id}/index.html">Open archived run</a>
    </p>
  </div>

  <div class="card">
    <h2 style="margin-top:0">Recent runs</h2>
    <table>
      <thead>
        <tr><th>Time (UTC)</th><th>Status</th><th>Passed</th><th>Branch</th><th>Commit</th><th>Workflow</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6">No prior runs yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_ROOT, 'index.html'), html);
}

function main() {
  if (!fs.existsSync(REPORT_SRC)) {
    console.error('Missing playwright-report directory. Run tests first.');
    process.exit(1);
  }

  const results = readJson(RESULTS_JSON);
  const summary = summarizePlaywright(results);
  const runFolder = stamp;

  if (fs.existsSync(OUT_ROOT)) fs.rmSync(OUT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  const latestDir = path.join(OUT_ROOT, 'latest');
  const archiveDir = path.join(OUT_ROOT, 'runs', runFolder);
  copyDir(REPORT_SRC, latestDir);
  copyDir(REPORT_SRC, archiveDir);

  const prior = fs.existsSync(PRIOR_HISTORY)
    ? readJson(PRIOR_HISTORY)
    : readJson(HISTORY_PATH);
  const history = prior && Array.isArray(prior.runs) ? prior : { runs: [] };
  const entry = {
    id: runFolder,
    timestamp,
    status: summary.status,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    total: summary.total,
    durationMs: summary.durationMs,
    sha,
    ref,
    runId,
    runNumber,
  };
  history.runs = [entry, ...history.runs.filter((r) => r.id !== runFolder)].slice(0, 50);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  writeLandingPage(summary, entry);

  fs.writeFileSync(path.join(OUT_ROOT, 'summary.json'), JSON.stringify({ summary, entry }, null, 2));

  console.log(`Report bundle ready: ${OUT_ROOT}`);
  console.log(`Status: ${summary.status} (${summary.passed}/${summary.total} passed)`);
}

main();
