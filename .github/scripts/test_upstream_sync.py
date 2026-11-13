"""Tests for upstream_sync.py. Run: python -m unittest discover -s .github/scripts"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import upstream_sync as us


class GitRepo:
    """A throwaway repository with `main` and an `upstream` branch."""

    def __init__(self, root: Path):
        self.root = root
        env = {
            'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@example.invalid',
            'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@example.invalid',
            'GIT_CONFIG_NOSYSTEM': '1', 'HOME': str(root),
        }
        self.env = {**os.environ, **env}
        self.run('init', '-q', '-b', 'main')
        self.commit('base')

    def run(self, *args: str) -> str:
        return subprocess.run(
            ['git', *args], cwd=self.root, env=self.env,
            check=True, capture_output=True, text=True,
        ).stdout.strip()

    def commit(self, name: str) -> str:
        (self.root / f'{name}.txt').write_text(name, encoding='utf-8')
        self.run('add', '-A')
        self.run('commit', '-q', '-m', name)
        return self.run('rev-parse', 'HEAD')

    def checkout(self, branch: str, create: bool = False, start: str = 'HEAD') -> None:
        if create:
            self.run('checkout', '-q', '-b', branch, start)
        else:
            self.run('checkout', '-q', branch)


class InRepo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = GitRepo(Path(self.tmp.name))
        self.cwd = os.getcwd()
        os.chdir(self.tmp.name)

    def tearDown(self):
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def upstream_line(self, *names: str) -> list[str]:
        """Upstream commits branching from main's root, oldest first."""
        root = self.repo.run('rev-list', '--max-parents=0', 'main')
        self.repo.checkout('upstream', create=True, start=root)
        shas = [self.repo.commit(n) for n in names]
        self.repo.checkout('main')
        return shas

    def candidates(self) -> list[str]:
        return us.git('rev-list', '--no-merges', '--topo-order', 'main..upstream').split()


class DetectAdoptions(unittest.TestCase):
    CANDIDATES = [
        'bc4e1d0e7a792e659dda680bfa39ad709def7210',
        '648e4e9e712310c2615084b2e53e966667366328',
        '1cd83787b69ec2e1389ec5938780cea444eff4d7',
    ]

    def test_cited_prefixes_and_full_shas_are_adoptions(self):
        prs = [
            {'number': 52, 'body': 'Adapted from upstream bc4e1d0e and 648e4e9e.'},
            {'number': 55, 'body': 'Adapted from upstream 1cd83787b69ec2e1389ec5938780cea444eff4d7'},
        ]
        commits, _ = us.detect_adoptions(prs, self.CANDIDATES)
        self.assertEqual(commits, {
            self.CANDIDATES[0]: [52], self.CANDIDATES[1]: [52], self.CANDIDATES[2]: [55],
        })

    def test_tokens_that_are_not_upstream_commits_are_ignored(self):
        prs = [{'number': 9, 'body': (
            'fork commit ebf393e9a44a35296c1aeda54cd3e7becc8ef077; seven-character bc4e1d0 counts; '
            'xbc4e1d0e inside a word, BC4E1D0E in uppercase, six-character 648e4e and the '
            'number 1234567 do not.'
        )}]
        commits, _ = us.detect_adoptions(prs, self.CANDIDATES)
        self.assertEqual(commits, {self.CANDIDATES[0]: [9]})

    def test_ambiguous_prefix_is_ignored(self):
        candidates = ['abcdef1000', 'abcdef1999']
        commits, _ = us.detect_adoptions([{'number': 1, 'body': 'abcdef1'}], candidates)
        self.assertEqual(commits, {})

    def test_upstream_pull_references(self):
        prs = [{'number': 74, 'body': (
            'Adapted from https://github.com/SnosMe/awakened-poe-trade/pull/1816 and '
            'upstream #1905, also upstream PR #1906. Fork #66 is not upstream.'
        )}]
        _, pulls = us.detect_adoptions(prs, [])
        self.assertEqual(pulls, {1816: [74], 1905: [74], 1906: [74]})

    def test_missing_body(self):
        self.assertEqual(us.detect_adoptions([{'number': 1, 'body': None}], self.CANDIDATES), ({}, {}))


