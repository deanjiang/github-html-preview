const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// GitHub's client-side navigation to the W3C file includes repo metadata and Raw,
// but can omit codeViewBlobLayoutRoute and rawLines until a full page refresh.
let button, observer, sent, saved, opened, fetched;
const location = {pathname: '/w3c/html'};
const data = {payload: {
  codeViewRepoRoute: {refInfo: {name: 'master'}, path: '/'},
  codeViewLayoutRoute: {refInfo: {name: 'master'}, path: '/'}
}};
const raw = {
  href: 'https://github.com/w3c/html/raw/refs/heads/master/SOURCES.html',
  insertAdjacentElement(position, element) {
    assert.equal(position, 'afterend');
    button = element;
    button.previousElementSibling = raw;
  }
};
const document = {
  documentElement: {},
  querySelector(selector) { return selector === 'a[data-testid="raw-button"][href]' && location.pathname.endsWith('.html') ? raw : null; },
  querySelectorAll(selector) {
    if (selector === 'script[data-target="react-app.embeddedData"]') return [{textContent: JSON.stringify(data)}];
    if (selector === 'a[href]') return [];
    throw Error(`Unexpected selector: ${selector}`);
  },
  getElementById() { return button; },
  createElement(tag) {
    assert.equal(tag, 'button');
    return {style: {}, addEventListener(event, handler) { if (event === 'click') this.click = handler; }};
  },
  addEventListener() {}
};
const script = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const context = vm.createContext({
  document, location, URL, window: {addEventListener() {}},
  MutationObserver: class {constructor(handler) {observer = handler;} observe() {}},
  setTimeout: handler => handler(),
  chrome: {runtime: {sendMessage: async message => {sent = message; return {ok: true};}}},
  alert: message => {throw Error(message);}
});
vm.runInContext(script('content.js'), context);
assert.equal(button, undefined, 'No button on repository overview');

(async () => {
  location.pathname = '/w3c/html/blob/master/SOURCES.html';
  observer(); // GitHub Turbo replaces the page in place; no second refresh.
  assert.equal(button?.textContent, 'Preview', 'Preview appears on first client-side visit');
  await button.click();
  assert.equal(sent?.path, 'SOURCES.html');
  assert.equal(sent?.ref, 'master');
  assert.equal(sent?.source, null, 'Missing embedded source requests a Raw fetch');
  assert.equal(sent?.rawBase, 'https://github.com/w3c/html/raw/refs/heads/master/');

  let listener;
  const html = '<!doctype html><title>W3C HTML sources</title>';
  const background = vm.createContext({
    URL, TextDecoder, crypto: {randomUUID: () => '11111111-1111-4111-8111-111111111111'},
    fetch: async url => {
      fetched = url;
      return {ok: true, status: 200, url: 'https://raw.githubusercontent.com/w3c/html/master/SOURCES.html',
        body: new ReadableStream({start(controller) {
          controller.enqueue(new TextEncoder().encode(html)); controller.close();
        }})};
    },
    chrome: {
      runtime: {onMessage: {addListener(handler) {listener = handler;}}, getURL: value => `chrome-extension://test/${value}`},
      storage: {session: {set: async value => {saved = value;}, remove: async () => {throw Error('Unexpected removal');}}},
      tabs: {create: async details => {opened = details;}}
    }
  });
  vm.runInContext(script('background.js'), background);
  const result = await new Promise(resolve => {
    assert.equal(listener(sent, {url: 'https://github.com/w3c/html/blob/master/SOURCES.html', tab: {id: 42}}, resolve), true);
  });
  assert.equal(result.ok, true);
  assert.equal(fetched, 'https://github.com/w3c/html/raw/refs/heads/master/SOURCES.html');
  assert.equal(saved['11111111-1111-4111-8111-111111111111'].source, html);
  assert.equal(opened.url, 'chrome-extension://test/preview.html#11111111-1111-4111-8111-111111111111');
  console.log('W3C SPA navigation: first-visit button, Raw fallback, new-tab handoff: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
