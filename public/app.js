// DuoDev Studio Client Application

let currentSession = null;
let tasks = [];
let messages = [];
let files = [];
let selectedFile = null;

// DOM Elements
const promptInput = document.getElementById('prompt-input');
const sprintMode = document.getElementById('sprint-mode');
const runMode = document.getElementById('run-mode');
const btnStart = document.getElementById('btn-start');
const btnAbort = document.getElementById('btn-abort');
const messagesContainer = document.getElementById('messages-container');
const emptyState = document.getElementById('empty-state');
const typingIndicator = document.getElementById('typing-indicator');
const typingLabel = document.getElementById('typing-label');
const messageCount = document.getElementById('message-count');
const taskCount = document.getElementById('task-count');
const fileCount = document.getElementById('file-count');
const kanbanCardsContainer = document.getElementById('kanban-cards-container');
const fileTreeContainer = document.getElementById('file-tree-container');
const codeBlock = document.getElementById('code-block');
const currentFileLabel = document.getElementById('current-file-label');
const terminalLogsContainer = document.getElementById('terminal-logs-container');
const currentFolderLabel = document.getElementById('current-folder-label');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercent = document.getElementById('progress-percent');
const statusAgy = document.getElementById('status-agy');
const statusCodex = document.getElementById('status-codex');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnClearLogs = document.getElementById('btn-clear-logs');

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    promptInput.value = btn.getAttribute('data-preset');
    promptInput.focus();
  });
});

// Tabs logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-tab');
    document.getElementById(targetId).classList.remove('hidden');
  });
});

// SSE Connection
function connectSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('init', (e) => {
    const data = JSON.parse(e.data);
    if (data.session) updateSession(data.session);
    if (data.history && data.history.length > 0) {
      data.history.forEach(m => addMessageToUI(m));
    }
    if (data.tasks) {
      tasks = data.tasks;
      renderKanban();
    }
    if (data.fileTree) {
      files = data.fileTree;
      renderFileTree(files);
    }
  });

  evtSource.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    addMessageToUI(msg);
  });

  evtSource.addEventListener('status_change', (e) => {
    const session = JSON.parse(e.data);
    updateSession(session);
  });

  evtSource.addEventListener('tasks_init', (e) => {
    tasks = JSON.parse(e.data);
    renderKanban();
  });

  evtSource.addEventListener('task_update', (e) => {
    const updated = JSON.parse(e.data);
    const idx = tasks.findIndex(t => t.id === updated.id);
    if (idx !== -1) {
      tasks[idx] = updated;
    } else {
      tasks.push(updated);
    }
    renderKanban();
  });

  evtSource.addEventListener('files_changed', (e) => {
    files = JSON.parse(e.data);
    renderFileTree(files);
  });

  evtSource.addEventListener('log', (e) => {
    const log = JSON.parse(e.data);
    appendLog(log);
  });

  evtSource.onerror = (err) => {
    console.warn('SSE reconnecting...', err);
  };
}

// Update Session & UI State
function updateSession(session) {
  currentSession = session;
  if (!session) return;

  currentFolderLabel.textContent = session.projectName || '준비 완료';
  progressBarFill.style.width = `${session.progress || 0}%`;
  progressPercent.textContent = `${session.progress || 0}%`;

  // Update step indicators
  const phaseOrder = ['planning', 'debating', 'coding', 'reviewing', 'completed'];
  const curIdx = phaseOrder.indexOf(session.status);

  document.querySelectorAll('#phase-steps .step-item').forEach((el) => {
    const phase = el.getAttribute('data-phase');
    const idx = phaseOrder.indexOf(phase);
    el.classList.remove('active', 'completed');
    if (idx < curIdx) {
      el.classList.add('completed');
    } else if (idx === curIdx) {
      el.classList.add('active');
    }
  });

  // Agents status pills
  if (session.status === 'planning') {
    statusAgy.textContent = '아키텍처 설계 중...';
    statusCodex.textContent = '대기 중';
    showTyping('Antigravity (Google) 가 아키텍처 초안을 설계 중입니다...');
  } else if (session.status === 'debating') {
    statusAgy.textContent = 'Codex 피드백 대기';
    statusCodex.textContent = '아키텍처 비평 & 합의 중...';
    showTyping('Codex (OpenAI) 가 설계안을 비평하고 엣지케이스를 검증 중입니다...');
  } else if (session.status === 'coding') {
    statusAgy.textContent = '핵심 인프라 코딩 중...';
    statusCodex.textContent = '대기 중';
    showTyping('Antigravity가 핵심 프로젝트 모듈을 생성 및 구현 중입니다...');
  } else if (session.status === 'reviewing') {
    statusAgy.textContent = '상호 검증 대기';
    statusCodex.textContent = '코드 교차 리뷰 & 보완 중...';
    showTyping('Codex가 코드를 교차 검증하고 단위 테스트 및 보완 로직을 작성 중입니다...');
  } else if (session.status === 'completed') {
    statusAgy.textContent = '완료 (Idle)';
    statusCodex.textContent = '완료 (Idle)';
    hideTyping();
    btnStart.classList.remove('hidden');
    btnAbort.classList.add('hidden');
  } else if (session.status === 'aborted' || session.status === 'error') {
    statusAgy.textContent = '중단됨';
    statusCodex.textContent = '중단됨';
    hideTyping();
    btnStart.classList.remove('hidden');
    btnAbort.classList.add('hidden');
  }
}

