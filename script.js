/* Light-Speed Float — 8-bit floating point on a speedometer.
   8-bit mantissa + 4-bit exponent, both two's complement.
   The mantissa's binary point sits straight after its first bit. */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const M = 8, E = 4;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    bits: [0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1], // 0.1011000 × 2^3 = 5.5
    testing: false,
    answered: false,
  };

  /* ---------- maths ---------- */
  const twos = (b) => b.reduce((v, bit, i) => v + bit * (i === 0 ? -1 : 1) * 2 ** (b.length - 1 - i), 0);
  function decode(bits) {
    const m = bits.slice(0, M), e = bits.slice(M);
    const exp = twos(e);
    return { m, e, exp, value: (twos(m) / 2 ** (M - 1)) * 2 ** exp };
  }
  const fmt = (v) => String(v).replace("-", "−");
  const label = (w) => (Math.abs(w) >= 1 ? fmt(w) : "1/" + 1 / w);
  function randomBits() {
    // always a normalised number: first two mantissa bits differ.
    // Keep questions friendly: short mantissas and exponents between −4 and 5.
    const s = Math.random() < 0.7 ? 0 : 1;
    const used = 3 + Math.floor(Math.random() * 3); // 3–5 significant bits after the first two
    const m = [s, 1 - s];
    for (let i = 2; i < M; i++) m.push(i < 2 + used && Math.random() < 0.5 ? 1 : 0);
    const exp = Math.floor(Math.random() * 10) - 4;
    const e = Array.from({ length: E }, (_, i) => ((exp + 2 ** E) >> (E - 1 - i)) & 1);
    return [...m, ...e];
  }

  /* ---------- speedometer ---------- */
  const CX = 200, CY = 190, R = 150, A0 = 150, SWEEP = 240;
  const LO = -15, HI = Math.log2(127); // slowest (2^-15) → top speed (127)
  const polar = (a, r) => { const t = (a * Math.PI) / 180; return [CX + r * Math.cos(t), CY + r * Math.sin(t)]; };
  function arc(a0, a1, r) {
    if (a1 - a0 < 0.05) a1 = a0 + 0.05;
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
  function angleOf(v) {
    if (v === 0) return A0;
    const t = Math.min(1, Math.max(0, (Math.log2(Math.abs(v)) - LO) / (HI - LO)));
    return A0 + SWEEP * (0.05 + 0.95 * t);
  }

  const dial = $("#dial");
  (function buildDial() {
    let s = `<circle class="d-face" cx="${CX}" cy="${CY}" r="${R - 9}"/>`;
    s += `<path class="d-track" d="${arc(A0, A0 + SWEEP, R)}"/>`;
    s += `<path class="d-prog" id="prog" d="${arc(A0, A0, R)}"/>`;
    for (let i = 0; i <= 12; i++) {
      const a = A0 + (SWEEP * i) / 12, [x1, y1] = polar(a, R - 22), [x2, y2] = polar(a, R - 10);
      s += `<line class="d-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    [["🐌", 0.07], ["🚶", 0.28], ["🚗", 0.5], ["✈️", 0.7], ["🚀", 0.88]].forEach(([icon, t]) => {
      const [x, y] = polar(A0 + SWEEP * t, R + 26);
      s += `<text class="d-icon" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${icon}</text>`;
    });
    { const [x, y] = polar(A0 + SWEEP + 4, R + 30);
      s += `<text class="d-light" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">⚡ LIGHT</text>`; }
    s += `<polygon class="d-needle" id="needle" points="${CX - 18},${CY - 4} ${CX + R - 16},${CY - 1} ${CX + R - 16},${CY + 1} ${CX - 18},${CY + 4}"/>`;
    s += `<circle class="d-hub" cx="${CX}" cy="${CY}" r="12"/>`;
    s += `<text class="d-val" id="val" x="${CX}" y="${CY + 62}" text-anchor="middle">0</text>`;
    s += `<text class="d-dir" id="dir" x="${CX}" y="${CY + 84}" text-anchor="middle">STOPPED</text>`;
    dial.innerHTML = s;
  })();
  const needle = $("#needle"), prog = $("#prog");

  /* ---------- stars + needle motion ---------- */
  const canvas = $("#stars"), ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  new ResizeObserver(() => {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }).observe(canvas);
  const stars = Array.from({ length: 150 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));

  const hidden = () => state.testing && !state.answered;
  let cur = A0, vel = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const v = decode(state.bits).value;
    const target = hidden() ? A0 : angleOf(v);
    if (reduceMotion) cur = target;
    else { vel += (70 * (target - cur) - 12 * vel) * dt; cur += vel * dt; }
    needle.setAttribute("transform", `rotate(${cur} ${CX} ${CY})`);
    prog.setAttribute("d", arc(A0, Math.max(A0, cur), R));

    const t = (cur - A0) / SWEEP, dir = !hidden() && v < 0 ? -1 : 1;
    const speed = reduceMotion || t < 0.03 ? 0 : 0.015 + 2.5 * t ** 3.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * (CY / 340), sc = W * 0.22;
    for (const s of stars) {
      s.z -= speed * dt * dir;
      if (s.z < 0.03 || s.z > 1) { s.z = dir > 0 ? 1 : 0.05; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; }
      const tz = Math.min(1, s.z + speed * 0.09 * dir);
      ctx.strokeStyle = `rgba(160,200,240,${Math.min(1, (1 - s.z) * 1.1)})`;
      ctx.lineWidth = Math.max(0.6, (1 - s.z) * 2);
      ctx.beginPath();
      ctx.moveTo(cx + (s.x / tz) * sc, cy + (s.y / tz) * sc);
      ctx.lineTo(cx + (s.x / s.z) * sc + 0.01, cy + (s.y / s.z) * sc);
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- bits ---------- */
  const bitsEl = $("#bits");
  (function buildBits() {
    const cell = (i, pv) =>
      `<div class="cell"><span class="pv${pv.startsWith("−") ? " neg" : ""}">${pv}</span><button type="button" class="bit" id="bit-${i}" data-i="${i}" aria-label="bit ${i + 1}, worth ${pv}">0</button></div>`;
    let m = "";
    ["−1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1/128"].forEach((pv, i) => { m += cell(i, pv); if (i === 0) m += `<span class="pt" aria-hidden="true">.</span>`; });
    const e = ["−8", "4", "2", "1"].map((pv, i) => cell(M + i, pv)).join("");
    bitsEl.innerHTML =
      `<div class="bitgroup mant"><span class="grp-label m">MANTISSA</span><span class="grp-hint">the digits</span><div class="cells">${m}</div></div>` +
      `<div class="bitgroup exp"><span class="grp-label e">EXPONENT</span><span class="grp-hint">moves the point</span><div class="cells">${e}</div></div>`;
  })();
  bitsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest(".bit");
    if (!b || b.disabled) return;
    state.bits[+b.dataset.i] ^= 1;
    render();
  });

  /* ---------- the working (shared by explore and test) ---------- */
  function work() {
    const d = decode(state.bits);
    const padL = Math.max(0, -d.exp), padR = Math.max(0, d.exp - (M - 1));
    const digits = [...Array(padL).fill(d.m[0]), ...d.m, ...Array(padR).fill(0)];
    const pad = digits.map((_, i) => i < padL || i >= padL + M);
    const intLen = Math.max(1, 1 + d.exp);
    const shifted = digits.slice(0, intLen).join("") + "." + (digits.slice(intLen).join("") || "0");
    return { ...d, padL, digits, pad, intLen, shifted };
  }

  function steps() {
    const { m, e, exp, value, padL, digits, pad, intLen } = work();
    if (m.every((b) => b === 0)) {
      return [{ t: "The mantissa is all zeros", h: `<p>No digits means no speed: the answer is <b>0</b>.</p>` }];
    }
    const out = [];

    // 1. exponent
    const eTerms = [-8, 4, 2, 1].filter((_, i) => e[i]);
    const eSum = eTerms.length ? eTerms.map((w, i) => (i ? " + " : "") + fmt(w)).join("") : "0";
    out.push({
      t: "Work out the exponent",
      h: `<p class="calc"><span class="e">${e.join("")}</span> → ${eSum} = <span class="e">${exp}</span></p>
          <p class="note">Use the numbers above the exponent bits. The first one is −8.</p>`,
    });

    // 2. move the point
    const n = Math.abs(exp), places = `${n} place${n === 1 ? "" : "s"}`;
    const how = exp > 0 ? `Move the point <b>${places} right</b>.` : exp < 0 ? `Move the point <b>${places} left</b>.` : `The exponent is 0, so the point <b>stays put</b>.`;
    const fill = padL ? `<p class="note">Fill any gaps on the left with copies of the first bit (<span class="m">${m[0]}</span>).</p>` : "";
    out.push({
      t: "Move the binary point",
      h: `<p>${how}</p>
          <div class="shift-wrap"><div class="shift" data-from="${padL + 1}" data-to="${intLen}">${digits.map((d, i) => `<span class="${pad[i] ? "pad" : ""}">${d}</span>`).join("")}<i class="shift-pt"></i></div>
          <button type="button" class="btn replay">Replay</button></div>${fill}`,
    });

    // 3. add up
    const w = digits.map((_, i) => (i === 0 ? -1 : 1) * 2 ** (intLen - 1 - i));
    const terms = w.filter((_, i) => digits[i]);
    const sum = terms.map((x, i) => (i === 0 ? fmt(x) : ` + ${fmt(x)}`)).join("");
    out.push({
      t: "Add up the place values",
      h: `<div class="tbl-wrap"><table><tr>${w.map((x, i) => `<th class="${x < 0 ? "neg" : ""}${i === intLen ? " after-pt" : ""}">${label(x)}</th>`).join("")}</tr>
          <tr>${digits.map((d, i) => `<td class="${pad[i] ? "pad" : ""}${d ? "" : " off"}${i === intLen ? " after-pt" : ""}">${d}</td>`).join("")}</tr></table></div>
          <p class="calc">${sum} = <span class="result${value < 0 ? " neg" : ""}">${fmt(value)}</span></p>
          ${m[0] ? `<p class="note">The first column is <span class="neg">negative</span>, so this speed is in reverse.</p>` : ""}`,
    });
    return out;
  }

  /* ---------- test mode: one question per step ---------- */
  const test = { stage: 0, tries: 0, shown: [], gap: null, picked: new Set() };

  function questions() {
    const { m, e, exp } = work();
    return [
      { ask: `The exponent bits are <b class="e">${e.join("")}</b>. What number is that?`, ph: "e.g. 2" },
      { ask: `The exponent is <b class="e">${fmt(exp)}</b>. Click the gap where the binary point should go.` },
      { ask: `Click the place values above each <b class="m">1</b> to add them up.` },
    ];
  }

  const parseNum = (s) => {
    s = s.trim().replace(/[−–]/g, "-").replace(/\s/g, "");
    if (!s) return NaN;
    if (s.includes("/")) { const [a, b] = s.split("/").map(Number); return a / b; }
    return Number(s);
  };
  const same = (a, b) => Math.abs(a - b) < 1e-12;

  // Step 2 layout: spare copies of the sign bit on the left, then the mantissa.
  function pointLayout() {
    const { m, exp } = work();
    const spare = Math.max(4, -exp);
    return { digits: [...Array(spare).fill(m[0]), ...m], spare, start: spare + 1, answer: spare + 1 + exp, exp };
  }
  function movedText(gap) {
    const { start } = pointLayout(), d = gap - start, n = Math.abs(d);
    if (!d) return "The ring shows where the point starts. Click a gap to move it.";
    return `You've moved the point ${n} place${n === 1 ? "" : "s"} ${d > 0 ? "right" : "left"}.`;
  }
  // Step 3: the place values the student has clicked
  function totalText() {
    const { digits, intLen } = work();
    const picked = [...test.picked].sort((a, b) => a - b);
    if (!picked.length) return "Your total: 0";
    const w = picked.map((i) => (i === 0 ? -1 : 1) * 2 ** (intLen - 1 - i));
    const sum = w.reduce((a, b) => a + b, 0);
    return `Your total: ${w.map((x, k) => (k === 0 ? fmt(x) : ` + ${fmt(x)}`)).join("")} = ${fmt(sum)}`;
  }

  // Returns [correct?, feedback]
  function mark(stage, raw) {
    const { e, exp, value, digits, intLen } = work();
    if (stage === 0) {
      const x = parseNum(raw);
      if (Number.isNaN(x)) return [false, "Type a whole number, like 2 or −3."];
      if (x === exp) return [true, `Yes! ${e.join("")} = ${fmt(exp)}.`];
      const unsigned = e.reduce((v, b, i) => v + b * 2 ** (E - 1 - i), 0);
      if (x === unsigned) return [false, "Careful: the first exponent bit is worth −8, not +8."];
      return [false, "Add up the numbers above each exponent bit that is a 1."];
    }
    if (stage === 1) {
      const { start, answer } = pointLayout(), gap = test.gap, n = Math.abs(exp);
      if (gap === answer) return [true, "Yes! The point is in the right place."];
      if (gap === start) return [false, "The point hasn't moved yet. The exponent tells you how far to move it."];
      if (exp !== 0 && gap === start - exp) return [false, `Wrong way! ${exp > 0 ? "A positive exponent moves the point right." : "A negative exponent moves the point left."}`];
      if (exp === 0) return [false, "The exponent is 0, so the point stays where it started."];
      return [false, `Count again: move it exactly ${n} place${n === 1 ? "" : "s"} ${exp > 0 ? "right" : "left"}.`];
    }
    const sum = [...test.picked].reduce((a, i) => a + (i === 0 ? -1 : 1) * 2 ** (intLen - 1 - i), 0);
    if (same(sum, value)) return [true, `Correct! The speed is ${fmt(value)}.`];
    const zero = [...test.picked].find((i) => !digits[i]);
    if (zero !== undefined) return [false, `There's a 0 under ${label((zero === 0 ? -1 : 1) * 2 ** (intLen - 1 - zero))}, so don't add that one.`];
    if (digits[0] && !test.picked.has(0)) return [false, "You've missed the leftmost column. It's negative, but it still counts."];
    return [false, "You've missed a column with a 1 under it."];
  }

  function activeBody(i) {
    const q = questions()[i];
    const buttons = `<div class="ans-row"><button type="button" class="btn primary check-step" data-stage="${i}">Check</button>
      <button type="button" class="btn showme" ${test.tries < 2 ? "hidden" : ""}>Show me</button></div>`;
    if (i === 0) {
      return `<p>${q.ask}</p><form class="ans-row" data-stage="0" autocomplete="off">
          <label for="ans-0" class="sr-only">Answer for step 1</label>
          <input id="ans-0" placeholder="${q.ph}">
          <button type="submit" class="btn primary">Check</button>
          <button type="button" class="btn showme" ${test.tries < 2 ? "hidden" : ""}>Show me</button>
        </form>`;
    }
    if (i === 1) {
      const { digits, spare, start } = pointLayout();
      if (test.gap == null) test.gap = start;
      let row = "";
      digits.forEach((d, k) => {
        row += `<span class="d${k < spare ? " spare" : ""}">${d}</span>`;
        if (k < digits.length - 1) {
          const g = k + 1;
          row += `<button type="button" class="gap${g === test.gap ? " on" : ""}${g === start ? " start" : ""}" data-gap="${g}" aria-label="Put the point after digit ${g}"></button>`;
        }
      });
      return `<p>${q.ask}</p><div class="slots-wrap"><div class="slots">${row}</div></div>
        <p class="note" id="moved">${movedText(test.gap)}</p>
        <p class="note">Faded digits are spare copies of the sign bit, for when the point moves left.</p>${buttons}`;
    }
    const { digits, intLen } = work();
    const w = digits.map((_, k) => (k === 0 ? -1 : 1) * 2 ** (intLen - 1 - k));
    const head = w.map((x, k) => `<th class="${k === intLen ? "after-pt" : ""}"><button type="button" class="pvbtn${x < 0 ? " neg" : ""}${test.picked.has(k) ? " on" : ""}" data-col="${k}" aria-pressed="${test.picked.has(k)}">${label(x)}</button></th>`).join("");
    const row = digits.map((d, k) => `<td class="${d ? "" : "off"}${k === intLen ? " after-pt" : ""}">${d}</td>`).join("");
    return `<p>${q.ask}</p><div class="tbl-wrap"><table class="pick"><tr>${head}</tr><tr>${row}</tr></table></div>
      <p class="calc" id="running">${totalText()}</p>${buttons}`;
  }

  function renderTest() {
    const worked = steps();
    stepsEl.innerHTML = worked.map((s, i) => {
      if (i < test.stage) {
        const tag = test.shown[i] ? `<span class="tag shown">shown</span>` : `<span class="tag ok">✓</span>`;
        return `<li class="step done"><h2>${s.t} ${tag}</h2>${s.h}</li>`;
      }
      if (i > test.stage) return `<li class="step locked"><h2>${s.t}</h2><p class="note">Unlocks when you finish step ${i}.</p></li>`;
      return `<li class="step active"><h2>${s.t}</h2>${activeBody(i)}<p class="msg" id="msg-${i}"></p></li>`;
    }).join("");
    if (test.stage >= worked.length) {
      stepsEl.insertAdjacentHTML("beforeend", `<li class="finish"><p class="msg ok">${test.shown.some(Boolean) ? "Done. Try another one without using Show me." : "All three steps right. Watch the needle go!"}</p><button type="button" class="btn primary" id="again">New question</button></li>`);
    }
    slidePoint();
    const input = $("#ans-0");
    if (input && test.stage === 0) input.focus({ preventScroll: true });
  }

  function advance(showed) {
    test.shown[test.stage] = showed;
    test.stage++;
    test.tries = 0;
    test.gap = null;
    test.picked = new Set();
    if (test.stage >= 3) { state.answered = true; render(); }
    else renderTest();
    stepsEl.querySelector(".step.active, .finish")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  function check(stage, raw) {
    const [ok, text] = mark(stage, raw);
    const li = stepsEl.querySelector(".step.active");
    const msg = $(`#msg-${stage}`);
    msg.textContent = text;
    msg.className = "msg " + (ok ? "ok" : "bad");
    if (ok) {
      li.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
      setTimeout(() => advance(false), reduceMotion ? 0 : 800);
      return;
    }
    test.tries++;
    if (test.tries >= 2) li.querySelector(".showme").hidden = false;
    li.querySelector("input")?.select();
  }

  const stepsEl = $("#steps");
  stepsEl.addEventListener("submit", (ev) => {
    ev.preventDefault();
    check(0, ev.target.querySelector("input").value);
  });
  stepsEl.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t.closest(".replay")) slidePoint();
    if (t.closest(".showme")) advance(true);
    if (t.closest("#again")) newQuestion();
    if (t.closest(".check-step")) check(+t.closest(".check-step").dataset.stage);
    const gap = t.closest(".gap");
    if (gap && !gap.disabled) {
      test.gap = +gap.dataset.gap;
      stepsEl.querySelectorAll(".gap").forEach((g) => g.classList.toggle("on", g === gap));
      $("#moved").textContent = movedText(test.gap);
    }
    const pv = t.closest(".pvbtn");
    if (pv && !pv.disabled) {
      const k = +pv.dataset.col;
      test.picked.has(k) ? test.picked.delete(k) : test.picked.add(k);
      pv.classList.toggle("on", test.picked.has(k));
      pv.setAttribute("aria-pressed", String(test.picked.has(k)));
      $("#running").textContent = totalText();
    }
  });

  function renderSteps() {
    if (state.testing) return renderTest();
    stepsEl.innerHTML = steps().map((s) => `<li class="step"><h2>${s.t}</h2>${s.h}</li>`).join("");
    slidePoint();
  }
  function slidePoint() {
    stepsEl.querySelectorAll(".shift").forEach((sh) => {
      const pt = sh.querySelector(".shift-pt"), cw = sh.querySelector("span").getBoundingClientRect().width || 32;
      const from = +sh.dataset.from, to = +sh.dataset.to;
      pt.style.transition = "none";
      pt.style.transform = `translateX(${from * cw}px)`;
      void pt.offsetWidth;
      pt.style.transition = reduceMotion ? "none" : `transform ${0.4 + 0.3 * Math.abs(to - from)}s ease-in-out .4s`;
      pt.style.transform = `translateX(${to * cw}px)`;
    });
  }

  /* ---------- render ---------- */
  function render() {
    const v = decode(state.bits).value, h = hidden();
    state.bits.forEach((b, i) => {
      const el = $("#bit-" + i);
      el.textContent = b;
      el.setAttribute("aria-pressed", String(!!b));
      el.disabled = state.testing;
    });
    const rev = !h && v < 0;
    $("#val").textContent = h ? "?" : fmt(v);
    $("#val").setAttribute("class", "d-val" + (rev ? " rev" : ""));
    $("#dir").textContent = h ? "WORK IT OUT" : v === 0 ? "STOPPED" : rev ? "REVERSE" : "FORWARD";
    $("#dir").setAttribute("class", "d-dir" + (rev ? " rev" : ""));
    needle.setAttribute("class", "d-needle" + (rev ? " rev" : ""));
    prog.setAttribute("class", "d-prog" + (rev ? " rev" : ""));
    $("#live").textContent = h ? "" : `Speed ${fmt(v)}`;
    $("#quiz").hidden = !state.testing;
    $("#random").textContent = state.testing ? "Stop testing" : "Random speed";
    $("#test").textContent = state.testing ? "New question" : "Test me";
    syncCustom();
    renderSteps();
  }

  /* ---------- buttons ---------- */
  function newQuestion() {
    state.testing = true;
    state.answered = false;
    state.bits = randomBits();
    test.stage = 0; test.tries = 0; test.shown = []; test.gap = null; test.picked = new Set();
    render();
  }
  $("#random").addEventListener("click", () => {
    if (state.testing) state.testing = false;
    else state.bits = randomBits();
    render();
  });
  $("#test").addEventListener("click", newQuestion);

  /* ---------- custom speed calculator ---------- */
  const cMant = $("#c-mant"), cExp = $("#c-exp"), cMsg = $("#c-msg");
  function syncCustom() {
    $("#custom").hidden = state.testing;
    // don't overwrite what the student is typing
    if (document.activeElement === cMant || document.activeElement === cExp) return;
    cMant.value = state.bits.slice(0, M).join("");
    cExp.value = state.bits.slice(M).join("");
    describeCustom();
  }
  function describeCustom(note = "") {
    const { m, value } = decode(state.bits);
    const norm = m.every((b) => b === 0) ? "zero" : m[0] !== m[1] ? "normalised" : "not normalised: the first two mantissa bits are the same";
    cMsg.textContent = `${note}Speed = ${fmt(value)} (${norm}).`;
    cMsg.className = "msg " + (norm.startsWith("not") ? "warn" : "ok");
  }
  function onCustomInput(ev) {
    const el = ev.target;
    const clean = el.value.replace(/[^01]/g, "");
    if (clean !== el.value) {
      el.value = clean;
      cMsg.textContent = "Only 0s and 1s, please.";
      cMsg.className = "msg bad";
      return;
    }
    const mv = cMant.value, ev2 = cExp.value;
    if (!mv) { cMsg.textContent = "Type the mantissa bits."; cMsg.className = "msg"; return; }
    if (ev2.length !== E) {
      cMsg.textContent = `The exponent needs ${E} bits (you've typed ${ev2.length}).`;
      cMsg.className = "msg";
      return;
    }
    state.bits = [...mv.padEnd(M, "0"), ...ev2].map(Number);
    render();
    describeCustom(mv.length < M ? `Mantissa padded with 0s to ${mv.padEnd(M, "0")}. ` : "");
  }
  cMant.addEventListener("input", onCustomInput);
  cExp.addEventListener("input", onCustomInput);

  render();
  requestAnimationFrame(frame);
})();
