# GitHub HTML Preview

A dependency-free Chrome Manifest V3 extension that adds a **Preview** button beside **Raw** on GitHub `.html` and `.htm` file pages. It opens the rendered HTML in a second tab, including for private repositories you can already access in GitHub. No separate login, token, OAuth app, or backend is required.

GitHub HTML Preview is currently under review by the Chrome Web Store and will soon be available there.

## Install from local files

1. Download [`github-html-preview-store-v0.1.3.zip`](https://github.com/deanjiang/github-html-preview/releases/latest/download/github-html-preview-store-v0.1.3.zip) from the latest GitHub release and extract it. Open the extracted folder; you should see `manifest.json` directly inside it.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder, not the ZIP file or its parent folder.
4. Open an HTML file on `github.com`, such as [w3c/html/SOURCES.html](https://github.com/w3c/html/blob/master/SOURCES.html), and click **Preview** beside **Raw**. Reload any GitHub tab that was open before installation.
5. For pages that generate images or other content with JavaScript, select **Enable active content** in the preview tab. Only enable it for repository code you trust.

After editing the extension or replacing its local files, click **Reload** on its card at `chrome://extensions`, then reload the GitHub page. **Load unpacked** takes the extracted project folder; the store upload ZIP is for the developer dashboard.

## What it supports

- Captures HTML source delivered to the open GitHub blob page, or fetches Raw when GitHub omits source data during client-side navigation, and passes it once to the preview tab using `chrome.storage.session`.
- Resolves relative CSS, images, fonts, CSS imports, and classic JavaScript files through the same repository's GitHub Raw route. Scripts are disabled by default.
- Renders repository HTML inside an opaque-origin sandboxed iframe, separated from extension APIs, GitHub's DOM, and the trusted preview toolbar.
- Prevents rendered content from making network requests, submitting forms, opening frames, or navigating its top-level tab. Nonfragment links are disabled.

### Current limits

GitHub's embedded page data and UI selectors are not stable public APIs. Large files, root-relative paths, external image URLs, CSS edge cases, dynamic imports, and JavaScript network calls are not supported. Some private asset redirects may use hosts outside the two declared permissions and fail with a warning. The HTML is captured or fetched at click time, while assets are fetched when the preview loads; a moving branch can give different versions. Use a commit permalink when exact consistency matters.

Reloading the preview tab after its one-time source handoff requires opening Preview from GitHub again. The extension has no analytics, backend, password access, or `cookies` permission.

## Project layout

| Path | Purpose |
|---|---|
| `content.js` | GitHub page detection, Preview button, source extraction |
| `background.js` | One-time session handoff and new tab |
| `preview.html`, `preview.css`, `preview.js` | Trusted toolbar and repository asset resolution |
| `sandbox.html`, `sandbox.js` | Isolated HTML renderer |
| `icons/` | Runtime extension icons, including `icon128.png` in the store upload ZIP |
| `assets/promo-440x280.png` | Small store listing promo image; excluded from the extension package |
| `assets/store-screenshot-1280x800.png` | Store listing screenshot (24-bit RGB PNG); upload separately in the dashboard |
| `assets/store-icon-128x128.png` | Copy of `icons/icon128.png` for easy review; the icon inside the extension ZIP is authoritative |
| `test-w3c.cjs`, `test-spa.cjs`, `tests.cjs` | Dependency-free Node checks |
| `scripts/package_store.py` | Builds a store upload ZIP with `manifest.json` at its root |

## Development checks

Run with a current Node.js release:

```bash
node test-w3c.cjs
node test-spa.cjs
node tests.cjs
```

The first test covers a full GitHub page load of the W3C example. The second reproduces its client-side navigation without embedded blob data and checks the Raw fallback and new-tab handoff. The last tests repository path containment and relative CSS/image resolution. Also test the unpacked extension manually in Chrome, including public and accessible private repositories. These Node checks are not a replacement for a live browser test.

## Publish to the Chrome Web Store

1. Register or sign in to your [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole), then choose **Add new item**. The store takes a runtime ZIP with `manifest.json` at its root, not this project ZIP.
2. From the extracted `github-html-preview-project` directory, build the runtime ZIP:

   ```bash
   python3 scripts/package_store.py
   ```

3. Upload `dist/github-html-preview-store-v0.1.3.zip` on the dashboard's **Package** page. The store icon `icons/icon128.png` is already inside this ZIP, referenced by `manifest.json`. Do not upload the project ZIP in its place.
4. On **Store listing**, add your description and upload `assets/store-screenshot-1280x800.png` as a screenshot and `assets/promo-440x280.png` as the small promotional image. The copy at `assets/store-icon-128x128.png` is included only for reference; the store reads the icon from the runtime ZIP. Use screenshots that accurately represent the version being submitted.
5. Complete the **Privacy** and **Distribution** sections, including a public privacy-policy URL and an accurate description of the repository content handled by the extension. Provide any requested review instructions, then choose **Submit for review**. Publication happens through the dashboard after review and according to your chosen distribution settings.

If you later publish a runtime change, increase `version` in `manifest.json`, rebuild the store ZIP, and upload the new package. Listing images can be changed in the dashboard separately from the extension code.

The optional **Enable active content** feature runs repository JavaScript in the sandbox after an explicit click. Describe it accurately in the Web Store's remote-code declaration and privacy information. The extension handles GitHub file contents locally, including potentially private source; disclose that even though it has no separate server.

## License

This project is licensed under the [MIT License](LICENSE).

## Put this project on GitHub

Unzip the project, create an empty repository on GitHub, then run from this directory:

```bash
git init -b main
git add .
git commit -m "Initial GitHub HTML Preview extension"
git remote add origin https://github.com/YOUR_USERNAME/github-html-preview.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your account name. Add a license only after choosing the terms under which you want others to use the code.