class LoadLedger(unittest.TestCase):
    def load(self, data) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'ledger.json'
            path.write_text(json.dumps(data), encoding='utf-8')
            return us.load_ledger(str(path))

    def test_valid_ledger(self):
        ledger = self.load({
            '$comment': 'x',
            'commits': {'ce551eb7': {'status': 'rejected', 'note': 'docs'}},
            'pulls': {'1094': {'status': 'adopted', 'fork_pr': 50}},
        })
        self.assertEqual(ledger['commits']['ce551eb7'].status, 'rejected')
        self.assertEqual(ledger['pulls']['1094'].fork_prs, [50])

    def test_checked_in_ledger_is_valid(self):
        path = Path(__file__).resolve().parents[1] / 'upstream-ledger.json'
        us.load_ledger(str(path))

    def test_rejects_malformed_entries(self):
        cases = [
            {'commits': {'ce551eb7': {'status': 'done'}}},
            {'commits': {'CE551EB7': {'status': 'rejected'}}},
            {'commits': {'ce55': {'status': 'rejected'}}},
            {'pulls': {'#1094': {'status': 'adopted'}}},
            {'pulls': {'1094': {'status': 'adopted', 'pr': 50}}},
            {'pulls': {'1094': {'status': 'adopted', 'fork_pr': '50'}}},
            {'pulls': {'1094': {'status': 'adopted', 'note': 5}}},
            {'extra': {}},
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(us.LedgerError):
                self.load(case)


class Baseline(InRepo):
    def test_baseline_stops_before_first_unsettled_commit(self):
        u1, u2, u3, u4 = self.upstream_line('u1', 'u2', 'u3', 'u4')
        decisions = us.classify_commits(
            self.candidates(),
            {u2: us.Decision('rejected'), u4: us.Decision('adopted')},
            {u1: [10]},
        )
        self.assertEqual(us.find_baseline('main', 'upstream', decisions), u2)
        decisions[u3] = us.Decision('adopted')
        self.assertEqual(us.find_baseline('main', 'upstream', decisions), u4)

    def test_partial_and_deferred_block_the_baseline(self):
        u1, u2 = self.upstream_line('u1', 'u2')
        for status in ('partial', 'deferred'):
            decisions = us.classify_commits(
                self.candidates(), {u1: us.Decision(status), u2: us.Decision('adopted')}, {},
            )
            self.assertIsNone(us.find_baseline('main', 'upstream', decisions))

    def test_ledger_overrides_detection(self):
        (u1,) = self.upstream_line('u1')
        decisions = us.classify_commits(self.candidates(), {u1: us.Decision('partial', 'more')}, {u1: [57]})
        self.assertEqual(decisions[u1].status, 'partial')
        self.assertEqual(decisions[u1].fork_prs, [57])

    def test_baseline_can_be_an_upstream_merge(self):
        u1 = self.upstream_line('u1')[0]
        self.repo.checkout('upstream')
        self.repo.checkout('topic', create=True)
        t1 = self.repo.commit('t1')
        self.repo.checkout('upstream')
        u2 = self.repo.commit('u2')
        self.repo.run('merge', '-q', '--no-ff', '-m', 'merge topic', 'topic')
        merge = self.repo.run('rev-parse', 'HEAD')
        self.repo.checkout('main')
        settled = {sha: us.Decision('adopted') for sha in (u1, t1, u2)}
        decisions = us.classify_commits(self.candidates(), settled, {})
        self.assertEqual(us.find_baseline('main', 'upstream', decisions), merge)

    def test_recorded_baseline_stops_reporting_and_keeps_files(self):
        u1, u2 = self.upstream_line('u1', 'u2')
        self.repo.commit('fork-only')
        before = self.repo.run('rev-parse', 'HEAD^{tree}')
        self.repo.run('merge', '-q', '-s', 'ours', '--no-ff', '-m', 'baseline', u1)
        self.assertEqual(self.repo.run('rev-parse', 'HEAD^{tree}'), before)
        self.assertEqual(self.candidates(), [u2])

    def test_no_upstream_changes(self):
        self.upstream_line()
        self.assertIsNone(us.find_baseline('main', 'upstream', {}))


class MergedInto(InRepo):
    def test_only_prs_that_reached_the_base_count(self):
        on_main = self.repo.commit('feature')
        self.repo.checkout('stack', create=True)
        elsewhere = self.repo.commit('stacked')
        self.repo.checkout('main')
        prs = [
            {'number': 1, 'merge_commit_sha': on_main},
            {'number': 2, 'merge_commit_sha': elsewhere},
            {'number': 3, 'merge_commit_sha': None},
            {'number': 4, 'merge_commit_sha': '0' * 40},
        ]
        self.assertEqual([p['number'] for p in us.merged_into(prs, 'main')], [1])


class LedgerResolution(InRepo):
    def test_resolves_prefixes_and_warns_only_about_unknown_commits(self):
        u1, u2 = self.upstream_line('u1', 'u2')
        self.repo.run('merge', '-q', '-s', 'ours', '--no-ff', '-m', 'baseline', u1)
        entries = {
            u2[:8]: us.Decision('adopted'),
            u1[:8]: us.Decision('rejected'),       # already recorded: history
            'deadbeefcafe': us.Decision('rejected'),  # typo
        }
        resolved, warnings = us.resolve_ledger_commits(entries, self.candidates())
        self.assertEqual(list(resolved), [u2])
        self.assertEqual(len(warnings), 1)
        self.assertIn('deadbeefcafe', warnings[0])


class LostBaselines(InRepo):
    def baseline_pr(self, sha: str) -> dict:
        return {
            'number': 80, 'head': 'chore/upstream-baseline', 'merge_commit_sha': sha,
            'body': f'text\n<!-- upstream-baseline: {sha} -->',
        }

    def test_squashed_baseline_is_reported(self):
        (u1,) = self.upstream_line('u1')
        squashed = self.repo.commit('squash of baseline')
        pr = {**self.baseline_pr(u1), 'merge_commit_sha': squashed}
        warnings = us.lost_baselines([pr], 'chore/upstream-baseline', 'main')
        self.assertEqual(len(warnings), 1)
        self.assertIn('merge commit', warnings[0])

    def test_merged_baseline_is_quiet(self):
        (u1,) = self.upstream_line('u1')
        self.repo.run('merge', '-q', '-s', 'ours', '--no-ff', '-m', 'baseline', u1)
        merged = self.repo.run('rev-parse', 'HEAD')
        pr = {**self.baseline_pr(u1), 'merge_commit_sha': merged}
        self.assertEqual(us.lost_baselines([pr], 'chore/upstream-baseline', 'main'), [])

    def test_other_branches_are_ignored(self):
        (u1,) = self.upstream_line('u1')
        pr = {**self.baseline_pr(u1), 'head': 'feature'}
        self.assertEqual(us.lost_baselines([pr], 'chore/upstream-baseline', 'main'), [])


class EndToEnd(InRepo):
    def test_report_and_outputs(self):
        u1, u2, u3 = self.upstream_line('u1', 'u2', 'u3')
        fork = self.repo.commit('fork feature')
        tmp = Path(self.tmp.name)
        (tmp / 'ledger.json').write_text(json.dumps({
            'commits': {u2[:8]: {'status': 'rejected', 'note': 'not | wanted'}},
            'pulls': {'7': {'status': 'rejected'}, '9': {'status': 'deferred', 'note': 'later'}},
        }), encoding='utf-8')
        (tmp / 'fork.jsonl').write_text(json.dumps({
            'number': 5, 'body': f'Adapted from upstream {u1[:8]}; upstream #8', 'head': 'x',
            'merge_commit_sha': fork,
        }) + '\n', encoding='utf-8')
        (tmp / 'up.jsonl').write_text('\n'.join(json.dumps(p) for p in (
            {'number': 7, 'title': 'rejected one'},
            {'number': 8, 'title': 'adopted one'},
            {'number': 9, 'title': 'deferred one'},
            {'number': 10, 'title': 'new one'},
        )), encoding='utf-8')
        out = tmp / 'out.txt'
        code = us.main([
            '--base', 'main', '--upstream', 'upstream', '--ledger', str(tmp / 'ledger.json'),
            '--fork-prs', str(tmp / 'fork.jsonl'), '--upstream-prs', str(tmp / 'up.jsonl'),
            '--repo', 'owner/fork', '--report', str(tmp / 'report.md'), '--github-output', str(out),
        ])
        self.assertEqual(code, 0)
        outputs = dict(line.split('=', 1) for line in out.read_text().splitlines())
        self.assertEqual(outputs, {'baseline': u2, 'open_items': '3', 'warnings': '0'})

        report = (tmp / 'report.md').read_text(encoding='utf-8')
        self.assertIn(f'[`{u3[:8]}`](https://github.com/SnosMe/awakened-poe-trade/commit/{u3})', report)
        self.assertNotIn(f'`{u1[:8]}`]', report.split('### Upstream commits')[1])
        self.assertIn('[upstream #9](https://github.com/SnosMe/awakened-poe-trade/pull/9) | deferred one | deferred | later', report)
        self.assertIn('[upstream #10]', report)
        self.assertNotIn('[upstream #7]', report)
        self.assertNotIn('[upstream #8]', report)
        self.assertNotIn('{repo}', report)

    def test_invalid_ledger_fails(self):
        self.upstream_line('u1')
        tmp = Path(self.tmp.name)
        (tmp / 'ledger.json').write_text('{"commits": {"zz": {}}}', encoding='utf-8')
        code = us.main([
            '--base', 'main', '--upstream', 'upstream', '--ledger', str(tmp / 'ledger.json'),
            '--report', str(tmp / 'report.md'),
        ])
        self.assertEqual(code, 1)


if __name__ == '__main__':
    unittest.main()
