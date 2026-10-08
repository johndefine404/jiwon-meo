// 메일 발송. RESEND_API_KEY 가 없거나 MOCK 이면 콘솔에만 찍는다.
import type { Env } from "../env";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (env.MAIL_SINK) {
    env.MAIL_SINK.push(mail);
    return;
  }
  if (env.MOCK === "1" || !env.RESEND_API_KEY) {
    console.log(`[mail:mock] to=${mail.to} subject=${mail.subject}\n${mail.text}\n[mail:mock:end]`);
    return;
  }
  // 시험되지 않은 경로 (실제 Resend 호출)
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}
