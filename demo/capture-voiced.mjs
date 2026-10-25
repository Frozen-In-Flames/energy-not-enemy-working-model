/* Voiced presentation capture: same scenes as demo/capture.mjs, with scene
 * holds sized to the recorded narration lines (demo/narration-script.md,
 * spoken from the caption texts) and a mark recorded at each caption from
 * the screencast frame clock, so the voice track can be placed exactly.
 * Assembly keeps real frame timestamps (duration clamp raised to 30 s) so
 * static holds keep their true length and marks stay true.
 * Usage: node demo/capture-voiced.mjs [out.mp4] */
import { launch, newPage, sleep } from '../tools/cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.CHROME_EXTRA_ARGS = '--allow-file-access-from-files';
process.env.CHROME_WINDOW = '1280,1000';
const ROOT = process.env.HOME + '/workspace/energy-not-enemy-model';
const OUT = process.argv[2] || path.join(ROOT, 'demo', 'energy-not-enemy-working-model-demo-voiced2.mp4');
const FRAMES = '/tmp/ene-frames-voiced2';
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const URL = 'file://' + ROOT + '/docs/index.html';
const log = [];
function note(msg) { log.push(msg); console.log(msg); }

const { proc } = await launch(9337);
const page = await newPage(null, 9337);
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

