// [Define404] 지원냥: 첫 화면 신청서
(async function () {
  "use strict";
  const J = window.Jiwon;
  const form = document.getElementById("subscribe");
  const msg = document.getElementById("msg");
  const root = document.getElementById("editor");
  let ed = await J.editor(root, "owner");
  const m = await J.meta();
  if (m && m.dataReady === false) document.getElementById("data-notice").hidden = false;

  form.querySelectorAll('input[name="kind"]').forEach((r) =>
    r.addEventListener("change", async () => {
      ed = await J.editor(root, r.value);
    }),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const kind = form.querySelector('input[name="kind"]:checked').value;
    const profiles = ed.read();
    const missing = profiles.find((p) => !p.sido || !p.industry || !p.bizType || !p.years || (kind === "consultant" && !p.label));
    if (missing) return J.show(msg, kind === "consultant" ? "고객마다 별칭, 시도, 업종, 사업자 구분, 업력을 골라 주세요." : "시도, 업종, 사업자 구분, 업력을 골라 주세요.", false);
    if (!form.email.checkValidity()) return J.show(msg, "메일 주소를 확인해 주세요.", false);
    if (!form.privacy.checked) return J.show(msg, "개인정보 수집·이용에 동의해 주셔야 구독할 수 있습니다.", false);
    btn.disabled = true;
    try {
      const r = await J.send("POST", "/api/subscribe", {
        email: form.email.value,
        kind,
        profiles,
        privacy: form.privacy.checked,
        marketing: form.marketing.checked,
        website: form.website.value,
      });
      J.show(msg, r.message, true);
    } catch (err) {
      J.show(msg, err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  const relink = document.getElementById("relink");
  const relinkMsg = document.getElementById("relink-msg");
  relink.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!relink.email.checkValidity()) return J.show(relinkMsg, "메일 주소를 확인해 주세요.", false);
    try {
      const r = await J.send("POST", "/api/manage-link", { email: relink.email.value });
      J.show(relinkMsg, r.message, true);
    } catch (err) {
      J.show(relinkMsg, err.message, false);
    }
  });
})();
