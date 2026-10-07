const express = require('express');
const path = require('path');
const orchestrator = require('./lib/orchestrator');
const projectManager = require('./lib/projectManager');
const { decodePdfUploads } = require('./lib/pdfUploads');

const app = express();
const PORT = process.env.PORT || 3300;
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if ((HOST === '127.0.0.1' && !['localhost', '127.0.0.1'].includes(req.hostname)) ||
      (origin && origin !== `http://${req.get('host')}` && origin !== `https://${req.get('host')}`)) {
    return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
  }
  next();
});

// Store active SSE clients
let sseClients = [];

function broadcastSSE(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client disconnected
    }
  });
}

// Wire orchestrator events to SSE
orchestrator.on('message', (msg) => broadcastSSE('message', msg));
orchestrator.on('log', (log) => broadcastSSE('log', log));
orchestrator.on('task_update', (task) => broadcastSSE('task_update', task));
orchestrator.on('tasks_init', (tasks) => broadcastSSE('tasks_init', tasks));
orchestrator.on('files_changed', (files) => broadcastSSE('files_changed', files));
orchestrator.on('status_change', (status) => broadcastSSE('status_change', status));
orchestrator.on('state_reset', (state) => broadcastSSE('state_reset', state));

// SSE Endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now() + Math.random().toString();
  const client = { id: clientId, res };
  sseClients.push(client);

  // Send initial state immediately
  res.write(`event: init\ndata: ${JSON.stringify(orchestrator.getCurrentState())}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// API: Get current state
app.get('/api/state', (req, res) => {
  res.json(orchestrator.getCurrentState());
});

// API: Start sprint
app.post('/api/sprint/start', express.json({ limit: '28mb' }), (req, res) => {
  const { prompt, projectName, mode, runMode } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: '프롬프트를 입력해주세요.' });
  }
  if (orchestrator.isRunning) {
    return res.status(409).json({ error: '이미 스프린트가 실행 중입니다.' });
  }
  if (mode && !['full', 'debate_only'].includes(mode)) {
    return res.status(400).json({ error: '지원하지 않는 스프린트 모드입니다.' });
  }
  if (runMode && !['cli', 'sim'].includes(runMode)) {
    return res.status(400).json({ error: '지원하지 않는 실행 모드입니다.' });
  }
  let pdfs;
  try {
    pdfs = decodePdfUploads(req.body.pdfs);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (pdfs.length && runMode === 'sim') {
    return res.status(400).json({ error: 'PDF 분석은 실제 CLI 실행 모드에서만 지원합니다.' });
  }

  // Trigger sprint in background
  orchestrator.startSprint({
    prompt: prompt.trim(),
    projectName: typeof projectName === 'string' ? projectName : 'duo_app',
    mode: mode || 'full',
    runMode: runMode || 'cli',
    pdfs
  });

  res.json({ success: true, message: '스프린트가 시작되었습니다.' });
});

// API: Abort sprint
app.post('/api/sprint/abort', (req, res) => {
  orchestrator.abort();
  res.json({ success: true, message: '중단 요청되었습니다.' });
});

// API: Read file content
app.get('/api/file', (req, res) => {
  const { path: relativePath } = req.query;
  const session = orchestrator.currentSession;
  if (!session || !session.projectPath) {
    return res.status(400).json({ error: '활성화된 세션이 없습니다.' });
  }
  try {
    const content = projectManager.readFileContent(session.projectPath, relativePath);
    if (content === null) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    res.json({ path: relativePath, content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: List and reopen past projects
app.get('/api/projects', (req, res) => {
  try {
    res.json(projectManager.listProjects());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects/:name/open', (req, res) => {
  if (orchestrator.isRunning) return res.status(409).json({ error: '스프린트 실행 중에는 다른 프로젝트를 열 수 없습니다.' });
  try {
    res.json(orchestrator.openProject(req.params.name));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/projects/clear', (req, res) => {
  if (orchestrator.isRunning) return res.status(409).json({ error: '스프린트 실행 중에는 새 프로젝트로 전환할 수 없습니다.' });
  res.json(orchestrator.clearProject());
});

app.post('/api/projects/:name/continue', express.json({ limit: '64kb' }), (req, res) => {
  if (orchestrator.isRunning) return res.status(409).json({ error: '이미 스프린트가 실행 중입니다.' });
  const prompt = req.body?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: '후속 요청을 입력해주세요.' });
  }
  try {
    projectManager.resolveProject(req.params.name);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
  orchestrator.startSprint({ prompt: prompt.trim(), existingProjectName: req.params.name });
  res.json({ success: true, message: '기존 프로젝트에서 후속 작업을 시작했습니다.' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'PDF 업로드 크기가 제한을 초과했습니다.' });
  }
  next(err);
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`===============================================`);
    console.log(`🚀 DuoDev Studio (Antigravity ✕ Codex) Running!`);
    console.log(`🌐 Local URL: http://${HOST}:${PORT}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
