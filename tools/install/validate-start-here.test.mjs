import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStartHereText } from './validate-start-here.mjs';

const GOOD_START_HERE = `
BellField Gate Day USB - rerun-29

Read before install work:
- docs\\codex-install-test-operator-rules.md
- docs\\gate-day-checklist.md

The runner creates the first-owner test account automatically with the
documented Gate Day dummy credential; the browser proof is sign-in plus
job booking.

Gate 4 uses the USB bellfield-license-EXPIRED.json; the runner swaps it in,
proves the updater refuses, and restores the valid license automatically.

Set the USB root first:
$usb = (Get-Location).Path

Gate 1 prepare command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $usb\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-prepare-release -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -ArtifactZip $usb\\artifacts\\bellfield-v0.0.1.zip -EvidenceRoot $usb\\evidence -RunId rerun-29 -ExpectedVersion 0.0.1 -ExpectedSourceCommit abc1234

Gate 1 admin install command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId rerun-29

Gate 3 update command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\BellField-update\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate3-update -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -UpdateArtifactRoot C:\\BellField-update\\release -EvidenceRoot $usb\\evidence -RunId rerun-29

Gate 4 expired-window refusal command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate4-expired-refusal -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -UpdateArtifactRoot C:\\BellField-update\\release -ExpiredLicensePath $usb\\licenses\\bellfield-license-EXPIRED.json -EvidenceRoot $usb\\evidence -RunId rerun-29
`;

// The literal shape that lost rerun-28: no prepare step, ArtifactZip bolted
// onto admin-install, relative artifact path, missing roots and evidence root,
// launched from the USB tools copy.
const RERUN_28_START_HERE = `
Gate 1 clean install command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -ArtifactZip .\\artifacts\\bellfield-v0.0.1-gateday.20260704.51.zip -RunId rerun-28 -ExpectedVersion 0.0.1-gateday.20260704.51 -ExpectedSourceCommit 17bfc81
`;

test('accepts the canonical Gate 1 through Gate 4 command sequence', () => {
  const result = validateStartHereText(GOOD_START_HERE);
  assert.deepEqual(result.problems, []);
  assert.equal(result.status, 'ok');
  assert.equal(result.commands.length, 4);
});

test('rejects the rerun-28 START-HERE shape with actionable problems', () => {
  const result = validateStartHereText(RERUN_28_START_HERE);
  assert.equal(result.status, 'failed');
  const joined = result.problems.join('\n');
  assert.match(joined, /must brief the operator on the first-owner step/);
  assert.match(joined, /codex-install-test-operator-rules\.md/);
  assert.match(joined, /gate-day-checklist\.md/);
  assert.match(joined, /Missing a -Mode gate1-prepare-release command/);
  assert.match(joined, /must not take -ArtifactZip/);
  assert.match(joined, /missing -InstallRoot/);
  assert.match(joined, /missing -ReleaseRoot/);
  assert.match(joined, /missing -EvidenceRoot/);
  assert.match(joined, /prepared release copy of run-gate-day-admin\.ps1/);
});

test('rejects relative artifact and evidence paths on prepare commands', () => {
  const result = validateStartHereText(`
powershell.exe -File $usb\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-prepare-release -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -ArtifactZip .\\artifacts\\a.zip -EvidenceRoot .\\evidence -RunId rerun-29
powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId rerun-29
`);
  assert.equal(result.status, 'failed');
  const joined = result.problems.join('\n');
  assert.match(joined, /relative -ArtifactZip/);
  assert.match(joined, /relative -EvidenceRoot/);
});

test('rejects ordering where admin-install precedes prepare', () => {
  const result = validateStartHereText(`
powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File $usb\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-prepare-release -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -ArtifactZip $usb\\artifacts\\a.zip -EvidenceRoot $usb\\evidence -RunId r
`);
  assert.equal(result.status, 'failed');
  assert.match(result.problems.join('\n'), /appears before gate1-prepare-release/);
});

