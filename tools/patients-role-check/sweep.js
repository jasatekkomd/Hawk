const { login, go } = require('./login');
const fs = require('fs');
const ROLES = (process.argv[2] || 'ORGADMIN,DOCTOR,DOCADMIN,CLINICAL,STAFF,STAFF2,PA,OPTOMETRIST').split(',');
(async () => {
  const all = {};
  for (const R of ROLES) {
    const v = 'EKKO_TEST_' + R + '_EMAIL'; const rec = { role: R };
    let o;
    try {
      o = await login(v);
      const { page } = o;
      rec.landed = page.url().replace('https://app-dev2.ekkomd.com', '');
      if (/signup|onboarding|login/.test(rec.landed)) { rec.loginFailed = true; await page.screenshot({ path: __dirname + `/shots/role-${R}-login.png` }); }
      else {
        const permP = page.waitForResponse(r => /access-control\/get-permissions/.test(r.url()), { timeout: 15000 }).catch(() => null);
        await go(page, '/patients'); await page.waitForTimeout(3000);
        const pr = await permP; if (pr) { try { const j = JSON.parse(await pr.text()).data; rec.roles = j.roles || j.role || j.userRoles; const wa = j.workspace_actions || j.workspaceActions || {}; rec.actions = Object.entries(wa).filter(([k, x]) => /^patients|documents|visits\.view|consultation/.test(k)).map(([k, x]) => k + '=' + x).join(' '); rec.permKeys = Object.keys(j).join(','); rec.perms = (j.effective_permissions || j.permissions || []).filter?.(p => /^patient|document|vital|prescription\.read|lab\.read/.test(p)); } catch (e) { rec.permErr = e.message; } }
        rec.rail = (await page.locator('nav a, nav button').allInnerTexts()).map(t => t.trim()).filter(Boolean).slice(0, 8);
        rec.patientsPage = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
        rec.newPatientBtn = await page.getByRole('button', { name: /new patient/i }).count();
        rec.rosterRows = await page.locator('[role=option], .patient-row, [data-patient-id]').count();
        await page.getByRole('button', { name: 'Search patients', exact: true }).click(); const s = page.getByLabel(/Search patients by name/);
        if (await s.count()) { await s.fill('Hawkqa Visitcheck'); await page.waitForTimeout(2500);
          const hit = page.getByText('Hawkqa Visitcheck', { exact: false }).first();
          if (await hit.count()) { await hit.click(); await page.waitForTimeout(3000);
            rec.url = page.url().replace('https://app-dev2.ekkomd.com', '');
            rec.tabs = (await page.getByRole('tab').allInnerTexts()).map(t => t.trim());
            const m = await page.locator('main').innerText(); 
            rec.flags = /Clinical flags|Allergies/i.test(m); rec.addAllergy = await page.getByRole('button', { name: /^\+?\s*Add$/ }).count();
            rec.editBtns = await page.getByRole('button', { name: /^Edit/ }).count();
            rec.startVisit = await page.getByRole('button', { name: /start visit/i }).count();
            rec.whatsapp = /WhatsApp/i.test(m);
            rec.moreMenu = await page.getByRole('button', { name: /more|actions|options/i }).count();
            await page.screenshot({ path: __dirname + `/shots/role-${R}-patient.png` });
            rec.tabContent = {};
            for (const t of rec.tabs) { await page.getByRole('tab', { name: t }).click(); await page.waitForTimeout(1800);
              const tx = (await page.locator('[role=tabpanel]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
              rec.tabContent[t] = { text: tx.slice(0, 140), upload: await page.getByRole('button', { name: /upload/i }).count(), add: await page.getByRole('button', { name: /add|record/i }).count() }; }
          } else rec.search = 'no hit';
        }
        await page.screenshot({ path: __dirname + `/shots/role-${R}-end.png` });
      }
      rec.log = o.log.filter(l => !/favicon/.test(l)).slice(0, 5);
    } catch (e) { rec.error = e.message.split('\n')[0]; }
    all[R] = rec; console.log(JSON.stringify(rec));
    if (o) await o.browser.close();
  }
  fs.writeFileSync(__dirname + '/sweep-' + Date.now() + '.json', JSON.stringify(all, null, 1));
})();
