# ⚡ DuoDev Studio (Antigravity ✕ Codex)

**Antigravity (Google)**와 **OpenAI Codex**가 하나의 팀이 되어 실시간으로 토론하고, 업무를 분담하며, 상호 교차 코드 리뷰를 통해 소프트웨어를 개발하는 자율 협업 개발 플랫폼입니다.

---

## 🌟 핵심 기능

1. **실시간 기획 및 아키텍처 토론 (Architecture Debate)**
   - 사용자가 프롬프트를 입력하면, **Antigravity(수석 아키텍트)**가 초기 구조와 모듈 분담안을 제안합니다.
   - **Codex(크리티컬 리뷰어)**가 제안된 설계를 검토하고 잠재적 버그, 엣지 케이스, 보안 취약점을 지적하며 최적화된 합의안을 도출합니다.

2. **자동 업무 분담 & 칸반 보드 (Task Division & Kanban)**
   - 두 AI가 합의한 태스크가 자동으로 칸반 보드(To Do, In Progress, In Review, Done)에 등록됩니다.
   - 각 태스크는 담당 AI(Antigravity vs Codex)와 대상 파일이 명시됩니다.

3. **분담 구현 및 상호 교차 코드 리뷰 (Cross-Review Loop)**
   - 한 AI가 코드를 작성하면, 다른 AI가 즉시 피어 코드 리뷰(Peer Review)를 수행하고 보완 모듈 및 테스트 케이스를 추가합니다.

4. **실시간 파일 브라우저 & 코드 뷰어 (Live File Explorer)**
   - 생성된 프로젝트 디렉터리의 파일 트리와 소스 코드를 웹 UI에서 실시간으로 열람하고 복사할 수 있습니다.

5. **실시간 실행 터미널 스트림 (Live Terminal)**
   - `agy` 및 `codex exec` 프로세스의 표준 입출력(stdout/stderr) 로그를 실시간으로 모니터링할 수 있습니다.

---

## 🚀 빠른 시작

### 1. 웹 스튜디오 실행
이미 백그라운드 서버가 구동 중입니다. 브라우저에서 아래 주소로 접속하세요:
👉 **[http://localhost:3300](http://localhost:3300)**

수동으로 실행하려면 터미널에서 다음 명령어를 입력하세요:
```bash
cd /home/qqqqdh/dual-agent-studio
./run.sh
```

---

## 🛠️ 지원 모드

| 모드 | 설명 |
| :--- | :--- |
| **전체 스프린트 (Full Sprint)** | 기획 토론 ➔ 업무 분담 ➔ 모듈 코딩 ➔ 상호 교차 리뷰 ➔ 최종 완성 |
| **설계 배틀만 (Debate Only)** | 아키텍처 맞짱 토론 및 RFC 기술 명세서 도출 |
| **⚡ 실시간 CLI 실행** | 실제 시스템의 `agy` 및 `codex` CLI를 호출하여 자율 개발 수행 |
| **🚀 빠른 시뮬레이션 데모** | 15초 내에 전체 협업 파이프라인 인터랙션을 빠르게 시연 |

---

## 📁 디렉터리 구조

```
/home/qqqqdh/dual-agent-studio/
├── server.js              # Express + SSE 실시간 스트리밍 서버
├── run.sh                 # 원클릭 실행 스크립트
├── lib/
│   ├── orchestrator.js    # 멀티 에이전트 협업 오케스트레이터
│   ├── agentRunner.js     # agy 및 codex CLI 연동 프로세스 제어
│   └── projectManager.js  # 작업 공간 및 파일 트리 관리
├── public/                # 모던 다크 테마 Web UI
│   ├── index.html         # 대시보드 레이아웃
│   ├── style.css          # 커스텀 테마 & 스타일링
│   └── app.js             # 실시간 SSE 이벤트 핸들러 & 반응형 UI
└── projects/              # AI 팀이 생성한 프로젝트들이 저장되는 폴더
```
