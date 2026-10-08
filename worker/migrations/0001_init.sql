-- [Define404] 지원냥 (jiwon-meo) 스키마

-- 구독 계정. kind = owner(사장님 본인, 조건 1개) | consultant(세무사·컨설턴트, 고객 여러 명)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,                    -- 수신 거부 시 지운다
  kind TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | unsubscribed
  token_version INTEGER NOT NULL DEFAULT 1, -- 올리면 이전 링크가 모두 무효
  privacy_consent_at TEXT,              -- 개인정보 수집·이용 동의 (필수)
  marketing_consent INTEGER NOT NULL DEFAULT 0, -- 광고성 정보 수신 동의 (선택)
  marketing_consent_at TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  last_mail_at TEXT                     -- 확인·링크 메일을 짧은 시간에 여러 번 보내지 않으려고
);

-- 조건. 사장님은 1개, 컨설턴트는 고객마다 1개
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sido TEXT NOT NULL,
  sigungu TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL,
  biz_type TEXT NOT NULL,
  years TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '',   -- 쉼표 구분
  created_at TEXT NOT NULL
);
CREATE INDEX profiles_account ON profiles(account_id);

-- 기업마당에서 받은 공고 (매주 갱신). summary = AI 한 줄 요약 캐시
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  summary TEXT,
  fetched_at TEXT NOT NULL
);

-- 주간 발송 기록. 같은 주에 두 번 보내지 않는다
CREATE TABLE sends (
  account_id TEXT NOT NULL,
  week TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  items INTEGER NOT NULL,
  PRIMARY KEY (account_id, week)
);

-- 동의·철회 기록 (증빙용). 이메일은 남기지 않고 계정 ID만
CREATE TABLE consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,   -- privacy | marketing | unsubscribe
  value INTEGER NOT NULL,
  at TEXT NOT NULL
);
