import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStartHereText } from './validate-start-here.mjs';

const GOOD_START_HERE = `
BellField Gate Day USB - rerun-29

Set the USB root first:
$usb = (Get-Location).Path

Gate 1 prepare command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $usb\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-prepare-release -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -ArtifactZip $usb\\artifacts\\bellfield-v0.0.1.zip -EvidenceRoot $usb\\evidence -RunId rerun-29 -ExpectedVersion 0.0.1 -ExpectedSourceCommit abc1234

Gate 1 admin install command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId rerun-29
`;

// The literal shape that lost rerun-28: no prepare step, ArtifactZip bolted
// onto admin-install, relative artifact path, missing roots and evidence root,
// launched from the USB tools copy.
const RERUN_28_START_HERE = `
Gate 1 clean install command:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -ArtifactZip .\\artifacts\\bellfield-v0.0.1-gateday.20260704.51.zip -RunId rerun-28 -ExpectedVersion 0.0.1-gateday.20260704.51 -ExpectedSourceCommit 17bfc81
`;

test('accepts the canonical two-step Gate 1 command sequence', () => {
  const result = validateStartHereText(GOOD_START_HERE);
  assert.deepEqual(result.problems, []);
  assert.equal(result.status, 'ok');
  assert.equal(result.commands.length, 2);
});

test('rejects the rerun-28 START-HERE shape with actionable problems', () => {
  const result = validateStartHereText(RERUN_28_START_HERE);
  assert.equal(result.status, 'failed');
  const joined = result.problems.join('\n');
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
      'powershell.exe -File $usb\\tools\\install\\run-gate-day-admin.ps1 `',
      '  -Mode gate1-prepare-release `',
      '  -InstallRoot C:\\BellField `',
      '  -ReleaseRoot C:\\BellField\\release `',
      '  -ArtifactZip $usb\\artifacts\\a.zip `',
      '  -EvidenceRoot $usb\\evidence `',
      '  -RunId rerun-29',
      'powershell.exe -File C:\\BellField\\release\\tools\\install\\run-gate-day-admin.ps1 -Mode gate1-admin-install -InstallRoot C:\\BellField -ReleaseRoot C:\\BellField\\release -EvidenceRoot $usb\\evidence -RunId rerun-29'
    ].join('\n')
  );
  assert.deepEqual(result.problems, []);
  assert.equal(result.status, 'ok');
});

test('fails when no runner commands are present at all', () => {
  const result = validateStartHereText('Just artifacts and hashes, no commands.');
  assert.equal(result.status, 'failed');
  assert.match(result.problems.join('\n'), /no run-gate-day-admin\.ps1 commands/);
});
