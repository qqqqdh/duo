# DuoDev Studio

`agy`와 `codex exec`을 순서대로 실행하고 진행 상황을 브라우저에 보여주는 로컬 개발 도구입니다. 한 번에 하나의 스프린트를 실행하며, 프로젝트마다 저장소의 `projects/` 아래에 새 작업 폴더를 만듭니다.

## 시작

Node.js와 npm을 설치한 뒤 저장소에서 실행하세요.

```bash
npm ci
npm start
```

브라우저에서 [http://127.0.0.1:3300](http://127.0.0.1:3300)을 엽니다. 서버는 기본적으로 로컬 주소에만 바인딩됩니다. 포트를 바꾸려면 `PORT` 환경 변수를 설정하세요. 서버에 사용자 인증은 없으므로 외부에 공개하지 마세요.

실제 에이전트를 실행하려면 `agy`와 `codex` 명령이 PATH에 있어야 합니다. 실행 파일이 다른 위치에 있으면 `AGY_BIN`, `CODEX_BIN` 환경 변수로 지정할 수 있습니다. CLI가 없다면 화면에서 **빠른 시뮬레이션 데모**를 선택하세요.

```bash
npm test
```

이 명령은 스튜디오 자체의 파일 경로, 스프린트 상태, CLI 입출력, API 검사를 실행합니다.

## 실행 방식

| 선택 | 동작 |
| --- | --- |
| 전체 스프린트 | Antigravity 설계 → Codex 설계 검토 → Antigravity 구현 → Codex 코드 검토 및 보완 |
| 설계 배틀만 | 설계와 검토 결과를 대화 화면에 표시하고 구현 단계는 실행하지 않음 |
| 실시간 CLI 실행 | 실제 `agy` 및 `codex exec`을 호출하고 작업 폴더의 파일을 직접 변경 |
| 빠른 시뮬레이션 데모 | 예시 메시지와 작업 상태를 표시하고 예시 README만 생성. 실제 코드는 만들지 않음 |

태스크 보드는 Antigravity 응답의 JSON 작업 목록을 읽습니다. 목록을 읽지 못하면 기본 작업 목록을 사용합니다. 실제 CLI 모드의 **완료** 상태는 실행한 CLI 명령이 정상 종료했다는 뜻이며, 생성 프로젝트의 테스트나 품질을 스튜디오가 자동으로 검증했다는 뜻은 아닙니다.

실제 CLI 모드에서 Antigravity는 권한 확인을 생략하는 `--dangerously-skip-permissions` 옵션으로 실행됩니다. Codex는 `workspace-write` 샌드박스로 실행됩니다. 두 도구가 파일을 변경하므로 신뢰할 수 있는 요청을 입력하세요.

## 실행 오류 확인

`codex exec`은 비대화형 명령이며 이 앱은 자식 프로세스의 stdin을 닫습니다. 로그의 `Reading additional input from stdin...` 한 줄만으로 입력 대기나 타임아웃을 원인으로 판단할 수 없습니다. CLI가 실행 후 비정상 종료하면 오류 메시지에 종료 코드 또는 신호와 실행 시간이 표시됩니다. 실패한 스프린트의 자동 재시도는 없으며 새 실행은 사용자가 시작합니다.

## 구성

```text
server.js           Express API와 SSE 이벤트 스트림
lib/agentRunner.js  agy·Codex CLI 실행
lib/orchestrator.js  스프린트 단계와 상태 관리
lib/projectManager.js 프로젝트 폴더와 파일 조회
public/             브라우저 UI
projects/           생성된 프로젝트 (Git에서 제외)
test/               스튜디오 자체 테스트
run.sh              npm start 대신 사용할 수 있는 셸 실행 스크립트
```
