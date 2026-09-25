const frame = document.getElementById('render');
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.type !== 'render' ||
      typeof event.data.html !== 'string') return;
  // The inner frame gets another opaque origin and never shares this page's DOM.
  frame.setAttribute('sandbox', event.data.scripts ? 'allow-scripts' : '');
  frame.srcdoc = event.data.html;
});
window.parent.postMessage({type: 'sandbox-ready'}, '*');
