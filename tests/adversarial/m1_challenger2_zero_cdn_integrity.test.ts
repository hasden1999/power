import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('M1 Challenger 2: Zero-CDN Compliance & Build Artifact Integrity Audit', () => {

  const knownCdnDomains = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'unpkg.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'cdn.skypack.dev',
    'esm.sh',
    'bootstrapcdn.com',
    'ajax.googleapis.com',
    'use.fontawesome.com',
    'code.jquery.com'
  ];

  function getFilesRecursively(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        getFilesRecursively(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  // --- 1. Dist Artifact CDN Scan ---
  it('E-CDN-1: scans all files in dist/ and verifies zero external CDN references', () => {
    const distPath = path.resolve('dist');
    assert.ok(fs.existsSync(distPath), 'dist/ directory must exist');

    const distFiles = getFilesRecursively(distPath);
    assert.ok(distFiles.length > 0, 'dist/ must contain built artifacts');

    const textExtensions = ['.html', '.css', '.js', '.webmanifest', '.svg', '.json'];
    const violations: { file: string; domain: string; line: number; snippet: string }[] = [];

    for (const file of distFiles) {
      const ext = path.extname(file).toLowerCase();
      if (!textExtensions.includes(ext)) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const cdn of knownCdnDomains) {
          if (line.includes(cdn)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              domain: cdn,
              line: i + 1,
              snippet: line.trim().slice(0, 100)
            });
          }
        }
      }
    }

    assert.equal(violations.length, 0, `External CDN references found in dist: ${JSON.stringify(violations, null, 2)}`);
  });

  // --- 2. Source Code CDN Scan ---
  it('E-CDN-2: scans all files in src/ and verifies zero external CDN references', () => {
    const srcPath = path.resolve('src');
    assert.ok(fs.existsSync(srcPath), 'src/ directory must exist');

    const srcFiles = getFilesRecursively(srcPath);
    const violations: { file: string; domain: string; line: number; snippet: string }[] = [];

    for (const file of srcFiles) {
      const ext = path.extname(file).toLowerCase();
      if (!['.ts', '.tsx', '.css', '.html', '.js', '.json'].includes(ext)) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const cdn of knownCdnDomains) {
          if (line.includes(cdn)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              domain: cdn,
              line: i + 1,
              snippet: line.trim().slice(0, 100)
            });
          }
        }
      }
    }

    assert.equal(violations.length, 0, `External CDN references found in src: ${JSON.stringify(violations, null, 2)}`);
  });

  // --- 3. Cairo .woff2 Font Verification & Precache ---
  it('E-FNT-1: verifies Cairo .woff2 fonts are present with valid WOFF2 magic header', () => {
    const fontFiles = [
      'cairo-arabic.woff2',
      'cairo-latin.woff2',
      'cairo-latin-arabic.woff2'
    ];

    const locations = [
      path.resolve('public/fonts'),
      path.resolve('dist/fonts')
    ];

    for (const loc of locations) {
      assert.ok(fs.existsSync(loc), `Font directory must exist: ${loc}`);
      for (const font of fontFiles) {
        const fullPath = path.join(loc, font);
        assert.ok(fs.existsSync(fullPath), `Font file missing: ${fullPath}`);

        const stats = fs.statSync(fullPath);
        assert.ok(stats.size > 20000, `Font file size unexpectedly small (${stats.size} bytes): ${font}`);

        // Read first 4 bytes to verify WOFF2 signature: 0x77 0x4F 0x46 0x32 ("wOF2")
        const fd = fs.openSync(fullPath, 'r');
        const buffer = Buffer.alloc(4);
        fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);

        const magic = buffer.toString('ascii');
        assert.equal(magic, 'wOF2', `Invalid WOFF2 magic header in ${font}: expected 'wOF2', got '${magic}'`);
      }
    }
  });

  it('E-FNT-2: verifies Cairo fonts and SQLite WASM are precached in dist/sw.js', () => {
    const swPath = path.resolve('dist/sw.js');
    assert.ok(fs.existsSync(swPath), 'dist/sw.js must exist');

    const swContent = fs.readFileSync(swPath, 'utf-8');

    // Verify precache entries
    assert.ok(swContent.includes('fonts/cairo-arabic.woff2'), 'dist/sw.js must precache fonts/cairo-arabic.woff2');
    assert.ok(swContent.includes('fonts/cairo-latin.woff2'), 'dist/sw.js must precache fonts/cairo-latin.woff2');
    assert.ok(swContent.includes('fonts/cairo-latin-arabic.woff2'), 'dist/sw.js must precache fonts/cairo-latin-arabic.woff2');
    assert.ok(swContent.includes('wasm/sqlite3.wasm'), 'dist/sw.js must precache wasm/sqlite3.wasm');
    assert.ok(swContent.includes('index.html'), 'dist/sw.js must precache index.html');
  });

  // --- 4. dist/index.html Network Isolation & 100% Offline Asset Resolution ---
  it('E-HTM-1: verifies dist/index.html has zero external network requests', () => {
    const indexPath = path.resolve('dist/index.html');
    assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');

    const html = fs.readFileSync(indexPath, 'utf-8');

    // 1. Check for absolute external URLs with protocol
    const externalUrlRegex = /(href|src|action)\s*=\s*["'](https?:)?\/\/[^"']+/gi;
    const matches = html.match(externalUrlRegex) || [];
    assert.equal(matches.length, 0, `External network requests found in dist/index.html: ${matches.join(', ')}`);

    // 2. Check all <link> hrefs are local
    const linkHrefRegex = /<link[^>]+href=["']([^"']+)["']/gi;
    let match;
    while ((match = linkHrefRegex.exec(html)) !== null) {
      const href = match[1];
      assert.ok(
        href.startsWith('/') || href.startsWith('./') || href.startsWith('#'),
        `<link> href is not local: ${href}`
      );
      assert.ok(!href.includes('://'), `<link> href contains protocol: ${href}`);
    }

    // 3. Check all <script> srcs are local
    const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["']/gi;
    while ((match = scriptSrcRegex.exec(html)) !== null) {
      const src = match[1];
      assert.ok(
        src.startsWith('/') || src.startsWith('./'),
        `<script> src is not local: ${src}`
      );
      assert.ok(!src.includes('://'), `<script> src contains protocol: ${src}`);
    }

    // 4. Verify font preload tag exists and targets local woff2
    assert.ok(
      html.includes('href="/fonts/cairo-arabic.woff2"'),
      'dist/index.html must preload local /fonts/cairo-arabic.woff2'
    );

    // 5. Verify dir="rtl" and lang="ar"
    assert.ok(html.includes('dir="rtl"'), 'dist/index.html must have dir="rtl"');
    assert.ok(html.includes('lang="ar"'), 'dist/index.html must have lang="ar"');
  });

  it('E-OFF-1: verifies 100% of resources referenced in dist/index.html exist locally on disk', () => {
    const distPath = path.resolve('dist');
    const indexPath = path.join(distPath, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');

    // Extract all local href and src paths
    const localAssetRegex = /(?:href|src)=["']\/([^"']+)["']/g;
    let match;
    const assetsFound: string[] = [];

    while ((match = localAssetRegex.exec(html)) !== null) {
      const relativeAsset = match[1];
      assetsFound.push(relativeAsset);
      const fullPath = path.join(distPath, relativeAsset);
      assert.ok(
        fs.existsSync(fullPath),
        `Asset referenced in index.html missing from dist: ${relativeAsset}`
      );
    }

    assert.ok(assetsFound.length >= 5, `Expected at least 5 local assets in index.html, found ${assetsFound.length}`);
  });

  // --- 5. COOP & COEP Headers Verification ---
  it('E-HDR-1: verifies COOP and COEP headers in vercel.json', () => {
    const vercelPath = path.resolve('vercel.json');
    assert.ok(fs.existsSync(vercelPath), 'vercel.json must exist');

    const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
    assert.ok(Array.isArray(vercelConfig.headers), 'vercel.json must have headers array');

    // Find catch-all route /(.*)
    const catchAllRule = vercelConfig.headers.find(
      (h: any) => h.source === '/(.*)'
    );
    assert.ok(catchAllRule, 'vercel.json must define headers for /(.*)');

    const headerMap = new Map<string, string>();
    for (const h of catchAllRule.headers) {
      headerMap.set(h.key.toLowerCase(), h.value);
    }

    // Verify Cross-Origin-Opener-Policy
    assert.equal(
      headerMap.get('cross-origin-opener-policy'),
      'same-origin',
      'COOP must be "same-origin"'
    );

    // Verify Cross-Origin-Embedder-Policy
    assert.equal(
      headerMap.get('cross-origin-embedder-policy'),
      'require-corp',
      'COEP must be "require-corp"'
    );

    // Verify sw.js cache-busting rule
    const swRule = vercelConfig.headers.find((h: any) => h.source === '/sw.js');
    assert.ok(swRule, 'vercel.json must define headers for /sw.js');
    const swCache = swRule.headers.find((h: any) => h.key.toLowerCase() === 'cache-control');
    assert.ok(swCache && swCache.value.includes('max-age=0'), '/sw.js must have max-age=0 Cache-Control');

    // Verify /fonts/(.*) MIME type and CORP
    const fontsRule = vercelConfig.headers.find((h: any) => h.source === '/fonts/(.*)');
    assert.ok(fontsRule, 'vercel.json must define headers for /fonts/(.*)');
    const fontType = fontsRule.headers.find((h: any) => h.key.toLowerCase() === 'content-type');
    assert.equal(fontType?.value, 'font/woff2', 'Fonts must have Content-Type: font/woff2');
    const fontCorp = fontsRule.headers.find((h: any) => h.key.toLowerCase() === 'cross-origin-resource-policy');
    assert.equal(fontCorp?.value, 'same-origin', 'Fonts must have CORP: same-origin');

    // Verify /wasm/(.*) MIME type and CORP
    const wasmRule = vercelConfig.headers.find((h: any) => h.source === '/wasm/(.*)');
    assert.ok(wasmRule, 'vercel.json must define headers for /wasm/(.*)');
    const wasmType = wasmRule.headers.find((h: any) => h.key.toLowerCase() === 'content-type');
    assert.equal(wasmType?.value, 'application/wasm', 'WASM must have Content-Type: application/wasm');
    const wasmCorp = wasmRule.headers.find((h: any) => h.key.toLowerCase() === 'cross-origin-resource-policy');
    assert.equal(wasmCorp?.value, 'same-origin', 'WASM must have CORP: same-origin');
  });

  it('E-HDR-2: verifies COOP and COEP headers and Workbox settings in vite.config.ts', () => {
    const viteConfigPath = path.resolve('vite.config.ts');
    assert.ok(fs.existsSync(viteConfigPath), 'vite.config.ts must exist');

    const viteConfigText = fs.readFileSync(viteConfigPath, 'utf-8');

    // Check server headers
    assert.ok(
      viteConfigText.includes("'Cross-Origin-Opener-Policy': 'same-origin'"),
      'server/preview headers must include COOP same-origin'
    );
    assert.ok(
      viteConfigText.includes("'Cross-Origin-Embedder-Policy': 'require-corp'"),
      'server/preview headers must include COEP require-corp'
    );

    // Check Workbox maximumFileSizeToCacheInBytes is configured for large WASM/font assets
    assert.ok(
      viteConfigText.includes('maximumFileSizeToCacheInBytes: 6 * 1024 * 1024') ||
      viteConfigText.includes('maximumFileSizeToCacheInBytes: 6291456'),
      'vite.config.ts must configure maximumFileSizeToCacheInBytes to 6MB'
    );

    // Check globPatterns includes wasm and woff2
    assert.ok(viteConfigText.includes('wasm'), 'globPatterns must include wasm');
    assert.ok(viteConfigText.includes('woff2'), 'globPatterns must include woff2');
  });

  // --- 6. SQLite WASM Binary Integrity ---
  it('E-WSM-1: verifies SQLite WASM binary file exists with valid WASM magic header', () => {
    const wasmLocations = [
      path.resolve('public/wasm/sqlite3.wasm'),
      path.resolve('dist/wasm/sqlite3.wasm')
    ];

    for (const wasmFile of wasmLocations) {
      assert.ok(fs.existsSync(wasmFile), `SQLite WASM file missing: ${wasmFile}`);

      const stats = fs.statSync(wasmFile);
      assert.ok(stats.size > 800000, `SQLite WASM file size unexpectedly small (${stats.size} bytes): ${wasmFile}`);

      // Verify WASM magic bytes: 0x00 0x61 0x73 0x6D ("\0asm") followed by version 0x01 0x00 0x00 0x00
      const fd = fs.openSync(wasmFile, 'r');
      const buffer = Buffer.alloc(8);
      fs.readSync(fd, buffer, 0, 8, 0);
      fs.closeSync(fd);

      assert.equal(buffer[0], 0x00, 'WASM byte 0 must be 0x00');
      assert.equal(buffer[1], 0x61, 'WASM byte 1 must be 0x61 (a)');
      assert.equal(buffer[2], 0x73, 'WASM byte 2 must be 0x73 (s)');
      assert.equal(buffer[3], 0x6D, 'WASM byte 3 must be 0x6D (m)');
      assert.equal(buffer[4], 0x01, 'WASM version byte 4 must be 0x01');
      assert.equal(buffer[5], 0x00, 'WASM version byte 5 must be 0x00');
      assert.equal(buffer[6], 0x00, 'WASM version byte 6 must be 0x00');
      assert.equal(buffer[7], 0x00, 'WASM version byte 7 must be 0x00');
    }
  });

  // --- 7. Dist CSS font-face and URL integrity ---
  it('E-CSS-1: verifies built CSS in dist/assets has local font-face definitions and no external fonts', () => {
    const distAssetsDir = path.resolve('dist/assets');
    const cssFiles = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.css'));
    assert.ok(cssFiles.length > 0, 'dist/assets must contain built CSS');

    for (const cssFile of cssFiles) {
      const cssContent = fs.readFileSync(path.join(distAssetsDir, cssFile), 'utf-8');

      // Verify font-face points to local /fonts/
      assert.ok(
        cssContent.includes('/fonts/cairo-arabic.woff2'),
        'Built CSS must reference local /fonts/cairo-arabic.woff2'
      );

      // Verify no url(http...)
      const externalUrlInCss = /url\s*\(\s*["']?https?:\/\//i;
      assert.equal(
        externalUrlInCss.test(cssContent),
        false,
        'Built CSS must not reference external HTTP/HTTPS font or image URLs'
      );
    }
  });

  // --- 8. Dist JS Bundle Network Calls Check ---
  it('E-JS-1: verifies built JavaScript in dist/assets contains zero active external network endpoints', () => {
    const distAssetsDir = path.resolve('dist/assets');
    const jsFiles = fs.readdirSync(distAssetsDir).filter(f => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'dist/assets must contain built JS');

    for (const jsFile of jsFiles) {
      const jsContent = fs.readFileSync(path.join(distAssetsDir, jsFile), 'utf-8');

      // Look for active HTTP fetch/XHR
      const fetchHttpRegex = /fetch\s*\(\s*["']https?:\/\//i;
      assert.equal(
        fetchHttpRegex.test(jsContent),
        false,
        `Built JS (${jsFile}) contains external fetch call`
      );

      const xhrHttpRegex = /open\s*\(\s*["'][A-Z]+["']\s*,\s*["']https?:\/\//i;
      assert.equal(
        xhrHttpRegex.test(jsContent),
        false,
        `Built JS (${jsFile}) contains external XMLHttpRequest call`
      );
    }
  });
});
