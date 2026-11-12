// Two real browsers sit at one online table and play a hand against two bots.
// Usage: node tools/online-check.mjs <out-dir> [url]
// Needs both `pnpm dev` and `pnpm dev:server` running, and Edge or Chrome installed.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:5173';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const errors = [];

async function open(name, viewport) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${name}: ${error}`));
    page.on('console', (message) => message.type() === 'error' && errors.push(`${name}: ${message.text()}`));
    return page;
}

const host = await open('host', { width: 1280, height: 800 });
const guest = await open('guest', { width: 390, height: 844 });

await host.goto(base);
await host.getByPlaceholder('Как вас зовут?').fill('Расул');
await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
await host.getByPlaceholder(/^Комната /).fill('Вечерний корт');
await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
await host.locator('.lobby-code').waitFor();
const code = (await host.locator('.lobby-code').textContent()).trim();
console.log(`table ${code}`);

await guest.goto(`${base}/?room=${code}`);
await guest.getByPlaceholder('Как вас зовут?').fill('Алия');
await guest.getByRole('button', { name: /Войти в комнату/ }).click();
await guest.locator('.lobby-code').waitFor();
await host.getByText('Алия').waitFor();
await host.screenshot({ path: join(outDir, 'online-1-host-lobby.png') });
await guest.screenshot({ path: join(outDir, 'online-2-guest-lobby.png') });

await host.getByRole('button', { name: /Начать/ }).click();
await host.locator('.hand-card').first().waitFor();
await guest.locator('.hand-card').first().waitFor();

async function moveIfDue(page) {
    const suit = page.locator('.trump-option').first();
    const card = page.locator('.hand-card.playable').first();
    if (await suit.isVisible()) {
        await page.waitForTimeout(600);
        await suit.click();
        return true;
    }
    if (await card.isVisible()) {
        const box = await card.boundingBox();
        if (!box) return false; // The card was played by the time we looked.
        await page.mouse.click(box.x + 14, box.y + box.height / 2);
        return true;
    }
    return false;
}

let moves = 0;
let shot = false;
for (let step = 0; step < 600; step++) {
    if ((await host.locator('.result').isVisible()) && (await guest.locator('.result').isVisible())) break;
    const moved = (await moveIfDue(host)) || (await moveIfDue(guest));
    if (moved) moves++;
    else await host.waitForTimeout(150);
    if (!shot && moves === 6) {
        shot = true;
        await guest.locator('.emotes-toggle').click();
        await guest.locator('.emotes button').first().click();
        await host.locator('.emote-bubble').waitFor();
        await host.screenshot({ path: join(outDir, 'online-3-host-game.png') });
        await guest.screenshot({ path: join(outDir, 'online-4-guest-game.png') });
    }
}

const result = async (page) => (await page.locator('.result-title').textContent())?.trim();
console.log(`host: ${await result(host)} | guest: ${await result(guest)} | moves by people: ${moves}`);

// A dropped connection: the guest reloads and must land back in the same seat.
await guest.reload();
await guest.getByRole('button', { name: /Войти в комнату/ }).click();
await guest.locator('.hand-card').first().waitFor({ timeout: 15000 });
console.log('guest rejoined the running game');
await guest.screenshot({ path: join(outDir, 'online-5-guest-rejoined.png') });

console.log(errors.length ? `ERRORS\n  ${errors.join('\n  ')}` : 'no console errors');
await browser.close();
