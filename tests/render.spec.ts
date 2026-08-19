import { PNG } from 'pngjs';
import { expect, test } from '@playwright/test';

const BASE = 'http://localhost:4173/';

interface RenderInfo {
  width: number;
  height: number;
}

/** Counts sampled pixels that are visibly not black, plus mean luminance. */
function samplePng(png: PNG): { litRatio: number; darkRatio: number; clippedRatio: number; meanLuma: number } {
  const w = png.width;
  const h = png.height;
  let lit = 0;
  let dark = 0;
  let clipped = 0;
  let total = 0;
  let lumaSum = 0;
  const step = 8;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (w * y + x) << 2;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      total++;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma;
      if (luma > 6) lit++;
      if (luma < 24) dark++;
      if (luma > 245) clipped++;
    }
  }
  return {
    litRatio: lit / total,
    darkRatio: dark / total,
    clippedRatio: clipped / total,
    meanLuma: lumaSum / total,
  };
}

test('solar system renders with eight planets and zero console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${String(err)}`);
  });

  await page.goto(`${BASE}?perf=low`, { waitUntil: 'load', timeout: 60_000 });
  // allow SwiftShader time to compile programs and draw several frames
  await page.waitForTimeout(5000);

  const shotPath = 'test-results/solar-system-frame.png';
  await page.screenshot({ path: shotPath });

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    return { width: canvas.width, height: canvas.height };
  });

  expect(info, 'scene canvas must exist').toBeTruthy();
  expect((info as RenderInfo).width).toBeGreaterThan(0);
  expect((info as RenderInfo).height).toBeGreaterThan(0);
  await expect(page).toHaveTitle(/SOLAR SYSTEM/);
  await expect(page.locator('.celestial-label')).toHaveCount(9);
  await expect(page.locator('.celestial-label', { hasText: 'Earth' })).toHaveCount(1);
  await expect(page.locator('.celestial-label', { hasText: 'Saturn' })).toHaveCount(1);
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toHaveLength(0);

  const png = await import('node:fs').then((fs) => PNG.sync.read(fs.readFileSync(shotPath)));
  const { litRatio, darkRatio, clippedRatio, meanLuma } = samplePng(png);

  // Sun, planets, belts, backdrop and bloom must produce a balanced frame.
  expect(litRatio, `too few lit pixels (litRatio=${litRatio.toFixed(4)})`).toBeGreaterThan(0.02);
  expect(meanLuma, `frame too dark (meanLuma=${meanLuma.toFixed(2)})`).toBeGreaterThan(2);
  expect(meanLuma, `frame washed out (meanLuma=${meanLuma.toFixed(2)})`).toBeLessThan(90);
  expect(darkRatio, `not enough dark space (darkRatio=${darkRatio.toFixed(4)})`).toBeGreaterThan(0.3);
  expect(clippedRatio, `too many clipped highlights (clippedRatio=${clippedRatio.toFixed(4)})`).toBeLessThan(0.08);
});

test('full-quality solar system boots', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${String(err)}`);
  });

  await page.goto(BASE, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    return { width: canvas.width, height: canvas.height };
  });
  expect(info, 'scene canvas must exist').toBeTruthy();
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toHaveLength(0);
});