const marks = [];
function mark(id) {
  if (!frames.length) return;
  const off = frames[frames.length - 1].ts - frames[0].ts;
  marks.push({ id, offset_s: +off.toFixed(3) });
  note('mark ' + id + ' @ ' + off.toFixed(2) + 's');
}

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

  /* Heartbeat: force a compositing frame every 250 ms for the whole
   * capture. Without it, long static holds starve the screencast, frame
   * timestamps go stale, and later scenes can be lost from the assembly
   * (observed in the first voiced attempt: the totals section collapsed).
   * A one-pixel transform toggle on a transparent overlay is invisible. */
  await page.eval(`(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;';
    document.body.appendChild(d);
    let x = 0;
    setInterval(() => { x = 1 - x; d.style.transform = 'translateX(' + x + 'px)'; }, 250);
    return true;
  })()`);

  await page.send('Page.startScreencast', {
    format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 1000, everyNthFrame: 1
  });
  await sleep(600);

  /* S1: title (L01, 11.2 s spoken) */
  await D('title(true)');
  mark('L01');
  await sleep(12200);
  await D('title(false)');
  await D('pause()');

  /* S2: the machine and its parts (L02 to L07) */
  await D('viewTop()');
  await caption('Here is the whole plant. Every part you can see was generated from the dimensions in the book that describes this machine.');
  mark('L02');
  await sleep(7200);
  await D("isolate('fresnel')");
  await caption('The big grid is the Fresnel lens array, forty square metres of lens in forty panels. It gathers sunlight and squeezes it onto one small spot.');
  mark('L03');
  await sleep(6200);
  await D("isolate('receiver')");
  await sleep(2700);
  await D("isolate('boiler')");
  await caption('That spot is the receiver, and right behind it sits the boiler, a sealed steel vessel holding the water the whole loop runs on.');
  mark('L04');
  await sleep(8000);
  await D("isolate('valve')");
  await D('setExplode(0.85)');
  await caption('This is the Tesla valve, a flow channel with no moving parts, shown cut open and spread apart. It lets steam through easily one way and resists it the other way.');
  mark('L05');
  await sleep(10300);
  await D("isolate('turbine')");
  await caption('The steam spins this turbine, and the turbine shaft turns the generator behind it, which is what finally makes electricity.');
  mark('L06');
  await sleep(7300);
  await D("isolate('condenser')");
  await caption('The last part is the condenser, a bank of air cooled panels where used steam gives up its heat and turns back into water.');
  mark('L07');
  await sleep(7600);

  /* S3: the day shift (L08 to L12) */
  const best = await page.eval('window.ENE_DEMO.analysisOf().bestDay.date');
  note('best day: ' + best);
  await D('setExplode(0.35)');
  await D("isolate('all')");
  await D(`setDate(${JSON.stringify(best)})`);
  await D('setTime(13.2)');
  await D('setSpeed(720)');
  await D('play()');
  await caption('Now watch a full day on real measured weather, the best day of the year for Lewisville, Texas. The panel on the right measures the energy at every phase as it happens.');
  mark('L08');
  await sleep(10200);
  await caption('Morning sun lands on the lens. Phases one and two: sunlight in, then concentrated heat, focused down by a factor of sixty onto the receiver.');
  mark('L09');
  await sleep(10400);
  await D("isolate('valve')");
  await caption('The boiler climbs toward its design point, four megapascals and four hundred degrees. Steam forms, and phase three shows the steam enthalpy rising.');
  mark('L10');
  await sleep(9800);
  await D("isolate('turbine')");
  await caption('The steam reaches the turbine through the valve. Phase five is shaft power, and the turbine spins at the speed the physics says, a few thousand rpm.');
  mark('L11');
  await sleep(9900);
  await D("isolate('all')");
  await caption('Phase six is the point of the whole machine: electricity out, a little under five kilowatts at the peak of this day. When the solver says zero flow, the motion stops.');
  mark('L12');
  await sleep(10800);

  /* S4: the night shift (L13 to L15) */
  await D('pause()');
  await D('setTime(4.4)');
  await D('setSpeed(240)');
  await D('play()');
  await D("isolate('condenser')");
  await caption('When the sun goes down, the plant runs on the steam it banked, until the pressure fades and the rest drifts here, to the condenser.');
  mark('L13');
  await sleep(8100);
  await D("isolate('boiler')");
  await caption('The steam cools, turns back into liquid, and the water makes its way home to the boiler side, closing the loop.');
  mark('L14');
  await sleep(7200);
  await D("isolate('all')");
  await caption('Counted over this day, and over the full year in the model, the water gained or lost is zero kilograms, the book claim, tested here as accounting inside a sealed boundary.');
  mark('L15');
  await sleep(10900);

  /* S5: another city (L16). Deterministic fallback, as in the shipped cut:
   * the recording browser cannot reach the weather archive, so the home
   * year analysis is shown and the caption says so. */
  await D('pause()');
  await page.eval("document.getElementById('city-section').scrollIntoView()");
  await D('viewAnalysis()');
  await captionF('The live fetch did not answer in this recording, so here is the home year instead: output by hour and by month, with the best, worst, and median days marked.');
  mark('L16');
  await sleep(18500);
  await captionF(null);

  /* S6: totals and the book (L17 to L19) */
  await D('viewTop()');
  await captionF('On its best day the model made about forty kilowatt hours, and across the full Lewisville year about nine thousand three hundred, a capacity factor of about fifteen percent.');
  mark('L17');
  await sleep(10400);
  await page.eval("document.getElementById('claims-section').scrollIntoView()");
  await captionF('The book reference arithmetic says twenty seven point six kilowatt hours on its design day. Running continuously the model lands within about an eighth of that, and the claims table says so openly, with the reasons.');
  mark('L18');
  await sleep(12800);
  await D('viewBook()');
  await captionF('Everything you have seen comes from one document, the book Energy Not Enemy by Aries Hilton, included in this project, free to read, and used as the specification this simulation was built and checked against.');
  mark('L19');
  await sleep(12700);
  await captionF(null);

  await page.send('Page.stopScreencast');
  await ackChain;
  note('frames captured: ' + frames.length);
} finally {
  page.close();
  proc.kill('SIGKILL');
}

/* Assemble the MP4 from screencast frames using their real timestamps.
 * Duration clamp is 30 s here (not 1 s) so timed holds keep their length
 * and the narration marks stay aligned with the picture. */
if (frames.length < 30) throw new Error('too few frames: ' + frames.length);
const list = [];
let totalDur = 0;
frames.forEach((f, i) => {
  const name = 'frame-' + String(i).padStart(5, '0') + '.jpg';
  fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, 'base64'));
  let dur = i + 1 < frames.length ? frames[i + 1].ts - f.ts : 1.0;
  dur = Math.min(30.0, Math.max(0.02, dur));
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
fs.writeFileSync(path.join(ROOT, 'demo', 'capture-voiced2-log.json'),
  JSON.stringify({ frames: frames.length, duration_s: +totalDur.toFixed(1),
                   marks, log, out: OUT }, null, 2));
