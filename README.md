<p align="center"><img src="public/logo.svg" width="96" alt="지원냥"></p>

# 지원냥 (jiwon-meo)

[Define404]

소상공인 정부지원사업 알리미

지역, 업종, 업력, 관심 분야를 한 번만 넣어 두면 맞는 정부지원사업을 매주 월요일 오전 9시에 메일로 보내 드리는 소상공인용 알리미입니다.

- 공고는 기업마당(bizinfo.go.kr) 지원사업정보 공개 API에서 받습니다
- 7일 안에 마감되는 공고를 맨 위에 "마감 D-n"으로 올립니다
- 공고마다 "맞는 이유"를 한 줄로 붙입니다
- 세무사·컨설턴트는 고객 30곳의 조건을 한 계정에서 관리하고, 메일은 고객별로 묶어 한 통으로 받습니다
- Cloudflare 무료 계정 하나로 돌아갑니다 (Workers, D1, Cron, Workers AI)
- 오픈소스(MIT)

## 무엇을 하나

| 기능 | 내용 |
|---|---|
| 구독 | 조건과 메일 주소를 넣고, 확인 메일의 버튼을 눌러야 구독이 시작됩니다 (이중 확인) |
| 매칭 | 지역, 사업자 구분, 업력, 업종, 관심 분야, 접수 기간을 규칙으로 거릅니다. 확실히 안 맞는 공고만 빼고, 애매하면 넣고 이유를 적습니다 |
| 마감 강조 | 7일 이내 마감은 맨 위에, 접수 전이면 "접수 예정", 끝 날짜가 없으면 "상시 접수" |
| 한 줄 요약 | 기본은 사업 개요 첫 문장. `USE_AI_SUMMARY=1`이면 Workers AI로 한 줄을 만듭니다 (공고당 한 번, 저장해 두고 다시 씀) |
| 주간 발송 | Cron이 매주 월요일 09:00(한국 시간)에 구독자별 메일을 만들어 Resend로 보냅니다. 맞는 공고가 없는 주에는 보내지 않습니다 |
| 조건 바꾸기 | 메일마다 서명된 링크가 붙습니다. 링크를 잃어버리면 첫 화면 아래에서 다시 받습니다 |
| 수신 거부 | 메일마다 링크가 있고, 메일 앱의 "구독 취소" 버튼(한 번 누르기, RFC 8058)도 받습니다. 거부하면 메일 주소와 조건을 바로 지웁니다. 광고가 실린 메일에는 "광고 수신만 거부" 링크도 붙습니다 |
| 컨설턴트 | 고객 별칭별로 조건을 따로 두고, 메일은 고객별 묶음(묶음당 최대 10건) |
| 문의 버튼 | 광고성 정보 수신에 동의한 분의 메일에만, 한국 시간 08~21시에 보낼 때만 "신청서 작성 도움 문의" 안내가 들어갑니다 |

```
매주 월 09:00 KST (Cron)
  └─ 기업마당 API ─> 공고 정리 ─> (선택) Workers AI 한 줄 요약 ─> D1 저장
       └─ 구독자마다: 조건별 매칭 ─> 메일 만들기 ─> Resend 발송 ─> 발송 기록
첫 화면 (public/) ─ /api/subscribe ─> 확인 메일 ─> /confirm ─> 구독 시작
메일 속 링크 ─> /manage (조건 바꾸기) · /unsubscribe (수신 거부) · /adoff (광고 수신만 거부)
매일 03:00 KST (Cron) ─> 확인하지 않은 신청 정리 (메일은 보내지 않음)
```

## 기업마당 API 키 받기

1. 기업마당 API 안내 화면을 엽니다: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi
2. 같은 화면 아래 "API 사용 신청"에서 기관(기업)명, 신청자명, 메일 주소, 전화번호, 시스템명, 시스템 IP, 시스템 주소(URL)를 넣고 개인정보 수집에 동의합니다
3. 등록하면 인증키가 화면에 나오고 같은 내용이 메일로도 옵니다. 키 분실 문의는 02-867-9765 (기업마당 안내 화면 기준)
4. 키를 비밀값으로 넣습니다: `npx wrangler secret put BIZINFO_API_KEY`

