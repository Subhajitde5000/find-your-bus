/*
 * The Cholo QR sticker maker.
 *
 * A private tool, not part of the website. It builds the two links the project prints —
 * one for a bus route, one for a bus stop — draws the QR code for each, and lays the
 * stickers out on a printable sheet.
 *
 * The link format has to match `fontend/src/lib/qrLinks.ts` exactly, because the app and
 * the scanner parse it:
 *
 *   <origin>/on-bus?route=<route>            every bus of one route
 *   <origin>/on-bus?route=<route>&bus=<reg>  one physical bus, later
 *   <origin>/stop?stop=<stop name>           one bus stop
 *
 * The origin is permanent once a sticker is on a bus, so it is stored and shown rather
 * than guessed per link. `scripts/set_qr_domain.mjs` rewrites the default below.
 */

(() => {
  "use strict";

  const DEFAULT_ORIGIN = "https://cholo.example";
  const ORIGIN_KEY = "cholo:qr:origin";
  const SHEET_KEY = "cholo:qr:sheet";
  const THEME_KEY = "cholo:qr:theme";
  const MAX_LIST_ROWS = 120;
  /** Quiet zone in modules, as the QR specification requires. */
  const QUIET = 4;
  /** Printed QR size in millimetres; the print CSS uses the same number. */
  const PRINT_MM = 40;

  const catalog = window.CHOLO_QR_CATALOG || { routes: [], stops: [], counts: {} };
  const state = {
    origin: DEFAULT_ORIGIN,
    tab: "bus",
    route: null,
    stop: null,
    sheet: [],
  };

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ storage */

  function read(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode: the tool still works, it just forgets between visits */
    }
  }

  /* ------------------------------------------------------------------ theme */

  /*
   * Light or dark, remembered per browser.
   *
   * The choice is stored, so it survives a reload; until something is stored the page
   * follows the operating system, and it keeps following it live if the system switches
   * at sunset. The first paint is handled by the inline script in index.html, so this
   * only has to keep the button honest and handle the click.
   */
  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, { remember = true } = {}) {
    document.documentElement.dataset.theme = theme;
    const button = $("theme-toggle");
    if (button) {
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("title", theme === "dark" ? "Switch to light" : "Switch to dark");
    }
    if (remember) write(THEME_KEY, theme);
  }

  function wireTheme() {
    const button = $("theme-toggle");
    if (button) {
      button.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
    }
    applyTheme(currentTheme(), { remember: false });
    // Only follow the system while the user has not made a choice of their own.
    if (window.matchMedia) {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = (event) => {
        if (read(THEME_KEY, null)) return;
        applyTheme(event.matches ? "dark" : "light", { remember: false });
      };
      if (typeof query.addEventListener === "function") query.addEventListener("change", onChange);
      else if (typeof query.addListener === "function") query.addListener(onChange);
    }
  }

  /* ------------------------------------------------------------------ links */

  function normaliseOrigin(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function originProblem(value) {
    const origin = normaliseOrigin(value);
    if (!origin) return "Enter the website address, for example https://cholo.in";
    let url;
    try {
      url = new URL(origin);
    } catch {
      return "That is not a complete web address. Include https:// in front of the domain.";
    }
    if (url.protocol !== "https:") return "Use https:// — a printed sticker must open a secure page.";
    if (url.pathname !== "/" || url.search || url.hash) return "Use the domain only, with nothing after it.";
    return null;
  }

  function routeLink(route, registration, origin) {
    const params = new URLSearchParams({ route });
    if (registration) params.set("bus", registration);
    return `${normaliseOrigin(origin)}/on-bus?${params.toString()}`;
  }

  function stopLink(stop, origin) {
    return `${normaliseOrigin(origin)}/stop?${new URLSearchParams({ stop }).toString()}`;
  }

  /** The same rule as the app: an Indian plate, or nothing. */
  function normaliseRegistration(value) {
    const compact = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
    const parts = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(compact);
    return parts ? `${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}` : null;
  }

  /* ------------------------------------------------------------------ QR drawing */

  function qrFor(text) {
    // Type 0 lets the encoder pick the smallest version that fits; "M" is the level
    // that survives a scuffed sticker without making the code dense.
    const code = window.qrcode(0, "M");
    code.addData(text);
    code.make();
    return code;
  }

  function paint(canvas, code, pixelSize) {
    const modules = code.getModuleCount();
    const size = modules + QUIET * 2;
    const scale = Math.max(1, Math.floor(pixelSize / size));
    const total = size * scale;
    canvas.width = total;
    canvas.height = total;
    const context = canvas.getContext("2d");
    // A browser without a 2D context cannot draw the code, but the link, the copy button
    // and the downloads still work, so this is a blank canvas rather than a crash.
    if (!context) return { modules, pixelSize: 0, scale: 0 };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, total, total);
    context.fillStyle = "#0b1f17";
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (code.isDark(row, column)) {
          context.fillRect((column + QUIET) * scale, (row + QUIET) * scale, scale, scale);
        }
      }
    }
    return { modules, pixelSize: total, scale };
  }

  function svgFor(code) {
    const modules = code.getModuleCount();
    const size = modules + QUIET * 2;
    const parts = [];
    for (let row = 0; row < modules; row += 1) {
      let start = -1;
      for (let column = 0; column <= modules; column += 1) {
        const dark = column < modules && code.isDark(row, column);
        if (dark && start < 0) start = column;
        if (!dark && start >= 0) {
          parts.push(`M${start + QUIET} ${row + QUIET}h${column - start}v1h-${column - start}z`);
          start = -1;
        }
      }
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" shape-rendering="crispEdges">` +
      `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
      `<path d="${parts.join("")}" fill="#0b1f17"/>` +
      `</svg>`
    );
  }

  function mmPerModule(code) {
    return PRINT_MM / (code.getModuleCount() + QUIET * 2);
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function slug(text) {
    return String(text)
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 48) || "cholo";
  }

  /* ------------------------------------------------------------------ origin */

  function setOrigin(value, { remember = true } = {}) {
    const problem = originProblem(value);
    const hint = $("origin-hint");
    if (problem) {
      hint.textContent = problem;
      hint.classList.add("bad");
      return false;
    }
    state.origin = normaliseOrigin(value);
    $("origin").value = state.origin;
    hint.classList.remove("bad");
    hint.textContent =
      "This address is printed on every sticker, so it must stay the same once stickers are on buses. " +
      "Change it with scripts/set_qr_domain.mjs, not by hand, then rebuild the site and the app.";
    if (remember) write(ORIGIN_KEY, state.origin);
    refreshPreview();
    return true;
  }

  /* ------------------------------------------------------------------ route and stop pickers */

  function renderRoutes() {
    const query = $("route-search").value.trim().toLowerCase();
    const list = $("route-list");
    const matches = catalog.routes.filter((route) => {
      if (!query) return true;
      return (
        route.number.toLowerCase().includes(query) ||
        route.origin.toLowerCase().includes(query) ||
        route.destination.toLowerCase().includes(query)
      );
    });
    $("route-meta").textContent = query
      ? `${matches.length} of ${catalog.routes.length} routes match`
      : `${catalog.routes.length} routes`;

    list.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("li");
      empty.className = "picker-empty";
      empty.textContent = "No route matches that.";
      list.append(empty);
      return;
    }
    for (const route of matches.slice(0, MAX_LIST_ROWS)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(state.route?.number === route.number));
      const strong = document.createElement("strong");
      strong.textContent = `${route.number}${route.type === "AC" ? " · AC" : ""}`;
      const span = document.createElement("span");
      span.textContent = `${route.origin} ↔ ${route.destination}`;
      button.append(strong, span);
      button.addEventListener("click", () => selectRoute(route));
      item.append(button);
      list.append(item);
    }
    if (matches.length > MAX_LIST_ROWS) {
      const more = document.createElement("li");
      more.className = "picker-empty";
      more.textContent = `${matches.length - MAX_LIST_ROWS} more — narrow the search to see them.`;
      list.append(more);
    }
  }

  function selectRoute(route) {
    state.route = route;
    $("bus-result").hidden = false;
    $("bus-title").textContent = `Bus ${route.number}`;
    $("bus-sub").textContent = `${route.origin} ↔ ${route.destination} · ${route.type} · ${route.operator} · ${route.stops} stops${route.timed ? "" : " · no published times"}`;
    $("bus-reg").value = "";
    renderRoutes();
    refreshPreview();
  }

  function renderStops() {
    const query = $("stop-search").value.trim().toLowerCase();
    const list = $("stop-list");
    const matches = catalog.stops.filter((stop) => !query || stop.name.toLowerCase().includes(query));
    $("stop-meta").textContent = query
      ? `${matches.length} of ${catalog.stops.length} stops match`
      : `${catalog.stops.length} stops`;

    list.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("li");
      empty.className = "picker-empty";
      empty.textContent = "No stop matches that.";
      list.append(empty);
      return;
    }
    for (const stop of matches.slice(0, MAX_LIST_ROWS)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(state.stop === stop.name));
      const strong = document.createElement("strong");
      strong.textContent = stop.name;
      button.append(strong);
      button.addEventListener("click", () => selectStop(stop));
      item.append(button);
      list.append(item);
    }
    if (matches.length > MAX_LIST_ROWS) {
      const more = document.createElement("li");
      more.className = "picker-empty";
      more.textContent = `${matches.length - MAX_LIST_ROWS} more — narrow the search to see them.`;
      list.append(more);
    }
  }

  function selectStop(stop) {
    state.stop = stop.name;
    $("stop-result").hidden = false;
    $("stop-title").textContent = stop.name;
    $("stop-sub").textContent = "The next buses from this stop, and the whole day.";
    renderStops();
    refreshPreview();
  }

  /* ------------------------------------------------------------------ previews */

  function busLinkNow() {
    if (!state.route) return null;
    const typed = $("bus-reg").value.trim();
    const registration = typed ? normaliseRegistration(typed) : null;
    return routeLink(state.route.number, registration, state.origin);
  }

  function refreshPreview() {
    if (state.route) {
      const link = busLinkNow();
      const typed = $("bus-reg").value.trim();
      const badRegistration = typed && !normaliseRegistration(typed);
      $("bus-reg").classList.toggle("bad", Boolean(badRegistration));
      $("bus-link").textContent = link;
      $("bus-open").href = link;
      const code = qrFor(link);
      paint($("bus-qr"), code, 640);
      const mm = mmPerModule(code);
      const meta = $("bus-qr-meta");
      meta.textContent = `${code.getModuleCount()}×${code.getModuleCount()} modules · ${mm.toFixed(2)} mm per module at ${PRINT_MM} mm`;
      meta.classList.toggle("bad", mm < 0.35);
      if (mm < 0.35) meta.textContent += " · too dense for this size, print larger";
      if (badRegistration) {
        meta.classList.add("bad");
        meta.textContent = "Bus number ignored: use a plate like WB 04 A 1234";
      }
    }

    if (state.stop) {
      const link = stopLink(state.stop, state.origin);
      $("stop-link").textContent = link;
      $("stop-open").href = link;
      const code = qrFor(link);
      paint($("stop-qr"), code, 640);
      const mm = mmPerModule(code);
      const meta = $("stop-qr-meta");
      meta.textContent = `${code.getModuleCount()}×${code.getModuleCount()} modules · ${mm.toFixed(2)} mm per module at ${PRINT_MM} mm`;
      meta.classList.toggle("bad", mm < 0.35);
    }
  }

  /* ------------------------------------------------------------------ the sheet */

  function stickerForRoute(route) {
    const typed = $("bus-reg").value.trim();
    const registration = typed ? normaliseRegistration(typed) : null;
    return {
      kind: "bus",
      title: `Bus ${route.number}`,
      subtitle: `${route.origin} ↔ ${route.destination}`,
      note: "Scan to see where you are on this route and when your stop comes.",
      link: routeLink(route.number, registration, state.origin),
    };
  }

  function stickerForStop(name) {
    return {
      kind: "stop",
      title: name,
      subtitle: "Next buses and the whole day",
      note: "Scan for the next buses from this stop, and the times for the rest of the day.",
      link: stopLink(name, state.origin),
    };
  }

  function addStickers(stickers) {
    let added = 0;
    for (const sticker of stickers) {
      if (state.sheet.some((item) => item.link === sticker.link)) continue;
      state.sheet.push({ ...sticker, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      added += 1;
    }
    persistSheet();
    renderSheet();
    return added;
  }

  function persistSheet() {
    write(SHEET_KEY, JSON.stringify(state.sheet));
  }

  function renderSheet() {
    const holder = $("sheet-cards");
    holder.replaceChildren();
    $("sheet-meta").textContent = state.sheet.length
      ? `${state.sheet.length} sticker${state.sheet.length === 1 ? "" : "s"} · ${Math.ceil(state.sheet.length / 8)} A4 page${Math.ceil(state.sheet.length / 8) === 1 ? "" : "s"}`
      : "Nothing added yet.";

    if (!state.sheet.length) {
      const empty = document.createElement("p");
      empty.className = "sheet-empty";
      empty.textContent = "Pick a route or a stop above and add it here. Stickers are grouped 8 to an A4 page.";
      holder.append(empty);
      return;
    }

    for (const sticker of state.sheet) {
      const card = document.createElement("article");
      card.className = "sticker";

      const canvas = document.createElement("canvas");
      paint(canvas, qrFor(sticker.link), 480);
      card.append(canvas);

      const body = document.createElement("div");
      body.className = "sticker-body";
      const kind = document.createElement("span");
      kind.className = "sticker-kind";
      kind.textContent = sticker.kind === "bus" ? "On bus · route sticker" : "At bus stop";
      const title = document.createElement("strong");
      title.className = "sticker-title";
      title.textContent = sticker.title;
      const sub = document.createElement("span");
      sub.className = "sticker-sub";
      sub.textContent = sticker.subtitle;
      const note = document.createElement("span");
      note.className = "sticker-note";
      note.textContent = sticker.note;
      const link = document.createElement("span");
      link.className = "sticker-link";
      link.textContent = sticker.link.replace(/^https?:\/\//, "");
      body.append(kind, title, sub, note, link);
      card.append(body);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "sticker-remove";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `Remove the ${sticker.title} sticker`);
      remove.addEventListener("click", () => {
        state.sheet = state.sheet.filter((item) => item.id !== sticker.id);
        persistSheet();
        renderSheet();
      });
      card.append(remove);
      holder.append(card);
    }
  }

  /* ------------------------------------------------------------------ events */

  function activateTab(tab) {
    state.tab = tab;
    for (const button of document.querySelectorAll(".step")) {
      const on = button.dataset.tab === tab;
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", String(on));
    }
    $("panel-bus").hidden = tab !== "bus";
    $("panel-stop").hidden = tab !== "stop";
    $("sheet-batch").textContent = tab === "bus" ? "Add every matching route" : "Add every matching stop";
  }

  function matchingRoutes() {
    const query = $("route-search").value.trim().toLowerCase();
    return catalog.routes.filter(
      (route) =>
        !query ||
        route.number.toLowerCase().includes(query) ||
        route.origin.toLowerCase().includes(query) ||
        route.destination.toLowerCase().includes(query),
    );
  }

  function matchingStops() {
    const query = $("stop-search").value.trim().toLowerCase();
    return catalog.stops.filter((stop) => !query || stop.name.toLowerCase().includes(query));
  }

  function wire() {
    $("origin").addEventListener("change", () => setOrigin($("origin").value));
    $("save-origin").addEventListener("click", () => {
      if (setOrigin($("origin").value)) $("origin").blur();
    });

    for (const button of document.querySelectorAll(".step")) {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    }

    $("route-search").addEventListener("input", renderRoutes);
    $("stop-search").addEventListener("input", renderStops);
    $("bus-reg").addEventListener("input", refreshPreview);

    $("bus-add").addEventListener("click", () => {
      if (!state.route) return;
      const added = addStickers([stickerForRoute(state.route)]);
      if (!added) $("bus-add").textContent = "Already on the sheet";
      else $("bus-add").textContent = "Add to print sheet";
    });

    $("stop-add").addEventListener("click", () => {
      if (!state.stop) return;
      const added = addStickers([stickerForStop(state.stop)]);
      if (!added) $("stop-add").textContent = "Already on the sheet";
      else $("stop-add").textContent = "Add to print sheet";
    });

    $("bus-png").addEventListener("click", () => {
      const link = busLinkNow();
      if (!link) return;
      const canvas = document.createElement("canvas");
      paint(canvas, qrFor(link), 1024);
      canvas.toBlob((blob) => blob && download(`cholo-bus-${slug(state.route.number)}.png`, blob), "image/png");
    });

    $("bus-svg").addEventListener("click", () => {
      const link = busLinkNow();
      if (!link) return;
      download(
        `cholo-bus-${slug(state.route.number)}.svg`,
        new Blob([svgFor(qrFor(link))], { type: "image/svg+xml" }),
      );
    });

    $("stop-png").addEventListener("click", () => {
      if (!state.stop) return;
      const canvas = document.createElement("canvas");
      paint(canvas, qrFor(stopLink(state.stop, state.origin)), 1024);
      canvas.toBlob((blob) => blob && download(`cholo-stop-${slug(state.stop)}.png`, blob), "image/png");
    });

    $("stop-svg").addEventListener("click", () => {
      if (!state.stop) return;
      download(
        `cholo-stop-${slug(state.stop)}.svg`,
        new Blob([svgFor(qrFor(stopLink(state.stop, state.origin)))], { type: "image/svg+xml" }),
      );
    });

    for (const button of document.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", async () => {
        const text = $(button.dataset.copy).textContent;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "Copied";
        } catch {
          // Clipboard access is refused on file:// in some browsers; select it instead.
          const range = document.createRange();
          const node = $(button.dataset.copy);
          range.selectNodeContents(node);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          button.textContent = "Select and copy";
        }
        setTimeout(() => (button.textContent = "Copy"), 1800);
      });
    }

    $("sheet-batch").addEventListener("click", () => {
      const stickerList =
        state.tab === "bus" ? matchingRoutes().map(stickerForRoute) : matchingStops().map((stop) => stickerForStop(stop.name));
      if (!stickerList.length) return;
      const count = stickerList.length;
      if (count > 8 && !window.confirm(`Add ${count} stickers to the print sheet? That is ${Math.ceil(count / 8)} A4 pages.`)) {
        return;
      }
      addStickers(stickerList);
    });

    $("sheet-print").addEventListener("click", () => {
      if (!state.sheet.length) {
        window.alert("Add at least one sticker first.");
        return;
      }
      window.print();
    });

    $("sheet-clear").addEventListener("click", () => {
      if (!state.sheet.length) return;
      if (!window.confirm(`Remove all ${state.sheet.length} stickers from the sheet?`)) return;
      state.sheet = [];
      persistSheet();
      renderSheet();
    });
  }

  /* ------------------------------------------------------------------ start */

  function start() {
    wireTheme();
    $("catalog-date").textContent = catalog.generated || "—";
    $("origin").value = read(ORIGIN_KEY, DEFAULT_ORIGIN);
    setOrigin($("origin").value, { remember: false });

    try {
      const stored = JSON.parse(read(SHEET_KEY, "[]"));
      if (Array.isArray(stored)) state.sheet = stored.filter((item) => item && typeof item.link === "string");
    } catch {
      state.sheet = [];
    }

    wire();
    activateTab("bus");
    renderRoutes();
    renderStops();
    renderSheet();
  }

  start();
})();
