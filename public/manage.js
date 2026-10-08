// [Define404] 지원냥: 조건 바꾸기와 수신 거부
(async function () {
  "use strict";
  const J = window.Jiwon;
  const token = J.tokenFromHash();
  const desc = document.getElementById("desc");
  const form = document.getElementById("form");
  const msg = document.getElementById("msg");
  let data;
  try {
    if (!token) throw new Error("링크가 올바르지 않습니다. 첫 화면 아래에서 조건 바꾸기 링크를 다시 받아 주세요.");
    data = await J.send("GET", "/api/manage", null, token);
  } catch (e) {
    desc.textContent = e.message;
    return;
  }
  desc.textContent = `${data.email} 로 ${data.kind === "consultant" ? `고객 ${data.profiles.length}곳의 공고를` : "공고를"} 매주 월요일 오전 9시에 보내 드리고 있습니다.`;
  const ed = await J.editor(document.getElementById("editor"), data.kind, data.profiles);
  form.marketing.checked = !!data.marketing;
  form.hidden = false;
  document.getElementById("danger").hidden = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const r = await J.send("PUT", "/api/manage", { profiles: ed.read(), marketing: form.marketing.checked }, token);
      J.show(msg, r.message, true);
    } catch (err) {
      J.show(msg, err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("unsub").addEventListener("click", async () => {
    if (!confirm("수신 거부하고 메일 주소와 조건을 지울까요?")) return;
    const m = document.getElementById("unsub-msg");
    try {
      const r = await J.send("POST", "/api/unsubscribe", {}, token);
      history.replaceState(null, "", location.pathname);
      form.hidden = true;
      J.show(m, r.message, true);
    } catch (err) {
      J.show(m, err.message, false);
    }
  });
})();
