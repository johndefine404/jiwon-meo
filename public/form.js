// [Define404] 지원냥: 조건 입력 부품 (첫 화면 신청서와 조건 바꾸기 화면이 같이 쓴다)
(function () {
  "use strict";

  let META = null;
  async function meta() {
    if (!META) {
      META = fetch("/api/meta").then((r) => r.json());
    }
    return META;
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) if (k) n.append(k);
    return n;
  }

  function select(name, options, value, placeholder) {
    const s = el("select", { name, required: !!placeholder });
    if (placeholder !== undefined) s.append(el("option", { value: "", text: placeholder }));
    for (const o of options) {
      const opt = el("option", { value: o.value ?? o, text: o.label ?? o });
      if ((o.value ?? o) === value) opt.selected = true;
      s.append(opt);
    }
    return s;
  }

  let seq = 0;

  // 조건 하나(사장님 본인 또는 고객 한 곳)를 그린다
  function profileBlock(m, p, opts) {
    p = p || {};
    const id = "p" + ++seq;
    const box = el("div", { class: opts.consultant ? "client" : "profile" });
    if (opts.consultant) {
      const head = el("div", { class: "client-head" }, el("span", { text: "고객" }));
      if (opts.onRemove) {
        const rm = el("button", { type: "button", class: "linkbtn", text: "이 고객 빼기" });
        rm.addEventListener("click", () => opts.onRemove(box));
        head.append(rm);
      }
      box.append(head);
      const label = el("input", { type: "text", name: "label", maxlength: "30", required: true, placeholder: "예: 수원 국밥집 (실명 대신 별칭)", value: p.label || "" });
      box.append(el("label", { class: "field" }, el("span", { text: "고객 별칭" }), label));
    }

    const sido = select("sido", Object.keys(m.regions), p.sido || "", "시도");
    const sigungu = select("sigungu", [], "", undefined);
    function fillSigungu(value) {
      sigungu.replaceChildren(el("option", { value: "", text: "시군구 전체" }));
      for (const g of m.regions[sido.value] || []) {
        const o = el("option", { value: g, text: g });
        if (g === value) o.selected = true;
        sigungu.append(o);
      }
      sigungu.disabled = !(m.regions[sido.value] || []).length;
    }
    sido.addEventListener("change", () => fillSigungu(""));
    fillSigungu(p.sigungu || "");
    sido.setAttribute("aria-label", "시도");
    sigungu.setAttribute("aria-label", "시군구");
    box.append(el("div", { class: "field" }, el("span", { text: "사업장 지역" }), el("div", { class: "row2" }, sido, sigungu)));

    const industry = select("industry", m.industries, p.industry || "", "업종을 골라 주세요");
    industry.setAttribute("aria-label", "업종");
    box.append(el("label", { class: "field" }, el("span", { text: "업종" }), industry));

    const biz = select("bizType", m.bizTypes, p.bizType || "", "구분");
    const years = select("years", m.years, p.years || "", "업력");
    biz.setAttribute("aria-label", "사업자 구분");
    years.setAttribute("aria-label", "업력");
    box.append(el("div", { class: "field" }, el("span", { text: "사업자 구분과 업력" }), el("div", { class: "row2" }, biz, years)));

    const chips = el("div", { class: "chips" });
    for (const name of m.interests) {
      const cb = el("input", { type: "checkbox", name: "interests", value: name });
      if ((p.interests || []).includes(name)) cb.checked = true;
      chips.append(el("label", {}, cb, document.createTextNode(name)));
    }
    box.append(
      el("fieldset", { class: "field", id }, el("legend", { text: "관심 분야" }), chips, el("p", { class: "small", text: "고르지 않으면 모든 분야를 보내 드립니다." })),
    );
    return box;
  }

  function readBlock(box, consultant) {
    const q = (n) => box.querySelector(`[name="${n}"]`);
    return {
      label: consultant ? q("label").value.trim() : "내 사업장",
      sido: q("sido").value,
      sigungu: q("sigungu").value,
      industry: q("industry").value,
      bizType: q("bizType").value,
      years: q("years").value,
      interests: [...box.querySelectorAll('[name="interests"]:checked')].map((x) => x.value),
    };
  }

  // 조건 편집기: 사장님이면 조건 하나, 컨설턴트면 고객 여러 곳
  async function editor(root, kind, profiles) {
    const m = await meta();
    root.replaceChildren();
    const consultant = kind === "consultant";
    const list = el("div");
    root.append(list);
    let add = null;
    function refresh() {
      const n = list.children.length;
      if (add) add.hidden = n >= m.maxClients;
      list.querySelectorAll(".client-head span").forEach((s, i) => (s.textContent = `고객 ${i + 1}`));
    }
    function addOne(p) {
      list.append(
        profileBlock(m, p, {
          consultant,
          onRemove: consultant
            ? (box) => {
                if (list.children.length > 1) box.remove();
                refresh();
              }
            : null,
        }),
      );
      refresh();
    }
    const initial = profiles && profiles.length ? profiles : [{}];
    (consultant ? initial : initial.slice(0, 1)).forEach(addOne);
    if (consultant) {
      add = el("button", { type: "button", class: "addbtn", text: `고객 추가 (최대 ${m.maxClients}곳)` });
      add.addEventListener("click", () => addOne({}));
      root.append(add);
      refresh();
    }
    return {
      read: () => [...list.children].map((b) => readBlock(b, consultant)),
    };
  }

  function show(node, text, ok) {
    node.textContent = text;
    node.className = "msg " + (ok ? "ok" : "err");
  }

  function tokenFromHash() {
    const m = location.hash.match(/[#&]t=([A-Za-z0-9_.-]+)/);
    return m ? m[1] : "";
  }

  async function send(method, url, body, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try {
      data = await r.json();
    } catch (e) {}
    if (!r.ok) throw new Error(data.error || "잠시 후 다시 시도해 주세요");
    return data;
  }

  // 개인정보 처리방침 주소는 서버 설정(PRIVACY_URL)을 따른다. 못 받으면 HTML 의 기본 주소를 그대로 둔다
  meta()
    .then((m) => {
      if (m && m.privacyUrl) document.querySelectorAll("a[data-privacy]").forEach((a) => (a.href = m.privacyUrl));
    })
    .catch(() => {});

  window.Jiwon = { editor, show, tokenFromHash, send, el, meta };
})();
