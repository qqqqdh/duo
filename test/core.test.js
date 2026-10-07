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
  fs.writeFileSync(path.join(base, 'exec'), "let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { console.error('stdin closed: ' + input + ', arg: ' + process.argv.at(-1)); process.exit(1); });");
  t.after(() => {
    agentRunner.codexBin = previousBin;
    fs.rmSync(base, { recursive: true, force: true });
  });

  await assert.rejects(
    agentRunner.runCodex({ prompt: 'test', projectDir: base, signal: AbortSignal.timeout(3000) }),
    /Codex exited with code 1 after \d+s: stdin closed: test, arg: -/
  );
});

test('Codex usage limit retries once through FactChat in the same directory', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-factchat-'));
  const previousBin = agentRunner.codexBin;
  const previousKey = process.env.BAZE_API_KEY;
  agentRunner.codexBin = process.execPath;
  process.env.BAZE_API_KEY = 'test-key';
  fs.writeFileSync(path.join(base, 'exec'), "let input = ''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { if (!process.argv.includes('model_provider=factchat')) { console.error('You have hit your usage limit'); process.exit(1); } if (!process.argv.includes('model_providers.factchat.env_key=BAZE_API_KEY') || input !== 'continue work') process.exit(2); console.log('codex\\ncontinued in ' + process.cwd()); });");
  t.after(() => {
    agentRunner.codexBin = previousBin;
    if (previousKey === undefined) delete process.env.BAZE_API_KEY;
    else process.env.BAZE_API_KEY = previousKey;
    fs.rmSync(base, { recursive: true, force: true });
  });

  const logs = [];
  const result = await agentRunner.runCodex({ prompt: 'continue work', projectDir: base, onLog: log => logs.push(log), signal: AbortSignal.timeout(5000) });
  assert.match(result.output, /continued in/);
  assert.ok(logs.some(log => log.message?.includes('FactChat')));
  assert.equal(agentRunner.isCodexUsageLimit(new Error('context window limit exceeded')), false);
});

test('Windows Gemini npm installation runs through Node without a shell', { skip: process.platform !== 'win32' }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-gemini-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const script = path.join(base, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, "console.log('gemini fixture');");

  const command = agentRunner.geminiCommand({ PATH: base });
  assert.equal(command.bin, process.execPath);
  assert.deepEqual(command.prefix, [script]);
});

test('Antigravity CLI finds the Windows local installation and respects AGY_BIN', { skip: process.platform !== 'win32' }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-agy-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const bin = path.join(base, 'agy', 'bin', 'agy.exe');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, 'fixture');

  assert.equal(agentRunner.agyCommand({ PATH: '', LOCALAPPDATA: base }), bin);
  assert.equal(agentRunner.agyCommand({ PATH: '', LOCALAPPDATA: base, AGY_BIN: 'custom-agy' }), 'custom-agy');
});

test('Windows Codex npm installation runs through Node without a shell', { skip: process.platform !== 'win32' }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-codex-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const script = path.join(base, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, "console.log('codex fixture');");

  const command = agentRunner.codexCommand({ PATH: base });
  assert.equal(command.bin, process.execPath);
  assert.deepEqual(command.prefix, [script]);
  assert.deepEqual(agentRunner.codexCommand({ PATH: base, CODEX_BIN: 'custom-codex' }), { bin: 'custom-codex', prefix: [] });
});

test('a saved project reopens and follow-up work uses the same directory', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-followup-'));
  const previousBase = projectManager.baseDir;
  const previousAgy = agentRunner.runAntigravity;
  const previousCodex = agentRunner.runCodex;
  projectManager.baseDir = base;
  const { folderName, projectPath } = projectManager.createProjectDir('existing');
  fs.writeFileSync(path.join(projectPath, 'app.txt'), 'keep this file');
  const prompts = [];
  agentRunner.runAntigravity = async ({ prompt }) => { prompts.push(prompt); return { output: 'Antigravity plan and changes' }; };
  agentRunner.runCodex = async ({ prompt }) => { prompts.push(prompt); return { output: 'Codex review and changes' }; };
  t.after(() => {
    agentRunner.runAntigravity = previousAgy;
    agentRunner.runCodex = previousCodex;
    projectManager.baseDir = previousBase;
    fs.rmSync(base, { recursive: true, force: true });
  });

  assert.throws(() => projectManager.resolveProject('../outside'), /잘못된 프로젝트/);
  const opened = orchestrator.openProject(folderName);
  assert.equal(opened.session.projectPath, projectPath);
  assert.ok(opened.fileTree.some(file => file.name === 'app.txt'));

  await orchestrator.startSprint({ prompt: 'Add a feature', existingProjectName: folderName });
  assert.equal(orchestrator.currentSession.status, 'completed');
  assert.equal(orchestrator.currentSession.projectPath, projectPath);
  assert.equal(fs.readdirSync(base).length, 1);
  assert.equal(fs.readFileSync(path.join(projectPath, 'app.txt'), 'utf8'), 'keep this file');
  assert.equal(prompts.length, 4);
  assert.match(prompts[0], /Read its code and relevant references first/);
  assert.match(prompts[2], /existing project directory/);
  const saved = projectManager.loadSnapshot(projectPath);
  assert.ok(saved.history.some(message => message.text.includes('후속 수정 요청')));
  assert.ok(saved.logs.some(log => log.message?.includes('1단계')));
  assert.equal(saved.session.status, 'completed');

  orchestrator.clearProject();
  assert.equal(orchestrator.openProject(folderName).session.projectPath, projectPath);
  assert.ok(orchestrator.history.some(message => message.text.includes('후속 수정 요청')));
});
