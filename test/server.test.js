const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const app = require('../server');
const projectManager = require('../lib/projectManager');
const orchestrator = require('../lib/orchestrator');
const agentRunner = require('../lib/agentRunner');

test('the local API rejects cross-origin and invalid sprint requests', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/sprint/start`;

  const crossOrigin = await fetch(url, {
    method: 'POST',
    headers: { origin: 'https://other.example', 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test', runMode: 'sim' })
  });
  assert.equal(crossOrigin.status, 403);

  const invalid = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: {}, runMode: 'sim' })
  });
  assert.equal(invalid.status, 400);

  const invalidPdf = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Read this PDF', pdfs: [{ name: 'notes.pdf', data: Buffer.from('not a PDF').toString('base64') }] })
  });
  assert.equal(invalidPdf.status, 400);
  assert.match((await invalidPdf.json()).error, /PDF 형식/);

  const simulationPdf = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Read this PDF', runMode: 'sim', pdfs: [{ name: 'notes.pdf', data: Buffer.from('%PDF-1.4').toString('base64') }] })
  });
  assert.equal(simulationPdf.status, 400);
  assert.match((await simulationPdf.json()).error, /실제 CLI/);
});

test('project API reopens a saved folder and continues work there', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-project-api-'));
  const previousBase = projectManager.baseDir;
  const previousAgy = agentRunner.runAntigravity;
  const previousCodex = agentRunner.runCodex;
  projectManager.baseDir = base;
  const { folderName, projectPath } = projectManager.createProjectDir('saved');
  fs.writeFileSync(path.join(projectPath, 'existing.txt'), 'original');
  agentRunner.runAntigravity = async () => ({ output: 'Plan and changes' });
  agentRunner.runCodex = async () => ({ output: 'Review and changes' });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => {
    server.close();
    agentRunner.runAntigravity = previousAgy;
    agentRunner.runCodex = previousCodex;
    projectManager.baseDir = previousBase;
    fs.rmSync(base, { recursive: true, force: true });
  });
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  const listed = await fetch(`${url}/api/projects`);
  assert.ok((await listed.json()).some(project => project.name === folderName));
  const opened = await fetch(`${url}/api/projects/${folderName}/open`, { method: 'POST' });
  assert.equal(opened.status, 200);
  assert.equal((await opened.json()).session.projectPath, projectPath);
  const started = await fetch(`${url}/api/projects/${folderName}/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'Improve existing project' })
  });
  assert.equal(started.status, 200);
  for (let attempt = 0; orchestrator.isRunning && attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(orchestrator.currentSession.status, 'completed');
  assert.equal(orchestrator.currentSession.projectPath, projectPath);
  const file = await fetch(`${url}/api/file?path=existing.txt`);
  assert.equal((await file.json()).content, 'original');
});
