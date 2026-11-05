# 코딩책상 클라이언트 v2

새 디자인을 적용한 Next.js 16, React 19 정적 앱입니다. 서버는 [prototype-server](https://github.com/SWUNION-12/prototype-server)이고, 폴더 구조는 이전 [client](https://github.com/SWUNION-12/client)를 따릅니다.

## 실행

```bash
corepack enable   # pnpm이 없을 때 한 번
pnpm install
pnpm dev:mock     # Spring 없이 목업으로 화면 보기
```

- 학생 입장: http://localhost:3000/join (목업 수업 코드 `NYW7D6`)
- 선생님 화면: http://localhost:3000/instructor (목업 계정 `instructor` / `instructor`)

실제 서버에 연결하려면 Spring을 8080에 띄우고 다음을 실행합니다. `/api`, `/l` 요청은 `API_TARGET`(기본 `http://localhost:8080`)으로 넘어갑니다.

```bash
pnpm dev
```

## 검사와 빌드

```bash
pnpm typecheck
pnpm lint
pnpm build        # 정적 파일이 out/에 만들어진다
```

## 화면

| 경로 | 화면 |
| --- | --- |
| `/join` | 학생 입장. `?code=`로 수업 코드를 미리 채울 수 있음 |
| `/lab` | 학생 실습(IDE), 내 PC로 이어가기 패널. 세션은 쿠키로 확인 |
| `/instructor/login` | 선생님 로그인 |
| `/instructor` | 내 수업. `?tab=ended`, `?q=` 지원 |
| `/instructor/new` | 수업 만들기 3단계 |
| `/instructor/course?id=` | 수업 상세. `&tab=settings`면 수업 설정 |

도움 요청과 강사 호출은 IDE 안의 `실습 도우미` 확장(서버 레포)에서 처리합니다.

## 목업

`mock/server.mjs`는 서버 컨트롤러와 같은 모양으로 응답합니다. `MOCK_EMPTY=1 pnpm dev:mock`은 수업 없는 화면으로 시작하고, `requests==9.9`처럼 없는 버전으로 수업을 만들면 실패 화면을 볼 수 있습니다.
