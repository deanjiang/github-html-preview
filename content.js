(() => {
  const BUTTON_ID = 'gh-html-preview-action';
  let scheduled = false;

  function pageTarget() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length < 5 || parts[2] !== 'blob' || !/\.html?$/i.test(parts.at(-1))) return null;
    const [owner, repo] = parts;
    if (!/^[\w-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
    return {owner, repo, rest: decodeURIComponent(parts.slice(3).join('/'))};
  }

  function context() {
    const target = pageTarget();
    if (!target) return null;
    for (const script of document.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
      try {
        const embedded = JSON.parse(script.textContent).payload;
        const blob = embedded?.codeViewBlobLayoutRoute || embedded;
        const candidates = [blob, embedded?.codeViewRepoRoute, embedded?.codeViewLayoutRoute];
        for (const candidate of candidates) {
          const ref = candidate?.refInfo?.name;
          if (typeof ref !== 'string' || !target.rest.startsWith(ref + '/')) continue;
          const path = target.rest.slice(ref.length + 1);
          if (!/\.html?$/i.test(path)) continue;
          const sameBlob = blob?.path === path && blob?.refInfo?.name === ref;
          const rawLines = sameBlob
            ? embedded?.['codeViewBlobLayoutRoute.StyledBlob']?.rawLines || blob?.blob?.rawLines
            : undefined;
          return {owner: target.owner, repo: target.repo, ref, path,
            rawLines, truncated: sameBlob && blob?.blob?.truncated};
        }
      } catch { /* Other embedded applications on GitHub have different data. */ }
    }
    return null;
  }

  function extractSource(current) {
    const lines = current.rawLines;
    if (!current.truncated && Array.isArray(lines) && lines.every(line => typeof line === 'string'))
      return lines.join('\n');
    return null; // SPA navigation can omit source data; the background fetches GitHub Raw.
  }

  function rawBase(raw, current) {
    const url = new URL(raw.href);
    const prefix = `/${current.owner}/${current.repo}/raw/`;
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith(prefix)) throw Error('Invalid Raw link.');
    const segments = url.pathname.split('/');
    const count = current.path.split('/').length;
    if (decodeURIComponent(segments.slice(-count).join('/')) !== current.path) throw Error('Raw link does not match this file.');
    url.pathname = segments.slice(0, -count).join('/') + '/';
    url.search = '';
    url.hash = '';
    return url.href;
  }

  async function openPreview(button, raw) {
    const current = context();
    if (!current) { alert('GitHub HTML Preview: File metadata is still loading. Try clicking Preview again.'); return; }
    button.disabled = true;
    button.textContent = 'Opening…';
    try {
      const result = await chrome.runtime.sendMessage({type: 'open-preview',
        owner: current.owner, repo: current.repo, ref: current.ref, path: current.path,
        rawBase: rawBase(raw, current), source: extractSource(current)});
      if (!result?.ok) throw Error(result?.error || 'Could not open preview.');
    } catch (error) {
      alert(`GitHub HTML Preview: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Preview';
    }
  }

  function update() {
    scheduled = false;
    const existing = document.getElementById(BUTTON_ID);
    if (!pageTarget()) { existing?.remove(); return; }
    const raw = document.querySelector('a[data-testid="raw-button"][href]') ||
      [...document.querySelectorAll('a[href]')].find(a =>
      a.textContent.trim() === 'Raw' && /\/raw\//.test(a.getAttribute('href') || ''));
    if (!raw) { existing?.remove(); return; }
    if (existing && existing.previousElementSibling === raw) return;
    existing?.remove();
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Preview';
    button.title = 'Preview this HTML file in a new tab';
    button.style.cssText = 'display:inline-flex;align-items:center;vertical-align:middle;height:28px;margin-left:6px;padding:0 10px;border:1px solid #0969da;border-radius:6px;background:#0969da;color:#fff;font:500 12px/18px system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer';
    button.addEventListener('mouseenter', () => { if (!button.disabled) button.style.backgroundColor = '#0757b5'; });
    button.addEventListener('mouseleave', () => { button.style.backgroundColor = '#0969da'; });
    button.addEventListener('click', () => openPreview(button, raw));
    raw.insertAdjacentElement('afterend', button);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(update, 150);
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href']
  });
  document.addEventListener('turbo:load', schedule);
  document.addEventListener('turbo:render', schedule);
  document.addEventListener('pjax:end', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('popstate', schedule);
  schedule();
})();
