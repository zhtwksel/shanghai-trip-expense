# Phase 2 Google Sheets 공유 저장

Apps Script API와 React 비동기 저장 서비스가 연결되었습니다. `VITE_GOOGLE_SCRIPT_URL`을 `.env.local`에 지정하고 개발 서버 재시작 또는 빌드를 하면 공유 모드로 사용합니다. UI는 더 이상 기존 로컬 데이터를 공유 원본으로 읽지 않습니다. 아래 Google 설정 절차는 새 전용 저장소를 설정하거나 재배포할 때 참고하세요.

## 사용자가 Google에서 직접 할 작업

1. Google Drive에서 **새** Spreadsheet를 생성하고 이름을 `상하이 출장 경비 DB`로 지정합니다. 기존 업무용 Sheet는 사용하지 않습니다. Spreadsheet는 공개 게시하지 말고 소유자만 접근하게 둡니다.
2. Spreadsheet URL `https://docs.google.com/spreadsheets/d/여기가_ID/edit`에서 ID를 복사합니다.
3. Spreadsheet에서 **확장 프로그램 → Apps Script**를 엽니다.
4. 프로젝트 이름을 `shanghai-trip-expense`로 정하고 `Code.gs`의 기본 내용을 제공된 Code.gs로 교체합니다.
5. 코드 맨 위 `SPREADSHEET_ID` 한 곳에 새 Spreadsheet ID를 입력합니다. 비밀번호나 OAuth 토큰은 입력하지 않습니다.
6. 저장하고 함수 목록에서 `initializeSpreadsheet`를 선택하여 실행합니다. 최초 Google 권한 요청에서 본인이 만든 코드와 대상 Spreadsheet를 확인한 후 직접 승인합니다. 화면이 안내와 다르면 그 화면의 문구를 알려주세요. 보안 경고를 임의로 우회하지 마세요.
7. Spreadsheet에 `tripRecords` 탭과 `key`, `json` 헤더가 생겼는지 확인합니다. 다시 실행해도 기존 기록을 삭제하지 않습니다.
8. Apps Script에서 **배포 → 새 배포 → 유형: 웹 앱**을 선택합니다.
9. **실행 사용자: 나**, **액세스 권한: 모든 사용자(Anyone)**를 선택하고 직접 배포합니다. Google 로그인이 필요한 `Google 계정이 있는 모든 사용자`와 구별하세요. 조직 계정 정책으로 이 선택지가 없으면 중단하고 알려주세요.
10. 생성된 **`/exec`로 끝나는 웹 앱 URL**을 복사하여 Codex에 전달합니다. `/dev` URL은 편집자용 테스트 주소라 사용할 수 없습니다.
11. 시크릿 창에서 `<웹앱 URL>?action=getAll`을 열어 Google 로그인 없이 `ok:true`, `revision`, `state`가 포함된 JSON이 나오는지 확인합니다. 권한 변경이나 코드 수정 후에는 새 버전으로 배포를 갱신해야 합니다.

배포 설정 근거: https://developers.google.com/apps-script/guides/web
ContentService의 응답 리디렉션: https://developers.google.com/apps-script/guides/content
LockService: https://developers.google.com/apps-script/reference/lock/lock-service

## 받을 값

- Web App `/exec` URL (필수).
- Spreadsheet ID 또는 Spreadsheet URL (전용 대상 확인용).
- 시크릿 창에서 getAll의 `ok:true` 확인 여부.

이 값은 로그인 비밀번호가 아닙니다. 비밀번호·권한 승인 토큰은 보내지 마세요. 로그인이 없는 웹앱이므로 URL을 아는 사람은 읽기·쓰기를 할 수 있습니다. 출장팀에게만 전달하는 운영 방식입니다.

## 저장 구조

단일 `tripRecords` 탭의 행마다 `key`, `json` 두 열을 사용합니다. Phase 1 State를 보존하는 가장 단순한 구조이며 새로운 회계 개념을 추가하지 않습니다.

| key | JSON 원천 데이터 |
| --- | --- |
| settings | version, trip, rate, threshold |
| member/이름 | initial, allocated |
| expenses/UUID | 출발 전 또는 출장 중 Expense 전체(phase, 원 금액·통화·환율·KRW 포함) |
| transfers/UUID | 추가 지급 원천 기록 |
| adjustments/UUID | 기존 직접 잔액 조정 기록 |
| _meta | revision |
| _request/UUID | 성공한 요청 본문(중복 재시도 검출) |

