/* Disk Heatmap hero demo: the app in miniature, driven by a script.
   Scan -> map -> hover -> zoom -> clean, on sample data for a made-up PC.
   The layout is the app's own squarified, nested treemap (src/lib.ts, src/Treemap.tsx).
   Shrinking the cleaned tile away is a dramatization: the real app updates the list and
   free space at once and redraws the map on the next scan. */
(function () {
  "use strict";

  var GB = 1073741824;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Sample tree ----------------------------------------------------------
  // n(name, children | gb, opts): folders total their children plus `other` (items under 100 MB).
  function n(name, kids, o) {
    o = o || {};
    var node = { name: name, children: [], other: (o.other || 0) * GB, other_count: o.oc || 0, is_dir: !o.file, files: 0, size: 0 };
    if (typeof kids === "number") {
      node.size = kids * GB;
      node.files = o.file ? 1 : o.files || Math.round(kids * 2300 + 41);
      if (!o.file) node.other = node.size; // leaf folder: contents are below the threshold
      if (!o.file) node.other_count = Math.max(12, Math.round(node.files / 9));
    } else {
      node.children = kids;
    }
    return node;
  }
  function finish(node, path) {
    node.path = path;
    if (node.children.length) {
      var s = node.other, f = Math.round(node.other / GB * 3100);
      if (!node.other_count && node.other) node.other_count = Math.round(node.other / GB * 3100);
      node.children.forEach(function (c) {
        finish(c, path.replace(/\\$/, "") + "\\" + c.name);
        s += c.size; f += c.files;
      });
      node.size = s; node.files = f;
      node.children.sort(function (a, b) { return b.size - a.size; });
    }
    return node;
  }

  var ROOT = finish(n("C:\\", [
    n("Users", [
      n("you", [
        n("AppData", [
          n("Local", [
            n("Temp", 7.4),
            n("NVIDIA", [n("DXCache", 6.8), n("GLCache", 1.9)]),
            n("Google", [n("Chrome", [n("User Data", [n("OptGuideOnDeviceModel", 4.0), n("Default", 2.9)], { other: 1.8 })])]),
            n("npm-cache", 5.3, { files: 48213 }),
            n("Packages", 4.2),
            n("pnpm", 3.6),
            n("Programs", [n("Python", 1.4), n("Microsoft VS Code", 0.61)], { other: 1.2 }),
            n("CrashDumps", 1.3, { files: 37 })
          ], { other: 9.8, oc: 31000 }),
          n("Roaming", [
            n("Code", [n("CachedExtensionVSIXs", 1.1), n("CachedData", 0.9)], { other: 0.9 }),
            n("Microsoft", 3.1),
            n("Adobe", 2.4)
          ], { other: 7.2 }),
          n("LocalLow", 2.6)
        ]),
        n("Videos", [n("Screen Recordings", 21.4), n("trip-2025.mp4", 9.1, { file: true })], { other: 7.5 }),
        n("Downloads", [n("Win11_24H2_x64.iso", 5.8, { file: true }), n("ubuntu-24.04-desktop-amd64.iso", 6.1, { file: true })], { other: 12.2 }),
        n("Pictures", 12.4),
        n("source", 9.2),
        n("Documents", 6.8)
      ], { other: 3.5 })
    ], { other: 1.2 }),
    n("Program Files (x86)", [
      n("Steam", [n("steamapps", [n("common", 115)], { other: 2 })], { other: 2 }),
      n("Microsoft", 9.4),
      n("Common Files", 3.8)
    ], { other: 5.8 }),
    n("Windows", [n("WinSxS", 11.8), n("System32", 6.1), n("Installer", 4.4), n("SoftwareDistribution", 2.9)], { other: 6 }),
    n("Program Files", [n("Adobe", 10.8), n("Microsoft Office", 4.6), n("Docker", 3.3), n("JetBrains", 3.3), n("NVIDIA Corporation", 1.9)], { other: 3.6 }),
    n("pagefile.sys", 16, { file: true }),
    n("hiberfil.sys", 12.7, { file: true }),
    n("ProgramData", 6.9),
    n("$Recycle.Bin", 6.7)
  ], { other: 2.0 }), "C:\\");

  var LOCAL = "C:\\Users\\you\\AppData\\Local";
  var ROAM = "C:\\Users\\you\\AppData\\Roaming";
  var VERDICT = {};
  VERDICT[LOCAL + "\\Temp"] = "safe";
  VERDICT[LOCAL + "\\NVIDIA\\DXCache"] = "safe";
  VERDICT[LOCAL + "\\NVIDIA\\GLCache"] = "safe";
  VERDICT[LOCAL + "\\npm-cache"] = "safe";
  VERDICT[LOCAL + "\\CrashDumps"] = "safe";
  VERDICT[ROAM + "\\Code\\CachedExtensionVSIXs"] = "safe";
  VERDICT[ROAM + "\\Code\\CachedData"] = "safe";
  VERDICT["C:\\$Recycle.Bin"] = "safe";
  VERDICT[LOCAL + "\\Google\\Chrome\\User Data\\OptGuideOnDeviceModel"] = "your-call";
  VERDICT["C:\\pagefile.sys"] = "keep";
  VERDICT["C:\\hiberfil.sys"] = "keep";
  VERDICT["C:\\Windows\\WinSxS"] = "keep";

  var DRIVE = { total: 476 * GB, free: 476 * GB - ROOT.size };

  function find(path) {
    var chain = [ROOT], cur = ROOT;
    while (cur.path !== path) {
      cur = cur.children.filter(function (c) { return path === c.path || path.indexOf(c.path + "\\") === 0; })[0];
      if (!cur) return null;
      chain.push(cur);
    }
    return chain;
  }

  // ---- App logic, ported ------------------------------------------------------
  function formatBytes(b) {
    if (b < 1024) return b + " B";
    var u = ["KB", "MB", "GB", "TB"], v = b / 1024, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + " " + u[i];
  }
  function count(x) { return Math.round(x).toLocaleString("en-US"); }
  var pct = function (x) { return x >= 0.995 ? "100%" : x >= 0.1 ? Math.round(x * 100) + "%" : x >= 0.001 ? (x * 100).toFixed(1) + "%" : "<0.1%"; };

  function squarify(items, rect) {
    var total = items.reduce(function (s, i) { return s + i.value; }, 0);
    if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
    var scale = (rect.w * rect.h) / total;
    var nodes = items.filter(function (i) { return i.value > 0; })
      .map(function (i) { return { area: i.value * scale, data: i.data }; })
      .sort(function (a, b) { return b.area - a.area; });
    var out = [], r = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, row = [];
    function worst(row, side) {
      if (!row.length) return Infinity;
      var s = 0, max = 0, min = Infinity;
      row.forEach(function (n) { s += n.area; if (n.area > max) max = n.area; if (n.area < min) min = n.area; });
      var s2 = s * s, side2 = side * side;
      return Math.max((side2 * max) / s2, s2 / (side2 * min));
    }
    function layoutRow(row, r) {
      var s = row.reduce(function (a, n) { return a + n.area; }, 0), w, h, x, y;
      if (r.w >= r.h) {
        w = s / r.h; y = r.y;
        row.forEach(function (n) { h = n.area / w; out.push({ x: r.x, y: y, w: w, h: h, data: n.data }); y += h; });
        return { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
      }
      h = s / r.w; x = r.x;
      row.forEach(function (n) { w = n.area / h; out.push({ x: x, y: r.y, w: w, h: h, data: n.data }); x += w; });
      return { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
    }
    var i = 0;
    while (i < nodes.length) {
      var side = Math.min(r.w, r.h), nd = nodes[i];
      if (!row.length || worst(row.concat([nd]), side) <= worst(row, side)) { row.push(nd); i++; }
      else { r = layoutRow(row, r); row = []; }
    }
    if (row.length) layoutRow(row, r);
    return out;
  }

  var FLOOR = 100 * 1048576;
  function heatT(size, top) {
    if (top <= FLOOR) return 1;
    return Math.max(0, Math.min(1, Math.log(Math.max(size, FLOOR) / FLOOR) / Math.log(top / FLOOR)));
  }

  var DIR_RULES = [
    ["cache", /^(cache|caches|temp|tmp|crashdumps|npm-cache|dxcache|glcache|cachedextensionvsixs|cacheddata|softwaredistribution)$/],
    ["system", /^(windows|\$recycle\.bin|programdata|winsxs)$/],
    ["games", /^(steam|steamapps)$/],
    ["code", /^(source|docker|jetbrains|python\d*)$/],
    ["media", /^(videos|pictures)$/],
    ["docs", /^(documents|downloads)$/],
    ["apps", /^(program files|program files \(x86\)|programs|appdata)$/]
  ];
  var FILE_RULES = [
    ["system", /^(pagefile|hiberfil|swapfile)\.sys$/],
    ["media", /\.(mp4|mkv|mov)$/],
    ["apps", /\.(exe|msi|iso)$/]
  ];
  var LABEL = { system: "System", apps: "Apps", games: "Games", code: "Code", cache: "Cache", media: "Media", docs: "Documents", other: "Other" };
  function classify(node, inherited) {
    var name = node.name.toLowerCase(), rules = node.is_dir ? DIR_RULES : FILE_RULES;
    for (var i = 0; i < rules.length; i++) if (rules[i][1].test(name)) return rules[i][0];
    return inherited;
  }
  function catOf(chain) {
    var c = "other";
    chain.forEach(function (nd, i) { if (i) c = classify(nd, c); });
    return c;
  }

  var HEADER = 18, MIN_GROUP_W = 52, MIN_GROUP_H = HEADER + 22;
  function layout(trail, box, maxDepth, skip) {
    var out = [], current = trail[trail.length - 1], top = current.size;
    function visit(node, chain, rect, depth, cat, verdict) {
      var items = node.children.filter(function (c) { return c.path !== skip; }).map(function (c) { return { value: c.size, data: c }; });
      if (node.other > 0) items.push({ value: node.other, data: null });
      var gap = depth === 0 ? 3 : 1;
      squarify(items, rect).forEach(function (r) {
        var w = r.w - gap, h = r.h - gap, c = r.data;
        if (w < 2 || h < 2) return;
        if (!c) {
          out.push({ x: r.x, y: r.y, w: w, h: h, key: node.path + "\0other", depth: depth, group: false, t: 0, cat: cat, verdict: verdict, other: true, parent: node });
          return;
        }
        var cCat = classify(c, cat), cV = VERDICT[c.path] || verdict, cChain = chain.concat([c]);
        var nest = c.is_dir && c.children.length > 0 && depth + 1 < maxDepth && w >= MIN_GROUP_W && h >= MIN_GROUP_H;
        out.push({ x: r.x, y: r.y, w: w, h: h, key: c.path, depth: depth, group: nest, t: heatT(c.size, top), cat: cCat, verdict: cV, node: c, chain: cChain });
        if (nest) visit(c, cChain, { x: r.x + 2, y: r.y + HEADER, w: w - 3, h: h - HEADER - 1 }, depth + 1, cCat, cV);
      });
    }
    visit(current, trail, box, 0, catOf(trail), VERDICT[current.path]);
    return out;
  }

  // ---- DOM helpers ------------------------------------------------------------
  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var ICON = {
    back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
    fwd: '<path d="M6 3.5 10.5 8 6 12.5"/>',
    up: '<path d="M8 13V3.5M4 7.5l4-4 4 4"/>',
    minus: '<path d="M4 8h8"/>',
    plus: '<path d="M4 8h8M8 4v8"/>',
    rescan: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.8v2.7h-2.7"/>',
    reveal: '<path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/>',
    chev: '<path d="M6 3.5 10.5 8 6 12.5"/>'
  };
  function icon(k) { return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + "</svg>"; }
  var MARK = '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="1" y="1" width="9" height="16" rx="1.5" class="m1"/><rect x="11" y="1" width="6" height="8" rx="1.5" class="m2"/><rect x="11" y="10" width="6" height="3.5" rx="1" class="m3"/><rect x="11" y="14.5" width="6" height="2.5" rx="1" class="m4"/></svg>';

  function tileLabel(t) {
    var name = t.other ? count(t.parent.other_count) + " small items" : t.node.name;
    var bytes = formatBytes(t.other ? t.parent.other : t.node.size);
    if (t.group) return '<div class="hd"><span class="n">' + esc(name) + "</span>" + (t.w > 96 ? '<span class="s">' + bytes + "</span>" : "") + "</div>";
    if (t.w >= 44 && t.h >= 32) return '<div class="lb"><span class="n">' + esc(name) + '</span><span class="s">' + bytes + "</span></div>";
    if (t.w >= 36 && t.h >= 17) return '<div class="lb"><span class="n">' + esc(name) + "</span></div>";
    return "";
  }
  function tileClass(t) {
    return ["tile", "c-" + t.cat, t.group ? "group" : "leaf", t.other ? "other" : t.node.is_dir ? "dir" : "file",
      t.verdict === "safe" ? "reclaim" : t.verdict === "your-call" ? "maybe" : ""].join(" ");
  }

  /** Draws tiles into `layer`, reusing elements by key so a relayout glides. */
  function paint(layer, tiles, enter) {
    var old = {}, seen = {};
    Array.prototype.forEach.call(layer.children, function (el) { old[el.dataset.k] = el; });
    tiles.forEach(function (t, i) {
      var el = old[t.key];
      if (!el) {
        el = h("div");
        el.dataset.k = t.key;
        if (enter) { el.classList.add("enter"); el.style.setProperty("--d", String(t.depth * 170 + Math.min(i, 60) * 7)); }
        layer.appendChild(el);
      }
      seen[t.key] = 1;
      var keep = el.classList.contains("enter") ? " enter" : "";
      el.className = tileClass(t) + keep + (el.classList.contains("hot") ? " hot" : "");
      el.style.left = t.x + "px"; el.style.top = t.y + "px";
      el.style.width = t.w + "px"; el.style.height = t.h + "px";
      el.style.setProperty("--t", t.t.toFixed(3));
      el.innerHTML = tileLabel(t);
      el._t = t;
    });
    Object.keys(old).forEach(function (k) { if (!seen[k] && !old[k].classList.contains("gone")) old[k].remove(); });
  }

  // ---- Specimen map in "Big things look big" ----------------------------------
  var spec = document.querySelector("[data-specimen]");
  if (spec) {
    spec.classList.add("dx");
    var specLayer = h("div", "dx-layer instant");
    spec.appendChild(specLayer);
    var drawSpec = function () {
      var w = spec.clientWidth, hh = spec.clientHeight;
      if (w) paint(specLayer, layout(find("C:\\Users\\you"), { x: 0, y: 0, w: w, h: hh }, 3), false);
    };
    new ResizeObserver(drawSpec).observe(spec);
  }

  // ---- Hero stage -------------------------------------------------------------
  var stage = document.querySelector("[data-demo]");
  if (!stage) return;
  var pauseBtn = document.querySelector(".demo-pause");
  var rail = document.querySelector(".rail");
  var steps = rail ? Array.prototype.slice.call(rail.querySelectorAll("[data-step]")) : [];

  var dx = h("div", "dx dx-win");
  dx.setAttribute("aria-hidden", "true");
  dx.innerHTML =
    '<div class="dx-top">' +
      '<div class="dx-brand">' + MARK + "<span>Disk Heatmap</span></div>" +
      '<div class="dx-hist"><span class="dx-ib off" data-back>' + icon("back") + '</span><span class="dx-ib off" data-fwd>' + icon("fwd") + '</span><span class="dx-ib off" data-up>' + icon("up") + "</span></div>" +
      '<ol class="dx-crumbs" data-crumbs></ol>' +
      '<span class="dx-spacer"></span>' +
      '<span class="dx-depth"><span class="lbl">Depth</span><span class="dx-ib">' + icon("minus") + "</span><b>3</b><span class=\"dx-ib\">" + icon("plus") + "</span></span>" +
      '<span class="dx-ib">' + icon("rescan") + "</span>" +
    "</div>" +
    '<div class="dx-body">' +
      '<section class="dx-view dx-drives" data-view="drives"><h3 class="dx-h1">Choose a drive to map</h3>' +
        '<div class="dx-drive" data-drive="c"><span class="l">C:</span><span class="nm">Local disk<span>NTFS</span></span><span class="fr"><b>' + formatBytes(DRIVE.free) + "</b> free of " + formatBytes(DRIVE.total) + '</span><span class="dx-meter"><i style="width:' + ((1 - DRIVE.free / DRIVE.total) * 100).toFixed(1) + '%"></i></span></div>' +
        '<div class="dx-drive"><span class="l">D:</span><span class="nm">Data<span>NTFS</span></span><span class="fr"><b>512 GB</b> free of 931 GB</span><span class="dx-meter"><i style="width:45%"></i></span></div>' +
      "</section>" +
      '<section class="dx-view dx-scan" data-view="scan" hidden><p class="t">Scanning C:</p>' +
        '<div class="big"><span data-s-bytes>0 B</span><span class="of">of about ' + formatBytes(DRIVE.total - DRIVE.free) + "</span></div>" +
        '<span class="dx-meter"><i data-s-meter style="width:0"></i></span>' +
        '<dl><div><dt>Files</dt><dd data-s-files>0</dd></div><div><dt>Folders</dt><dd data-s-dirs>0</dd></div><div><dt>Elapsed</dt><dd data-s-time>0 s</dd></div></dl>' +
        '<div class="p" data-s-path>C:\\</div>' +
        '<span class="dx-btn">Stop and show results so far</span>' +
      "</section>" +
      '<section class="dx-view dx-results" data-view="results" hidden>' +
        '<div class="dx-maparea"><div class="dx-sub"><div class="st" data-sub></div>' +
          '<ul class="dx-legend"><li><i class="sw rk"></i>Reclaimable</li><li><i class="sw c-apps"></i>Apps</li><li><i class="sw c-games"></i>Games</li><li><i class="sw c-code"></i>Code</li><li><i class="sw c-cache"></i>Cache</li><li><i class="sw c-media"></i>Media</li></ul></div>' +
          '<div class="dx-map" data-map><div class="dx-layer"></div></div></div>' +
        '<aside class="dx-panel"><div class="dx-pscroll" data-pscroll><div data-sel></div><div class="dx-worth" data-worth></div></div><div class="dx-disk" data-disk></div></aside>' +
      "</section>" +
    "</div>";
  var cursor = h("div", "dx-cursor", '<svg viewBox="0 0 18 22" aria-hidden="true"><path d="M1.5 1.5v16.2l4.1-3.9 2.7 6.3 2.9-1.2-2.7-6.2h5.8z" fill="#fff" stroke="#16171a" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  dx.appendChild(cursor);
  stage.appendChild(dx);

  var $ = function (s) { return dx.querySelector(s); };
  var views = { drives: $('[data-view="drives"]'), scan: $('[data-view="scan"]'), results: $('[data-view="results"]') };
  var mapEl = $("[data-map]"), layer = $(".dx-layer"), pscroll = $("[data-pscroll]");

  var S = { trail: [ROOT], focus: null, cleaned: false, open: null, confirm: false, busy: false, msg: null, hist: 0 };

  function show(v) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== v; });
  }
  function sizeClass() {
    var w = stage.clientWidth;
    dx.classList.toggle("narrow", w < 600);
    dx.style.setProperty("--panel-w", Math.round(Math.max(210, Math.min(268, w * 0.32))) + "px");
    dx.style.setProperty("--panel-h", Math.round(Math.max(236, stage.clientHeight * 0.44)) + "px");
  }

  function renderCrumbs() {
    var el = $("[data-crumbs]");
    var showing = !views.results.hidden;
    el.innerHTML = showing ? S.trail.map(function (nd, i) {
      return "<li>" + (i ? icon("chev") : "") + "<span>" + esc(i ? nd.name : "C:") + "</span></li>";
    }).join("") : "";
    $("[data-back]").classList.toggle("off", !showing || S.hist === 0);
    $("[data-up]").classList.toggle("off", !showing || S.trail.length < 2);
  }

  function drawMap(enter) {
    var w = mapEl.clientWidth, hh = mapEl.clientHeight;
    if (!w || !hh) return;
    var tiles = layout(S.trail, { x: 0, y: 0, w: w, h: hh }, 3, S.cleaned ? LOCAL + "\\npm-cache" : null);
    paint(layer, tiles, enter);
  }
  function tileEl(path) { return layer.querySelector('[data-k="' + path.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]'); }

  function renderSub() {
    var cur = S.trail[S.trail.length - 1];
    $("[data-sub]").innerHTML = "<span><b>" + formatBytes(cur.size) + "</b></span><span>" + count(cur.files) + " files</span>" +
      (S.trail.length === 1 ? '<span class="opt">scanned in 14.2 s</span><span class="warn opt">3 folders unreadable</span>' : "");
  }

  function renderSel() {
    var f = S.focus, cur = S.trail[S.trail.length - 1], html;
    if (f && f.other) {
      html = "<h4>Selection</h4><div class=\"dx-sel-name\">" + count(f.parent.other_count) + " small items</div><div class=\"dx-sel-path\">" + esc(f.parent.path) + "</div>" +
        '<div class="dx-num">' + formatBytes(f.parent.other).replace(" ", "<span>") + '</span></div><span class="dx-meter"><i style="width:' + Math.max(0.5, f.parent.other / f.parent.size * 100) + '%"></i></span>';
    } else {
      var node = f ? f.node : cur, chain = f ? f.chain : S.trail, parent = chain[chain.length - 2];
      var share = parent ? node.size / parent.size : 1, cat = f ? f.cat : catOf(S.trail);
      var verdict = f ? f.verdict : VERDICT[cur.path];
      var vText = verdict === "safe" ? "Safe to clean" : verdict === "your-call" ? "Your call" : verdict === "keep" ? "Keep" : "No advice";
      html = "<h4>" + (f ? "Selection" : "This folder") + '</h4><div class="dx-sel-name">' + esc(node.name) + '</div><div class="dx-sel-path">' + esc(node.path) + "</div>" +
        '<div class="dx-num">' + formatBytes(node.size).replace(" ", "<span>") + "</span></div>" +
        '<span class="dx-meter"><i style="width:' + Math.max(0.5, share * 100).toFixed(1) + '%"></i></span>' +
        '<dl class="dx-facts"><div><dt>' + (parent ? "Of " + esc(parent.name.replace(/[\\/]$/, "")) : "Of scan") + "</dt><dd>" + pct(parent ? share : node.size / ROOT.size) + "</dd></div>" +
        "<div><dt>Files</dt><dd>" + (node.is_dir ? count(node.files) : "1") + "</dd></div>" +
        '<div><dt>Kind</dt><dd><i class="sw c-' + cat + '"></i>' + LABEL[cat] + "</dd></div>" +
        "<div><dt>Cleanup</dt><dd>" + vText + "</dd></div></dl>" +
        '<div class="dx-acts">' + (f && node.is_dir ? '<span class="dx-btn">Open</span>' : "") + '<span class="dx-btn">' + icon("reveal") + " Show in Explorer</span></div>";
    }
    $("[data-sel]").innerHTML = html;
  }

  var ITEMS = [
    { id: "temp", title: "Your temporary files (%TEMP%)", path: LOCAL + "\\Temp" },
    { id: "dx", title: "NVIDIA shader cache (DXCache / GLCache)", path: LOCAL + "\\NVIDIA\\DXCache" },
    { id: "bin", title: "Recycle Bin", path: "C:\\$Recycle.Bin" },
    { id: "npm", title: "npm package cache", path: LOCAL + "\\npm-cache", text: "Copies of every package npm has downloaded. npm re-downloads what it needs on the next install." },
    { id: "gl", title: "NVIDIA shader cache (DXCache / GLCache)", path: LOCAL + "\\NVIDIA\\GLCache" },
    { id: "crash", title: "Application crash dumps", path: LOCAL + "\\CrashDumps" },
    { id: "vsix", title: "VS Code cached extension installers", path: ROAM + "\\Code\\CachedExtensionVSIXs" },
    { id: "cd", title: "VS Code cached extension installers", path: ROAM + "\\Code\\CachedData" }
  ];
  ITEMS.forEach(function (it) { it.node = find(it.path).pop(); it.size = it.node.size; });
  var KEPT = find("C:\\pagefile.sys").pop().size + find("C:\\hiberfil.sys").pop().size + find("C:\\Windows\\WinSxS").pop().size;
  var CALL = find(LOCAL + "\\Google\\Chrome\\User Data\\OptGuideOnDeviceModel").pop();
  var NPM = ITEMS[3];

  function shortPath(p, max) {
    max = max || 34;
    if (p.length <= max) return p;
    var parts = p.split("\\"), tail = parts[parts.length - 1];
    for (var i = parts.length - 2; i > 0; i--) {
      var next = parts[i] + "\\" + tail;
      if (parts[0].length + 3 + next.length > max) break;
      tail = next;
    }
    return parts[0] + "\\…\\" + tail;
  }

  function renderWorth() {
    var list = ITEMS.filter(function (it) { return !(S.cleaned && it === NPM && S.npmGone); });
    var total = ITEMS.reduce(function (s, it) { return s + (S.cleaned && it === NPM ? 0 : it.size); }, 0);
    var rows = list.map(function (it) {
      var open = S.open === it.id, inner = "";
      if (open) {
        inner = '<div class="dx-detail"><p>' + esc(it.text || "") + "</p>" +
          (S.msg ? '<p class="done">' + S.msg + "</p>" : "") +
          (S.confirm
            ? '<div class="dx-confirm"><p>Permanently delete <b>' + formatBytes(it.size) + "</b> (" + count(it.node.files) + ' files)? The folder stays; files in use are skipped.</p><div class="dx-acts"><span class="dx-btn" data-cancel>Cancel</span><span class="dx-btn danger" data-go>' + (S.busy ? "Cleaning…" : "Clean") + "</span></div></div>"
            : S.msg ? "" : '<div class="dx-acts"><span class="dx-btn">' + icon("reveal") + ' Show in Explorer</span><span class="dx-btn danger-outline" data-clean>Clean</span></div>') +
          "</div>";
      }
      return '<li class="dx-item' + (open ? " open" : "") + '" data-item="' + it.id + '"><div class="dx-row"><span class="tt">' + esc(it.title) + '</span><span class="sz">' + formatBytes(S.cleaned && it === NPM ? 0 : it.size) + '</span><span class="pt">' + esc(shortPath(it.path)) + "</span></div>" + inner + "</li>";
    }).join("");
    $("[data-worth]").innerHTML =
      '<section class="dx-g safe"><h4><span class="nm"><i class="dx-vm safe"></i>Safe to clean</span><span class="aside" data-safe-total>' + formatBytes(total) + '</span></h4><ul class="dx-list">' + rows + "</ul></section>" +
      '<section class="dx-g"><h4><span class="nm"><i class="dx-vm call"></i>Your call</span><span class="aside">' + formatBytes(CALL.size) + '</span></h4><ul class="dx-list"><li class="dx-item"><div class="dx-row"><span class="tt">Chrome on-device AI model (OptGuideOnDeviceModel)</span><span class="sz">' + formatBytes(CALL.size) + '</span><span class="pt">' + esc(shortPath(CALL.path)) + "</span></div></li></ul></section>" +
      '<div class="dx-kept">Managed by Windows <b>' + formatBytes(KEPT) + "</b></div>";
  }

  function renderDisk() {
    var free = DRIVE.free + (S.cleaned ? NPM.size : 0), used = DRIVE.total - free;
    $("[data-disk]").innerHTML = '<h4>Disk <span class="aside">C:</span></h4><div class="dx-free" data-free>' + formatBytes(free).replace(" ", "<span>") + ' free</span></div>' +
      '<span class="dx-meter"><i style="width:' + (used / DRIVE.total * 100).toFixed(1) + '%"></i></span><div class="dx-dfoot"><span>' + formatBytes(used) + " used</span><span>" + formatBytes(DRIVE.total) + " total</span></div>";
  }

  function renderResults(enter) {
    renderCrumbs(); renderSub(); renderSel(); renderWorth(); renderDisk(); drawMap(enter);
  }

  // ---- Clock: advances only while the demo is visible and not paused ---------
  var clock = 0, last = 0, running = false, userPaused = false, visible = false, waiters = [], gen = 0;
  function tick(now) {
    if (running) {
      clock += Math.min(100, now - (last || now));
      for (var i = waiters.length - 1; i >= 0; i--) if (clock >= waiters[i].at) waiters.splice(i, 1)[0].fn();
      railTick();
    }
    last = now;
    requestAnimationFrame(tick);
  }
  function sleep(ms) { var g = gen; return new Promise(function (res, rej) { waiters.push({ at: clock + ms, fn: function () { g === gen ? res() : rej("restart"); } }); }); }
  function setRunning() {
    running = visible && !userPaused && !document.hidden;
    dx.classList.toggle("paused", !running);
  }

  // Rail progress: which step is playing and how far along.
  var phase = { i: -1, at: 0, len: 1 };
  function enterPhase(i, len) {
    phase = { i: i, at: clock, len: len };
    steps.forEach(function (s, k) { s.style.setProperty("--p", k < i ? 1 : 0); });
  }
  function railTick() {
    var s = steps[phase.i];
    if (s) s.style.setProperty("--p", Math.min(1, (clock - phase.at) / phase.len).toFixed(3));
  }

  // ---- Pointer ----------------------------------------------------------------
  var pos = { x: 0, y: 0 };
  function place(x, y, ms) {
    cursor.style.transitionDuration = (ms || 0) + "ms";
    cursor.style.transform = "translate(" + x + "px," + y + "px)";
    pos = { x: x, y: y };
    return sleep(ms || 0);
  }
  function pointAt(el, fx, fy, ms) {
    var a = el.getBoundingClientRect(), b = dx.getBoundingClientRect();
    var x = a.left - b.left + a.width * (fx == null ? 0.5 : fx), y = a.top - b.top + a.height * (fy == null ? 0.5 : fy);
    var dist = Math.hypot(x - pos.x, y - pos.y);
    return place(x, y, ms || Math.max(380, Math.min(900, dist * 1.6)));
  }
  function click() {
    cursor.classList.remove("click"); void cursor.offsetWidth; cursor.classList.add("click");
    return sleep(240);
  }
  function hover(el, on) { if (el) el.classList.toggle("hot", on); }
  function focusTile(path) {
    Array.prototype.forEach.call(layer.querySelectorAll(".hot"), function (e) { e.classList.remove("hot"); });
    var el = tileEl(path);
    if (!el) return null;
    el.classList.add("hot");
    var t = el._t;
    S.focus = t.other ? t : { node: t.node, chain: t.chain, cat: t.cat, verdict: t.verdict };
    renderSel();
    return el;
  }
  function scrollPanel(to, ms) {
    var from = pscroll.scrollTop, start = clock;
    return new Promise(function (res) {
      (function step() {
        var k = Math.min(1, (clock - start) / ms), e = 1 - Math.pow(1 - k, 3);
        pscroll.scrollTop = from + (to - from) * e;
        if (k < 1) requestAnimationFrame(step); else res();
      })();
    });
  }

  function zoomInto(path) {
    var el = tileEl(path), r = el ? el._t : null;
    S.trail = find(path); S.focus = null; S.hist++;
    layer.classList.add("instant");
    layer.innerHTML = "";
    renderResults(false);
    if (r) {
      var W = mapEl.clientWidth, H = mapEl.clientHeight;
      layer.animate([
        { transform: "translate(" + r.x + "px," + r.y + "px) scale(" + r.w / W + "," + r.h / H + ")", opacity: 0.55 },
        { transform: "none", opacity: 1 }
      ], { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    }
    requestAnimationFrame(function () { layer.classList.remove("instant"); });
  }

  // ---- The story --------------------------------------------------------------
  var SCAN_PATHS = ["C:\\Program Files (x86)\\Steam\\steamapps\\common", "C:\\Users\\you\\AppData\\Local\\npm-cache\\_cacache", "C:\\Users\\you\\Videos\\Screen Recordings",
    "C:\\Windows\\WinSxS\\amd64_microsoft-windows", "C:\\Program Files\\Adobe", "C:\\Users\\you\\AppData\\Roaming\\Code\\CachedData", "C:\\ProgramData\\Microsoft"];

  function reset() {
    S = { trail: [ROOT], focus: null, cleaned: false, npmGone: false, open: null, confirm: false, busy: false, msg: null, hist: 0 };
    layer.innerHTML = ""; pscroll.scrollTop = 0;
    show("drives"); renderCrumbs();
  }

  async function story() {
    reset();
    var W = dx.clientWidth, H = dx.clientHeight;
    await place(W * 0.62, H * 0.86, 0);
    dx.style.opacity = "1";

    // 1. Scan
    enterPhase(0, 5200);
    await sleep(500);
    var drive = $('[data-drive="c"]');
    await pointAt(drive, 0.4, 0.45, 800);
    hover(drive, true);
    await sleep(240);
    await click();
    hover(drive, false);
    show("scan");
    var total = DRIVE.total - DRIVE.free, start = clock, dur = 3100;
    var bytesEl = $("[data-s-bytes]"), meter = $("[data-s-meter]"), files = $("[data-s-files]"), dirs = $("[data-s-dirs]"), time = $("[data-s-time]"), pathEl = $("[data-s-path]");
    await place(W * 0.82, H * 0.9, 700);
    while (clock - start < dur) {
      var k = (clock - start) / dur, e = 1 - Math.pow(1 - k, 1.6);
      bytesEl.textContent = formatBytes(total * e);
      meter.style.width = (e * 100).toFixed(1) + "%";
      files.textContent = count(ROOT.files * e);
      dirs.textContent = count(ROOT.files * e / 7.3);
      time.textContent = (14.2 * k).toFixed(1) + " s";
      pathEl.textContent = SCAN_PATHS[Math.floor(k * 21) % SCAN_PATHS.length];
      await sleep(60);
    }

    // 2. Map
    enterPhase(1, 5600);
    show("results");
    renderResults(true);
    await sleep(1300);
    var steam = tileEl("C:\\Program Files (x86)\\Steam");
    if (steam) { await pointAt(steam, 0.42, 0.55); focusTile(steam.dataset.k); await sleep(1300); }
    var page = tileEl("C:\\pagefile.sys");
    if (page) { await pointAt(page, 0.5, 0.5); focusTile(page.dataset.k); await sleep(1200); }
    var appdata = tileEl("C:\\Users\\you\\AppData");
    if (appdata) { await pointAt(appdata, 0.5, 0.42); focusTile(appdata.dataset.k); await sleep(1200); }

    // 3. Zoom
    enterPhase(2, 4400);
    await click();
    zoomInto("C:\\Users\\you\\AppData");
    await sleep(900);
    var npmTile = tileEl(LOCAL + "\\npm-cache");
    if (npmTile) { await pointAt(npmTile, 0.5, 0.55); focusTile(npmTile.dataset.k); await sleep(1500); }
    var tmp = tileEl(LOCAL + "\\Temp");
    if (tmp) { await pointAt(tmp, 0.45, 0.5); focusTile(tmp.dataset.k); await sleep(1100); }

    // 4. Clean
    enterPhase(3, 7600);
    Array.prototype.forEach.call(layer.querySelectorAll(".hot"), function (e) { e.classList.remove("hot"); });
    S.focus = null; renderSel();
    var group = $("[data-worth]");
    await scrollPanel(group.offsetTop - 8, 600);
    var row = $('[data-item="npm"] .dx-row');
    await pointAt(row, 0.4, 0.4);
    hover(row, true); await sleep(200); await click();
    S.open = "npm"; renderWorth();
    await sleep(650);
    var cleanBtn = $("[data-clean]");
    var item = $('[data-item="npm"]');
    await scrollPanel(Math.max(pscroll.scrollTop, item.offsetTop + item.offsetHeight - pscroll.clientHeight + 70), 400);
    await pointAt(cleanBtn, 0.5, 0.5); hover(cleanBtn, true); await sleep(160); await click();
    S.confirm = true; renderWorth();
    await sleep(900);
    var go = $("[data-go]");
    await scrollPanel(Math.max(pscroll.scrollTop, $('[data-item="npm"]').offsetTop + $('[data-item="npm"]').offsetHeight - pscroll.clientHeight + 20), 300);
    await pointAt(go, 0.5, 0.5); hover(go, true); await sleep(200); await click();
    S.busy = true; renderWorth();
    await sleep(800);

    // The tile shrinks away and the rest of the map settles into the space.
    var gone = tileEl(LOCAL + "\\npm-cache");
    if (gone) gone.classList.add("gone");
    await sleep(480);
    S.cleaned = true; S.busy = false; S.confirm = false; S.msg = "Freed " + formatBytes(NPM.size) + ".";
    drawMap(false);
    if (gone) gone.remove();
    renderWorth(); renderDisk();
    [$("[data-safe-total]"), $("[data-free]")].forEach(function (e) { if (e) e.classList.add("dx-flash"); });
    await sleep(2800);
    railTick();
    await sleep(600);
    dx.style.transition = "opacity 400ms ease";
    dx.style.opacity = "0";
    await sleep(450);
  }

  async function loop() {
    for (;;) {
      try { await story(); } catch (e) { if (e !== "restart") throw e; }
    }
  }

  // ---- Static frame for reduced motion ---------------------------------------
  function staticFrame() {
    cursor.hidden = true;
    S.trail = find("C:\\Users\\you\\AppData"); S.hist = 1; S.open = "npm";
    show("results");
    renderResults(false);
    var el = focusTile(LOCAL + "\\npm-cache");
    if (el) el.classList.remove("hot");
    pscroll.scrollTop = $("[data-worth]").offsetTop - 8;
  }

  sizeClass();
  var lastW = 0, lastH = 0;
  new ResizeObserver(function () {
    if (stage.clientWidth === lastW && stage.clientHeight === lastH) return;
    lastW = stage.clientWidth; lastH = stage.clientHeight;
    sizeClass();
    if (!views.results.hidden) {
      layer.classList.add("instant"); drawMap(false);
      requestAnimationFrame(function () { layer.classList.remove("instant"); });
    }
  }).observe(stage);

  if (reduce) { staticFrame(); return; }

  if (rail) rail.classList.add("live");
  if (pauseBtn) {
    pauseBtn.hidden = false;
    pauseBtn.addEventListener("click", function () {
      userPaused = !userPaused;
      pauseBtn.setAttribute("aria-pressed", String(userPaused));
      pauseBtn.setAttribute("aria-label", userPaused ? "Play the demo" : "Pause the demo");
      setRunning();
    });
  }
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; setRunning(); }, { threshold: 0.15 }).observe(stage);
  document.addEventListener("visibilitychange", setRunning);
  requestAnimationFrame(tick);
  loop();
})();
