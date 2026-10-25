/* Page acceptance test: serves the repo, opens the real page in headless
 * Chrome, waits for the bundled analysis, and inspects the running app the
 * way a user would: rendered pixels, live numbers, day totals, interactions.
 * Usage: node tools/page-test.mjs [outdir] */
import { launch, newPage, sleep } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

/* This VM's Chrome build blocks loopback HTTP navigation (Local Network
 * Access checks), so the test loads the identical page over file:// with
 * local file access enabled. The deployed page runs over HTTPS on GitHub
 * Pages; only the transport differs. */
process.env.CHROME_EXTRA_ARGS = '--allow-file-access-from-files';
const OUT = process.argv[2] || '/tmp/ene-pagetest';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + process.env.HOME
  + '/workspace/energy-not-enemy-model/docs/index.html';

const { proc } = await launch(9333);
const page = await newPage(null, 9333);
const report = { consoleErrors: page.consoleErrors };

try {
  await page.navigate(URL);
  // Wait for readiness (bundled load + analysis).
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    ready = await page.eval('!!window.ENE_READY').catch(() => false);
    if (ready) break;
  }
  report.ready = ready;
  report.clock = await page.eval("document.getElementById('clock-text').textContent");
  report.provenance = await page.eval("document.getElementById('provenance').textContent");
  report.analysisSummary = await page.eval("document.getElementById('analysis-summary').innerText");
  report.totals = await page.eval("document.getElementById('totals').innerText");
  report.claimsCounts = await page.eval("document.getElementById('claims-counts').textContent");
  report.dateShown = await page.eval("document.getElementById('date-input').value");

  // Jump to the best day and midday, let the plant run.
  const best = await page.eval("window.ENE_DEMO.analysisOf().bestDay.date");
  report.bestDay = best;
  await page.eval(`window.ENE_DEMO.setDate(${JSON.stringify(best)})`);
  await page.eval('window.ENE_DEMO.setSpeed(240); window.ENE_DEMO.play();');
  await page.eval('window.ENE_DEMO.setTime(11.5)');
  await sleep(2500);
  await page.screenshot(path.join(OUT, 'midday.png'));
  report.middayClock = await page.eval("document.getElementById('clock-text').textContent");
  report.partNumbers = await page.eval("document.getElementById('part-numbers').innerText");

  // Isolate the turbine at generation time.
  await page.eval("window.ENE_DEMO.isolate('turbine')");
  await sleep(1400);
  await page.screenshot(path.join(OUT, 'turbine.png'));
  report.turbineNumbers = await page.eval("document.getElementById('part-numbers').innerText");

  // Tesla valve cutaway, exploded, with a reverse pulse.
  await page.eval("window.ENE_DEMO.isolate('valve'); window.ENE_DEMO.setExplode(0.8); window.ENE_DEMO.pulse();");
  await sleep(1500);
  await page.screenshot(path.join(OUT, 'valve.png'));
  report.valveNumbers = await page.eval("document.getElementById('part-numbers').innerText");
  report.pulseNote = await page.eval("document.getElementById('pulse-note').textContent");

  // Night: condenser and water coming home.
  await page.eval("window.ENE_DEMO.isolate('condenser'); window.ENE_DEMO.setTime(23.2); window.ENE_DEMO.setSpeed(60);");
  await sleep(2000);
  await page.screenshot(path.join(OUT, 'night.png'));
  report.nightClock = await page.eval("document.getElementById('clock-text').textContent");
  report.condenserNumbers = await page.eval("document.getElementById('part-numbers').innerText");

  // Back to whole plant, check phases text.
  await page.eval("window.ENE_DEMO.isolate('all')");
  report.phases = await page.eval("document.getElementById('phases').innerText");
  report.dayTotalsAfter = await page.eval("document.getElementById('totals').innerText");
} finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  page.close();
  proc.kill('SIGKILL');
}