최종잔액은 저장하지 않습니다. 조회 결과를 기존 `validateState`와 `calculate`로 검증·계산합니다. 서버는 원천 기록의 형식·정수 여부와 충돌만 검사하며 별도 환산·잔액 계산을 하지 않습니다. 초기화는 전용 탭을 새로 만들거나 정상 기존 탭을 그대로 유지하며 다른 탭은 건드리지 않습니다.

## API와 동시성

- GET `?action=getAll` → `{ok:true, revision, state}`.
- POST `Content-Type: text/plain;charset=utf-8`, 본문 `{action:'mutate',requestId,revision,requireRevision,changes:[{key,before,after}]}` → 같은 응답 형식. 삭제는 after:null.
- 실패는 `{ok:false,code,message}`. HTTP 200만으로 성공 판단하지 않습니다.
- 모든 읽기·쓰기는 동일 ScriptLock을 사용합니다. 현재 기록과 before가 일치하는지 확인한 후 최신 데이터에 변경 행만 반영합니다. 독립 지출 2건은 같은 오래된 화면에서 입력해도 두 건 모두 보존합니다.
- 같은 거래 수정·삭제는 충돌을 알립니다. 설정·배분·추가 지급·잔액 조정은 전체 revision도 검사합니다. 충돌 시 최신 조회 후 기존 domain 명령으로 재검토해야 하며 덮어쓰지 않습니다.
- JSON 전체 복원은 `requireRevision:true`로 반드시 최신 revision을 확인합니다. 사용자에게 전체 교체 확인을 받고 새로운 기준에서 만든 변경만 전송합니다.
- 요청 ID와 정확히 동일한 본문으로 재시도하면 중복 기록하지 않습니다. 응답 유실 시 입력창과 원래 요청을 유지합니다. 재시도 도중 입력이 바뀌었다면 이전 요청의 반영 여부를 조회해 확인한 후 새 요청 ID를 생성해야 합니다.
- State와 요청 중복방지 기록은 잠금 안에서 한 번의 setValues로 저장합니다. 이 단기 앱용 구조이며 Sheets는 DB 트랜잭션 시스템이 아닙니다. 실제 Google 장애·쿼터와 응답 유실은 연결 후 검증합니다.
- 단일 변경/요청 크기에 상한을 둡니다. 긴 전체 JSON 복원은 자동 분할하지 않고 거부합니다. 3박4일 소규모 용도 기준이며 큰 복원 데이터는 별도 처리해야 합니다.

## React 공유 저장 연결

`createSharedRepository()`가 환경변수 한 곳에서 URL을 읽습니다. `TripService`와 `useTripData`를 통해 UI가 비동기 저장됩니다. 기존 LocalStorage를 Google에 자동 업로드하지 않습니다.

공유 모드에서는 시작·수동 새로 조회·저장 응답 이후 재조회로 최신 상태를 반영합니다. 불필요한 polling은 하지 않습니다. Sheet가 원본이고 로컬 저장은 별도 키로 마지막 성공 조회 캐시만 저장합니다. 조회 실패 시 데이터 화면을 숨기고 다시 시도를 제공합니다. 저장 중 버튼 중복 입력을 차단하고 저장 실패 시 입력창을 유지합니다. 백업은 현재 조회된 공유 스냅샷을 다운로드합니다.

브라우저 직접 호출은 text/plain POST와 리디렉션을 따라가는 fetch로 준비했습니다. `no-cors`의 불투명 응답을 저장 성공으로 취급하지 않습니다. 실제 배포 URL에서 CORS와 익명 접근을 확인한 뒤 활성화합니다. 서버 측 호출 성공만으로 모바일 브라우저 연결 성공을 선언하지 않습니다.

중국 현지에서 Google 주소에 접근할 수 있는지도 출장 전 사용할 네트워크로 검증해야 합니다. 로그인 없는 설정만으로 현지 네트워크 접근성을 보장하지 않습니다.

Google 저장소 생성·권한 승인·웹앱 배포는 사용자가 직접 수행했습니다. 실제 연결 검증 결과는 별도의 Phase 2 검증 보고서를 참고하세요. GitHub 관련 작업은 하지 않습니다.
