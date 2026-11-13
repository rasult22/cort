// Three real browsers at one online table: a signed-in host, a guest and a spectator.
// They pick seats, play, react, run out of time, swap roles and finish a whole match;
// the host then opens the profile to see it in the history.
//
// Usage: node tools/online-check.mjs <out-dir> [url]
// Needs `pnpm dev` and the server started for testing:
//   DEV_LOGIN=1 FAST_BOTS=1 TURN_SECONDS=8 pnpm dev:server
// (PowerShell: $env:DEV_LOGIN=1; $env:FAST_BOTS=1; $env:TURN_SECONDS=8; pnpm dev:server)
// and Edge or Chrome installed.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://localhost:5173';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const errors = [];
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function open(name, viewport) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${name}: ${error}`));
    page.on('console', (message) => {
        // Google's own button complains about a headless browser; that is not ours to fix.
        if (message.type() === 'error' && !/accounts\.google|gsi|GSI_LOGGER|FedCM/i.test(message.text() + message.location().url)) {
            errors.push(`${name}: ${message.text()}`);
        }
    });
    return page;
}

const shot = (page, label) => page.screenshot({ path: join(outDir, `online-${label}.png`) });
const step = (text) => console.log(`· ${text}`);

async function signIn(page, name) {
    await page.getByPlaceholder('Как вас зовут?').fill(name);
    const button = page.getByRole('button', { name: /Войти без Google/ });
    if (!(await button.isVisible().catch(() => false))) {
        throw new Error('No development sign-in on this server. Start it with DEV_LOGIN=1.');
    }
    await button.click();
    await page.locator('.profile-row').waitFor();
}

const host = await open('host', DESKTOP);
const guest = await open('guest', PHONE);
const watcher = await open('watcher', PHONE);

// ── The menu, as a guest and signed in ──
await guest.goto(base);
await guest.getByRole('button', { name: 'Играть с ботами' }).waitFor();
await guest.waitForTimeout(1500); // Google draws its button in its own time.
await shot(guest, '01-menu-guest');

await host.goto(base);
await signIn(host, 'Расул');
await shot(host, '02-menu-signed-in');

// ── A guest may not open a table to the public; an account may ──
await guest.getByPlaceholder('Как вас зовут?').fill('Алия');
await guest.getByRole('button', { name: 'Создать комнату', exact: true }).click();
if (!(await guest.locator('.toggle input').isDisabled())) errors.push('guest: the "open table" switch should be locked for guests');
await shot(guest, '03-new-room-guest');
await guest.getByRole('button', { name: 'Назад' }).click();

await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
await host.getByPlaceholder(/^Комната /).fill('Вечерний корт');
await host.locator('.toggle input').check();
await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
await host.locator('.lobby-code').waitFor();
const code = (await host.locator('.lobby-code').textContent()).trim();
step(`table ${code}`);

// ── The guest arrives by link and picks a seat ──
await guest.goto(`${base}/?room=${code}`);
await guest.getByPlaceholder('Как вас зовут?').fill('Алия');
await guest.locator('.invite-title').waitFor();
await shot(guest, '04-invite');
await guest.getByRole('button', { name: /Войти в комнату/ }).click();
await guest.locator('.lobby-code').waitFor();
// Seated opposite the host by default; move to their left, then back to be partners.
await guest.getByRole('button', { name: 'Сесть на место 2' }).click();
await guest.locator('.seat-spot.pos-left.mine').waitFor();
await host.locator('.seat-spot.pos-left.human').waitFor();
await shot(guest, '05-lobby-moved-seat');
await guest.getByRole('button', { name: 'Сесть на место 3' }).click();
await guest.locator('.seat-spot.pos-top.mine').waitFor();
step('guest chose a seat');

// ── A spectator: only with an account ──
await watcher.goto(`${base}/?room=${code}`);
await signIn(watcher, 'Тимур');
await watcher.getByRole('button', { name: 'Смотреть' }).click();
await watcher.locator('.lobby-code').waitFor();
await host.locator('.lobby-watcher').waitFor();
await shot(host, '06-lobby-host');
await shot(watcher, '07-lobby-watcher');

await host.getByRole('button', { name: /Начать/ }).click();
await host.locator('.hand-card').first().waitFor();
await guest.locator('.hand-card').first().waitFor();
await watcher.locator('.plate-bottom').waitFor();
if (await watcher.locator('.hand-card').count()) errors.push('watcher: a spectator must not be dealt cards');
step('game started; the spectator sees four plates and no hand');

async function moveIfDue(page) {
    const suit = page.locator('.trump-option').first();
    const card = page.locator('.hand-card.playable').first();
    if (await suit.isVisible()) {
        await page.waitForTimeout(600);
        await suit.click();
        // The picker slides away for a moment after the choice: do not mistake it for a new one.
        await page.locator('.trump-option').first().waitFor({ state: 'detached' });
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

const sendReaction = async (page, tab) => {
    await page.locator('.emotes-toggle').click();
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.locator('.emotes-grid button').first().click();
};

// ── A few moves, then reactions from a player and from the stands ──
let moves = 0;
for (let i = 0; i < 400 && moves < 6; i++) {
    if ((await moveIfDue(host)) || (await moveIfDue(guest))) moves++;
    else await host.waitForTimeout(120);
}
await sendReaction(host, 'Мемы');
// The guest's partner is the host, at the top: the meme hangs over their name and fan of cards.
await guest.locator('.plate-top .emote-bubble').waitFor();
await guest.waitForTimeout(350);
await shot(guest, '08-partner-meme-over-cards');
const covered = await guest.evaluate(() => {
    const bubble = document.querySelector('.plate-top .emote-bubble')?.getBoundingClientRect();
    if (!bubble) return 'no bubble';
    const top = document.elementFromPoint(bubble.left + bubble.width / 2, bubble.top + bubble.height * 0.8);
    return top?.closest('.emote-bubble') ? null : `covered by .${top?.className}`;
});
if (covered) errors.push(`guest: the partner's reaction is hidden (${covered})`);
else step("the partner's reaction is drawn above their cards");

