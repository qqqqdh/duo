const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const projectManager = require('../lib/projectManager');
const orchestrator = require('../lib/orchestrator');
const agentRunner = require('../lib/agentRunner');

test('file reads stay inside the project', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-files-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const project = path.join(base, 'app');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'ok.txt'), 'ok');
  fs.writeFileSync(path.join(base, 'secret.txt'), 'secret');

  assert.equal(projectManager.readFileContent(project, 'ok.txt'), 'ok');
  assert.throws(() => projectManager.readFileContent(project, '../secret.txt'), /Path traversal/);
  assert.throws(() => projectManager.readFileContent(project, ''), /Invalid file path/);

  try {
    fs.symlinkSync(path.join(base, 'secret.txt'), path.join(project, 'link.txt'));
    assert.throws(() => projectManager.readFileContent(project, 'link.txt'), /Path traversal/);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
});

test('an aborted sprint cannot overlap another sprint', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-sprints-'));
  const previousBase = projectManager.baseDir;
  projectManager.baseDir = base;
  t.after(() => {
    projectManager.baseDir = previousBase;
    fs.rmSync(base, { recursive: true, force: true });
  });

  const first = orchestrator.startSprint({ prompt: 'test', runMode: 'sim' });
  assert.equal(await orchestrator.startSprint({ prompt: 'second', runMode: 'sim' }), false);
  orchestrator.abort();
  await first;
  assert.equal(orchestrator.currentSession.status, 'aborted');
  assert.equal(orchestrator.isRunning, false);
});

test('Codex receives stdin EOF and failures report the exit reason', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-cli-'));
  const previousBin = agentRunner.codexBin;
  agentRunner.codexBin = process.execPath;
  fs.writeFileSync(path.join(base, 'exec'), "process.stdin.resume(); process.stdin.on('end', () => { console.error('stdin closed'); process.exit(1); });");
  t.after(() => {
    agentRunner.codexBin = previousBin;
    fs.rmSync(base, { recursive: true, force: true });
  });

  await assert.rejects(
    agentRunner.runCodex({ prompt: 'test', projectDir: base, signal: AbortSignal.timeout(3000) }),
    /Codex exited with code 1 after \d+s: stdin closed/
  );
});
