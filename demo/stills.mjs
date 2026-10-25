/* Ending-scene stills for the voiced presentation. The recording
 * browser's screencast stalls once the analysis view is on screen (found
 * in main-side verification, in both the original and the voiced capture
 * attempts), so the closing scenes are captured as direct screenshots,
 * which do not depend on screencast frame flow.
 * Usage: node demo/stills.mjs <outdir> */
import { launch, newPage, sleep } from '../tools/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';

process.env.CHROME_EXTRA_ARGS = '--allow-file-access-from-files';
process.env.CHROME_WINDOW = '1280,1000';
const ROOT = process.env.HOME + '/workspace/energy-not-enemy-model';
const OUTDIR = process.argv[2] || '/tmp/ene-stills';
fs.mkdirSync(OUTDIR, { recursive: true });
const URL = 'file://' + ROOT + '/docs/index.html';

const { proc } = await launch(9339);
const page = await newPage(null, 9339);
await page.send('Page.bringToFront').catch(() => {});

async function shot(name) {
  await sleep(1200);
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUTDIR, name), Buffer.from(r.data, 'base64'));
  console.log('shot', name);
}

try {
  await page.navigate(URL);
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    ready = await page.eval('!!window.ENE_READY').catch(() => false);
    if (ready) break;
  }
  if (!ready) throw new Error('page never became ready');

  const D = (expr) => page.eval('window.ENE_DEMO.' + expr);

  /* City section: where a visitor picks a place and loads its weather. */
  await page.eval("document.getElementById('city-section').scrollIntoView()");
  await shot('city.png');

  /* Analysis of the bundled Lewisville year. */
  await D('viewAnalysis()');
  await shot('analysis.png');

  /* Claims table. */
  await page.eval("document.getElementById('claims-section').scrollIntoView()");
  await shot('claims.png');

  /* The book. */
  await D('viewBook()');
  await shot('book.png');
} finally {
  page.close();
  proc.kill('SIGKILL');
}
