const status = document.getElementById('status');
const frame = document.getElementById('sandbox');
const toggle = document.getElementById('scripts');
let entry, ready = false, generation = 0;
const MAX_ASSET = 8 * 1024 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024;
const MAX_FILES = 100;

function message(value) { status.textContent = value; status.hidden = !value; }
function pathOf(base, reference) {
  const value = reference.trim();
  if (!value || value.startsWith('/') || value.startsWith('//') ||
      /^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  let decoded;
  try { decoded = decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch { return null; }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const segments = base.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (segment === '..') { if (!segments.length) return null; segments.pop(); }
    else if (segment && segment !== '.') segments.push(segment);
  }
  return segments.join('/');
}
function rawUrl(path) {
  const encode = value => value.split('/').map(encodeURIComponent).join('/');
  return entry.rawBase + encode(path);
}
function mimeFor(path, responseType) {
  const ext = path.split('.').at(-1).toLowerCase();
  const mimes = {
    css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg'
  };
  return mimes[ext] || (responseType?.split(';')[0] || 'application/octet-stream');
}
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function resolver() {
  const cache = new Map(), warnings = new Set();
  let total = 0;
  async function get(path) {
    if (cache.has(path)) return cache.get(path);
    if (cache.size >= MAX_FILES) throw Error(`Asset limit (${MAX_FILES}) reached`);
    const pending = (async () => {
      const response = await fetch(rawUrl(path), {credentials: 'include', redirect: 'follow'});
      if (!response.ok || !['github.com', 'raw.githubusercontent.com'].includes(new URL(response.url).hostname))
        throw Error(`Could not load ${path} (HTTP ${response.status})`);
      if (/text\/html/i.test(response.headers.get('content-type') || '') && !/\.html?$/i.test(path))
        throw Error(`GitHub returned a page instead of ${path}`);
      const chunks = [];
      let size = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_ASSET || total + size > MAX_TOTAL) throw Error(`Asset size limit reached: ${path}`);
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      total += size;
      return {bytes, mime: mimeFor(path, response.headers.get('content-type'))};
    })();
    cache.set(path, pending);
    return pending;
  }
  async function asset(base, value) {
    if (/^(data:|#)/i.test(value.trim())) return value;
    const path = pathOf(base, value);
    if (!path) { warnings.add('Some external or root-relative resources were blocked.'); return ''; }
    try {
      const {bytes, mime} = await get(path);
      return `data:${mime};base64,${base64(bytes)}`;
    } catch (error) { warnings.add(error.message); return ''; }
  }
  async function css(text, path, depth = 0) {
    if (depth > 5) { warnings.add('CSS import depth limit reached.'); return ''; }
    const imports = /@import\s+(?:url\(\s*)?(?:["']([^"']+)["']|([^\s);]+))\s*\)?\s*([^;]*);/gi;
    text = await replaceAsync(text, imports, async (_match, quoted, bare, media) => {
      const next = pathOf(path, quoted || bare);
      if (!next || !/\.css$/i.test(next)) { warnings.add('An external CSS import was blocked.'); return ''; }
      try {
        const {bytes} = await get(next);
        const result = await css(new TextDecoder().decode(bytes), next, depth + 1);
        return media?.trim() ? `@media ${media.trim()} {${result}}` : result;
      } catch (error) { warnings.add(error.message); return ''; }
    });
    return replaceAsync(text, /url\(\s*(["']?)(.*?)\1\s*\)/gi, async (_match, _quote, url) =>
      `url("${(await asset(path, url)).replaceAll('"', '%22')}")`);
  }
  return {asset, css, warnings};
}

async function replaceAsync(input, regex, callback) {
  const matches = [...input.matchAll(regex)];
  const replacements = await Promise.all(matches.map(match => callback(...match)));
  let result = '', last = 0;
  matches.forEach((match, index) => {
    result += input.slice(last, match.index) + replacements[index];
    last = match.index + match[0].length;
  });
  return result + input.slice(last);
}

async function buildHtml(scripts) {
  const {asset, css, warnings} = resolver();
  const doc = new DOMParser().parseFromString(entry.source, 'text/html');
  for (const el of doc.querySelectorAll('base, meta[http-equiv="refresh"], meta[http-equiv="Content-Security-Policy"], iframe, frame, object, embed, form, link[rel~="preload"], link[rel~="prefetch"]')) el.remove();
  for (const el of doc.querySelectorAll('script')) {
    if (!scripts) { el.remove(); continue; }
    if (el.hasAttribute('src')) {
      const value = await asset(entry.path, el.getAttribute('src'));
      if (value && value.startsWith('data:text/javascript;')) el.setAttribute('src', value);
      else el.remove();
    }
  }
  for (const style of doc.querySelectorAll('style')) style.textContent = await css(style.textContent, entry.path);
  for (const link of doc.querySelectorAll('link')) {
    if (!link.relList.contains('stylesheet')) { link.remove(); continue; }
    const path = pathOf(entry.path, link.getAttribute('href') || '');
    if (!path || !/\.css$/i.test(path)) { link.remove(); warnings.add('An external stylesheet was blocked.'); continue; }
    try {
      const response = await asset(entry.path, link.getAttribute('href'));
      if (!response) { link.remove(); continue; }
      const text = atob(response.split(',')[1]);
      const style = doc.createElement('style');
      style.textContent = await css(new TextDecoder().decode(Uint8Array.from(text, c => c.charCodeAt(0))), path);
      link.replaceWith(style);
    } catch (error) { warnings.add(error.message); link.remove(); }
  }
  for (const el of doc.querySelectorAll('[style]')) el.setAttribute('style', await css(el.getAttribute('style'), entry.path));
  for (const el of doc.querySelectorAll('[src], [poster]')) {
    for (const attr of ['src', 'poster']) if (el.hasAttribute(attr)) {
      if (el.tagName === 'SCRIPT' && scripts) continue;
      el.setAttribute(attr, await asset(entry.path, el.getAttribute(attr)));
    }
  }
  for (const el of doc.querySelectorAll('[srcset]')) {
    const rewritten = [];
    for (const part of el.getAttribute('srcset').split(',')) {
      const [, url, descriptor] = part.trim().match(/^(\S+)(?:\s+(.*))?$/) || [];
      if (url) {
        const value = await asset(entry.path, url);
        if (value) rewritten.push(`${value} ${descriptor || ''}`);
      }
    }
    el.setAttribute('srcset', rewritten.join(', '));
  }
  for (const el of doc.querySelectorAll('[href]')) {
    if (el.tagName === 'A' || el.tagName === 'AREA' || el.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (!el.getAttribute('href').startsWith('#')) el.removeAttribute('href');
    }
  }
  const policy = ["default-src 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'none'",
    "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "img-src data: blob:",
    "media-src data: blob:", "font-src data: blob:", "style-src 'unsafe-inline' data: blob:",
    scripts ? "script-src 'unsafe-inline' data: blob:" : "script-src 'none'"].join('; ');
  const meta = doc.createElement('meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', policy);
  doc.head.prepend(meta);
  return {html: '<!doctype html>\n' + doc.documentElement.outerHTML, warnings};
}

async function render() {
  if (!entry || !ready) return;
  const id = ++generation;
  const scripts = toggle.checked;
  message('Resolving repository assets…');
  try {
    const {html, warnings} = await buildHtml(scripts);
    if (id !== generation) return;
    frame.contentWindow.postMessage({type: 'render', html, scripts}, '*');
    message([...warnings].slice(0, 3).join('  ·  '));
  } catch (error) { if (id === generation) message(`Preview failed: ${error.message}`); }
}
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.data?.type !== 'sandbox-ready') return;
  ready = true;
  render();
});
toggle.addEventListener('change', render);
document.getElementById('refresh').addEventListener('click', render);

(async () => {
  const nonce = location.hash.slice(1);
  if (!/^[\da-f-]{36}$/i.test(nonce)) throw Error('Invalid preview link.');
  const value = await chrome.storage.session.get(nonce);
  entry = value[nonce];
  await chrome.storage.session.remove(nonce);
  history.replaceState(null, '', location.pathname);
  if (!entry) throw Error('Preview data expired. Open it again from GitHub.');
  document.getElementById('filename').textContent = `${entry.owner}/${entry.repo}/${entry.path} @ ${entry.ref}`;
  document.getElementById('github').href = entry.pageUrl;
  render();
})().catch(error => message(error.message));