키가 없으면 `worker/fixtures/programs.sample.json`의 예시 공고 16건으로 동작합니다. 예시 공고는 지어낸 것이며 제목 끝에 "(예시)"가 붙고, 메일에도 "예시 데이터"라고 적힙니다.

### API 요약 (2026-10-09 기업마당 안내 화면 기준)

- 주소: `GET https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do`
- 요청 값: `crtfcKey`(필수, 인증키), `dataType`(rss 또는 json), `searchCnt`(조회 건수, 0이나 빈 값이면 전체), `searchLclasId`(분야 01 금융, 02 기술, 03 인력, 04 수출, 05 내수, 06 창업, 07 경영, 09 기타), `hashtags`(쉼표로 여러 개, 분야·지역 이름), `pageUnit`, `pageIndex`
- 쓰는 응답 항목: `pblancId`(공고 ID), `pblancNm`(공고명), `pblancUrl`(공고 주소), `jrsdInsttNm`(소관기관), `excInsttNm`(수행기관), `bsnsSumryCn`(사업 개요), `pldirSportRealmLclasCodeNm`(지원분야 대분류), `trgetNm`(지원 대상), `hashTags`(해시태그: 연도, 분야, 지역, 기관), `reqstBeginEndDe`(신청기간 "20220727 ~ 20220930"), `creatPnttm`(등록일), `refrncNm`(문의처), `rceptEngnHmpgUrl`(신청 주소)
- 지역 해시태그는 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주, 그리고 "전남광주"가 있습니다. "전남광주"는 광주와 전남 둘 다로 봅니다

## 설치

### 1. 준비물

- Cloudflare 무료 계정, Node.js 20 이상
- (발송) Resend 계정과 보내는 도메인 인증
- (선택) 기업마당 API 키

