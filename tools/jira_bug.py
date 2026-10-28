#!/usr/bin/env python3
"""Hawk QA: file Jira bugs with screenshots attached, one or many at a time.

Usage:
  python3 tools/jira_bug.py bugs.json            # create every bug in the file
  python3 tools/jira_bug.py --attach V2-64 a.png b.png
  python3 tools/jira_bug.py --check              # confirm the token works

bugs.json is a list of objects:
  {"summary": "...", "description_md": "...", "priority": "Medium",
   "labels": ["Medium", "Patients"], "assignee": "<accountId>",
   "attachments": ["/abs/path/shot1.png", ...]}

Auth: JIRA_API_TOKEN (required) and JIRA_EMAIL (default jasper.p@ekkomd.com).
The token is read from the environment only and never printed.
"""
import base64, json, mimetypes, os, sys, urllib.request, uuid

SITE = os.environ.get("JIRA_SITE", "https://scribeai-2024.atlassian.net")
PROJECT = os.environ.get("JIRA_PROJECT", "V2")
EMAIL = os.environ.get("JIRA_EMAIL", "jasper.p@ekkomd.com")
ATTRIBUTION = ("Reported by Jasper P's Agent AI testing agent (built on Claude Code), "
               "filed on Jasper's behalf. Questions go to Jasper P.")


def auth_header():
    token = os.environ.get("JIRA_API_TOKEN")
    if not token:
        sys.exit("JIRA_API_TOKEN is not set in this session. Add it to the Hawk environment and start a new session.")
    return "Basic " + base64.b64encode(f"{EMAIL}:{token}".encode()).decode()


def call(method, path, body=None, headers=None, raw=None):
    h = {"Authorization": auth_header(), "Accept": "application/json"}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(SITE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]


def adf(description_md):
    """Attribution panel first, then each blank-line block as a paragraph."""
    content = [{"type": "panel", "attrs": {"panelType": "info"}, "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": ATTRIBUTION}]}]}]
    for block in [b for b in description_md.split("\n\n") if b.strip()]:
        content.append({"type": "paragraph", "content": [{"type": "text", "text": block.strip()}]})
    return {"type": "doc", "version": 1, "content": content}


def attach(key, paths):
    boundary = uuid.uuid4().hex
    parts = []
    for p in paths:
        ctype = mimetypes.guess_type(p)[0] or "application/octet-stream"
        parts.append((f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                      f"filename=\"{os.path.basename(p)}\"\r\nContent-Type: {ctype}\r\n\r\n").encode()
                     + open(p, "rb").read() + b"\r\n")
    raw = b"".join(parts) + f"--{boundary}--\r\n".encode()
    code, res = call("POST", f"/rest/api/3/issue/{key}/attachments", raw=raw,
                     headers={"X-Atlassian-Token": "no-check",
                              "Content-Type": f"multipart/form-data; boundary={boundary}"})
    names = [a["filename"] for a in res] if code == 200 else res
    print(f"{key}: attach {code} {names}")
    return code == 200


def create(bug):
    fields = {"project": {"key": PROJECT}, "issuetype": {"name": "Bug"},
              "summary": bug["summary"], "description": adf(bug.get("description_md", "")),
              "priority": {"name": bug.get("priority", "Medium")}, "labels": bug.get("labels", [])}
    if bug.get("assignee"):
        fields["assignee"] = {"accountId": bug["assignee"]}
    code, res = call("POST", "/rest/api/3/issue", {"fields": fields})
    if code != 201:
        print(f"FAILED create '{bug['summary']}': {code} {res}")
        return None
    key = res["key"]
    print(f"{key}: created {SITE}/browse/{key}")
    if bug.get("attachments"):
        attach(key, bug["attachments"])
    return key


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "--check":
        code, res = call("GET", "/rest/api/3/myself")
        print("auth", code, res.get("displayName") if isinstance(res, dict) else res)
    elif a[0] == "--attach":
        attach(a[1], a[2:])
    else:
        keys = [create(b) for b in json.load(open(a[0]))]
        print("done:", [k for k in keys if k])
