const express = require('express');
const path = require('path');
const fs = require('fs');
const orchestrator = require('./lib/orchestrator');
const projectManager = require('./lib/projectManager');

const app = express();
const PORT = process.env.PORT || 3300;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
app.post('/api/sprint/start', async (req, res) => {
  const { prompt, projectName, mode, runMode } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: '프롬프트를 입력해주세요.' });
  }

  // Trigger sprint in background
  orchestrator.startSprint({
    prompt: prompt.trim(),
    projectName: projectName || 'duo_app',
    mode: mode || 'full',
    runMode: runMode || 'cli'
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
    res.status(500).json({ error: err.message });
  }
});

// API: List past projects
app.get('/api/projects', (req, res) => {
  try {
    const projectsDir = path.join(__dirname, 'projects');
    if (!fs.existsSync(projectsDir)) return res.json([]);
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({
        name: d.name,
        path: path.join(projectsDir, d.name),
        mtime: fs.statSync(path.join(projectsDir, d.name)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    res.json(dirs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 DuoDev Studio (Antigravity ✕ Codex) Running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
