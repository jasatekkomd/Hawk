const { login, go } = require('./login');
const VC = 'd8501c43-351f-41b4-b19a-05f4b6916544';
const EP = ['summary', 'visits', 'measurements', 'medications', 'labs', 'documents'];
(async () => {
  for (const R of (process.argv[2] || 'ORGADMIN,DOCTOR,DOCADMIN,STAFF2,CLINICAL').split(',')) {
    let o, auth = null;
    for (let t = 0; t < 3 && !auth; t++) { o = await login('EKKO_TEST_' + R + '_EMAIL'); o.page.on('request', r => { if (/api-dev2/.test(r.url()) && r.headers().authorization) auth = r.headers().authorization; }); await go(o.page, '/calendar'); await o.page.waitForTimeout(4000); if (!auth) await o.browser.close(); }
    if (!auth) { console.log(R, 'no token'); continue; }
    const res = [];
    const sr = await o.page.request.post('https://api-dev2.ekkomd.com/v2/patients/search', { headers: { authorization: auth, 'content-type': 'application/json' }, data: { sort_by: 'created_at', order: 'desc', limit: 5 } }); res.push('search=' + sr.status());
    for (const e of EP) { const r = await o.page.request.get(`https://api-dev2.ekkomd.com/v2/patients/${VC}/${e}`, { headers: { authorization: auth } }); res.push(`${e}=${r.status()}`); }
    console.log(R.padEnd(9), res.join(' '));
    await o.browser.close();
  }
})().catch(e => { console.error('FATAL', e.message.split('\n')[0]); process.exit(1); });
