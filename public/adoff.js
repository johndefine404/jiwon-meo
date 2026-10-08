// [Define404] 지원냥: 광고 수신만 거부 (버튼을 눌러야 처리. 메일 검사기가 링크를 미리 열어도 처리되지 않게)
(function () {
  "use strict";
  const J = window.Jiwon;
  const token = J.tokenFromHash();
  const go = document.getElementById("go");
  const msg = document.getElementById("msg");
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await J.send("POST", "/api/marketing-off", { token });
      history.replaceState(null, "", location.pathname);
      go.hidden = true;
      J.show(msg, r.message, true);
    } catch (e) {
      go.disabled = false;
      J.show(msg, e.message, false);
    }
  });
})();
