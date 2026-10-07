const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const agentRunner = require('./agentRunner');
const projectManager = require('./projectManager');

class CollaborationOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.currentSession = null;
    this.history = [];
    this.tasks = [];
    this.logs = [];
    this.isAborted = false;
    this.isRunning = false;
    this.abortController = null;
  }

  getCurrentState() {
    return {
      session: this.currentSession,
      history: this.history,
      tasks: this.tasks,
      logs: this.logs.slice(-100),
      fileTree: this.currentSession?.projectPath ? projectManager.getFileTree(this.currentSession.projectPath) : []
    };
  }

  log(entry) {
    const logItem = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleTimeString(),
      ...entry
    };
    this.logs.push(logItem);
    this.emit('log', logItem);
  }

  addMessage(agent, role, text, meta = {}) {
    const msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      agent, // 'antigravity' | 'codex' | 'system'
      role,  // 'Lead Architect' | 'Critical Reviewer' | 'Orchestrator'
      text,
      time: new Date().toLocaleTimeString(),
      meta
    };
    this.history.push(msg);
    this.emit('message', msg);
    return msg;
  }

  updateTask(taskId, updates) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      this.emit('task_update', task);
    }
  }

  abort() {
    if (!this.isRunning || this.isAborted) return;
    this.isAborted = true;
    this.abortController.abort();
    if (this.currentSession) {
      this.currentSession.status = 'aborted';
      this.addMessage('system', 'System', '사용자에 의해 세션이 중단되었습니다.');
      this.emit('status_change', { status: 'aborted' });
    }
  }

  async startSprint({ prompt, projectName, mode = 'full', runMode = 'cli' }) {
    if (this.isRunning) return false;
    this.isRunning = true;
    this.abortController = new AbortController();
    this.isAborted = false;
    this.currentSession = null;
    this.history = [];
    this.tasks = [];
    this.logs = [];

    const isSim = (runMode === 'sim');
    try {
      const { folderName, projectPath } = projectManager.createProjectDir(projectName || 'duo_project');

      this.currentSession = {
        id: 'sess_' + Date.now(),
        prompt,
        projectName: folderName,
        projectPath,
        mode,
        runMode,
        status: 'starting',
        progress: 5
      };

    this.emit('status_change', this.currentSession);
    this.log({ type: 'info', message: `프로젝트 생성됨: ${projectPath}` });

    this.addMessage('system', 'Orchestrator', `새 프로젝트 작업 시작: "${prompt}"\n작업 폴더: ${projectPath}`);

      // PHASE 1: Antigravity Drafts Architecture & Proposes Division
      if (this.isAborted) return;
      this.currentSession.status = 'planning';
      this.currentSession.progress = 20;
      this.emit('status_change', this.currentSession);

      this.log({ type: 'step', message: '1단계: Antigravity가 아키텍처 초안 및 역할 분담안을 작성 중입니다.' });

      const agyPrompt = `You are Antigravity, a Principal System Architect & Autonomous Engineer.
We are collaborating with OpenAI Codex on this project:
"${prompt}"

Please formulate a concise, modular software design:
1. Architecture summary & Tech stack selection.
2. Division of Work:
   - Antigravity responsibilities (e.g. Scaffolding, Core Infrastructure, APIs)
   - Codex responsibilities (e.g. Business Algorithms, Edge-case validation, Client/UI or Tests)
3. Provide a list of initial tasks formatted in JSON as:
\`\`\`json
[
  {"id": "t1", "title": "...", "assignedTo": "antigravity", "description": "...", "files": ["..."]},
  {"id": "t2", "title": "...", "assignedTo": "codex", "description": "...", "files": ["..."]}
]
\`\`\`
Answer in Korean with clear Markdown.`;

      const agyRes = await agentRunner.runAntigravity({
        prompt: agyPrompt,
        projectDir: projectPath,
        onLog: (l) => this.log(l),
        isSimulation: isSim,
        signal: this.abortController.signal
      });

      if (this.isAborted) return;
      this.addMessage('antigravity', 'Lead Architect & Executor', agyRes.output);

      // Parse tasks from Antigravity output or default
      this.tasks = this._extractTasks(agyRes.output, prompt);
      this.emit('tasks_init', this.tasks);

      // PHASE 2: Codex Critical Review & Debate
      if (this.isAborted) return;
      this.currentSession.status = 'debating';
      this.currentSession.progress = 40;
      this.emit('status_change', this.currentSession);

      this.log({ type: 'step', message: '2단계: Codex가 아키텍처를 교차 검증하고 대안 및 개선점을 제시 중입니다.' });

      const codexPrompt = `You are OpenAI Codex, Senior Systems Specialist and Critical Reviewer.
Your partner Antigravity proposed this architecture and task division:
"""
${agyRes.output}
"""

Critique this proposal:
1. Identify any potential flaws, race conditions, performance bottlenecks, or security holes.
2. Propose optimizations and accept/adjust your assigned tasks.
3. Formulate the final consensus to begin implementation.
Answer in Korean with constructive and sharp technical analysis.`;

      const codexRes = await agentRunner.runCodex({
        prompt: codexPrompt,
        projectDir: projectPath,
        onLog: (l) => this.log(l),
        isSimulation: isSim,
        signal: this.abortController.signal
      });

      if (this.isAborted) return;
      this.addMessage('codex', 'Critical Reviewer & Specialist', codexRes.output);

      if (mode === 'debate_only') {
        this.currentSession.status = 'completed';
        this.currentSession.progress = 100;
        this.emit('status_change', this.currentSession);
        this.addMessage('system', 'Orchestrator', '설계 및 아키텍처 토론이 완료되었습니다.');
        return;
      }

      // PHASE 3: Implementation by Antigravity
      if (this.isAborted) return;
      this.currentSession.status = 'coding';
      this.currentSession.progress = 60;
      this.emit('status_change', this.currentSession);

      const agyTasks = this.tasks.filter(t => t.assignedTo === 'antigravity');
      for (const t of agyTasks) {
        this.updateTask(t.id, { status: 'in_progress' });
      }

      this.log({ type: 'step', message: '3단계: Antigravity가 핵심 파일 및 인프라 구현을 시작합니다.' });

      const codingPrompt = `You are Antigravity. The architectural consensus is reached with Codex.
Now implement the core backend/infrastructure and essential files for: "${prompt}"
In directory: ${projectPath}
Write full, production-ready, clean code into the appropriate files.
List the files created and a summary of what you implemented in Korean.`;

      const agyCodeRes = await agentRunner.runAntigravity({
        prompt: codingPrompt,
        projectDir: projectPath,
        onLog: (l) => this.log(l),
        isSimulation: isSim,
        signal: this.abortController.signal
      });

      if (this.isAborted) return;
      this.addMessage('antigravity', 'Lead Architect & Executor', agyCodeRes.output);

      if (isSim) this._ensureProjectFiles(projectPath, prompt);

      for (const t of agyTasks) {
        this.updateTask(t.id, { status: 'review' });
      }
      this.emit('files_changed', projectManager.getFileTree(projectPath));

      // PHASE 4: Cross-Review & Enhancements by Codex
      if (this.isAborted) return;
      this.currentSession.status = 'reviewing';
      this.currentSession.progress = 80;
      this.emit('status_change', this.currentSession);

      const codexTasks = this.tasks.filter(t => t.assignedTo === 'codex');
      for (const t of codexTasks) {
        this.updateTask(t.id, { status: 'in_progress' });
      }

      this.log({ type: 'step', message: '4단계: Codex가 Antigravity의 코드를 교차 리뷰하고 추가 모듈/테스트를 보완합니다.' });

      const reviewPrompt = `You are OpenAI Codex. Antigravity just implemented the initial modules for "${prompt}" in ${projectPath}.
Now:
1. Conduct a peer code review: verify edge cases, error handling, and performance.
2. Implement your assigned module or write comprehensive test cases / frontend UI in the workspace.
3. Report your findings and additions in Korean.`;

      const codexCodeRes = await agentRunner.runCodex({
        prompt: reviewPrompt,
        projectDir: projectPath,
        onLog: (l) => this.log(l),
        isSimulation: isSim,
        signal: this.abortController.signal
      });

      if (this.isAborted) return;
      this.addMessage('codex', 'Critical Reviewer & Specialist', codexCodeRes.output);

      for (const t of this.tasks) {
        this.updateTask(t.id, { status: 'done' });
      }
      this.emit('files_changed', projectManager.getFileTree(projectPath));

      // PHASE 5: Completion & Delivery
      this.currentSession.status = 'completed';
      this.currentSession.progress = 100;
      this.emit('status_change', this.currentSession);

      const summary = `🎉 **프로젝트 공동 개발이 완료되었습니다!**\n\n- **프로젝트 디렉터리**: \`${projectPath}\`\n- **협업 결과**: 아키텍처 토론 합의 → 모듈 분담 개발 → 교차 코드 리뷰 완료\n- 좌측/우측 탭에서 생성된 파일과 상호 검증 로그를 확인하실 수 있습니다.`;
      this.addMessage('system', 'Orchestrator', summary);
      this.log({ type: 'success', message: '프로젝트가 성공적으로 완료되었습니다.' });

    } catch (err) {
      if (this.isAborted) return;
      console.error('Sprint error:', err);
      this.currentSession ||= { id: 'sess_' + Date.now(), prompt, projectName, projectPath: null, progress: 0 };
      this.currentSession.status = 'error';
      this.emit('status_change', this.currentSession);
      this.addMessage('system', 'Error', `오류 발생: ${err.message}`);
      this.log({ type: 'error', message: err.message });
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
    return true;
  }

  _extractTasks(text, defaultPrompt) {
    try {
      const match = text.match(/```json([\s\S]*?)```/);
      if (match) {
        const parsed = JSON.parse(match[1].trim());
        const valid = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
        if (valid.length > 0) {
          return valid.map((item, idx) => ({
            id: `task_${idx + 1}`,
            title: typeof item.title === 'string' ? item.title : `Task ${idx + 1}`,
            assignedTo: ['antigravity', 'codex'].includes(item.assignedTo) ? item.assignedTo : (idx % 2 === 0 ? 'antigravity' : 'codex'),
            description: typeof item.description === 'string' ? item.description : '',
            files: Array.isArray(item.files) ? item.files.filter(file => typeof file === 'string') : [],
            status: 'pending'
          }));
        }
      }
    } catch (e) {
      // fallback
    }

    // Default tasks if not parsed
    return [
      {
        id: 'task_1',
        title: '시스템 뼈대 및 기본 환경 설정',
        assignedTo: 'antigravity',
        description: '디렉터리 구조 설계 및 메인 서버/엔트리포인트 스캐폴딩',
        files: ['server.js', 'package.json'],
        status: 'pending'
      },
      {
        id: 'task_2',
        title: '비즈니스 로직 및 엣지 케이스 처리',
        assignedTo: 'codex',
        description: '핵심 서비스 로직 및 데이터 유효성 검증',
        files: ['services/logic.js'],
        status: 'pending'
      },
      {
        id: 'task_3',
        title: '클라이언트 인터페이스 / API 엔드포인트',
        assignedTo: 'antigravity',
        description: '사용자 인터랙션 화면 또는 REST/WS 엔드포인트 구현',
        files: ['public/index.html'],
        status: 'pending'
      },
      {
        id: 'task_4',
        title: '단위 테스트 및 교차 검증',
        assignedTo: 'codex',
        description: '기능 동작 및 예외 처리 검증 테스트 슈트 작성',
        files: ['tests/suite.test.js'],
        status: 'pending'
      }
    ];
  }

  _ensureProjectFiles(projectPath, prompt) {
    const readmePath = path.join(projectPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      const readmeContent = `# ${path.basename(projectPath)}

> **Developed by DuoDev Studio: Antigravity (Google) ✕ Codex (OpenAI)**

## 프로젝트 개요
${prompt}

## 협업 파이프라인
1. **아키텍처 설계 & 초안:** Antigravity (Lead Architect)
2. **비평 & 엣지 케이스 분석:** Codex (Critical Reviewer)
3. **분담 구현 및 인프라 구축:** Antigravity & Codex
4. **상호 교차 리뷰 (Cross-Review):** 양방향 검증 완료

## 실행 방법
\`\`\`bash
cd ${projectPath}
# 프로젝트 실행 명령어 (예: node server.js 또는 python main.py)
\`\`\`
`;
      fs.writeFileSync(readmePath, readmeContent, 'utf8');
    }
  }
}

module.exports = new CollaborationOrchestrator();
