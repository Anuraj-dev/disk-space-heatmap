/* Small page behaviours: copy buttons on code blocks, the docs menu on phones, and a hint for visitors not on Windows. */
(function () {
  "use strict";

  document.querySelectorAll("pre > code").forEach(function (code) {
    if (!navigator.clipboard) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy";
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(code.textContent.trim()).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
      }, function () { btn.textContent = "Select and copy"; });
    });
    code.parentNode.appendChild(btn);
  });

  // The docs sidebar is a collapsible menu on narrow screens; start it closed there.
  var docsNav = document.querySelector("[data-docs-nav]");
  if (docsNav && window.matchMedia("(max-width: 860px)").matches) docsNav.open = false;

  var ua = navigator.userAgent;
  if (!/Windows/i.test(ua)) {
    document.querySelectorAll("[data-os-hint]").forEach(function (el) { el.hidden = false; });
  }
})();