### 2. 배포

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create jiwon-meo        # 나온 database_id 를 wrangler.toml 에 넣는다
npx wrangler d1 migrations apply jiwon-meo --remote
npx wrangler secret put TOKEN_SECRET       # 32자 이상 아무 값 (openssl rand -hex 32)
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put BIZINFO_API_KEY    # 없으면 예시 데이터로 동작
npx wrangler deploy
```

`wrangler.toml`의 `[vars]`에서 `PUBLIC_URL`(메일 링크 기준 주소), `MAIL_FROM`, `SENDER_INFO`(메일 끝 보내는 곳), `CONTACT_URL`(문의 버튼 주소)을 바꿉니다.

## 설정 값

| 이름 | 위치 | 설명 |
|---|---|---|
| `TOKEN_SECRET` | secret | 메일 링크 서명 비밀값. 바꾸면 이미 보낸 링크가 모두 무효 |
| `BIZINFO_API_KEY` | secret | 기업마당 인증키 |
| `RESEND_API_KEY` | secret | 없으면 메일을 콘솔에 찍기만 합니다 |
| `PUBLIC_URL` | vars | 메일 속 링크의 기준 주소 |
| `MAIL_FROM` | vars | 보내는 사람 |
| `SENDER_INFO` | vars | 메일 끝 보내는 곳 명칭·연락처 |
| `CONTACT_URL` | vars | "신청서 작성 도움 문의" 버튼 주소. 모든 메일 끝 보내는 곳 연락처로도 적습니다 |
| `USE_AI_SUMMARY` | vars | "1"이면 Workers AI 한 줄 요약 |
| `AI_MODEL` | vars | Workers AI 모델 |
| `MOCK` | vars | "1"이면 외부 호출 없이 예시 데이터와 콘솔 메일로만 동작 |

## 개인정보와 광고 수신

법률 자문이 아닌 운영 기준입니다. 운영 전에 전문가 확인을 권합니다.

| 무엇을 | 왜 | 얼마나 |
|---|---|---|
| 메일 주소, 사업장 지역(시도·시군구), 업종, 사업자 구분, 업력 구간, 관심 분야 (컨설턴트는 고객 별칭과 고객별 같은 항목) | 조건에 맞는 지원사업 메일, 구독 확인·조건 바꾸기 링크 발송 | 구독하는 동안. 수신 거부하면 바로 지웁니다. 확인하지 않은 신청은 매일 정리해 3일 안에 지웁니다 |
| 광고성 정보 수신 동의 여부와 동의 일시 (선택) | 주간 메일 끝 Define404 신청서 작성 도움 안내 | 동의한 날부터 2년. 철회하거나 수신 거부하면 바로 끝납니다 |
| 동의·철회 일시, 발송 기록 (메일 주소 없이 계정 번호로만) | 동의 증빙, 같은 주 중복 발송 방지 | 계속 남깁니다 |

- 개인정보 보호법 제15조 제2항: 필수 동의 "내용 보기"에 목적, 항목, 보유·이용 기간, 동의 거부 권리와 거부 시 불이익(구독 불가)을 적었습니다. 처리 위탁(Cloudflare, Resend)과 국외 이전 가능성도 적었습니다. 국외 이전 고지(이전 국가, 일시, 방법, 받는 자)는 더 구체적으로 적어야 할 수 있습니다
- 개인정보 보호법 제22조 제1항·제5항: 광고성 정보 수신 동의는 필수 동의와 따로 받는 선택 칸이고, 처음에 체크되어 있지 않습니다. 동의하지 않아도 지원사업 메일은 똑같이 받습니다
- 정보통신망법 제50조 제1항·제2항: 주간 메일 자체는 구독자가 직접 신청한 정보 제공으로 보고 광고 동의 없이 보냅니다. 메일 끝 "신청서 작성 도움 문의"는 Define404의 영리 목적 안내라 광고로 보고, 유효한 광고 수신 동의가 있는 분께만 넣습니다. 철회나 수신 거부 뒤에는 넣지 않습니다
- 제50조 제3항: 야간 전송 동의는 따로 받지 않습니다. 광고 안내는 실제 보내는 시각이 한국 시간 08~21시일 때만 넣고, 그 밖의 시각에는 빼고 보냅니다. 주간 발송은 월요일 09:00입니다
- 제50조 제4항과 시행령: 광고가 실린 메일은 제목 앞에 "(광고)"를 붙이고(끌 수 없음), 본문에 보내는 곳 명칭·연락처(`SENDER_INFO`, `CONTACT_URL`)와 "수신 거부", "광고 수신만 거부" 링크를 적습니다
- 제50조 제5항·제6항: 철회는 메일 속 링크를 열어 버튼 한 번으로 되고 비용이 들지 않습니다
- 제50조 제7항: 광고 수신 동의(구독 확정 때), 철회(조건 바꾸기 화면, 광고 수신만 거부), 수신 거부로 인한 철회가 처리되면 결과를 메일로 알립니다. 발송 키가 없으면 콘솔에 찍습니다. 알림에는 광고를 넣지 않습니다
- 제50조 제8항(2년마다 수신 동의 확인): 확인 안내 메일을 보내는 대신, 동의 일시를 저장해 두고 2년이 지나면 동의가 끝난 것으로 보고 광고를 빼는 쪽을 택했습니다. 계속 받으려면 조건 바꾸기 화면에서 다시 동의하면 됩니다
- 컨설턴트 모드는 고객 실명 대신 별칭을 받고, 고객 연락처나 사업자번호는 받지 않습니다

## 보안

- 확인, 조건 바꾸기, 수신 거부 링크는 HMAC-SHA256으로 서명합니다. 용도, 계정, 토큰 세대, 만료가 들어 있고, 수신 거부하면 세대가 올라가 이전 링크가 모두 무효가 됩니다
- 링크의 토큰은 주소의 `#` 뒤에 두어 서버 기록과 Referer에 남지 않습니다
- API는 계정 ID를 요청 본문에서 받지 않고 검증된 토큰에서만 꺼냅니다 (남의 계정 조회·수정 불가)
- 구독 확인과 화면 수신 거부는 버튼을 눌러야 처리됩니다. 메일 검사기가 링크를 미리 열어도 확정되지 않습니다
- 이미 있는 주소로 신청해도 같은 답을 줍니다 (가입 여부 노출 없음). 확인·링크 메일은 같은 주소로 5분에 한 번만
- 접속자별 요청 제한(1분 10번), 다른 사이트에서 온 요청 차단, 요청 크기 제한, 자동 입력 걸러 내는 숨은 칸
- 확인하지 않은 신청은 매일 정리해 3일 안에 지웁니다

