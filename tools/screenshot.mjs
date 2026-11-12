// Drives the game in a real browser and saves screenshots, for checking the UI by eye.
// Usage: node tools/screenshot.mjs <out-dir> [url]
// Needs the dev server running (pnpm dev) and Edge or Chrome installed.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:5173';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));

const VIEWPORTS = {
    desktop: { width: 1280, height: 800 },
    phone: { width: 390, height: 844 },
};

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    const shot = (label) => page.screenshot({ path: join(outDir, `${name}-${label}.png`) });

    await page.goto(`${base}/?seed=7`);
    await shot('1-menu');

    await page.getByRole('button', { name: 'Играть с ботами' }).click();
    await page.waitForTimeout(1200);
    await shot('2-dealt');

    // Play until the hand is over: name trump when asked, otherwise play the first legal card.
    let trickShots = 0;
    for (let step = 0; step < 400; step++) {
        if (await page.locator('.result').isVisible()) break;
        const suit = page.locator('.trump-option').first();
        const card = page.locator('.hand-card.playable').first();
        if (await suit.isVisible()) {
            await page.waitForTimeout(700);
            await shot('3-trump-picker');
            await suit.click();
            await page.waitForTimeout(500);
            await shot('4-trump-notice');
        } else if (await card.isVisible()) {
            if (trickShots === 1) await shot('5-my-turn');
            // Cards overlap: aim at the strip of the card that is actually visible.
            const box = await card.boundingBox();
            if (!box) continue;
            await page.mouse.click(box.x + 14, box.y + box.height / 2);
            if (trickShots === 1) {
                await page.waitForTimeout(140);
                await shot('6-card-flying');
            }
            trickShots++;
        } else {
            await page.waitForTimeout(150);
            if (trickShots === 3 && (await page.locator('.trick-card').count()) === 4) {
                await shot('7-full-trick');
                trickShots++;
            }
        }
    }
    await page.waitForTimeout(600);
    await shot('8-hand-over');

    console.log(`${name}: ${errors.length ? `ERRORS\n  ${errors.join('\n  ')}` : 'no console errors'}`);
    await page.close();
}

await browser.close();