function showTyping(label) {
  typingLabel.textContent = label;
  typingIndicator.classList.remove('hidden');
}

function hideTyping() {
  typingIndicator.classList.add('hidden');
}

// Add message to chat feed
function addMessageToUI(msg) {
  if (emptyState) {
    emptyState.classList.add('hidden');
  }

  messages.push(msg);
  messageCount.textContent = `${messages.length} 건`;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex flex-col gap-1 transition-all duration-300';

  let agentBadge = '';
  let borderClass = '';
  let bgClass = '';
  let avatarIcon = '🤖';

  if (msg.agent === 'antigravity') {
    agentBadge = `<span class="px-2 py-0.5 rounded-md bg-blue-900/60 text-blue-300 border border-blue-700/60 font-semibold text-[11px]">⚡ Antigravity (Google)</span>`;
    borderClass = 'border-blue-800/60 shadow-lg shadow-blue-950/20';
    bgClass = 'bg-[#0f172a]';
    avatarIcon = '🔷';
  } else if (msg.agent === 'codex') {
    agentBadge = `<span class="px-2 py-0.5 rounded-md bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 font-semibold text-[11px]">🟩 Codex (OpenAI)</span>`;
    borderClass = 'border-emerald-800/60 shadow-lg shadow-emerald-950/20';
    bgClass = 'bg-[#091f1a]';
    avatarIcon = '🟢';
  } else {
    agentBadge = `<span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold text-[11px]">⚙️ System Orchestrator</span>`;
    borderClass = 'border-slate-800';
    bgClass = 'bg-[#0b101c]';
    avatarIcon = '⚡';
  }

  const parsedMarkdown = marked.parse(msg.text || '');

  msgDiv.innerHTML = `
    <div class="border ${borderClass} ${bgClass} rounded-2xl p-4">
      <div class="flex items-center justify-between border-b border-slate-800/70 pb-2 mb-2">
        <div class="flex items-center gap-2">
          <span>${avatarIcon}</span>
          ${agentBadge}
          <span class="text-xs text-slate-400 font-medium">${msg.role || ''}</span>
        </div>
        <span class="text-[11px] text-slate-500 font-mono">${msg.time || ''}</span>
      </div>
      <div class="chat-markdown text-slate-200">
        ${parsedMarkdown}
      </div>
    </div>
  `;

  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Apply code highlighting inside this message
  msgDiv.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
}

// Render Kanban Board
function renderKanban() {
  taskCount.textContent = tasks.length;
  if (!tasks || tasks.length === 0) {
    kanbanCardsContainer.innerHTML = `
      <div class="col-span-2 text-center py-12 text-slate-500 text-xs">
        스프린트가 시작되면 기획 토론 후 자동으로 업무가 분담됩니다.
      </div>
    `;
    return;
  }

  const statusMap = {
    pending: { label: '대기 중', color: 'bg-slate-800 text-slate-400 border-slate-700' },
    in_progress: { label: '작업 중', color: 'bg-blue-900/60 text-blue-300 border-blue-700 animate-pulse' },
    review: { label: '교차 리뷰', color: 'bg-amber-900/60 text-amber-300 border-amber-700' },
    done: { label: '완료됨', color: 'bg-emerald-900/60 text-emerald-300 border-emerald-700' }
  };

  kanbanCardsContainer.innerHTML = tasks.map(task => {
    const isAgy = task.assignedTo === 'antigravity';
    const agentPill = isAgy 
      ? `<span class="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-400 border border-blue-800 font-semibold">⚡ Antigravity</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">🟩 Codex</span>`;

    const statusBadge = statusMap[task.status] || statusMap.pending;

    const filesBadges = (task.files || []).map(f => 
      `<span class="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-[10px] border border-slate-800">📄 ${f}</span>`
    ).join(' ');

    return `
      <div class="kanban-card status-${task.status}">
        <div class="flex items-center justify-between mb-2">
          ${agentPill}
          <span class="px-2 py-0.5 rounded text-[10px] border ${statusBadge.color} font-medium">
            ${statusBadge.label}
          </span>
        </div>
        <h4 class="font-semibold text-xs text-slate-100 mb-1">${task.title}</h4>
        <p class="text-[11px] text-slate-400 leading-normal mb-2">${task.description || ''}</p>
        <div class="flex flex-wrap gap-1 mt-auto">
          ${filesBadges}
        </div>
      </div>
    `;
  }).join('');
}

