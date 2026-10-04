/* Light-Speed Float — Normalising.
   Denary → normalised floating point (8-bit mantissa, 4-bit exponent,
   both two's complement), with supports students remove one at a time. */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const M = 8, E = 4;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Supports in the order they are removed. `level` = how many are still on.
  const SUPPORTS = [
    { name: "Hints", what: "an explanation under each step" },
    { name: "Place-value helpers", what: "click columns instead of typing binary" },
    { name: "Point mover and flip helper", what: "click where the point goes; see the flipped bits" },
    { name: "Step-by-step boxes", what: "the problem split into small steps" },
  ];
  const LEVEL_NAMES = ["On your own", "Steps only", "Helpers removed", "Hints removed", "Full support"];
  let level = 4;
  try { const s = localStorage.getItem("lsf-support"); if (s !== null && +s >= 0 && +s <= 4) level = +s; } catch (_) { /* storage blocked */ }
  const on = {
    get hints() { return level >= 4; },
    get pv() { return level >= 3; },
    get mover() { return level >= 2; },
    get steps() { return level >= 1; },
  };

  /* ---------- maths ---------- */
  const fmt = (v) => String(v).replace("-", "−");
  const label = (w) => (Math.abs(w) >= 1 ? fmt(w) : "1/" + 1 / w);
  const withPt = (s, n) => `${s.slice(0, n)}.${s.slice(n) || "0"}`;
  const same = (a, b) => Math.abs(a - b) < 1e-12;
  const parseNum = (s) => {
    s = s.trim().replace(/[−–]/g, "-").replace(/\s/g, "");
    if (!s) return NaN;
    if (s.includes("/")) { const [a, b] = s.split("/").map(Number); return a / b; }
    return Number(s);
  };
  // "0101.1" → { plain: 5.5, twos: 5.5 }; "1010.1" → { plain: 10.5, twos: −5.5 }
  function parseBin(s) {
    s = s.trim().replace(/\s/g, "");
    if (!/^[01]*\.?[01]*$/.test(s) || !/[01]/.test(s)) return null;
    const [i = "", f = ""] = s.split(".");
    const plain = [...(i + f)].reduce((v, b, k) => v + +b * 2 ** (i.length - 1 - k), 0);
    return { plain, twos: i[0] === "1" ? plain - 2 ** i.length : plain, int: i, frac: f };
  }

  // Everything about converting v, or null if 8|4 bits can't hold it exactly.
  function plan(v) {
    if (!Number.isFinite(v) || v === 0) return null;
    const neg = v < 0, a = Math.abs(v);
    let f = 0;
    while (!Number.isInteger(a * 2 ** f)) if (++f > 16) return null;
    const N = a * 2 ** f;
    let P = N.toString(2).padStart(f + 1, "0");
    if (P.length - f > 1 || P[0] === "1") P = "0" + P; // a 0 sign bit in front
    const W = P.length, n = W - f;
    const flipped = [...P].map((c) => (c === "1" ? "0" : "1")).join("");
    const Neg = (2 ** W - N).toString(2).padStart(W, "0");
    const D = neg ? Neg : P;
    const Dp = D + "0".repeat(M + 2);
    let k = 0;
    while (Dp[k] === Dp[k + 1]) k++;
    const exp = n - (k + 1);
    const sig = D.slice(k).replace(/0+$/, "") || D[k];
    if (sig.length > M || exp > 7 || exp < -8) return null;
    const parts = [];
    for (let p = Math.floor(Math.log2(a)); p >= -f; p--) if (Math.floor(a / 2 ** p) % 2 === 1) parts.push(2 ** p);
    return {
      v, neg, a, f, P, n, flipped, Neg, D, k, exp, sig, parts,
      mant: Dp.slice(k, k + M),
      expBits: ((exp + 16) % 16).toString(2).padStart(E, "0"),
    };
  }
  function randomTarget() {
    for (;;) {
      const s = Math.random() < 0.65 ? 0 : 1;
      const bits = [s, 1 - s];
      const used = 2 + Math.floor(Math.random() * 3);
      for (let i = 2; i < M; i++) bits.push(i < 2 + used && Math.random() < 0.5 ? 1 : 0);
      const mant = bits.reduce((v, b, i) => v + b * (i ? 1 : -1) * 2 ** -i, 0);
      const exp = Math.floor(Math.random() * 8) - 3;
      const p = plan(mant * 2 ** exp);
      if (p && p.f <= 5 && p.a < 32 && (!q.p || p.v !== q.p.v)) return p;
    }
  }

  /* ---------- question state ---------- */
  const q = { p: null, stage: 0, tries: 0, shown: [], cols: new Set(), gap: null, ebits: [0, 0, 0, 0] };
  const stepIds = () => (!on.steps ? ["solo"] : q.p.neg ? ["sign", "bin", "twos", "norm", "exp", "final"] : ["sign", "bin", "norm", "exp", "final"]);
  function resetProgress() {
    q.stage = 0; q.tries = 0; q.shown = []; q.cols = new Set(); q.gap = null; q.ebits = [0, 0, 0, 0];
  }
  function setTarget(p) {
    q.p = p;
    resetProgress();
    $("#target-val").textContent = fmt(p.v);
    $("#target-val").classList.toggle("neg", p.neg);
    render();
  }

  /* ---------- helpers drawn inside steps ---------- */
  function builderCols() {
    const { a, f } = q.p;
    const hi = Math.max(4, Math.floor(Math.log2(a))), lo = Math.max(5, f);
    const cols = [];
    for (let p = hi; p >= -lo; p--) cols.push(2 ** p);
    return cols;
  }
  const builderTotal = () => builderCols().reduce((s, w, i) => s + (q.cols.has(i) ? w : 0), 0);
  function builderHTML() {
    const cols = builderCols();
    const cells = cols.map((w, i) =>
      `<button type="button" class="colbtn${q.cols.has(i) ? " on" : ""}${w === 0.5 ? " first-frac" : ""}" data-col="${i}" aria-pressed="${q.cols.has(i)}"><span>${label(w)}</span><b>${q.cols.has(i) ? 1 : 0}</b></button>`).join("");
    return `<div class="builder-wrap"><div class="builder">${cells}</div></div>
      <p class="calc" id="builder-total">Total: ${fmt(builderTotal())}</p>`;
  }
  function moverHTML() {
    const { D, n } = q.p;
    if (q.gap == null) q.gap = n;
    let row = "";
    [...D].forEach((d, i) => {
      row += `<span class="d${i < spareBefore(q.gap) ? " spare" : ""}" data-i="${i}">${d}</span>`;
      if (i < D.length - 1) row += `<button type="button" class="gap${i + 1 === q.gap ? " on" : ""}${i + 1 === n ? " start" : ""}" data-gap="${i + 1}" aria-label="Put the point after digit ${i + 1}"></button>`;
    });
    return `<div class="slots-wrap"><div class="slots" id="slots">${row}</div></div><p class="note" id="mover-text">${moverText()}</p>`;
  }
  // With the point after digit g, which digits are spare sign-bit copies, and how does it read?
  const spareBefore = (g) => Math.min(g - 1, q.p.k);
  const readsAt = (g) => { const s = spareBefore(g); return withPt(q.p.D.slice(s), g - s); };
  function moverText() {
    const { n } = q.p, g = q.gap, d = n - g, num = Math.abs(d);
    const reads = readsAt(g);
    const moved = d === 0 ? "The ring shows where the point starts." : `Moved ${num} place${num === 1 ? "" : "s"} ${d > 0 ? "left" : "right"}.`;
    return `${moved} Reads as <b class="m">${reads}</b>${spareBefore(g) > 0 ? " (faded digits are spare copies of the sign bit, so drop them)" : ""}.`;
  }
  function ebitsHTML() {
    const w = [-8, 4, 2, 1];
    const total = q.ebits.reduce((s, b, i) => s + b * w[i], 0);
    return `<div class="ebits">${w.map((x, i) => `<button type="button" class="colbtn e${q.ebits[i] ? " on" : ""}${x < 0 ? " negcol" : ""}" data-ebit="${i}" aria-pressed="${!!q.ebits[i]}"><span>${fmt(x)}</span><b>${q.ebits[i]}</b></button>`).join("")}</div>
      <p class="calc" id="ebits-total">Exponent bits make: ${fmt(total)}</p>`;
  }

  /* ---------- the steps ---------- */
  function def(id) {
    const p = q.p;
    const start = p.neg ? "1.0" : "0.1";
    const normStr = withPt(p.sig.length > 1 ? p.sig : p.sig + "0", 1);
    const moveWords = p.exp > 0 ? `${p.exp} place${p.exp === 1 ? "" : "s"} left` : p.exp < 0 ? `${-p.exp} place${p.exp === -1 ? "" : "s"} right` : "nowhere";
    switch (id) {
      case "sign": return {
        t: "Positive or negative?",
        hint: "A minus sign means negative. Work with the size first and deal with the sign later.",
        body: () => `<div class="row"><button type="button" class="btn choice" data-sign="pos">Positive</button><button type="button" class="btn choice" data-sign="neg">Negative</button></div>`,
        done: () => `<p>${p.neg ? `<b class="neg">Negative</b>. Work with ${fmt(p.a)} first, then make it negative.` : `<b class="pos">Positive</b>, so the sign bit is 0.`}</p>`,
      };
      case "bin": return {
        t: `Write ${fmt(p.a)} in binary`,
        hint: "Start with the biggest place value that fits, take it away, then repeat with what's left.",
        body: () => on.pv ? builderHTML() : `<div class="ans-row"><label for="in-bin" class="sr-only">${fmt(p.a)} in binary</label><input id="in-bin" class="typed" placeholder="e.g. 101.1"></div>`,
        check: () => {
          const x = on.pv ? builderTotal() : parseBin($("#in-bin").value)?.plain;
          if (x == null) return [false, "Use only 0, 1 and a point, like 101.1"];
          if (same(x, p.a)) return [true, `Yes! ${fmt(p.a)} = ${p.parts.map(fmt).join(" + ")}.`];
          return [false, x > p.a ? `That makes ${fmt(x)}, which is too big.` : `That makes ${fmt(x)}, which is too small.`];
        },
        done: () => `<p class="calc">${fmt(p.a)} = ${p.parts.map(fmt).join(" + ")}</p><p>With a 0 sign bit in front: <b class="m mono">${withPt(p.P, p.n)}</b></p>`,
      };
      case "twos": return {
        t: "Make it negative (two's complement)",
        hint: "Flip every bit (0 ↔ 1), then add 1 in the rightmost column, carrying like normal addition.",
        body: () => `<p>Start with <b class="m mono">${withPt(p.P, p.n)}</b>. Flip every bit, add 1, and type the result.</p>
          ${on.mover ? `<p class="helper">Flipped for you: <b class="mono">${withPt(p.flipped, p.n)}</b>. Now add 1 to the last digit.</p>` : ""}
          <div class="ans-row"><label for="in-twos" class="sr-only">Two's complement</label><input id="in-twos" class="typed" placeholder="e.g. 1010.1"></div>`,
        check: () => {
          const b = parseBin($("#in-twos").value);
          if (!b) return [false, "Use only 0, 1 and a point."];
          if (same(b.twos, p.v)) return [true, "Yes! That's the negative version."];
          if (same(b.plain, parseInt(p.flipped, 2) / 2 ** p.f)) return [false, "You've flipped the bits. Now add 1 to the last digit."];
          if (same(b.twos, p.a) || same(b.plain, p.a)) return [false, "That's still positive. Flip every bit, then add 1."];
          return [false, "Check the flip, then add 1 in the rightmost column."];
        },
        done: () => `<p class="calc mono">${withPt(p.P, p.n)} <span class="arrow">flip</span> ${withPt(p.flipped, p.n)} <span class="arrow">+1</span> <b class="m">${withPt(p.Neg, p.n)}</b></p>`,
      };
      case "norm": return {
        t: "Normalise: move the point",
        hint: `A normalised ${p.neg ? "negative" : "positive"} number starts <b>${start}</b>. Slide the point until it does. Extra copies of the sign bit at the front get dropped.`,
        body: () => `<p>Your number: <b class="m mono">${withPt(p.D, p.n)}</b>. ${on.mover ? `Click the gap where the point should go so it reads <b>${start}…</b>` : `Type it normalised, so it starts <b>${start}</b>.`}</p>
          ${on.mover ? moverHTML() : `<div class="ans-row"><label for="in-norm" class="sr-only">Normalised mantissa</label><input id="in-norm" class="typed" placeholder="e.g. ${start}11"></div>`}`,
        check: () => {
          if (on.mover) {
            if (q.gap === p.k + 1) return [true, `Yes! It reads ${normStr}.`];
            const reads = readsAt(q.gap);
            if (q.gap === p.n) return [false, "The point hasn't moved yet."];
            if (reads.slice(0, 3) !== start) return [false, `It reads ${reads}. It needs to start ${start}.`];
            return [false, "Not quite: keep moving the point."];
          }
          const raw = $("#in-norm").value.trim().replace(/\s/g, "");
          if (!/^[01]\.[01]*$/.test(raw)) return [false, `Type it with the point after the first digit, like ${start}11`];
          const digits = raw.replace(".", "").replace(/0+$/, "") || raw[0];
          if (raw.slice(0, 3).padEnd(3, "0") !== start) return [false, `Not normalised yet: it must start ${start}.`];
          if (digits === p.sig || digits + "0" === p.sig + "0") return [true, `Yes! ${normStr}.`];
          return [false, "Keep the same digits in the same order. Only the point moves, and spare sign bits at the front are dropped."];
        },
        done: () => `<p class="calc mono">${withPt(p.D, p.n)} <span class="arrow">→</span> <b class="m">${normStr}</b></p><p class="note">The point moved ${moveWords}.</p>`,
      };
      case "exp": return {
        t: "Count the moves: the exponent",
        hint: "The exponent undoes the move. If the point moved left, you'd move it back right to undo it, so the exponent is positive. Moved right → negative.",
        body: () => `<p>The point went from <b class="mono">${withPt(p.D, p.n)}</b> to <b class="m mono">${normStr}</b>${on.mover ? `: it moved <b>${moveWords}</b>` : ""}. What's the exponent in denary?</p>
          <div class="ans-row"><label for="in-exp" class="sr-only">Exponent</label><input id="in-exp" class="typed" placeholder="e.g. 3 or −2"></div>`,
        check: () => {
          const x = parseNum($("#in-exp").value);
          if (Number.isNaN(x)) return [false, "Type a whole number, like 3 or −2."];
          if (x === p.exp) return [true, `Yes! The exponent is ${fmt(p.exp)}.`];
          if (x === -p.exp) return [false, "Right number, wrong sign. Moved left → positive. Moved right → negative."];
          return [false, "Count how many places the point moved."];
        },
        done: () => `<p>Exponent = <b class="e">${fmt(p.exp)}</b> (the point moved ${moveWords}).</p>`,
      };
      case "final": return {
        t: "Write the 8-bit mantissa and 4-bit exponent",
        hint: `Pad the mantissa with 0s on the right to make 8 bits (no point). Write ${fmt(p.exp)} in 4-bit two's complement: the first column is worth −8.`,
        body: () => `<p>Mantissa from <b class="m mono">${normStr}</b>, exponent <b class="e">${fmt(p.exp)}</b>.</p>
          <div class="custom-row">
            <label class="field mfield" for="in-mant"><span>Mantissa · 8 bits</span><input id="in-mant" maxlength="8" autocomplete="off" spellcheck="false" placeholder="01011000"></label>
            ${on.pv ? `<div class="field efield"><span>Exponent · 4 bits</span>${ebitsHTML()}</div>`
              : `<label class="field efield" for="in-ebits"><span>Exponent · 4 bits</span><input id="in-ebits" maxlength="4" autocomplete="off" spellcheck="false" placeholder="0011"></label>`}
          </div>`,
        check: () => {
          const mv = $("#in-mant").value.trim(), ev = on.pv ? q.ebits.join("") : $("#in-ebits").value.trim();
          if (!/^[01]*$/.test(mv) || !/^[01]*$/.test(ev)) return [false, "Use only 0s and 1s."];
          if (mv !== p.mant) {
            if (mv.length < M && mv.padEnd(M, "0") === p.mant) return [false, "Right digits. Now pad with 0s on the right to make 8 bits."];
            return [false, `The mantissa is the digits of ${normStr} without the point, padded to 8 bits.`];
          }
          if (ev !== p.expBits) return [false, `The mantissa is right. The exponent bits need to make ${fmt(p.exp)}.`];
          return [true, "Yes! That's the normalised number."];
        },
        done: () => `<p class="calc mono"><b class="m">${p.mant}</b> <b class="e">${p.expBits}</b></p>`,
      };
      case "solo": return {
        t: `Write ${fmt(p.v)} as a normalised floating point number`,
        hint: "",
        body: () => `<div class="custom-row">
            <label class="field mfield" for="in-mant"><span>Mantissa · 8 bits</span><input id="in-mant" maxlength="8" autocomplete="off" spellcheck="false"></label>
            <label class="field efield" for="in-ebits"><span>Exponent · 4 bits</span><input id="in-ebits" maxlength="4" autocomplete="off" spellcheck="false"></label>
          </div>`,
        check: () => {
          const mv = $("#in-mant").value.trim(), ev = $("#in-ebits").value.trim();
          if (!/^[01]{8}$/.test(mv) || !/^[01]{4}$/.test(ev)) return [false, "Type exactly 8 mantissa bits and 4 exponent bits."];
          const twos = (s) => [...s].reduce((v, b, i) => v + +b * (i ? 1 : -1) * 2 ** (s.length - 1 - i), 0);
          const val = (twos(mv) / 2 ** (M - 1)) * 2 ** twos(ev);
          if (same(val, p.v) && mv[0] !== mv[1]) return [true, "Correct, and normalised!"];
          if (same(val, p.v)) return [false, "Right value, but not normalised: the first two mantissa bits must be different."];
          return [false, `Your bits make ${fmt(val)}, not ${fmt(p.v)}. Add a support back if you're stuck.`];
        },
        done: () => `<p class="calc mono"><b class="m">${p.mant}</b> <b class="e">${p.expBits}</b></p>`,
      };
    }
  }

  /* ---------- rendering ---------- */
  const stepsEl = $("#steps");
  function render() {
    // support ladder
    $("#level-name").textContent = LEVEL_NAMES[level];
    $("#ladder").innerHTML = SUPPORTS.map((s, i) => {
      const isOn = level > 3 - i; // removed in order: index 0 first
      return `<li class="${isOn ? "on" : "off"}"><b>${s.name}</b><span>${isOn ? s.what : "removed"}</span></li>`;
    }).join("");
    $("#less").disabled = level === 0;
    $("#more").disabled = level === 4;

    const ids = stepIds();
    stepsEl.innerHTML = ids.map((id, i) => {
      const d = def(id);
      if (i < q.stage) {
        const tag = q.shown[i] ? `<span class="tag shown">shown</span>` : `<span class="tag ok">✓</span>`;
        return `<li class="step done"><h2>${d.t} ${tag}</h2>${d.done()}</li>`;
      }
      if (i > q.stage) return `<li class="step locked"><h2>${d.t}</h2></li>`;
      const showme = id === "sign" ? "" : `<button type="button" class="btn showme" ${q.tries < 2 ? "hidden" : ""}>Show me</button>`;
      const check = id === "sign" ? "" : `<div class="row"><button type="button" class="btn primary" data-check>Check</button>${showme}</div>`;
      return `<li class="step active">${ids.length > 1 ? `<h2>${d.t}</h2>` : `<h2 class="solo">${d.t}</h2>`}
        ${on.hints && d.hint ? `<p class="hint">${d.hint}</p>` : ""}${d.body()}${check}<p class="msg" id="step-msg"></p></li>`;
    }).join("");
    stepsEl.classList.toggle("solo-mode", ids.length === 1);

    if (q.stage >= ids.length) {
      const p = q.p, helped = q.shown.some(Boolean);
      const nudge = helped ? "Try another one without Show me." : level > 0 ? "No help needed. Ready to remove a support?" : "Done on your own. Brilliant!";
      stepsEl.insertAdjacentHTML("beforeend", `<li class="finish"><div><p class="msg ok">${fmt(p.v)} = <span class="m mono">${p.mant}</span> <span class="e mono">${p.expBits}</span></p><p class="note">${nudge}</p></div>
        <div class="row">${!helped && level > 0 ? `<button type="button" class="btn" id="finish-less">Remove a support</button>` : ""}<button type="button" class="btn primary" id="again">New number</button></div></li>`);
    }
    stepsEl.querySelector(".step.active input")?.focus({ preventScroll: true });
  }

  function msg(text, ok) { const el = $("#step-msg"); el.textContent = text; el.className = "msg " + (ok ? "ok" : "bad"); }
  function advance(showed) {
    q.shown[q.stage] = showed;
    q.stage++;
    q.tries = 0;
    render();
    stepsEl.querySelector(".step.active, .finish")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }
  function pass(text) {
    msg(text, true);
    stepsEl.querySelectorAll(".step.active button, .step.active input").forEach((el) => (el.disabled = true));
    setTimeout(() => advance(false), reduceMotion ? 0 : 800);
  }
  function fail(text) {
    msg(text, false);
    q.tries++;
    if (q.tries >= 2) { const s = stepsEl.querySelector(".showme"); if (s) s.hidden = false; }
  }

  stepsEl.addEventListener("click", (ev) => {
    const t = ev.target;
    const id = stepIds()[q.stage];
    const sign = t.closest("[data-sign]");
    if (sign) {
      const right = (sign.dataset.sign === "neg") === q.p.neg;
      right ? pass(q.p.neg ? "Yes, negative." : "Yes, positive.") : fail("Look again: is there a minus sign?");
      return;
    }
    if (t.closest("[data-check]")) {
      const [ok, text] = def(id).check();
      ok ? pass(text) : fail(text);
      return;
    }
    if (t.closest(".showme")) { advance(true); return; }
    if (t.closest("#again")) { setTarget(randomTarget()); return; }
    if (t.closest("#finish-less")) { changeLevel(-1); return; }
    const col = t.closest("[data-col]");
    if (col && !col.disabled) {
      const i = +col.dataset.col;
      q.cols.has(i) ? q.cols.delete(i) : q.cols.add(i);
      col.classList.toggle("on", q.cols.has(i));
      col.setAttribute("aria-pressed", String(q.cols.has(i)));
      col.querySelector("b").textContent = q.cols.has(i) ? 1 : 0;
      $("#builder-total").textContent = `Total: ${fmt(builderTotal())}`;
      return;
    }
    const gap = t.closest(".gap");
    if (gap && !gap.disabled) {
      q.gap = +gap.dataset.gap;
      stepsEl.querySelectorAll(".gap").forEach((g) => g.classList.toggle("on", g === gap));
      stepsEl.querySelectorAll("#slots .d").forEach((d) => d.classList.toggle("spare", +d.dataset.i < spareBefore(q.gap)));
      $("#mover-text").innerHTML = moverText();
      return;
    }
    const eb = t.closest("[data-ebit]");
    if (eb && !eb.disabled) {
      const i = +eb.dataset.ebit;
      q.ebits[i] ^= 1;
      eb.classList.toggle("on", !!q.ebits[i]);
      eb.setAttribute("aria-pressed", String(!!q.ebits[i]));
      eb.querySelector("b").textContent = q.ebits[i];
      const total = q.ebits.reduce((s, b, k) => s + b * [-8, 4, 2, 1][k], 0);
      $("#ebits-total").textContent = `Exponent bits make: ${fmt(total)}`;
    }
  });
  // Enter in a typed box = Check
  stepsEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.matches("input")) { ev.preventDefault(); stepsEl.querySelector("[data-check]")?.click(); }
  });

  /* ---------- support level ---------- */
  function changeLevel(d) {
    level = Math.max(0, Math.min(4, level + d));
    try { localStorage.setItem("lsf-support", String(level)); } catch (_) { /* storage blocked */ }
    resetProgress();
    render();
  }
  $("#less").addEventListener("click", () => changeLevel(-1));
  $("#more").addEventListener("click", () => changeLevel(1));

  /* ---------- targets ---------- */
  $("#new").addEventListener("click", () => { $("#own-msg").textContent = ""; setTarget(randomTarget()); });
  $("#own-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const out = $("#own-msg");
    const v = parseNum($("#own").value);
    if (Number.isNaN(v)) { out.textContent = "Type a denary number, like 6.75 or −0.375."; out.className = "msg bad"; return; }
    if (v === 0) { out.textContent = "0 can't be normalised: there's no 1 to line up. Try another number."; out.className = "msg bad"; return; }
    const p = plan(v);
    if (!p) { out.textContent = `${fmt(v)} can't be stored exactly with an 8-bit mantissa and 4-bit exponent. Try a number with fewer binary digits.`; out.className = "msg bad"; return; }
    out.textContent = `Now normalising ${fmt(v)}.`;
    out.className = "msg ok";
    setTarget(p);
  });

  setTarget(plan(5.5));
})();
