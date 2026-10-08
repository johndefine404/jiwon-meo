// [Define404] 지원냥: 구독 확인 (버튼을 눌러야 확정. 메일 검사기가 링크를 미리 열어도 확정되지 않게)
(function () {
  "use strict";
  const J = window.Jiwon;
  const token = J.tokenFromHash();
  const go = document.getElementById("go");
  const msg = document.getElementById("msg");
  if (!token) {
    go.disabled = true;
    J.show(msg, "링크가 올바르지 않습니다. 메일의 링크를 다시 눌러 주세요.", false);
    return;
  }
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await J.send("POST", "/api/confirm", { token });
      history.replaceState(null, "", location.pathname);
      go.hidden = true;
      const a = document.getElementById("manage");
      a.href = r.manageUrl;
      a.hidden = false;
      document.querySelector("h1").textContent = "구독을 시작했습니다";
      J.show(msg, "다음 주 월요일 오전 9시부터 보내 드립니다. 조건 바꾸기 링크는 매주 메일 아래에도 있습니다.", true);
    } catch (e) {
      go.disabled = false;
      J.show(msg, e.message, false);
    }
  });
})();
