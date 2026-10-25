/* Demo presentation capture: drives the real page through the narration
 * script (demo/narration-script.md) with Chrome's screencast, then assembles
 * an MP4 with ffmpeg. Captions are the narration lines, shown on the page
 * itself. No voiceover is recorded: this environment has no speech
 * synthesis, which the delivery report states plainly.
 * Usage: node demo/capture.mjs [out.mp4]
 * The page is loaded over file:// because this VM's Chrome build blocks
 * loopback HTTP navigation; only the transport differs from deployment. */
import { launch, newPage, sleep } from '../tools/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.CHROME_EXTRA_ARGS = '--allow-file-access-from-files';
process.env.CHROME_WINDOW = '1280,1000';
const ROOT = process.env.HOME + '/workspace/energy-not-enemy-model';
const OUT = process.argv[2] || path.join(ROOT, 'demo', 'energy-not-enemy-working-model-demo.mp4');
const FRAMES = '/tmp/ene-frames';
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const URL = 'file://' + ROOT + '/docs/index.html';
const log = [];
function note(msg) { log.push(msg); console.log(msg); }

const { proc } = await launch(9335);
const page = await newPage(null, 9335);
await page.send('Page.bringToFront').catch(() => {});

const frames = [];
let ackChain = Promise.resolve();
page.onEvent((msg) => {
  if (msg.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = msg.params;
    frames.push({ data, ts: metadata.timestamp });
    ackChain = ackChain.then(() =>
      page.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
  }
});

const D = (expr) => page.eval('window.ENE_DEMO.' + expr);
async function caption(text) { await D(`caption(${JSON.stringify(text)})`); }
async function captionF(text) { await D(`captionFixed(${JSON.stringify(text)})`); }

try {
  await page.navigate(URL);
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    ready = await page.eval('!!window.ENE_READY').catch(() => false);
    if (ready) break;
  }
  if (!ready) throw new Error('page never became ready');
  note('page ready');

  await page.send('Page.startScreencast', {
    format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 1000, everyNthFrame: 1
  });

  /* S1: title (narration 1) */
  await D('title(true)');
  await sleep(7000);
  await D('title(false)');
  await D('pause()');

  /* S2: the machine and its parts (narration 2 to 7) */
  await D('viewTop()');
  await caption('Here is the whole plant. Every part you can see was generated from the dimensions in the book that describes this machine.');
  await sleep(6000);
  await D("isolate('fresnel')");
  await caption('The big grid is the Fresnel lens array, forty square metres of lens in forty panels. It gathers sunlight and squeezes it onto one small spot.');
  await sleep(6500);
  await D("isolate('receiver')");
  await sleep(2500);
  await D("isolate('boiler')");
  await caption('That spot is the receiver, and right behind it sits the boiler, a sealed steel vessel holding the water the whole loop runs on.');
  await sleep(6000);
  await D("isolate('valve')");
  await D('setExplode(0.85)');
  await caption('This is the Tesla valve, a flow channel with no moving parts, shown cut open and spread apart. It lets steam through easily one way and resists it the other way.');
  await sleep(7500);
  await D("isolate('turbine')");
  await caption('The steam spins this turbine, and the turbine shaft turns the generator behind it, which is what finally makes electricity.');
  await sleep(6000);
  await D("isolate('condenser')");
  await caption('The last part is the condenser, a bank of air cooled panels where used steam gives up its heat and turns back into water.');
  await sleep(6000);

  /* S3: the day shift (narration 8 to 12) */
  const best = await page.eval('window.ENE_DEMO.analysisOf().bestDay.date');
  note('best day: ' + best);
  await D('setExplode(0.35)');
  await D("isolate('all')");
  await D(`setDate(${JSON.stringify(best)})`);
  await D('setTime(13.2)');
  await D('setSpeed(720)');
  await D('play()');
  await caption('Now watch a full day on real measured weather, the best day of the year for Lewisville, Texas. The panel on the right measures the energy at every phase as it happens.');
  await sleep(11000);
  await caption('Morning sun lands on the lens. Phases one and two: sunlight in, then concentrated heat, focused down by a factor of sixty onto the receiver.');
  await sleep(11000);
  await D("isolate('valve')");
  await caption('The boiler climbs toward its design point, four megapascals and four hundred degrees. Steam forms, and phase three shows the steam enthalpy rising.');
  await sleep(11000);
  await D("isolate('turbine')");
  await caption('The steam reaches the turbine through the valve. Phase five is shaft power, and the turbine spins at the speed the physics says, a few thousand rpm.');
  await sleep(11000);
  await D("isolate('all')");
  await caption('Phase six is the point of the whole machine: electricity out, a little under five kilowatts at the peak of this day. When the solver says zero flow, the motion stops.');
  await sleep(10000);

  /* S4: the night shift (narration 13 to 15) */
  await D('pause()');
  await D('setTime(4.4)');
  await D('setSpeed(240)');
  await D('play()');
  await D("isolate('condenser')");
  await caption('When the sun goes down, the plant runs on the steam it banked, until the pressure fades and the rest drifts here, to the condenser.');
  await sleep(10000);
  await D("isolate('boiler')");
  await caption('The steam cools, turns back into liquid, and the water makes its way home to the boiler side, closing the loop.');
  await sleep(8000);
  await D("isolate('all')");
  await caption('Counted over this day, and over the full year in the model, the water gained or lost is zero kilograms, the book claim, tested here as accounting inside a sealed boundary.');
  await sleep(8000);

  /* S5: another city (narration 16 and 17, or the fallback) */
  await D('pause()');
  await page.eval("document.getElementById('city-section').scrollIntoView()");
  let phoenixOk = false;
  try {
    await captionF('The machine does not change. The weather does. The same plant is set down in Phoenix, Arizona, and the app fetches a full year of real hourly weather for that spot.');
    await Promise.race([
      D("loadPreset('Phoenix, Arizona')"),
      sleep(75000).then(() => { throw new Error('timeout'); })
    ]);
    phoenixOk = true;
    note('Phoenix loaded live');
  } catch (e) {
    note('Phoenix live load failed, using fallback: ' + e.message);
  }
  if (phoenixOk) {
    await D('viewAnalysis()');
    await captionF('Same lens, same boiler, same turbine, different sky. The heatmap shows the shape of the year, output by hour and by month, and the places compare side by side below.');
    await sleep(15000);
  } else {
    await D('viewAnalysis()');
    await captionF('The live fetch did not answer in this recording, so here is the home year instead: output by hour and by month, with the best, worst, and median days marked.');
    await sleep(12000);
  }
  await captionF(null);

  /* S6: totals and the book (narration 18 to 20) */
  await D('viewTop()');
  await captionF('On its best day the model made about forty kilowatt hours, and across the full Lewisville year about nine thousand three hundred, a capacity factor of about fifteen percent.');
  await sleep(10000);
  await page.eval("document.getElementById('claims-section').scrollIntoView()");
  await captionF('The book reference arithmetic says twenty seven point six kilowatt hours on its design day. Running continuously the model lands within about an eighth of that, and the claims table says so openly, with the reasons.');
  await sleep(11000);
  await D('viewBook()');
  await captionF('Everything you have seen comes from one document, the book Energy Not Enemy by Aries Hilton, included in this project, free to read, and used as the specification this simulation was built and checked against.');
  await sleep(10000);
  await captionF(null);

  await page.send('Page.stopScreencast');
  await ackChain;
  note('frames captured: ' + frames.length);
} finally {
  page.close();
  proc.kill('SIGKILL');
}

/* Assemble the MP4 from screencast frames using their real timestamps. */
if (frames.length < 30) throw new Error('too few frames: ' + frames.length);
const list = [];
let totalDur = 0;
frames.forEach((f, i) => {
  const name = 'frame-' + String(i).padStart(5, '0') + '.jpg';
  fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, 'base64'));
  let dur = i + 1 < frames.length ? frames[i + 1].ts - f.ts : 1.0;
  dur = Math.min(1.0, Math.max(0.02, dur));
  totalDur += dur;
  list.push(`file '${name}'\nduration ${dur.toFixed(3)}`);
});
fs.writeFileSync(path.join(FRAMES, 'list.txt'), list.join('\n'));
note('video duration: ' + totalDur.toFixed(1) + ' s');
execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i',
  path.join(FRAMES, 'list.txt'), '-vf', 'fps=30,scale=1280:-2,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart',
  OUT], { stdio: 'inherit' });
note('wrote ' + OUT);
fs.writeFileSync(path.join(ROOT, 'demo', 'capture-log.json'),
  JSON.stringify({ frames: frames.length, duration_s: +totalDur.toFixed(1),
                   log, out: OUT }, null, 2));