await sendReaction(watcher, 'Эмодзи');
await host.locator('.watcher-reaction').waitFor();
await shot(host, '09-table-with-spectator-reaction');
await shot(watcher, '10-spectator-view');

// ── The clock: someone thinks for too long, and the move is made for them ──
for (let i = 0; i < 400; i++) {
    if ((await host.locator('.hand-card.playable').count()) || (await guest.locator('.hand-card.playable').count())) break;
    await host.waitForTimeout(120);
}
const sleeper = (await host.locator('.hand-card.playable').count()) ? host : guest;
const other = sleeper === host ? guest : host;
await other.locator('.clock-ring').first().waitFor();
await other.waitForTimeout(1500);
await shot(other, '11-opponent-on-the-clock');
await shot(sleeper, '12-my-clock');
step('waiting for the clock to run out…');
await other.getByText('долго думает').waitFor({ timeout: 45_000 });
await shot(other, '13-timed-out');
step('the move was made for the sleeper, and the table shows it');

// ── The spectator sits down in place of a bot ──
await watcher.locator('.plate-sit').first().click();
await watcher.locator('.hand-card').first().waitFor({ timeout: 15_000 });
await host.waitForFunction(() => !document.querySelector('.watchers'));
await shot(watcher, '14-spectator-sat-down');
step('the spectator took a seat and got cards');

// ── A dropped connection: the guest reloads and lands back in the same seat ──
await guest.reload();
await guest.getByRole('button', { name: /Войти в комнату/ }).click();
await guest.locator('.hand-card').first().waitFor({ timeout: 15_000 });
step('guest rejoined the running game');

// ── Play the match out (bots are fast on a test server) ──
const players = [host, guest, watcher];
let hands = 0;
let momentShots = 0;
const started = Date.now();
while (!(await host.getByRole('button', { name: 'Ещё партию' }).isVisible())) {
    if (Date.now() - started > 12 * 60_000) throw new Error('The match did not finish in 12 minutes. Is the server running with FAST_BOTS=1?');
    let moved = false;
    for (const page of players) moved = (await moveIfDue(page)) || moved;
    if (momentShots < 3 && (await host.locator('.moment').isVisible())) {
        await host.waitForTimeout(180);
        await shot(host, `15-moment-${++momentShots}`);
        await shot(guest, `15-moment-${momentShots}-phone`);
    }
    if ((await host.locator('.result-next').isVisible()) && hands === 0) {
        hands++;
        await shot(guest, '16-hand-over');
    }
    if (!moved) await host.waitForTimeout(100);
}
await host.waitForTimeout(500);
await shot(host, '17-match-over');
await shot(guest, '18-match-over-phone');
const title = async (page) => (await page.locator('.result-title').textContent())?.trim();
step(`match over — host: ${await title(host)} | guest: ${await title(guest)} | third: ${await title(watcher)}`);

// ── The history: the match is there for those with an account ──
await host.getByRole('button', { name: 'В меню', exact: true }).click();
await host.locator('.profile-row').click();
await host.locator('.match').first().waitFor({ timeout: 10_000 });
await host.locator('.match-head').first().click();
await shot(host, '19-profile');
const phone = await open('host on a phone', PHONE);
await phone.goto(base);
await signIn(phone, 'Расул');
await phone.locator('.profile-row').click();
await phone.locator('.match').first().waitFor({ timeout: 10_000 });
await phone.locator('.match-head').first().click();
await phone.screenshot({ path: join(outDir, 'online-20-profile-phone.png'), fullPage: false });
await phone.locator('.profile').evaluate((panel) => panel.parentElement.scrollTo(0, 99999));
await phone.screenshot({ path: join(outDir, 'online-21-profile-phone-bottom.png') });
step('the finished match is in the history');

console.log(errors.length ? `ERRORS\n  ${errors.join('\n  ')}` : 'no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
