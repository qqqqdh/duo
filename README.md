# DuoDev Studio

Antigravity CLI와 `codex exec`을 순서대로 실행하고 진행 상황을 브라우저에 보여주는 로컬 개발 도구입니다. Antigravity CLI를 찾지 못하면 Gemini CLI를 대체 실행기로 사용합니다. 한 번에 하나의 스프린트를 실행하며, 프로젝트마다 저장소의 `projects/` 아래에 새 작업 폴더를 만듭니다.

## 시작

Node.js 22.13 이상과 npm을 설치한 뒤 **`package.json`과 `package-lock.json`이 있는 저장소 폴더**로 먼저 이동하세요. Windows 명령 프롬프트에서는 아래 경로를 실제로 저장소를 복제한 위치로 바꿔 입력합니다.

```bat
cd /d "C:\path\to\duo"
dir package.json package-lock.json
```

macOS/Linux에서는 `cd /path/to/duo`로 이동합니다. 두 파일이 보이면 다음 명령을 실행하세요.

```bash
npm ci
npm start
```

브라우저에서 [http://127.0.0.1:3300](http://127.0.0.1:3300)을 엽니다. 서버는 기본적으로 로컬 주소에만 바인딩됩니다. 포트를 바꾸려면 `PORT` 환경 변수를 설정하세요. 서버에 사용자 인증은 없으므로 외부에 공개하지 마세요.

실제 에이전트를 실행하려면 Antigravity CLI(`agy`)와 `codex`가 필요합니다. Windows에서는 PATH에 등록된 `agy.exe`와 `%LOCALAPPDATA%\agy\bin\agy.exe`를 자동으로 찾습니다. 다른 경로에 설치했다면 `AGY_BIN` 환경 변수로 지정하세요. `agy`가 없고 [Gemini CLI](https://github.com/google-gemini/gemini-cli)가 설치되어 있다면 Gemini CLI를 사용합니다. Codex는 PATH의 `codex.exe` 또는 npm 설치본을 자동으로 찾으며, 다른 경로는 `CODEX_BIN`으로 지정할 수 있습니다. CLI 설치나 환경 변수 변경 후에는 서버를 다시 시작하세요. CLI가 없다면 화면에서 **빠른 시뮬레이션 데모**를 선택하세요.

```bash
npm test
```

이 명령은 스튜디오 자체의 파일 경로, 스프린트 상태, CLI 입출력, API 검사를 실행합니다.

## 실행 방식

| 선택 | 동작 |
| --- | --- |
| 전체 스프린트 | Antigravity 설계 → Codex 설계 검토 → Antigravity 구현 → Codex 코드 검토 및 보완 |
| 설계 배틀만 | 설계와 검토 결과를 대화 화면에 표시하고 구현 단계는 실행하지 않음 |
| 실시간 CLI 실행 | 실제 `agy` 및 `codex exec`을 호출하고 작업 폴더의 파일을 직접 변경. `agy`가 없으면 `gemini` 사용 |
| 빠른 시뮬레이션 데모 | 예시 메시지와 작업 상태를 표시하고 예시 README만 생성. 실제 코드는 만들지 않음 |

### 참고 PDF 분석

실제 CLI 실행 모드에서 프롬프트 아래의 **참고 PDF**를 선택한 뒤 작업을 시작하세요. 최대 3개, 각 10MB, 전체 20MB, 문서당 100페이지까지 업로드할 수 있습니다. 추출된 텍스트는 PDF당 30만 자까지 지원합니다. 스튜디오는 PDF의 텍스트를 추출해 프로젝트의 `references/document-N.txt`에 저장하고 원본은 같은 이름의 `.pdf`로 보관합니다. Antigravity와 Codex 모두 텍스트 파일을 읽도록 작업 지시를 받습니다.

텍스트가 들어 있는 PDF만 지원합니다. 이미지 스캔 PDF와 비밀번호가 필요한 PDF는 읽을 수 없으며, 텍스트가 없거나 추출에 실패하면 스프린트가 오류로 종료됩니다. 시뮬레이션 모드에서는 PDF 분석을 실행하지 않습니다.

태스크 보드는 Antigravity 응답의 JSON 작업 목록을 읽습니다. 목록을 읽지 못하면 기본 작업 목록을 사용합니다. 실제 CLI 모드의 **완료** 상태는 실행한 CLI 명령이 정상 종료했다는 뜻이며, 생성 프로젝트의 테스트나 품질을 스튜디오가 자동으로 검증했다는 뜻은 아닙니다.

### 기존 프로젝트 이어서 수정

화면 위쪽의 **프로젝트** 목록에서 `projects/` 아래의 폴더를 고르고 **불러오기**를 누르세요. 파일과 저장된 협업 대화가 표시됩니다. 이전 버전에서 만든 폴더도 열 수 있지만 과거 대화 기록은 복구할 수 없습니다. 후속 요청을 입력하고 **수정 요청 실행**을 누르면 Antigravity가 기존 코드를 분석해 계획을 세우고, Codex가 검토한 뒤 두 에이전트가 **같은 폴더**에서 수정과 코드 리뷰를 진행합니다. 새 폴더를 만들지 않습니다.

협업 대화는 각 프로젝트의 `.duo-session.json`에 저장되어 서버를 다시 시작해도 불러올 수 있습니다. 현재 작업 요약은 피드 상단에 표시되며 **확대** 버튼으로 피드를 화면 전체에 띄울 수 있습니다. 기존 프로젝트의 참고 PDF는 `references/` 폴더에서 다시 읽습니다. 후속 수정에 새 PDF를 추가하려면 현재는 새 프로젝트로 시작해야 합니다.

실제 CLI 모드에서 Antigravity는 `--dangerously-skip-permissions`로 실행됩니다. 대체 실행기인 Gemini CLI는 `--skip-trust --approval-mode yolo`로 실행됩니다. Codex는 `workspace-write` 샌드박스로 실행됩니다. 두 도구가 파일을 변경하므로 신뢰할 수 있는 요청을 입력하세요.

## 실행 오류 확인

`codex exec`은 비대화형 명령이며 이 앱은 프롬프트를 stdin으로 전달한 뒤 즉시 닫습니다. 긴 설계안도 Windows 명령줄 길이 제한에 걸리지 않습니다. 로그의 `Reading additional input from stdin...` 한 줄만으로 입력 대기나 타임아웃을 원인으로 판단할 수 없습니다. CLI가 실행 후 비정상 종료하면 오류 메시지에 종료 코드 또는 신호와 실행 시간이 표시됩니다. 실패한 스프린트의 자동 재시도는 없으며 새 실행은 사용자가 시작합니다.

## 구성

```text
server.js           Express API와 SSE 이벤트 스트림
lib/agentRunner.js  Gemini/agy·Codex CLI 실행
lib/orchestrator.js  스프린트 단계와 상태 관리
lib/projectManager.js 프로젝트 폴더와 파일 조회
public/             브라우저 UI
projects/           생성된 프로젝트 (Git에서 제외)
test/               스튜디오 자체 테스트
run.sh              npm start 대신 사용할 수 있는 셸 실행 스크립트
```
