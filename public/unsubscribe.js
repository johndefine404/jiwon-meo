// [Define404] 지원냥: 수신 거부 (버튼을 눌러야 처리. 메일 앱의 한 번 누르기는 /api/unsubscribe 로 바로 간다)
(function () {
  "use strict";
  const J = window.Jiwon;
  const token = J.tokenFromHash();
  const go = document.getElementById("go");
  const msg = document.getElementById("msg");
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await J.send("POST", "/api/unsubscribe", { token });
      history.replaceState(null, "", location.pathname);
      go.hidden = true;
      J.show(msg, r.message, true);
    } catch (e) {
      go.disabled = false;
      J.show(msg, e.message, false);
    }
  });
})();
