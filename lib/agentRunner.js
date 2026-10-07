const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function agyCommand(env = process.env) {
  if (env.AGY_BIN) return env.AGY_BIN;
  const name = process.platform === 'win32' ? 'agy.exe' : 'agy';
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const bin = path.join(dir, name);
    if (fs.existsSync(bin)) return bin;
  }
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    const bin = path.join(env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe');
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function geminiCommand(env = process.env) {
  if (process.platform === 'win32') {
    // npm's Windows shim is a .cmd file; spawn cannot execute it with shell: false.
    for (const dir of (env.PATH || '').split(path.delimiter)) {
      if (!dir) continue;
      const script = path.join(dir, 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
      if (fs.existsSync(script)) return { bin: process.execPath, prefix: [script] };
    }
  }
  return { bin: 'gemini', prefix: [] };
}

class AgentRunner {
  constructor() {
    this.agyBin = agyCommand();
    this.codexBin = process.env.CODEX_BIN || 'codex';
  }

  /**
   * Run Antigravity CLI non-interactively
   */
  async runAntigravity({ prompt, projectDir, onLog, isSimulation = false, signal }) {
    if (isSimulation) {
      return this._simulateAntigravity(prompt, onLog);
    }

    return new Promise((resolve, reject) => {
      const useAgy = Boolean(this.agyBin);
      const command = useAgy ? { bin: this.agyBin, prefix: [] } : geminiCommand();
      onLog && onLog({ type: 'start', agent: 'antigravity', message: `${useAgy ? 'Antigravity' : 'Gemini'} CLI 시작 중...` });
      const startedAt = Date.now();
      
      const args = [...command.prefix, '-p', prompt];
      if (useAgy) {
        args.push('--dangerously-skip-permissions', '--print-timeout', '180s');
      } else {
        args.push('--skip-trust', '--approval-mode', 'yolo');
      }
      if (useAgy && projectDir) {
        args.push('--add-dir', projectDir);
      }

      const proc = spawn(command.bin, args, {
        cwd: projectDir || process.cwd(),
        env: { ...process.env, PAGER: 'cat' },
        signal,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        onLog && onLog({ type: 'stdout', agent: 'antigravity', text: str });
      });

      proc.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        onLog && onLog({ type: 'stderr', agent: 'antigravity', text: str });
      });

      proc.on('close', (code, exitSignal) => {
        if (code === 0) {
          resolve({
            success: true,
            agent: 'antigravity',
            output: stdout.trim(),
            raw: stdout
          });
        } else {
          reject(new Error(`${useAgy ? 'Antigravity' : 'Gemini'} ${exitSignal ? `terminated by ${exitSignal}` : `exited with code ${code}`} after ${Math.round((Date.now() - startedAt) / 1000)}s: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(err.code === 'ENOENT'
          ? new Error(`${useAgy ? 'AGY_BIN 실행 파일' : 'Gemini CLI'}을 찾지 못했습니다. ${useAgy ? 'AGY_BIN 경로를 확인하세요.' : 'npm install -g @google/gemini-cli 후 서버를 다시 시작하세요.'}`)
          : err);
      });
    });
  }

  /**
   * Run Codex CLI non-interactively
   */
  async runCodex({ prompt, projectDir, onLog, isSimulation = false, signal }) {
    if (isSimulation) {
      return this._simulateCodex(prompt, onLog);
    }

    return new Promise((resolve, reject) => {
      onLog && onLog({ type: 'start', agent: 'codex', message: 'OpenAI Codex CLI 시작 중...' });
      const startedAt = Date.now();

      const args = [
        'exec',
        '--sandbox', 'workspace-write',
        '--skip-git-repo-check',
        '-C', projectDir || process.cwd(),
        prompt
      ];

      const proc = spawn(this.codexBin, args, {
        cwd: projectDir || process.cwd(),
        env: { ...process.env, PAGER: 'cat' },
        signal,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        onLog && onLog({ type: 'stdout', agent: 'codex', text: str });
      });

      proc.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        onLog && onLog({ type: 'stderr', agent: 'codex', text: str });
      });

      proc.on('close', (code, exitSignal) => {
        if (code === 0) {
          // Codex CLI outputs preamble headers, user prompt, and response. Let's extract the response portion cleanly.
          const cleanOutput = this._cleanCodexOutput(stdout);
          resolve({
            success: true,
            agent: 'codex',
            output: cleanOutput,
            raw: stdout
          });
        } else {
          reject(new Error(`Codex ${exitSignal ? `terminated by ${exitSignal}` : `exited with code ${code}`} after ${Math.round((Date.now() - startedAt) / 1000)}s: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  _cleanCodexOutput(raw) {
    if (!raw) return '';
    // Look for lines after "codex" marker in the CLI session dump
    const codexMarker = '\ncodex\n';
    const markerIndex = raw.lastIndexOf(codexMarker);
    if (markerIndex !== -1) {
      let content = raw.substring(markerIndex + codexMarker.length);
      // Remove trailing "tokens used ..."
      const tokenIndex = content.lastIndexOf('\ntokens used\n');
      if (tokenIndex !== -1) {
        content = content.substring(0, tokenIndex);
      }
      return content.trim();
    }
    return raw.trim();
  }

  // Fallback simulator for instant previews or testing
  async _simulateAntigravity(prompt, onLog) {
    const stream = [
      "요구사항을 분석하여 시스템 아키텍처와 태스크 분담 계획을 수립하고 있습니다...",
      "핵심 모듈 구조 정의 및 디렉터리 레이아웃 생성 준비 중.",
      "Codex와의 업무 분담 및 교차 검증 포인트 도출 완료."
    ];
    for (const msg of stream) {
      onLog && onLog({ type: 'stdout', agent: 'antigravity', text: msg + '\n' });
      await new Promise(r => setTimeout(r, 600));
    }
    return {
      success: true,
      agent: 'antigravity',
      output: `[Antigravity 제안]\n요구사항: "${prompt.slice(0, 100)}..."\n\n1. 전체 아키텍처: 모듈화된 엔드포인트 및 상태 관리 레이어 분리\n2. 태스크 1 (Antigravity): 프로젝트 기반 뼈대, 설정 파일 및 핵심 인터페이스 구현\n3. 태스크 2 (Codex): 세부 비즈니스 로직 최적화 및 엣지 케이스 검증용 테스트 슈트 구현`
    };
  }

  async _simulateCodex(prompt, onLog) {
    const stream = [
      "Antigravity의 설계안을 수신하여 엣지 케이스 및 보안/성능 결함을 교차 검증 중...",
      "경쟁 상태(Race Condition) 및 입력 유효성 검사 보완안 수립 중.",
      "태스크 분담 수락 및 상호 코드 리뷰 기준 합의."
    ];
    for (const msg of stream) {
      onLog && onLog({ type: 'stdout', agent: 'codex', text: msg + '\n' });
      await new Promise(r => setTimeout(r, 600));
    }
    return {
      success: true,
      agent: 'codex',
      output: `[Codex 피드백 & 보완]\nAntigravity의 설계안을 검토했습니다.\n\n- 개선점: 에러 핸들링 미들웨어와 입력값 validation 스키마가 더 명확해야 합니다.\n- 동의 사항: 태스크 분담안을 승인하며, 저는 비즈니스 로직 검증 및 단위 테스트 모듈을 맡겠습니다.\n- 최종 합의: 즉시 분담 작업을 진행합시다.`
    };
  }
}

module.exports = new AgentRunner();
module.exports.agyCommand = agyCommand;
module.exports.geminiCommand = geminiCommand;
