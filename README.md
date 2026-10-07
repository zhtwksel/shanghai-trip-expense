# 상하이 출장 경비관리 · Phase 1

React / Vite / TypeScript로 만든 모바일 우선 앱입니다. Phase 2에서는 Google Sheets를 공용 원본으로 사용합니다. 실제 지급액·배분액과 출장기간은 공유 설정에서 입력합니다. 기존 로컬 테스트 데이터를 자동으로 이전하지 않습니다.

## 바로 실행

압축을 **기존 프로젝트와 관련 없는 신규 폴더**에 풉니다. Windows에서 `start.cmd`를 실행하고 브라우저에서 http://127.0.0.1:5173/ 를 엽니다. 포함된 `dist` 빌드를 실행하므로 패키지 설치가 필요 없습니다. Node.js 22.12 이상이 필요합니다. 이 PC의 Codex Node 런타임도 자동으로 찾습니다. 종료는 터미널에서 Ctrl+C입니다. 같은 포트의 서버를 중복 실행하지 마세요.

## 개발

```sh
npm install
npm run dev
npm test
npm run build
```

잠금파일은 `pnpm-lock.yaml`입니다. pnpm 사용 시 esbuild 빌드 스크립트를 허용하고 설치합니다. 저장소 초기화, remote 등록, commit, push와 외부 배포는 수행하지 않았습니다.

## 공유 저장 연결

`.env.example`을 참고하여 `.env.local`에 `VITE_GOOGLE_SCRIPT_URL=<배포된 /exec URL>`을 설정한 후 개발 서버를 재시작하거나 빌드합니다. `.env.local`은 Git 제외 대상입니다. 코드에서 URL을 여러 곳에 하드코딩하지 않습니다. 제공된 빌드는 현재 사용자가 배포한 전용 Apps Script와 연결되어 있습니다.

앱 시작 시 Google에서 최신 데이터를 조회합니다. URL 미설정·조회 실패 시 오류와 재시도 버튼을 표시하고 로컬 데이터를 공유 데이터처럼 표시하지 않습니다. 상단 ↻ 버튼으로 최신 데이터를 조회합니다. polling은 하지 않습니다. 저장 완료 응답을 확인하고 다시 조회한 뒤 화면을 갱신합니다.

저장 중에는 중복 요청을 차단합니다. 네트워크 실패 시 입력을 유지하고, 결과가 불확실하면 입력을 잠가 동일 요청 ID로 재시도합니다. 결과 확인 전 새 거래로 재작성하지 않습니다. 요청은 메모리에 보관하므로 화면을 닫거나 새로 고침하면 입력창은 초기화됩니다. 그 경우 Google 최신 기록에서 이미 반영되었는지 먼저 확인하세요. 저장은 확인됐으나 후속 조회만 실패한 경우 이를 별도로 안내합니다.

LocalStorage는 `shanghai-trip-expense:shared-cache:v1`에 마지막 성공 조회를 캐시할 뿐, 공유 원본이나 자동 업로드 소스로 사용하지 않습니다. 예전 `shanghai-trip-expense:v1` 데이터는 그대로 두며 공유 UI에서는 읽지 않습니다. JSON 백업은 현재 조회된 공유 데이터이며 복원은 팀 전체에 반영되는 원천 데이터 교체입니다. 확인 창과 최신 revision 검사로 보호합니다.

## 사용 흐름

1. 설정에서 출장명·기간, 6명의 최초 지급액과 실제 배분액을 저장합니다.
2. 자금현황에서 출발 전 공통지출을 등록합니다. 결제자는 지급 사실의 기록이며 실제 개인 배분잔액에서 다시 차감하지 않습니다.
3. 홈에서 출장 중 공통지출을 등록합니다. 결제자의 개인잔액이 자동 차감됩니다.
4. 개인잔액에서 미배분 공통 보유금을 개인에게 추가 지급합니다. 총액은 변하지 않습니다.
5. 자금현황의 전체 정산표를 확인하고 인쇄/PDF 저장할 수 있습니다.
6. 설정에서 JSON 백업·복원이 가능합니다. 복원은 기존 데이터를 교체하므로 확인 창을 제공합니다.

## 회계 기준

