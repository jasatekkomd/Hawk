const { login, go } = require('./login');
(async () => {
  const { browser, page } = await login();
  const got = page.waitForResponse(r => /\/v2\/settings\/permissions/.test(r.url()) && r.request().method() === 'GET', { timeout: 30000 });
  await go(page, '/settings/permissions');
  const j = JSON.parse(await (await got).text()).data;
  require('fs').writeFileSync(__dirname + '/perm.json', JSON.stringify(j, null, 1));
  const roles = j.roles || j;
  for (const r of roles) {
    const acts = r.actions || r.workspaceActions || {};
    const pat = Object.entries(acts).filter(([k]) => /^patients?\.|documents|measure|medic|labs/.test(k));
    console.log(r.name || r.roleName, '|', r.code || r.roleCode, '|', pat.map(([k, v]) => k + '=' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(' '));
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
