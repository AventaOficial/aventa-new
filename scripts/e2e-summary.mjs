import fs from 'node:fs';
import { assertSummaryGate, summarizeCases } from '../e2e/cases.mjs';

const raw = fs.existsSync('e2e/results.json')
  ? JSON.parse(fs.readFileSync('e2e/results.json', 'utf8'))
  : { suites: [] };

const rows = [];
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    const ok = spec.ok === true;
    const skipped = (spec.tests ?? []).every((test) =>
      (test.results ?? []).every((result) => result.status === 'skipped'),
    );
    rows.push({ id: spec.title, status: skipped ? 'skipped' : ok ? 'passed' : 'failed' });
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of raw.suites ?? []) walk(suite);

const summary = summarizeCases(rows);
console.log(JSON.stringify(summary));
assertSummaryGate(summary);
