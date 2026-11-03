# Patients role check (Hawk)

Playwright scripts for checking each role's access to the Patients module on app-dev2 (TEST10).
Credentials come only from environment variables (`EKKO_TEST_<ROLE>_EMAIL`, `EKKO_TEST_PASSWORD`); nothing is stored here.
Copy the folder into the session scratchpad and run there (global Playwright: `npm root -g`).

| Script | What it does |
|---|---|
| `login.js` | Log in, pick TEST10, retry the flaky /signup landing; `go()` navigates in-app |
| `perm.js` | As Org Admin, dump Space > Permissions (`/v2/settings/permissions`) to `perm.json`: the expected behaviour per role |
| `sweep.js ROLE1,ROLE2` | Per role: rail, Patients access, New patient button, tabs and actions on "Hawkqa Visitcheck" |
| `api.js ROLE1,ROLE2` | Per role: status codes of search, summary, visits, measurements, medications, labs, documents |

Role names: ORGADMIN, DOCTOR, DOCADMIN, CLINICAL, STAFF, STAFF2, PA, OPTOMETRIST.

## Pending (3 Nov): PA and Optometrist
TEST10 members are `+07` (PA, "test pa") and `+08` (Optometrist, "OP Test"); Jasper is fixing the env vars, then retest in a new session:
1. `perm.js`, then `sweep.js PA,OPTOMETRIST` and `api.js PA,OPTOMETRIST`; compare with the matrix.
2. For every action ON: it must work (create, edit, upload, flags, start visit). For every action OFF: hidden in the UI AND refused (403) by the API.
3. Known suspect: Optometrist has "Manage documents" ON but "View documents" OFF; the Upload button lives only in the Documents tab, so the right is unusable.