// Render File Tree
function renderFileTree(tree, depth = 0) {
  let count = 0;
  function countFiles(items) {
    items.forEach(i => {
      if (i.type === 'file') count++;
      if (i.children) countFiles(i.children);
    });
  }
  countFiles(tree);
  fileCount.textContent = count;

  if (tree.length === 0) {
    fileTreeContainer.innerHTML = '<div class="text-slate-500 p-2">생성된 파일 없음</div>';
    return;
  }

  function renderNodes(items, indent = 0) {
    return items.map(item => {
      const paddingLeft = `${indent * 12 + 6}px`;
      if (item.type === 'directory') {
        return `
          <div>
            <div class="file-item font-semibold text-slate-300" style="padding-left: ${paddingLeft}">
              📁 ${item.name}
            </div>
            ${item.children ? renderNodes(item.children, indent + 1) : ''}
          </div>
        `;
      } else {
        const isSelected = selectedFile === item.path;
        return `
          <div class="file-item ${isSelected ? 'selected' : ''}" style="padding-left: ${paddingLeft}" onclick="loadFile('${item.path}')">
            📄 ${item.name}
          </div>
        `;
      }
    }).join('');
  }

  fileTreeContainer.innerHTML = renderNodes(tree);

  // Auto-open first file if none selected
  if (!selectedFile && tree.length > 0) {
    const firstFile = findFirstFile(tree);
    if (firstFile) loadFile(firstFile.path);
  }
}

function findFirstFile(items) {
  for (const item of items) {
    if (item.type === 'file') return item;
    if (item.children) {
      const found = findFirstFile(item.children);
      if (found) return found;
    }
  }
  return null;
}

// Load file content
window.loadFile = async function(relativePath) {
  selectedFile = relativePath;
  currentFileLabel.textContent = relativePath;
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('selected', el.textContent.includes(relativePath.split('/').pop()));
  });

  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(relativePath)}`);
    const data = await res.json();
    if (data.content !== undefined) {
      codeBlock.textContent = data.content;
      hljs.highlightElement(codeBlock);
    } else {
      codeBlock.textContent = `// 에러: ${data.error || '파일을 불러올 수 없습니다.'}`;
    }
  } catch (err) {
    codeBlock.textContent = `// 네트워크 오류: ${err.message}`;
  }
};

// Copy code button
btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(codeBlock.textContent);
  const oldText = btnCopyCode.textContent;
  btnCopyCode.textContent = '복사 완료!';
  setTimeout(() => btnCopyCode.textContent = oldText, 1500);
});

// Append log to terminal
function appendLog(log) {
  const line = document.createElement('div');
  let color = 'text-slate-400';
  let prefix = '[LOG]';
  if (log.agent === 'antigravity') {
    color = 'text-blue-400';
    prefix = '[Antigravity]';
  } else if (log.agent === 'codex') {
    color = 'text-emerald-400';
    prefix = '[Codex]';
  } else if (log.type === 'error') {
    color = 'text-red-400';
    prefix = '[ERROR]';
  } else if (log.type === 'step') {
    color = 'text-amber-300 font-bold';
    prefix = '[STEP]';
  }

  const text = log.text || log.message || '';
  line.className = `leading-relaxed break-all ${color}`;
  line.textContent = `${log.time || ''} ${prefix} ${text}`;
  terminalLogsContainer.appendChild(line);
  terminalLogsContainer.scrollTop = terminalLogsContainer.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  terminalLogsContainer.innerHTML = '<div class="text-slate-600">// 터미널 로그 초기화됨</div>';
});

// START SPRINT
btnStart.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    alert('프로젝트 요청 내용을 입력해주세요.');
    promptInput.focus();
    return;
  }

  btnStart.classList.add('hidden');
  btnAbort.classList.remove('hidden');

  // Clear previous chat & logs if starting fresh
  messagesContainer.innerHTML = '';
  terminalLogsContainer.innerHTML = '';
  messages = [];

  try {
    const res = await fetch('/api/sprint/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        projectName: 'duo_' + Date.now().toString().slice(-4),
        mode: sprintMode.value,
        runMode: runMode.value
      })
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.error || '시작 중 오류가 발생했습니다.');
      btnStart.classList.remove('hidden');
      btnAbort.classList.add('hidden');
    }
  } catch (err) {
    alert('서버 통신 실패: ' + err.message);
    btnStart.classList.remove('hidden');
    btnAbort.classList.add('hidden');
  }
});

// ABORT SPRINT
btnAbort.addEventListener('click', async () => {
  try {
    await fetch('/api/sprint/abort', { method: 'POST' });
    btnStart.classList.remove('hidden');
    btnAbort.classList.add('hidden');
  } catch (err) {
    console.error(err);
  }
});

// Start SSE connection on load
connectSSE();
