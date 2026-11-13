#!/usr/bin/env python3
"""Decide which upstream work this fork has handled, and report the rest.

Upstream changes reach this fork as focused, hand-adapted pull requests rather
than git merges, so git ancestry alone cannot tell what is done. Two sources
settle an upstream commit or pull request:

* the ledger (.github/upstream-ledger.json), which records explicit decisions
  and always wins; and
* merged fork pull requests whose descriptions cite an upstream commit SHA or
  an upstream pull request, which count as adoptions.

Once every upstream commit up to some point is settled, that point is offered
as a baseline: a `git merge -s ours` commit that changes no files but makes git
treat those commits as merged, so they stop being reported.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

UPSTREAM_REPO = 'SnosMe/awakened-poe-trade'
STATUSES = ('adopted', 'rejected', 'partial', 'deferred')
SETTLED = frozenset(('adopted', 'rejected'))
BASELINE_MARKER = re.compile(r'<!--\s*upstream-baseline:\s*([0-9a-f]{40})\s*-->')

# A citation is a standalone 7-40 character lowercase hex token. It only counts
# when it prefixes an upstream commit, which rules out fork SHAs and numbers.
SHA_TOKEN = re.compile(r'(?<![0-9A-Za-z])[0-9a-f]{7,40}(?![0-9A-Za-z])')
UPSTREAM_PR_REF = re.compile(
    r'(?:github\.com/SnosMe/awakened-poe-trade/pull/|upstream\s+(?:PR\s+)?#)(\d+)',
    re.IGNORECASE,
)
# How GitHub records a merged pull request in upstream history.
SQUASHED_PR = re.compile(r'\(#(\d+)\)$')
MERGED_PR = re.compile(r'^Merge pull request #(\d+) from ')


class LedgerError(ValueError):
    pass


@dataclass
class Decision:
    status: str  # one of STATUSES, or 'pending'
    note: str = ''
    fork_prs: list[int] = field(default_factory=list)
    source: str = ''  # 'ledger', 'detected' or ''

    @property
    def settled(self) -> bool:
        return self.status in SETTLED


def git(*args: str, cwd: str | None = None) -> str:
    return subprocess.run(
        ['git', *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def read_jsonl(path: str | None) -> list[dict]:
    if not path:
        return []
    text = Path(path).read_text(encoding='utf-8')
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def _fork_prs(value, where: str) -> list[int]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in values):
        raise LedgerError(f'{where}: fork_pr must be a pull request number or a list of them')
    return values


def load_ledger(path: str) -> dict[str, dict[str, Decision]]:
    raw = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(raw, dict) or set(raw) - {'$comment', 'commits', 'pulls'}:
        raise LedgerError('the ledger must be an object with "commits" and "pulls"')

    ledger: dict[str, dict[str, Decision]] = {'commits': {}, 'pulls': {}}
    for section in ('commits', 'pulls'):
        entries = raw.get(section, {})
        if not isinstance(entries, dict):
            raise LedgerError(f'"{section}" must be an object')
        for key, entry in entries.items():
            where = f'{section}.{key}'
            if section == 'commits' and not re.fullmatch(r'[0-9a-f]{7,40}', key):
                raise LedgerError(f'{where}: commit keys are 7-40 lowercase hex characters')
            if section == 'pulls' and not re.fullmatch(r'[1-9][0-9]*', key):
                raise LedgerError(f'{where}: pull request keys are upstream PR numbers')
            if not isinstance(entry, dict) or set(entry) - {'status', 'note', 'fork_pr'}:
                raise LedgerError(f'{where}: expected {{"status", "note", "fork_pr"}}')
            status = entry.get('status')
            if status not in STATUSES:
                raise LedgerError(f'{where}: status must be one of {", ".join(STATUSES)}')
            note = entry.get('note', '')
            if not isinstance(note, str):
                raise LedgerError(f'{where}: note must be a string')
            ledger[section][key] = Decision(
                status=status, note=note,
                fork_prs=_fork_prs(entry.get('fork_pr'), where), source='ledger',
            )
    return ledger


def merged_into(prs: list[dict], base: str, cwd: str | None = None) -> list[dict]:
    """Merged pull requests whose merge commit reached the base branch."""
    landed = []
    for pr in prs:
        sha = pr.get('merge_commit_sha')
        if not sha:
            continue
        result = subprocess.run(
            ['git', 'merge-base', '--is-ancestor', sha, base],
            cwd=cwd, capture_output=True,
        )
        if result.returncode == 0:
            landed.append(pr)
    return landed


def detect_adoptions(
    prs: list[dict], candidates: list[str]
) -> tuple[dict[str, list[int]], dict[int, list[int]]]:
    """Map upstream commits and upstream PRs to the fork PRs that cite them."""
    commits: dict[str, list[int]] = {}
    pulls: dict[int, list[int]] = {}
    for pr in sorted(prs, key=lambda p: p['number']):
        body = pr.get('body') or ''
        for token in set(SHA_TOKEN.findall(body)):
            matches = [sha for sha in candidates if sha.startswith(token)]
            if len(matches) == 1:
                commits.setdefault(matches[0], []).append(pr['number'])
        for number in {int(n) for n in UPSTREAM_PR_REF.findall(body)}:
            pulls.setdefault(number, []).append(pr['number'])
    return commits, pulls


def resolve_ledger_commits(
    entries: dict[str, Decision], candidates: list[str], cwd: str | None = None
) -> tuple[dict[str, Decision], list[str]]:
    """Attach ledger entries to full candidate SHAs; warn about the rest."""
    resolved: dict[str, Decision] = {}
    warnings: list[str] = []
    for key, decision in entries.items():
        matches = [sha for sha in candidates if sha.startswith(key)]
        if len(matches) > 1:
            raise LedgerError(f'commits.{key}: ambiguous, matches {len(matches)} upstream commits')
        if matches:
            resolved[matches[0]] = decision
            continue
        # Entries below the recorded baseline are history, not errors. Anything
        # git cannot find at all is most likely a typo.
        found = subprocess.run(
            ['git', 'rev-parse', '--verify', '--quiet', f'{key}^{{commit}}'],
            cwd=cwd, capture_output=True,
        )
        if found.returncode != 0:
            warnings.append(f'Ledger entry `{key}` does not match any known commit.')
    return resolved, warnings


def upstream_pull_commits(
    base: str, upstream: str, candidates: list[str], cwd: str | None = None
) -> dict[str, int]:
    """Map candidate commits to the upstream pull request that merged them.

    Reads GitHub's squash subjects (`title (#N)`) and merge subjects
    (`Merge pull request #N from ...`). Rebase merges leave no trace.
    """
    wanted = set(candidates)
    owner: dict[str, int] = {}
    # Oldest first, so a PR merged into a branch that a later PR merges keeps
    # its own commits rather than ceding them to the outer PR.
    log = git('log', '--topo-order', '--reverse', '--format=%H %P%x09%s', f'{base}..{upstream}', cwd=cwd)
    for line in log.splitlines():
        head, _, subject = line.partition('	')
        sha, *parents = head.split()
        if len(parents) == 1:
            squashed = SQUASHED_PR.search(subject)
            if squashed and sha in wanted:
                owner[sha] = int(squashed.group(1))
            continue
        merged = MERGED_PR.match(subject)
        if merged and len(parents) == 2:
            brought = git('rev-list', '--no-merges', f'{parents[0]}..{parents[1]}', cwd=cwd).split()
            for commit in brought:
                if commit in wanted:
                    owner.setdefault(commit, int(merged.group(1)))
    return owner


def decide_pull(number: int, ledger_pulls: dict[str, Decision], detected: dict[int, list[int]]) -> Decision:
    if str(number) in ledger_pulls:
        return ledger_pulls[str(number)]
    if number in detected:
        return Decision('adopted', '', detected[number], 'detected')
    return Decision('pending')


def classify_commits(
    candidates: list[str],
    ledger_commits: dict[str, Decision],
    detected: dict[str, list[int]],
    pull_of: dict[str, int] | None = None,
    pull_decisions: dict[int, Decision] | None = None,
) -> dict[str, Decision]:
    """Precedence: commit ledger, PR ledger, commit citation, PR citation."""
    pull_of = pull_of or {}
    pull_decisions = pull_decisions or {}
    decisions = {}
    for sha in candidates:
        cited = detected.get(sha, [])
        via_pull = pull_decisions.get(pull_of.get(sha, 0))
        if sha in ledger_commits:
            decision = ledger_commits[sha]
        elif via_pull and via_pull.source == 'ledger':
            decision = via_pull
        elif cited:
            decision = Decision('adopted', '', [], 'detected')
        elif via_pull and via_pull.status != 'pending':
            decision = via_pull
        else:
            decisions[sha] = Decision('pending')
            continue
        extra = [n for n in cited if n not in decision.fork_prs]
        decisions[sha] = Decision(
            decision.status, decision.note, decision.fork_prs + extra, decision.source
        )
    return decisions


def classify_pulls(
    open_pulls: list[dict],
    ledger_pulls: dict[str, Decision],
    detected: dict[int, list[int]],
) -> dict[int, Decision]:
    return {pr['number']: decide_pull(pr['number'], ledger_pulls, detected) for pr in open_pulls}


def find_baseline(
    base: str, upstream: str, decisions: dict[str, Decision], cwd: str | None = None
) -> str | None:
    """Newest upstream commit whose every unmerged non-merge ancestor is settled."""
    ordered = git('rev-list', '--topo-order', f'{base}..{upstream}', cwd=cwd).split()
    for sha in ordered:  # newest first
        needed = git('rev-list', '--no-merges', f'{base}..{sha}', cwd=cwd).split()
        if needed and all(decisions.get(c, Decision('pending')).settled for c in needed):
            return sha
    return None


def lost_baselines(prs: list[dict], branch: str, base: str, cwd: str | None = None) -> list[str]:
    """Warn when a baseline PR merged without keeping its merge commit."""
    warnings = []
    for pr in prs:
        if pr.get('head') != branch or not pr.get('merge_commit_sha'):
            continue
        marker = BASELINE_MARKER.search(pr.get('body') or '')
        if not marker:
            continue
        kept = subprocess.run(
            ['git', 'merge-base', '--is-ancestor', marker.group(1), base],
            cwd=cwd, capture_output=True,
        ).returncode == 0
        if not kept:
            warnings.append(
                f'{fork_link(pr["number"])} was merged without a merge commit, so the '
                'upstream baseline it recorded was lost. Merge the next baseline PR with '
                '**Create a merge commit**.'
            )
    return warnings


def fork_link(number: int) -> str:
    return f'[#{number}](https://github.com/{{repo}}/pull/{number})'


def upstream_pr_link(number: int) -> str:
    return f'[upstream #{number}](https://github.com/{UPSTREAM_REPO}/pull/{number})'


def commit_link(sha: str) -> str:
    return f'[`{sha[:8]}`](https://github.com/{UPSTREAM_REPO}/commit/{sha})'


def _detail(decision: Decision) -> str:
    parts = []
    if decision.note:
        parts.append(decision.note)
    if decision.fork_prs:
        parts.append('via ' + ', '.join(fork_link(n) for n in decision.fork_prs))
    return '; '.join(parts).replace('|', '\\|') or ' '


def render_report(
    subjects: dict[str, str],
    commits: dict[str, Decision],
    pulls: dict[int, Decision],
    pull_titles: dict[int, str],
    baseline: str | None,
    warnings: list[str],
    repo: str,
) -> str:
    unsettled_commits = [sha for sha, d in commits.items() if not d.settled]
    unsettled_pulls = [n for n, d in sorted(pulls.items()) if not d.settled]
    settled = len(commits) - len(unsettled_commits)

    lines = ['## Upstream sync status', '']
    lines.append(
        f'{len(commits)} upstream commit(s) are not merged into main: '
        f'{settled} settled, {len(unsettled_commits)} still open. '
        f'{len(unsettled_pulls)} open upstream pull request(s) await a decision.'
    )
    lines.append('')
    if baseline:
        lines.append(
            f'Everything up to {commit_link(baseline)} is settled; the baseline pull '
            'request records it so those commits stop being reported.'
        )
        lines.append('')

    if warnings:
        lines += ['### Warnings', ''] + [f'- {w}' for w in warnings] + ['']

    if unsettled_commits:
        lines += ['### Upstream commits', '', '| Commit | Subject | Status | Notes |', '|---|---|---|---|']
        for sha in unsettled_commits:
            d = commits[sha]
            subject = subjects.get(sha, '').replace('|', '\\|')
            lines.append(f'| {commit_link(sha)} | {subject} | {d.status} | {_detail(d)} |')
        lines.append('')

    if unsettled_pulls:
        lines += ['### Open upstream pull requests', '', '| Pull request | Title | Status | Notes |', '|---|---|---|---|']
        for number in unsettled_pulls:
            d = pulls[number]
            title = pull_titles.get(number, '').replace('|', '\\|')
            lines.append(f'| {upstream_pr_link(number)} | {title} | {d.status} | {_detail(d)} |')
        lines.append('')

    lines += [
        '### Recording decisions',
        '',
        'Edit `.github/upstream-ledger.json` in a pull request. Statuses: `adopted` and '
        '`rejected` settle an item; `partial` and `deferred` keep it listed. A merged fork '
        'pull request that cites an upstream commit SHA or `upstream #N` in its description '
        'counts as adopted automatically.',
        '',
        '<!-- upstream-sync-report -->',
    ]
    return '\n'.join(lines).replace('{repo}', repo) + '\n'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--base', default='origin/main')
    parser.add_argument('--upstream', default='upstream/master')
    parser.add_argument('--ledger', default='.github/upstream-ledger.json')
    parser.add_argument('--fork-prs', help='JSON lines: number, body, head, merge_commit_sha')
    parser.add_argument('--upstream-prs', help='JSON lines: number, title')
    parser.add_argument('--baseline-branch', default='chore/upstream-baseline')
    parser.add_argument('--repo', default='RadioactiveCheese/krangled-poe-trade')
    parser.add_argument('--report', required=True)
    parser.add_argument('--github-output')
    args = parser.parse_args(argv)

    try:
        ledger = load_ledger(args.ledger)
    except (LedgerError, json.JSONDecodeError) as error:
        print(f'::error::Invalid upstream ledger: {error}', file=sys.stderr)
        return 1

    candidates = git('rev-list', '--no-merges', '--topo-order', f'{args.base}..{args.upstream}').split()
    subjects = dict(
        line.split(' ', 1) for line in
        git('log', '--no-merges', '--format=%H %s', f'{args.base}..{args.upstream}').splitlines()
        if line
    )
    fork_prs = read_jsonl(args.fork_prs)
    landed = merged_into(fork_prs, args.base)
    open_pulls = read_jsonl(args.upstream_prs)

    try:
        ledger_commits, warnings = resolve_ledger_commits(ledger['commits'], candidates)
    except LedgerError as error:
        print(f'::error::Invalid upstream ledger: {error}', file=sys.stderr)
        return 1
    detected_commits, detected_pulls = detect_adoptions(landed, candidates)
    # A decision on an upstream PR still applies once upstream merges it.
    pull_of = upstream_pull_commits(args.base, args.upstream, candidates)
    pull_decisions = {n: decide_pull(n, ledger['pulls'], detected_pulls) for n in set(pull_of.values())}
    commits = classify_commits(candidates, ledger_commits, detected_commits, pull_of, pull_decisions)
    pulls = classify_pulls(open_pulls, ledger['pulls'], detected_pulls)
    baseline = find_baseline(args.base, args.upstream, commits)
    warnings += lost_baselines(fork_prs, args.baseline_branch, args.base)

    report = render_report(
        subjects, commits, pulls, {p['number']: p.get('title', '') for p in open_pulls},
        baseline, warnings, args.repo,
    )
    Path(args.report).write_text(report, encoding='utf-8')

    open_items = sum(not d.settled for d in commits.values()) + sum(not d.settled for d in pulls.values())
    if args.github_output:
        with open(args.github_output, 'a', encoding='utf-8') as out:
            out.write(f'baseline={baseline or ""}\n')
            out.write(f'open_items={open_items}\n')
            out.write(f'warnings={len(warnings)}\n')
    print(report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
