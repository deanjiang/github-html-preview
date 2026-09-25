const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const elements = new Map();
const element = () => ({addEventListener() {}, set textContent(value) { this.text = value; }, set hidden(value) { this.isHidden = value; }});
const document = {getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }};
const files = {
  'site/css/site.css': '@import "theme.css"; body { background:url(../img/icon.png) }',
  'site/css/theme.css': 'h1 { color: teal }',
  'site/img/icon.png': 'PNG'
};
const requests = [];
const context = vm.createContext({document, window: {addEventListener() {}}, location: {hash: ''},
  history: {replaceState() {}}, chrome: {storage: {session: {get: async () => ({}), remove: async () => {}}}},
  TextDecoder, Uint8Array, String, btoa, URL, console, fetch: async url => {
    requests.push(url);
    const name = decodeURIComponent(new URL(url).pathname.split('/raw/refs/heads/main/')[1]);
    assert(name in files, `Unexpected fetch: ${url}`);
    const bytes = new TextEncoder().encode(files[name]);
    return {ok: true, status: 200, url: url.replace('github.com/', 'raw.githubusercontent.com/'),
      headers: {get: () => name.endsWith('.css') ? 'text/css' : 'image/png'},
      body: new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }})};
  }});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, 'preview.js'), 'utf8'), context);

(async () => {
  const path = expression => vm.runInContext(expression, context);
  assert.equal(path("pathOf('site/pages/index.html','../img/icon.png')"), 'site/img/icon.png');
  assert.equal(path("pathOf('index.html','../../secret')"), null);
  assert.equal(path("pathOf('site/index.html','https://example.com/x')"), null);
  assert.equal(path("pathOf('site/index.html','/root.css')"), null);
  vm.runInContext("entry = {owner:'team',repo:'demo',rawBase:'https://github.com/team/demo/raw/refs/heads/main/'}", context);
  const result = await vm.runInContext("resolver().css('@import \"../css/site.css\";', 'site/pages/index.html')", context);
  assert.match(result, /color: teal/);
  assert.match(result, /data:image\/png;base64/);
  assert.equal(requests.length, 3);
  assert(requests.every(url => url.startsWith('https://github.com/team/demo/raw/refs/heads/main/site/')));
  console.log('URL containment, CSS imports, and relative repository assets: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
