#!/usr/bin/env python3
"""Push local HEAD on top of a diverged remote ref via the git-database API.

Safety: aborts unless the remote commit's tree equals the local parent's
tree, proving the divergence is hash-only (no remote content is orphaned).
"""
from __future__ import annotations

import subprocess
import sys

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
import dynamic_credentials as dc  # noqa: E402

import json
import urllib.error
import urllib.request

API = "https://api.github.com"
CRED = "custom.github"
HOSTS = ["api.github.com"]
REPO = "jameskaye/setwise"
REF = "main"
REPO_DIR = "/home/hatch/workspace/setwise"


def sh(*args: str) -> str:
    proc = subprocess.run(["git", "-C", REPO_DIR, *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def api(method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "muse-github-skill",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    dc.add_surrogate_to_request(req, CRED, allowed_hosts=HOSTS)
    try:
        with urllib.request.urlopen(req) as resp:
            return dc.read_json_response(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"GitHub API {method} {path} -> HTTP {exc.code}: {body}")


def main() -> int:
    if sh("status", "--porcelain"):
        raise RuntimeError("working tree is dirty; commit or stash first")
    head_tree = sh("rev-parse", "HEAD^{tree}")
    parent_tree = sh("rev-parse", "HEAD^^{tree}")
    message = sh("log", "-1", "--format=%B")
    author_name = sh("log", "-1", "--format=%an")
    author_email = sh("log", "-1", "--format=%ae")
    author_date = sh("log", "-1", "--format=%cI")

    remote_ref = api("GET", f"/repos/{REPO}/git/ref/heads/{REF}")
    remote_sha = remote_ref["object"]["sha"]
    remote_commit = api("GET", f"/repos/{REPO}/git/commits/{remote_sha}")
    remote_tree = remote_commit["tree"]["sha"]
    print(f"remote {REF} at {remote_sha[:7]}, tree {remote_tree[:7]}")
    print(f"local parent tree {parent_tree[:7]}")
    if remote_tree != parent_tree:
        raise RuntimeError(
            "remote tree differs from local parent tree; refusing to rebase-push"
        )
    print("trees match: divergence is hash-only, safe to stack on remote")

    # The local HEAD tree object doesn't exist on the remote; rebuild it from
    # the HEAD^..HEAD diff on top of the remote tree (same pattern as gh-push).
    import base64
    import os

    raw = sh("diff-tree", "--no-commit-id", "-r", "--raw", "HEAD")
    entries = []
    for line in raw.splitlines():
        meta, path = line.split("\t", 1)
        parts = meta.split()
        newmode, status = parts[1], parts[4]
        if status == "D":
            entries.append({"path": path, "mode": newmode, "type": "blob", "sha": None})
            continue
        with open(os.path.join(REPO_DIR, path), "rb") as fh:
            content = fh.read()
        blob = api(
            "POST",
            f"/repos/{REPO}/git/blobs",
            {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"},
        )
        entries.append({"path": path, "mode": newmode, "type": "blob", "sha": blob["sha"]})
    tree = api(
        "POST", f"/repos/{REPO}/git/trees", {"base_tree": remote_tree, "tree": entries}
    )
    head_tree = tree["sha"]
    print(f"rebuilt tree {head_tree[:7]} on remote")

    commit = api(
        "POST",
        f"/repos/{REPO}/git/commits",
        {
            "message": message,
            "tree": head_tree,
            "parents": [remote_sha],
            "author": {"name": author_name, "email": author_email, "date": author_date},
        },
    )
    new_sha = commit["sha"]
    updated = api("PATCH", f"/repos/{REPO}/git/refs/heads/{REF}", {"sha": new_sha})
    if updated["object"]["sha"] != new_sha:
        raise RuntimeError("ref update did not stick; check the repository")
    print(f"pushed HEAD -> {REPO}@{REF} as {new_sha[:7]}")
    print(f"https://github.com/{REPO}/commit/{new_sha}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
