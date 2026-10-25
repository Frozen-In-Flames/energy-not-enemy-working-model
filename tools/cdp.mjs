/* Minimal Chrome DevTools Protocol driver (hand-written, Node stdlib only).
 * Shared by the page test and the demo capture. */
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME = '/opt/meta-chromium/chrome';

export function serve(root, port) {
  return new Promise((resolve) => {
    const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '0.0.0.0'], { cwd: root, stdio: 'ignore' });
    setTimeout(() => resolve(p), 700);
  });
}

export async function launch(port) {
  // This VM reaches the internet only through an egress proxy named in the
  // environment. Chromium does not read those variables by itself, so pass
  // the proxy through when present (value read at runtime, never stored).
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY
    || process.env.http_proxy || '';
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests',
    ...(proxy ? ['--proxy-server=' + proxy] : []),
    '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1',
    '--window-size=' + (process.env.CHROME_WINDOW || '1280,1500'),
    ...(process.env.CHROME_EXTRA_ARGS ? process.env.CHROME_EXTRA_ARGS.split(' ') : []),
    'about:blank'
  ], { stdio: 'ignore' });
  // Wait for the devtools endpoint.
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}/json/version`, (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      break;
    } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!version) throw new Error('Chrome devtools did not start');
  return { proc, version };
}

export class Page {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    this.consoleErrors = [];
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled' &&
            (msg.params.type === 'error')) {
          this.consoleErrors.push(msg.params.args.map(a => a.value || a.description || '').join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          this.consoleErrors.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
        }
        this.listeners.forEach((f) => f(msg));
      }
    };
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    return this;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
  async navigate(url) {
    await this.send('Page.navigate', { url });
  }
  async screenshot(path) {
    const fs = await import('node:fs');
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
    return path;
  }
  onEvent(fn) { this.listeners.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

export async function newPage(browser, port) {
  const targets = await new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${port}/json/list`, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const t = targets.find((x) => x.type === 'page');
  return new Page(t.webSocketDebuggerUrl).connect();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
