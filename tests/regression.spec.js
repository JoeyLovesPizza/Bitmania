// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const FIXTURE = path.join(__dirname, 'fixtures', 'sample.png');

/** @param {import('@playwright/test').Page} page */
async function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

/** @param {import('@playwright/test').Page} page */
async function waitForRenderer(page) {
  await expect(page.locator('#c')).toBeVisible();
  await page.waitForFunction(() => {
    const canvas = document.getElementById('c');
    const gl = canvas && canvas.getContext('webgl2');
    return !!gl && !gl.isContextLost();
  });
  await page.waitForTimeout(300);
}

/** @param {import('@playwright/test').Page} page */
async function loadFixtureImage(page) {
  await page.locator('#file-input').setInputFiles(FIXTURE);
  await expect(page.locator('#no-img')).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

/** @param {import('@playwright/test').Page} page */
async function readCanvasPixelVariance(page) {
  return page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
    const gl = canvas.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no-webgl2' };

    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return { ok: false, reason: 'zero-size' };

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      null,
      0,
    );

    // Read from default framebuffer (canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.deleteFramebuffer(fb);

    let sum = 0;
    let sumSq = 0;
    const step = Math.max(1, Math.floor((w * h) / 4096));
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4 * step) {
      const v = pixels[i] + pixels[i + 1] + pixels[i + 2];
      sum += v;
      sumSq += v * v;
      count += 1;
    }
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return { ok: true, width: w, height: h, variance, mean };
  });
}

test.describe('Bitmania regression', () => {
  test('loads with WebGL2 and no shader errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await page.goto('/index.html');
    await waitForRenderer(page);

    expect(errors.filter((e) => /shader|webgl/i.test(e))).toEqual([]);
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#status #s-pat')).toContainText('DOTS');
  });

  test('initializes canvas with valid dimensions', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    const stats = await readCanvasPixelVariance(page);
    expect(stats.ok).toBe(true);
    expect(stats.width).toBeGreaterThan(0);
    expect(stats.height).toBeGreaterThan(0);
  });

  test('loads a fixture image and updates status', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    await expect(page.locator('#s-res')).not.toContainText('—');
    const stats = await readCanvasPixelVariance(page);
    expect(stats.ok).toBe(true);
    expect(stats.variance).toBeGreaterThan(0);
  });

  test('switches across all pattern modes', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    const patterns = [
      { value: '0', label: 'DOTS' },
      { value: '1', label: 'LINES' },
      { value: '2', label: 'RINGS' },
      { value: '3', label: 'CMYK' },
      { value: '4', label: 'ASCII' },
      { value: '5', label: 'MIX' },
    ];

    for (const pattern of patterns) {
      await page.locator('#patternType').selectOption(pattern.value);
      await page.waitForTimeout(250);
      await expect(page.locator('#status #s-pat')).toContainText(pattern.label);

      const stats = await readCanvasPixelVariance(page);
      expect(stats.ok).toBe(true);
      expect(stats.variance).toBeGreaterThan(0);
    }
  });

  test('applies built-in presets', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    const presets = ['newspaper', 'highcontrast', 'fineline', 'gooey', 'rings'];
    for (const preset of presets) {
      await page.locator('#preset-sel').selectOption(preset);
      await page.waitForTimeout(300);
      const stats = await readCanvasPixelVariance(page);
      expect(stats.ok).toBe(true);
      expect(stats.variance).toBeGreaterThan(0);
    }
  });

  test('reset restores defaults', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    await page.locator('#patternType').selectOption('3');
    await page.locator('#contrast').fill('60');
    await page.locator('#btn-reset').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#patternType')).toHaveValue('0');
    await expect(page.locator('#contrast')).toHaveValue('0');
  });

  test('viewport zoom controls update status', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    const before = await page.locator('#s-zoom').textContent();
    await page.locator('#btn-zoom-in').click();
    await page.waitForTimeout(150);
    const after = await page.locator('#s-zoom').textContent();
    expect(after).not.toBe(before);

    await page.locator('#btn-fit').click();
    await page.waitForTimeout(150);
    await expect(page.locator('#s-zoom')).toContainText('%');
  });

  test('exports a PNG download', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^halftone-.*\.png$/);
    const outPath = path.join(test.info().outputDir, download.suggestedFilename());
    await download.saveAs(outPath);
    const size = fs.statSync(outPath).size;
    expect(size).toBeGreaterThan(100);
  });

  test('toggles Layer B overlay', async ({ page }) => {
    await page.goto('/index.html');
    await waitForRenderer(page);
    await loadFixtureImage(page);

    await page.evaluate(() => {
      const section = document.getElementById('s-layerb');
      section?.classList.remove('closed');
      const enabled = document.getElementById('layerBEnabled');
      if (enabled) enabled.checked = true;
      const patternB = document.getElementById('patternTypeB');
      if (patternB) patternB.value = '2';
    });
    await page.waitForTimeout(400);

    const stats = await readCanvasPixelVariance(page);
    expect(stats.ok).toBe(true);
    expect(stats.variance).toBeGreaterThan(0);
  });
});