- 모든 집계는 원 단위 정수입니다. CNY는 소수 2자리, 환율은 소수 4자리까지 허용하고 BigInt로 계산한 뒤 1원 단위 반올림합니다.
- 지출에는 원 금액, 통화, 당시 환율, KRW 환산금액을 함께 저장합니다. 설정 환율 변경은 과거 지출에 영향을 주지 않습니다.
- 전체 현재 보유액 = 개인잔액 합계 + 현재 미배분 공통 보유금.
- 공통 보유금 = 최초 지급 합계 − 출발 전 지출 − 실제 배분 합계 − 추가 지급 합계.
- 개인잔액 = 실제 배분액 + 추가 지급액 − 출장 중 본인 공통지출 + 직접 잔액 조정.
- 검증 기준 = 최초 지급 합계 − 출발 전 지출 − 출장 중 지출. 직접 수정으로 차이가 발생하면 `⚠ 정산 불일치`와 `실제 총액 − 검증 기준` 차이를 표시합니다.
- 추가 지급은 공통 보유금 범위에서만 가능합니다. 설정 또는 지출로 잔액이 음수가 된 경우 해당 금액과 경고를 보여주므로 실제 값을 숨기지 않습니다.
- 직접 잔액 수정은 사유가 필수이며 델타 조정 기록을 남깁니다. 나중에 원천 거래를 수정하면 그 거래도 재계산됩니다.
- Excel 내보내기는 후속 Phase이며 `State`와 `calculate` 결과를 활용해 추가할 수 있습니다.

## 구조

```text
src/domain/accounting.ts  데이터 모델, 검증 및 순수 회계 계산
src/data/repository.ts    TripRepository 인터페이스와 localStorage 구현
src/main.tsx              4개 메뉴, 입력창 및 정산 화면
src/style.css            모바일 및 인쇄 스타일
tests/accounting.test.ts 핵심 계산 12개 테스트
dist/                    바로 실행 가능한 프로덕션 빌드
serve.mjs / start.cmd     로컬 전용 실행
```

UI는 기존 회계 명령으로 새 상태를 만들고 Apps Script 저장 성공 후에만 화면에 반영합니다. `src/data/tripService.ts`는 저장 직렬화, 응답 유실 재시도 및 재조회를 처리하고 `useTripData.ts`는 로딩·저장 상태를 UI에 전달합니다. Apps Script는 ScriptLock과 원천 기록별 충돌 검사로 독립 지출을 병합하고, 자금 설정·추가 지급·잔액 조정·전체 복원은 revision도 검사합니다. 충돌 시 최신 값을 확인한 뒤 다시 저장하세요.

Google Sheet 자체는 공개하지 않습니다. 앱과 Apps Script에는 사용자 로그인이 없으므로 웹앱 URL을 아는 사람이 조회·수정할 수 있는 방식입니다. Google 비밀번호·OAuth 토큰은 앱에 저장하지 않습니다. 중국 현지에서 사용할 네트워크로 Google 주소 접근성을 확인해야 합니다.

## GitHub Pages 배포

전용 Repository `shanghai-trip-expense`의 `main` push 또는 수동 workflow 실행으로 테스트 → 타입 검사 → 빌드 → Pages 배포를 진행합니다. `.github/workflows/pages.yml`은 pnpm 10.17.1과 기존 lock file을 사용합니다. GitHub Settings → Secrets and variables → Actions → Variables에서 `VITE_GOOGLE_SCRIPT_URL`을 설정하고 Settings → Pages의 Source를 GitHub Actions로 선택합니다.

Pages CI는 Repository 이름에서 `VITE_BASE_PATH`를 구성합니다. `vite.config.ts`가 이를 받아 하위 경로 자산 URL을 생성하며, 일반 로컬 개발과 빌드는 `/`를 유지합니다. 로컬 검증 예: `VITE_BASE_PATH=/shanghai-trip-expense/ pnpm build --outDir dist-pages` (셸에 맞는 환경변수 설정 필요).

환경변수 원본, 실제 Spreadsheet ID, 실제 출장/백업 데이터, node_modules, 빌드 산출물은 commit하지 않습니다. Apps Script URL은 Repository 변수에서 CI 빌드에 주입되며 클라이언트 번들에서는 조회 가능한 값입니다. 소스의 테스트 금액은 실제 출장 데이터가 아닌 자동 테스트용 합성 값입니다. 기존 프로젝트의 Git history나 remote는 재사용하지 않습니다.
