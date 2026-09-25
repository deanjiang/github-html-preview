const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Observed on https://github.com/w3c/html/blob/master/SOURCES.html (2026-09-25).
const pageData = {
  payload: {
    codeViewBlobLayoutRoute: {
      path: 'SOURCES.html', refInfo: {name: 'master'}, blob: {truncated: false}
    },
    'codeViewBlobLayoutRoute.StyledBlob': {
      rawLines: ['<!DOCTYPE html>', '<html>', '<h2>A rough guide to the documents used to build the HTML specification</h2>', '</html>']
    }
  }
};
let button, sent;
const raw = {
  textContent: 'Raw',
  href: 'https://github.com/w3c/html/raw/refs/heads/master/SOURCES.html',
  getAttribute(name) { return name === 'href' ? this.href : null; },
  insertAdjacentElement(position, element) { assert.equal(position, 'afterend'); button = element; button.previousElementSibling = raw; }
};
const document = {
  documentElement: {},
  querySelector(selector) { return selector === 'a[data-testid="raw-button"][href]' ? raw : null; },
  querySelectorAll(selector) {
    if (selector === 'script[data-target="react-app.embeddedData"]') return [{textContent: JSON.stringify(pageData)}];
    if (selector === 'a[href]') return [raw];
    throw Error(`Unexpected selector: ${selector}`);
  },
  getElementById() { return button; },
  createElement(tag) {
    assert.equal(tag, 'button');
    return {style: {}, addEventListener(event, handler) { if (event === 'click') this.click = handler; }};
  },
  addEventListener() {}
};
const context = vm.createContext({
  document, location: {pathname: '/w3c/html/blob/master/SOURCES.html'},
  window: {addEventListener() {}}, MutationObserver: class {observe() {}},
  setTimeout: handler => handler(),
  chrome: {runtime: {sendMessage: async message => { sent = message; return {ok: true}; }}},
  alert: message => {throw Error(message);}, URL
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8'), context);

(async () => {
  assert.equal(button?.textContent, 'Preview', 'Preview button appears beside Raw');
  await button.click();
  assert.equal(sent?.path, 'SOURCES.html');
  assert.equal(sent?.ref, 'master');
  assert.equal(sent?.rawBase, 'https://github.com/w3c/html/raw/refs/heads/master/');
  assert.match(sent?.source, /A rough guide to the documents/);
  assert.equal(button.textContent, 'Preview');
  let listener, saved, opened;
  const background = vm.createContext({
    URL, crypto: {randomUUID: () => '11111111-1111-4111-8111-111111111111'},
    chrome: {
      runtime: {onMessage: {addListener(handler) {listener = handler;}}, getURL: value => `chrome-extension://test/${value}`},
      storage: {session: {set: async value => {saved = value;}, remove: async () => {throw Error('Unexpected removal');}}},
      tabs: {create: async details => {opened = details;}}
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), background);
  const result = await new Promise(resolve => {
    assert.equal(listener(sent, {url: 'https://github.com/w3c/html/blob/master/SOURCES.html', tab: {id: 42}}, resolve), true);
  });
  assert.equal(result.ok, true);
  assert.equal(saved['11111111-1111-4111-8111-111111111111'].source, sent.source);
  assert.equal(opened.url, 'chrome-extension://test/preview.html#11111111-1111-4111-8111-111111111111');
  console.log('W3C SOURCES.html: button, source capture, and new-tab handoff: OK');
})().catch(error => {console.error(error); process.exitCode = 1;});
