// Login helper. Credentials come only from env vars; never logged.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const APP = 'https://app-dev2.ekkomd.com';
async function login(emailVar = 'EKKO_TEST_ORGADMIN_EMAIL', opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 } });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', e => log.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') log.push('console: ' + m.text().slice(0, 200)); });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(APP + '/signup', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /log in/i }).first().click();
    await page.waitForURL(/auth-dev\.ekkomd\.com|auth0/, { timeout: 30000 });
    await page.locator('input[name="username"], input[type="email"]').first().fill(process.env[emailVar]);
    await page.getByRole('button', { name: /continue/i }).first().click();
    await page.locator('input[type="password"]').first().fill(process.env.EKKO_TEST_PASSWORD);
    await page.getByRole('button', { name: /continue|log in/i }).first().click();
    await page.waitForURL(/app-dev2\.ekkomd\.com/, { timeout: 45000 });
    try {
      await page.waitForURL(/pick-workspace/, { timeout: 20000 });
      await page.getByText('TEST10', { exact: false }).first().click();
      await page.waitForTimeout(4000);
    } catch {}
    if (!/signup|onboarding/.test(page.url())) break;
    await ctx.clearCookies();
  }
  return { browser, ctx, page, log };
}
// in-app navigation (full goto re-asks workspace)
async function go(page, path) {
  await page.evaluate(p => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForTimeout(2500);
}
module.exports = { login, go, APP };