test('joins backtick line continuations before parsing', () => {
  const result = validateStartHereText(
    [
      'Read docs\\codex-install-test-operator-rules.md and docs\\gate-day-checklist.md.',
      'The runner creates the first-owner test account automatically.',
      'Gate 4 swaps in the USB bellfield-license-EXPIRED.json and restores the valid license automatically.',
      'powershell.exe -File $usb\\tools\\install\\run-gate-day-admin.ps1 `',
      '  -Mode gate1-prepare-release `',
      '  -InstallRoot C:\\BellField `',
      '  -ReleaseRoot C:\\BellField\\release `',
      '  -ArtifactZip $usb\\artifacts\\a.zip `',
      '  -EvidenceRoot $usb\\evidence `',
      '  -RunId rerun-29',
      'powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId rerun-29',
      'powershell.exe -File C:\\BellField-update\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate3-update -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -UpdateArtifactRoot C:\\BellField-update\\release -EvidenceRoot $usb\\evidence -RunId rerun-29',
      'powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 `',
      '  -Mode gate4-expired-refusal `',
      '  -InstallRoot C:\\BellField `',
      '  -ReleaseRoot C:\\BellField\\release `',
      '  -UpdateArtifactRoot C:\\BellField-update\\release `',
      '  -ExpiredLicensePath $usb\\licenses\\bellfield-license-EXPIRED.json `',
      '  -EvidenceRoot $usb\\evidence `',
      '  -RunId rerun-29'
    ].join('\n')
  );
  assert.deepEqual(result.problems, []);
  assert.equal(result.status, 'ok');
});

test('rejects a START-HERE that stops at Gate 3 (the rerun-30 gap)', () => {
  const result = validateStartHereText(
    GOOD_START_HERE.split('\n')
      .filter(
        (line) =>
          !line.includes('gate4-expired-refusal') && !/bellfield-license-EXPIRED/i.test(line)
      )
      .join('\n')
  );
  assert.equal(result.status, 'failed');
  const joined = result.problems.join('\n');
  assert.match(joined, /Missing a -Mode gate4-expired-refusal command/);
  assert.match(joined, /bellfield-license-EXPIRED\.json/);
});

test('rejects gate4-expired-refusal ordered before gate3-update', () => {
  const result = validateStartHereText(`
The runner creates the first-owner test account automatically.
Read docs\\codex-install-test-operator-rules.md and docs\\gate-day-checklist.md.
Gate 4 uses the USB bellfield-license-EXPIRED.json.
powershell.exe -File $usb\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-prepare-release -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -ArtifactZip $usb\\artifacts\\a.zip -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate4-expired-refusal -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -UpdateArtifactRoot C:\\BellField-update\\release -ExpiredLicensePath $usb\\licenses\\bellfield-license-EXPIRED.json -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File C:\\BellField-update\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate3-update -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -UpdateArtifactRoot C:\\BellField-update\\release -EvidenceRoot $usb\\evidence -RunId r
`);
  assert.equal(result.status, 'failed');
  assert.match(result.problems.join('\n'), /gate4-expired-refusal appears before gate3-update/);
});

test('rejects gate4 commands missing or dot-relative on required paths', () => {
  const result = validateStartHereText(`
The runner creates the first-owner test account automatically.
Read docs\\codex-install-test-operator-rules.md and docs\\gate-day-checklist.md.
Gate 4 uses the USB bellfield-license-EXPIRED.json.
powershell.exe -File $usb\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-prepare-release -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -ArtifactZip $usb\\artifacts\\a.zip -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File C:\\BellField-update\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate3-update -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId r
powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate4-expired-refusal -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -UpdateArtifactRoot C:\\BellField-update\\release -ExpiredLicensePath .\\licenses\\bellfield-license-EXPIRED.json -EvidenceRoot $usb\\evidence -RunId r
`);
  assert.equal(result.status, 'failed');
  const joined = result.problems.join('\n');
  assert.match(joined, /-Mode gate3-update is missing -UpdateArtifactRoot/);
  assert.match(joined, /relative -ExpiredLicensePath/);
});

test('fails when no runner commands are present at all', () => {
  const result = validateStartHereText('Just artifacts and hashes, no commands.');
  assert.equal(result.status, 'failed');
  assert.match(result.problems.join('\n'), /no run-gate-day-admin\.ps1 commands/);
});