## 로컬에서 시험하기

```bash
cd worker
npm install
npm test                                   # 단위·흐름 시험 (Node 내장 SQLite 로 D1 흉내)
npx wrangler types                         # 타입 파일(worker-configuration.d.ts)을 만든다
npm run check                              # 타입 검사 (wrangler types 다음에)
cp .dev.vars.example .dev.vars             # TOKEN_SECRET 를 채운다
npx wrangler d1 migrations apply jiwon-meo --local
npx wrangler dev --test-scheduled --var MOCK:1
```

- `http://localhost:8787/`에서 신청하면 확인 메일이 터미널에 찍힙니다. 메일 속 `/confirm#t=...` 주소를 열어 확정합니다
- `curl "http://localhost:8787/__scheduled?cron=0+0+*+*+MON"`으로 주간 발송을 바로 돌립니다. 메일 내용이 터미널에 찍힙니다
- `http://localhost:8787/dev/digest?today=2026-10-12`(컨설턴트는 `&kind=consultant`)에서 예시 주간 메일을 봅니다. `MOCK=1`일 때만 열립니다

## 시험하지 못한 것

- 실제 기업마당 API 호출. 응답 모양은 안내 화면의 예시 기준이며 `{"jsonArray": {"item": [...]}}`, `{"jsonArray": [...]}` 둘 다 받도록 짰습니다. "상시", "예산 소진 시까지" 같은 신청기간 표기는 끝 날짜가 없으면 상시로 처리합니다
- 실제 Resend 발송, 실제 Workers AI 요약 호출
- 배포된 Cloudflare 환경의 요청 제한, Cron 실행 시각, 두 Cron(주간 발송, 매일 정리)을 `event.cron` 문자열로 나누는 부분
- 메일 프로그램별 HTML 표시 (브라우저로만 확인)
- 구독자가 많을 때: 한 번 실행에 200명까지 보내고 나머지는 같은 주 다음 실행에서 이어 보냅니다. 수천 명 규모면 Queues로 나눠야 합니다

## 만든 곳

[Define404](https://define404.com)

설치, 조건 설계, 신청서 작성 도움은 [contact.define404.com](https://contact.define404.com)으로 문의해 주세요.

- 저장소: https://github.com/johndefine404/jiwon-meo
- 같은 고양이 시리즈: 부킹냥(booking-meo). 로고는 같은 고양이 머리 도형에 초록 바탕과 편지 봉투를 얹은 것으로, `python3 tools/make-logo.py`가 `public/logo.svg`와 `public/favicon.svg`를 만듭니다. 메일 머리글용 `public/logo-email.png`(96px)는 `logo.svg`를 그대로 찍은 그림입니다

---

## English

jiwon-meo (지원냥, "jiwon-nyang") is an open-source weekly digest of Korean government support programs for small business owners. Subscribers enter their region (province and district), industry, business type, years in business and interest areas once, confirm by email (double opt-in), and receive a Korean email every Monday 09:00 KST listing matching programs from the Bizinfo (bizinfo.go.kr) open API, with programs closing within 7 days at the top and a one-line reason for each match. A consultant mode lets tax accountants and consultants manage up to 30 client profiles in one account, with the digest grouped by client. Every email carries signed (HMAC) manage and unsubscribe links plus RFC 8058 one-click unsubscribe. Optional marketing consent is collected separately (unchecked by default), ads are added only for consenting subscribers and only when sent between 08:00 and 21:00 KST with a "(광고)" subject prefix and an ad-only opt-out link, every consent change triggers a result notice email, and marketing consent expires after 2 years. It runs on Cloudflare Workers (Hono), D1, Cron Triggers and optional Workers AI summaries, and sends through Resend. Without an API key it runs on a clearly marked fictional sample dataset. MIT licensed.
