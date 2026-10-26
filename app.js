/* CSS Units — plain arithmetic, 96 CSS px per inch as the CSS spec defines. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;

  var UNITS = [
    ["px", "Pixels"], ["rem", "Root em"], ["em", "Parent em"], ["%", "Percent of parent font"], ["pt", "Points"],
    ["vw", "Viewport width"], ["vh", "Viewport height"], ["vmin", "Viewport min"], ["vmax", "Viewport max"],
    ["pc", "Picas"], ["in", "Inches"], ["cm", "Centimetres"], ["mm", "Millimetres"]
  ];
  // How many px one unit is, in a given context {root, parent, vw, vh}
  function perUnit(u, c) {
    switch (u) {
      case "px": return 1;
      case "rem": return c.root;
      case "em": return c.parent;
      case "%": return c.parent / 100;
      case "pt": return 96 / 72;
      case "pc": return 16;
      case "in": return 96;
      case "cm": return 96 / 2.54;
      case "mm": return 96 / 25.4;
      case "vw": return c.vw / 100;
      case "vh": return c.vh / 100;
      case "vmin": return Math.min(c.vw, c.vh) / 100;
      case "vmax": return Math.max(c.vw, c.vh) / 100;
    }
    return NaN;
  }
  function convert(v, from, to, c) { return v * perUnit(from, c) / perUnit(to, c); }
  function fmt(n, d) {
    if (!isFinite(n)) return "—";
    var s = (Math.round(n * Math.pow(10, d == null ? 4 : d)) / Math.pow(10, d == null ? 4 : d)).toString();
    return s === "-0" ? "0" : s;
  }

  // Fluid clamp(): linear from (minVp, minSize) to (maxVp, maxSize)
  function fluid(minSize, maxSize, minVp, maxVp, root, unit) {
    if (!(maxVp > minVp)) return { error: "“To viewport” must be larger than “From viewport”" };
    var slope = (maxSize - minSize) / (maxVp - minVp), intercept = minSize - slope * minVp;
    var lo = Math.min(minSize, maxSize), hi = Math.max(minSize, maxSize);
    var u = unit === "px" ? 1 : root, sfx = unit === "px" ? "px" : "rem";
    var mid = fmt(slope * 100) + "vw";
    if (Math.abs(intercept) > 1e-9) mid = fmt(intercept / u) + sfx + (slope >= 0 ? " + " + mid : " - " + fmt(-slope * 100) + "vw");
    if (Math.abs(intercept) > 1e-9 && intercept < 0) mid = fmt(slope * 100) + "vw - " + fmt(-intercept / u) + sfx;
    return {
      css: "clamp(" + fmt(lo / u) + sfx + ", " + mid + ", " + fmt(hi / u) + sfx + ")",
      at: function (vp) { return Math.min(hi, Math.max(lo, intercept + slope * vp)); },
      slope: slope, intercept: intercept
    };
  }

  // ================= UI =================
  var unitSel = $("#unit");
  UNITS.forEach(function (u) { unitSel.appendChild(S3.h("option", { value: u[0], text: u[0] + " — " + u[1] })); });
  var saved = S3.store("cu.state") || {};
  ["root", "parent", "vw", "vh", "val", "minSize", "maxSize", "minVp", "maxVp"].forEach(function (id) { if (saved[id] != null) $("#" + id).value = saved[id]; });
  unitSel.value = saved.unit || "px";
  var cunit = saved.cunit || "rem";

  function num(id, def) { var v = parseFloat($("#" + id).value); return isFinite(v) ? v : def; }
  function ctx() { return { root: num("root", 16) || 16, parent: num("parent", 16) || 16, vw: num("vw", 1440) || 1440, vh: num("vh", 900) || 900 }; }
  function save() {
    var s = { unit: unitSel.value, cunit: cunit };
    ["root", "parent", "vw", "vh", "val", "minSize", "maxSize", "minVp", "maxVp"].forEach(function (id) { s[id] = $("#" + id).value; });
    S3.store("cu.state", s);
  }

  function renderConvert() {
    var c = ctx(), v = num("val", NaN), from = unitSel.value, box = $("#res");
    box.innerHTML = "";
    UNITS.forEach(function (u) {
      var out = isFinite(v) ? fmt(convert(v, from, u[0], c)) + u[0] : "—";
      var b = S3.h("button", { "class": "cu-item" + (u[0] === from ? " is-src" : ""), type: "button", title: "Click to copy" }, [
        S3.h("span", { "class": "cu-v", text: out }), S3.h("span", { "class": "cu-k", text: u[1] })]);
      b.addEventListener("click", function () { if (isFinite(v)) { S3.copy(out); S3.done(); } });
      box.appendChild(b);
    });
  }

  function renderTable() {
    var c = ctx(), t = $("#tbl"), cols = ["px", "rem", "em", "pt", "vw", "%"];
    t.innerHTML = "";
    var head = S3.h("tr"); cols.forEach(function (k) { head.appendChild(S3.h("th", { text: k })); });
    t.appendChild(S3.h("thead", null, [head]));
    var tb = S3.h("tbody");
    [8, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96].forEach(function (px) {
      var tr = S3.h("tr");
      cols.forEach(function (k) {
        var txt = fmt(convert(px, "px", k, c), 3) + k;
        var td = S3.h("td", { "class": "mono" + (k === "px" ? " cu-strong" : ""), text: txt, title: "Click to copy" });
        td.addEventListener("click", function () { S3.copy(txt); });
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    $("#tblInfo").textContent = "root " + fmt(c.root) + "px · parent " + fmt(c.parent) + "px · viewport " + fmt(c.vw) + "px";
  }

  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var lastFluid = null;
  function renderClamp() {
    var c = ctx(), f = fluid(num("minSize", 16), num("maxSize", 32), num("minVp", 320), num("maxVp", 1280), c.root, cunit);
    var code = $("#clamp"), chart = $("#chart"), sample = $("#sample"), pv = +$("#pv").value;
    $$("#cunit button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === cunit)); });
    $("#pvLabel").textContent = pv + "px";
    chart.innerHTML = "";
    if (f.error) { code.textContent = f.error; code.classList.add("bad"); lastFluid = null; return; }
    code.classList.remove("bad"); lastFluid = f;
    code.textContent = "font-size: " + f.css + ";";
    var size = f.at(pv);
    sample.style.fontSize = size + "px";
    sample.title = fmt(size, 2) + "px at " + pv + "px wide";
    // chart: x = 320..1920 px viewport, y = size
    var X0 = 320, X1 = 1920, lo = Math.min(num("minSize", 16), num("maxSize", 32)), hi = Math.max(num("minSize", 16), num("maxSize", 32));
    var ymin = Math.max(0, lo - (hi - lo) * 0.25 - 1), ymax = hi + (hi - lo) * 0.25 + 1;
    function px(x) { return 40 + (x - X0) / (X1 - X0) * 548; }
    function py(y) { return 150 - (y - ymin) / (ymax - ymin) * 136; }
    chart.appendChild(svg("line", { x1: 40, y1: 150, x2: 588, y2: 150, "class": "cu-axis" }));
    [lo, hi].forEach(function (y) {
      chart.appendChild(svg("line", { x1: 40, y1: py(y), x2: 588, y2: py(y), "class": "cu-grid" }));
      var t = svg("text", { x: 34, y: py(y) + 4, "text-anchor": "end", "class": "cu-lbl" }); t.textContent = fmt(y, 1); chart.appendChild(t);
    });
    [320, 768, 1280, 1920].forEach(function (x) {
      var t = svg("text", { x: px(x), y: 166, "text-anchor": "middle", "class": "cu-lbl" }); t.textContent = x; chart.appendChild(t);
    });
    var d = "";
    for (var x = X0; x <= X1; x += 8) d += (d ? " L" : "M") + px(x).toFixed(1) + " " + py(f.at(x)).toFixed(1);
    chart.appendChild(svg("path", { d: d, "class": "cu-line" }));
    chart.appendChild(svg("line", { x1: px(pv), y1: 10, x2: px(pv), y2: 150, "class": "cu-now" }));
    chart.appendChild(svg("circle", { cx: px(pv), cy: py(size), r: 5, "class": "cu-dot" }));
    var lab = svg("text", { x: Math.min(px(pv) + 8, 520), y: Math.max(py(size) - 8, 18), "class": "cu-lbl cu-lbl-now" }); lab.textContent = fmt(size, 2) + "px"; chart.appendChild(lab);
  }

  function all() { save(); renderConvert(); renderTable(); renderClamp(); }
  $$("input").forEach(function (i) { i.addEventListener("input", i.id === "pv" ? renderClamp : all); });
  unitSel.addEventListener("change", function () {
    // keep the same length: re-express the value in the new unit
    var c = ctx(), prev = unitSel.dataset.prev || "px", v = num("val", NaN);
    if (isFinite(v)) $("#val").value = fmt(convert(v, prev, unitSel.value, c));
    unitSel.dataset.prev = unitSel.value; all();
  });
  unitSel.dataset.prev = unitSel.value;
  $$("#cunit button").forEach(function (b) { b.addEventListener("click", function () { cunit = b.dataset.v; save(); renderClamp(); }); });
  $("#copyClamp").addEventListener("click", function () { if (lastFluid) { S3.copy($("#clamp").textContent); S3.done(); } });

  window.S3_DEMO = function () { $("#pv").value = 960; renderClamp(); };

  window.S3_SELFTEST = function () {
    var fails = [], c = { root: 16, parent: 20, vw: 1440, vh: 900 };
    function eq(name, a, b) { if (a !== b) fails.push(name + ": got " + a + " want " + b); }
    eq("px→rem", fmt(convert(24, "px", "rem", c)), "1.5");
    eq("pt→px", fmt(convert(12, "pt", "px", c)), "16");
    eq("vw→px", fmt(convert(1, "vw", "px", c)), "14.4");
    eq("em uses parent", fmt(convert(1.5, "em", "px", c)), "30");
    eq("% of parent", fmt(convert(150, "%", "px", c)), "30");
    eq("in→cm", fmt(convert(1, "in", "cm", c)), "2.54");
    eq("vmin", fmt(convert(10, "vmin", "px", c)), "90");
    eq("rem→pt", fmt(convert(1, "rem", "pt", c)), "12");
    var f = fluid(16, 32, 320, 1280, 16, "rem");
    eq("clamp", f.css, "clamp(1rem, 0.6667rem + 1.6667vw, 2rem)");
    eq("clamp at 800", fmt(f.at(800)), "24");
    eq("clamp below", f.at(100), 16); eq("clamp above", f.at(5000), 32);
    eq("clamp px", fluid(16, 32, 320, 1280, 16, "px").css, "clamp(16px, 10.6667px + 1.6667vw, 32px)");
    eq("clamp negative intercept", fluid(10, 50, 600, 1000, 16, "rem").css, "clamp(0.625rem, 10vw - 3.125rem, 3.125rem)");
    eq("clamp shrinking", fluid(40, 20, 400, 1200, 16, "rem").css, "clamp(1.25rem, 3.125rem - 2.5vw, 2.5rem)");
    eq("bad range", !!fluid(16, 32, 900, 300, 16, "rem").error, true);
    return fails.length ? fails : true;
  };

  all();
})();
