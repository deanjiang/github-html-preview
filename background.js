const MAX_SOURCE = 8 * 1024 * 1024;

async function fetchSource(rawUrl) {
  const response = await fetch(rawUrl, {credentials: 'include', redirect: 'follow'});
  const final = new URL(response.url);
  if (!response.ok || !['github.com', 'raw.githubusercontent.com'].includes(final.hostname) ||
      (final.hostname === 'github.com' && final.pathname !== new URL(rawUrl).pathname))
    throw Error(`GitHub Raw could not provide this file (HTTP ${response.status}).`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let source = '', size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE) throw Error('This HTML file exceeds the preview size limit.');
      source += decoder.decode(value, {stream: true});
    }
  } finally { reader.releaseLock(); }
  return source + decoder.decode();
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'open-preview') return;
  (async () => {
    const page = new URL(sender.url || 'about:blank');
    if (page.origin !== 'https://github.com' || !sender.tab ||
        (message.source !== null && typeof message.source !== 'string') ||
        (typeof message.source === 'string' && message.source.length > MAX_SOURCE) ||
        !/^[\w-]+$/.test(message.owner) || !/^[\w.-]+$/.test(message.repo) ||
        !/^[^\x00-\x1f]+$/.test(message.ref) || !/^[^\x00-\x1f]+\.html?$/i.test(message.path) ||
        !page.pathname.startsWith(`/${message.owner}/${message.repo}/blob/`)) {
      throw Error('Invalid GitHub preview request.');
    }
    const raw = new URL(message.rawBase);
    if (raw.origin !== 'https://github.com' || raw.search || raw.hash ||
        !raw.pathname.startsWith(`/${message.owner}/${message.repo}/raw/`) || !raw.pathname.endsWith('/'))
      throw Error('Invalid GitHub Raw link.');
    const encodedPath = message.path.split('/').map(encodeURIComponent).join('/');
    const source = message.source === null ? await fetchSource(raw.href + encodedPath) : message.source;
    const nonce = crypto.randomUUID();
    await chrome.storage.session.set({[nonce]: {
      source, owner: message.owner, repo: message.repo,
      ref: message.ref, path: message.path, rawBase: raw.href, pageUrl: page.href
    }});
    try {
      await chrome.tabs.create({url: chrome.runtime.getURL(`preview.html#${nonce}`), active: true});
    } catch (error) {
      await chrome.storage.session.remove(nonce);
      throw error;
    }
    return {ok: true};
  })().then(respond, error => respond({ok: false, error: error.message}));
  return true;
});
