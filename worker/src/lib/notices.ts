// 확인 메일, 조건 변경 링크 메일. 광고성 문구를 넣지 않는다.
import type { Env } from "../env";
import { esc } from "./digest";
import type { Mail } from "./mail";
import { signToken, type Purpose } from "./token";

// 링크는 #t= 뒤에 토큰을 붙인다. 주소 조각(#)은 서버 기록과 Referer 에 남지 않는다
export async function link(env: Env, page: "confirm" | "manage" | "unsubscribe", purpose: Purpose, accountId: string, version: number): Promise<string> {
  const t = await signToken(env.TOKEN_SECRET, purpose, accountId, version);
  return `${env.PUBLIC_URL.replace(/\/$/, "")}/${page}#t=${t}`;
}

export async function unsubscribeUrls(env: Env, accountId: string, version: number): Promise<{ page: string; oneClick: string }> {
  const t = await signToken(env.TOKEN_SECRET, "unsub", accountId, version);
  const base = env.PUBLIC_URL.replace(/\/$/, "");
  return { page: `${base}/unsubscribe#t=${t}`, oneClick: `${base}/api/unsubscribe?t=${encodeURIComponent(t)}` };
}

function simple(site: string, title: string, body: string, buttonLabel: string, url: string, foot: string): { html: string; text: string } {
  const logo = `${site.replace(/\/$/, "")}/logo-email.png`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F7F5F0;word-break:keep-all">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1B1F1D">
<tr><td style="font-size:13px;font-weight:800;color:#1F6B4F;padding-bottom:6px"><img src="${esc(logo)}" width="24" height="24" alt="" style="vertical-align:middle;border:0;margin-right:6px">지원냥</td></tr>
<tr><td style="font-size:20px;font-weight:800;line-height:1.4;padding-bottom:10px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.7;padding-bottom:18px">${esc(body)}</td></tr>
<tr><td style="padding-bottom:22px"><a href="${esc(url)}" style="display:inline-block;padding:12px 18px;border-radius:4px;background:#1B1F1D;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none">${esc(buttonLabel)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.7;color:#5B605C;border-top:1px solid #E3E0D8;padding-top:14px">${esc(foot)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `지원냥\n\n${title}\n\n${body}\n\n${buttonLabel}: ${url}\n\n${foot}`;
  return { html, text };
}

export async function confirmMail(env: Env, to: string, accountId: string, version: number): Promise<Mail> {
  const url = await link(env, "confirm", "confirm", accountId, version);
  const { html, text } = simple(
    env.PUBLIC_URL,
    "구독 신청을 확인해 주세요",
    "지원냥 구독 신청이 접수되었습니다. 아래 버튼을 누르고 열린 화면에서 확정 버튼을 누르시면 다음 주 월요일부터 조건에 맞는 지원사업을 메일로 보내 드립니다. 48시간 안에 확인하지 않으시면 신청은 저절로 무효가 됩니다.",
    "구독 확인하기",
    url,
    `직접 신청하지 않으셨다면 이 메일을 무시하셔도 됩니다. 확인하지 않으면 메일을 보내지 않습니다. 보내는 곳: ${env.SENDER_INFO}`,
  );
  return { to, subject: "[지원냥] 구독 신청을 확인해 주세요", html, text };
}

export async function manageMail(env: Env, to: string, accountId: string, version: number): Promise<Mail> {
  const url = await link(env, "manage", "manage", accountId, version);
  const { html, text } = simple(
    env.PUBLIC_URL,
    "조건 바꾸기 링크입니다",
    "이미 지원냥을 구독 중이십니다. 아래 링크에서 지역, 업종, 관심 분야를 바꾸거나 수신을 거부하실 수 있습니다. 링크는 30일 동안 쓸 수 있습니다.",
    "조건 바꾸기",
    url,
    `직접 요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. 보내는 곳: ${env.SENDER_INFO}`,
  );
  return { to, subject: "[지원냥] 조건 바꾸기 링크", html, text };
}
