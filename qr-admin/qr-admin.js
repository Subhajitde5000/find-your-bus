/*
 * The Pathsathi QR sticker maker.
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

  const DEFAULT_ORIGIN = "https://pathsathi.example";
  const ORIGIN_KEY = "pathsathi:qr:origin";
  const SHEET_KEY = "pathsathi:qr:sheet";
  const THEME_KEY = "pathsathi:qr:theme";
  const SIZE_KEY = "pathsathi:qr:size";
  const LOGO_KEY = "pathsathi:qr:logo";
  const MAX_LIST_ROWS = 120;
  /** Quiet zone in modules, as the QR specification requires. */
  const QUIET = 4;

  /**
   * A4 at the stylesheet's page margin (`@page { margin: 10mm }`), in millimetres.
   * The sheet counts how many stickers fit, so the two numbers must agree.
   */
  const PAGE = { width: 210, height: 297, margin: 10 };

  /**
   * Sticker sizes, in millimetres. A sticker is a physical object, so its size is a print
   * decision rather than a layout one: `qr` is the printed width of the code and `gap` is
   * the space between stickers on the page. The sheet lays out as many as fit.
   */
  const SIZES = {
    small: { label: "Small", width: 70, height: 45, qr: 30, gap: 5 },
    standard: { label: "Standard", width: 90, height: 60, qr: 40, gap: 6 },
    large: { label: "Large", width: 120, height: 65, qr: 50, gap: 6 },
    wide: { label: "Wide", width: 190, height: 55, qr: 42, gap: 5 },
  };
  /** Nothing outside these can be printed sensibly on A4, so the fields are bounded. */
  const SIZE_LIMITS = { width: [40, 190], height: [30, 140], qr: [20, 110], gap: [0, 15] };
  /** Below this, a phone camera on paper starts to struggle: the sheet says so. */
  const MIN_MM_PER_MODULE = 0.35;

  const catalog = window.PATHSATHI_QR_CATALOG || { routes: [], stops: [], counts: {} };
  const logoSpec = window.PATHSATHI_LOGO || null;
  const state = {
    origin: DEFAULT_ORIGIN,
    tab: "bus",
    route: null,
    stop: null,
    sheet: [],
    densestModules: null,
    size: sizeOf("standard"),
    logo: true,
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

  /* ------------------------------------------------------------------ sticker size */

  function sizeOf(name) {
    const preset = SIZES[name] || SIZES.standard;
    return { width: preset.width, height: preset.height, qr: preset.qr, gap: preset.gap };
  }

  function clampTo(value, [min, max]) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  /** How many stickers of this size fit on one A4 page, and therefore on the sheet. */
  function layoutFor(size) {
    const usableWidth = PAGE.width - PAGE.margin * 2;
    const usableHeight = PAGE.height - PAGE.margin * 2;
    const columns = Math.max(1, Math.floor((usableWidth + size.gap) / (size.width + size.gap)));
    const rows = Math.max(1, Math.floor((usableHeight + size.gap) / (size.height + size.gap)));
    return { columns, rows, perPage: columns * rows };
  }

  /**
   * Every size passes through here: bounds first, then the code can never be wider than
   * the sticker it sits on. A typo becomes a clamped number, not an unprintable sheet.
   */
  function normaliseSize(input) {
    const next = { ...state.size, ...input };
    for (const key of ["width", "height", "qr", "gap"]) {
      const value = clampTo(next[key], SIZE_LIMITS[key]);
      if (value !== null) next[key] = value;
    }
    next.qr = Math.min(next.qr, Math.min(next.width, next.height) - 6);
    return next;
  }

  function presetName(size) {
    return (
      Object.keys(SIZES).find((name) => {
        const preset = SIZES[name];
        return (
          preset.width === size.width &&
          preset.height === size.height &&
          preset.qr === size.qr &&
          preset.gap === size.gap
        );
      }) || "custom"
    );
  }

  /** Millimetres per printed module: the one number that predicts whether a code scans. */
  function mmPerModule(modules) {
    return state.size.qr / (modules + QUIET * 2);
  }

  function applySize(input, { remember = true } = {}) {
    state.size = normaliseSize(input);
    const size = state.size;
    const root = document.documentElement;
    const layout = layoutFor(size);
    // Words are dropped before they are allowed to overflow: a short sticker or one whose
    // code leaves little room loses the sentence, then the eyebrow, in that order.
    const padMm = Math.max(3, Math.round(Math.min(size.width, size.height) * 0.07));
    const textRoom = Math.max(0, size.width - size.qr - padMm * 2 - Math.round(size.width * 0.039));
    const pages = $("sheet-cards");
    if (pages) {
      // A sentence needs roughly 26 mm of width beside the code and 42 mm of height;
      // below that the sticker keeps the title, the route and the link.
      pages.dataset.compact = textRoom < 26 || size.height < 42 ? "on" : "off";
      pages.dataset.tight = textRoom < 16 ? "on" : "off";
    }
    root.style.setProperty("--sticker-w", String(size.width));
    root.style.setProperty("--sticker-h", String(size.height));
    root.style.setProperty("--sticker-qr", String(size.qr));
    root.style.setProperty("--sticker-gap", String(size.gap));
    root.style.setProperty("--sticker-pad", String(Math.max(3, Math.round(Math.min(size.width, size.height) * 0.07))));
    root.style.setProperty("--sheet-cols", String(layout.columns));
    // The room left for words once the code is drawn: the text is sized against this,
    // so a sticker with a big code gets smaller type instead of an overflow.
    root.style.setProperty("--sticker-text-mm", String(textRoom));
    // Explicit pixels for the screen: CSS cannot divide one custom property by another,
    // so the geometry is computed here rather than in calc().
    root.style.setProperty("--sticker-qr-px", `${(size.qr * 3.7795).toFixed(2)}px`);
    root.style.setProperty("--sticker-w-px", `${(size.width * 3.7795).toFixed(2)}px`);
    root.style.setProperty("--sticker-h-px", `${(size.height * 3.7795).toFixed(2)}px`);
    root.style.setProperty("--sticker-pad-px", `${(Math.max(3, Math.round(Math.min(size.width, size.height) * 0.07)) * 3.7795).toFixed(2)}px`);

    const name = presetName(size);
    for (const button of document.querySelectorAll("[data-size-preset]")) {
      button.setAttribute("aria-pressed", String(button.dataset.sizePreset === name));
    }
    const fields = { width: $("size-width"), height: $("size-height"), qr: $("size-qr"), gap: $("size-gap") };
    for (const key of Object.keys(fields)) {
      if (fields[key]) fields[key].value = String(size[key]);
    }

    if (remember) write(SIZE_KEY, JSON.stringify(size));
    renderSheet();
    refreshPreview();
  }

  /* ------------------------------------------------------------------ logo in the code */

  /** Whether the site's mark is drawn in the middle of the code. */
  function applyLogo(on, { remember = true } = {}) {
    state.logo = Boolean(on);
    const toggle = $("logo-toggle");
    if (toggle) toggle.checked = state.logo;
    document.documentElement.dataset.qrLogo = state.logo ? "on" : "off";
    if (remember) write(LOGO_KEY, state.logo ? "on" : "off");
    renderSheet();
    refreshPreview();
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
    context.fill();
  }

  /**
   * Draws the white plate and the Pathsathi mark over the finished code.
   *
   * The plate is the whole trick: modules underneath it are gone, so it has to be clean
   * white rather than semi-transparent, and the code has to be level H for the decoder
   * to rebuild them (`qrFor`). Geometry comes from `logo.js`, which verify-qr.mjs uses
   * as well, so what is tested is what is printed.
   */
  function drawLogo(context, total) {
    if (!logoSpec) return false;
    const pad = total * logoSpec.padRatio;
    const box = total * logoSpec.boxRatio;
    const origin = (total - pad) / 2;
    context.fillStyle = "#ffffff";
    roundedRect(context, origin, origin, pad, pad, pad * logoSpec.padRadius);

    const scale = box / logoSpec.viewBox;
    const left = (total - box) / 2;
    const top = (total - box) / 2;
    for (const shape of logoSpec.shapes) {
      context.fillStyle = shape.fill;
      if (shape.rect) {
        const [x, y, width, height] = shape.rect;
        roundedRect(context, left + x * scale, top + y * scale, width * scale, height * scale, (shape.radius || 0) * scale);
      } else if (shape.circle) {
        const [cx, cy, radius] = shape.circle;
        context.beginPath();
        context.arc(left + cx * scale, top + cy * scale, radius * scale, 0, Math.PI * 2);
        context.closePath();
        context.fill();
      }
    }
    return true;
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
    if (!origin) return "Enter the website address, for example https://pathsathi.in";
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
    // Type 0 lets the encoder pick the smallest version that fits. With a logo the code
    // has to survive a hole in the middle, so the level goes up to H (about 30%
    // recoverable); without one, M is the level that survives a scuffed sticker without
    // making the code needlessly dense.
    const code = window.qrcode(0, state.logo && logoSpec ? logoSpec.level : "M");
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
    if (!context) return { modules, pixelSize: 0, scale: 0, logo: false };
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
    const logo = state.logo ? drawLogo(context, total) : false;
    return { modules, pixelSize: total, scale, logo };
  }

  /** The mark as SVG, in the code's own module coordinates, so exports match the screen. */
  function logoSvg(size) {
    if (!logoSpec) return "";
    const pad = size * logoSpec.padRatio;
    const box = size * logoSpec.boxRatio;
    const origin = (size - pad) / 2;
    const scale = box / logoSpec.viewBox;
    const shapes = logoSpec.shapes
      .map((shape) => {
        if (shape.rect) {
          const [x, y, width, height] = shape.rect;
          return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${shape.radius || 0}" fill="${shape.fill}"/>`;
        }
        const [cx, cy, radius] = shape.circle;
        return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${shape.fill}"/>`;
      })
      .join("");
    return (
      `<g data-pathsathi-logo="true">` +
      `<rect x="${origin}" y="${origin}" width="${pad}" height="${pad}" rx="${pad * logoSpec.padRadius}" fill="#ffffff"/>` +
      `<g transform="translate(${(size - box) / 2} ${(size - box) / 2}) scale(${scale})">${shapes}</g>` +
      `</g>`
    );
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
      (state.logo ? logoSvg(size) : "") +
      `</svg>`
    );
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
      .slice(0, 48) || "pathsathi";
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
    $("bus-empty").hidden = true;
    $("bus-title").textContent = `Bus ${route.number}`;
    $("bus-sub").textContent = `${route.origin} ↔ ${route.destination} · ${route.type} · ${route.operator} · ${route.stops} stops${route.timed ? "" : " · no published times"}`;
    $("bus-reg").value = "";
    // The add button carries a one-off "already on the sheet"; a new route resets it.
    $("bus-add").textContent = "Add to print sheet";
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
    $("stop-empty").hidden = true;
    $("stop-title").textContent = stop.name;
    $("stop-sub").textContent = "The next buses from this stop, and the whole day.";
    $("stop-add").textContent = "Add to print sheet";
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

  /** What the printed code will actually be: module count, and millimetres per module. */
  function describeDensity(modules) {
    const mm = mmPerModule(modules);
    const parts = [
      `${modules}×${modules} modules`,
      `${mm.toFixed(2)} mm per module at ${state.size.qr} mm${state.logo ? " with the logo" : ""}`,
    ];
    const tooDense = mm < MIN_MM_PER_MODULE;
    if (tooDense) parts.push("too dense for this size: print larger, or turn the logo off");
    return { text: parts.join(" · "), tooDense };
  }

  function refreshPreview() {
    if (state.route) {
      const link = busLinkNow();
      const typed = $("bus-reg").value.trim();
      const badRegistration = typed && !normaliseRegistration(typed);
      $("bus-reg").classList.toggle("bad", Boolean(badRegistration));
      $("bus-link").textContent = link;
      $("bus-open").href = link;
      const painted = paint($("bus-qr"), qrFor(link), 640);
      const density = describeDensity(painted.modules);
      const meta = $("bus-qr-meta");
      meta.textContent = density.text;
      meta.classList.toggle("bad", density.tooDense);
      if (badRegistration) {
        meta.classList.add("bad");
        meta.textContent = "Bus number ignored: use a plate like WB 04 A 1234";
      }
    }

    if (state.stop) {
      const link = stopLink(state.stop, state.origin);
      $("stop-link").textContent = link;
      $("stop-open").href = link;
      const painted = paint($("stop-qr"), qrFor(link), 640);
      const density = describeDensity(painted.modules);
      const meta = $("stop-qr-meta");
      meta.textContent = density.text;
      meta.classList.toggle("bad", density.tooDense);
    }

    updateSizeSummary();
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

  /**
   * The page frames are drawn at real paper size, which is wider than a phone. Rather than
   * cropping them, the whole frame is zoomed down to fit the window — zoom scales the
   * layout, so the preview keeps every printed proportion. Printing resets it to 1.
   */
  function fitSheetPreview() {
    const holder = $("sheet-cards");
    if (!holder) return;
    holder.style.removeProperty("--sheet-zoom");
    const frame = holder.querySelector(".sheet-page");
    if (!frame) return;
    const pageWidth = frame.getBoundingClientRect().width;
    const available = holder.clientWidth - 2;
    if (!pageWidth || !available) return;
    const zoom = Math.min(1, available / pageWidth);
    if (!Number.isFinite(zoom) || zoom >= 0.999) {
      holder.dataset.zoomed = "off";
      holder.style.removeProperty("--sheet-zoom");
      return;
    }
    holder.style.setProperty("--sheet-zoom", zoom.toFixed(3));
    holder.dataset.zoomed = zoom < 0.75 ? "on" : "off";
  }

  /**
   * What the current size means in practice: how many fit on a page, and whether the
   * smallest code on the sheet is still printable at that size. The number is measured
   * from the codes actually on the sheet, not from a guess.
   */
  function updateSizeSummary(densestModules = state.densestModules) {
    const size = state.size;
    const layout = layoutFor(size);
    const parts = [`${layout.columns} × ${layout.rows} = ${layout.perPage} per A4 page`];
    let tooDense = false;
    if (densestModules) {
      const mm = mmPerModule(densestModules);
      parts.push(`${mm.toFixed(2)} mm per module`);
      tooDense = mm < MIN_MM_PER_MODULE;
      if (tooDense) parts.push("too dense at this size: print larger, or turn the logo off");
    }
    const meta = $("size-meta");
    if (meta) {
      const textMm = Number(document.documentElement.style.getPropertyValue("--sticker-text-mm")) || 0;
      if (textMm > 0 && textMm < 22) parts.push("little room left for the words: a smaller code reads better");
      meta.textContent = parts.join(" · ");
      meta.classList.toggle("bad", tooDense || (textMm > 0 && textMm < 16));
    }
    const note = $("print-note");
    if (note) {
      note.textContent =
        `Print at 100% (no “fit to page”), on sticker paper or plain paper with tape. ` +
        `Each sticker is ${size.width} × ${size.height} mm with a ${size.qr} mm code, ` +
        `${size.gap} mm apart. Stickers always print black on white, whatever theme this screen is in.`;
    }
  }

  /** One card per sticker, in the same proportions it will be printed in. */
  function buildSticker(sticker) {
    const card = document.createElement("article");
    card.className = "sticker";

    const canvas = document.createElement("canvas");
    const painted = paint(canvas, qrFor(sticker.link), 480);
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
    return { card, modules: painted.modules };
  }

  /**
   * The sheet is dealt into real A4 pages rather than one long grid, so the page count
   * shown here is the number of sheets that come out of the printer, and a page break
   * never lands in the middle of a sticker.
   */
  function renderSheet() {
    const holder = $("sheet-cards");
    holder.replaceChildren();
    const layout = layoutFor(state.size);
    const pages = Math.max(1, Math.ceil(state.sheet.length / layout.perPage));
    $("sheet-meta").textContent = state.sheet.length
      ? `${state.sheet.length} sticker${state.sheet.length === 1 ? "" : "s"} · ${layout.columns} × ${layout.rows} per page · ${pages} A4 page${pages === 1 ? "" : "s"}`
      : "Nothing added yet.";

    if (!state.sheet.length) {
      const empty = document.createElement("p");
      empty.className = "sheet-empty";
      empty.textContent = `Pick a route or a stop above and add it here. ${layout.perPage} stickers of this size fit on an A4 page.`;
      holder.append(empty);
      state.densestModules = null;
      updateSizeSummary(null);
      return;
    }

    let densest = 0;
    for (let page = 0; page < pages; page += 1) {
      const slice = state.sheet.slice(page * layout.perPage, (page + 1) * layout.perPage);
      const section = document.createElement("section");
      section.className = "sheet-page";
      section.dataset.page = String(page + 1);

      const head = document.createElement("header");
      head.className = "sheet-page-head";
      const left = document.createElement("span");
      left.textContent = `A4 page ${page + 1} of ${pages}`;
      const right = document.createElement("span");
      right.textContent = `${slice.length} of ${layout.perPage} places used`;
      head.append(left, right);

      const grid = document.createElement("div");
      grid.className = "sheet-cards";
      for (const sticker of slice) {
        const built = buildSticker(sticker);
        // The largest module count needs the most millimetres per module to stay legible.
        densest = Math.max(densest, built.modules);
        grid.append(built.card);
      }
      section.append(head, grid);
      holder.append(section);
    }
    state.densestModules = densest;
    updateSizeSummary(densest);
    fitSheetPreview();
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
      canvas.toBlob((blob) => blob && download(`pathsathi-bus-${slug(state.route.number)}.png`, blob), "image/png");
    });

    $("bus-svg").addEventListener("click", () => {
      const link = busLinkNow();
      if (!link) return;
      download(
        `pathsathi-bus-${slug(state.route.number)}.svg`,
        new Blob([svgFor(qrFor(link))], { type: "image/svg+xml" }),
      );
    });

    $("stop-png").addEventListener("click", () => {
      if (!state.stop) return;
      const canvas = document.createElement("canvas");
      paint(canvas, qrFor(stopLink(state.stop, state.origin)), 1024);
      canvas.toBlob((blob) => blob && download(`pathsathi-stop-${slug(state.stop)}.png`, blob), "image/png");
    });

    $("stop-svg").addEventListener("click", () => {
      if (!state.stop) return;
      download(
        `pathsathi-stop-${slug(state.stop)}.svg`,
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
      const perPage = layoutFor(state.size).perPage;
      if (count > perPage && !window.confirm(`Add ${count} stickers to the print sheet? That is ${Math.ceil(count / perPage)} A4 pages at this size.`)) {
        return;
      }
      addStickers(stickerList);
    });

    for (const button of document.querySelectorAll("[data-size-preset]")) {
      button.addEventListener("click", () => applySize(sizeOf(button.dataset.sizePreset)));
    }

    for (const key of ["width", "height", "qr", "gap"]) {
      const input = $(`size-${key}`);
      if (!input) continue;
      // Typing applies as soon as the number is usable, so the preview follows the hand.
      input.addEventListener("input", () => {
        const value = clampTo(input.value, SIZE_LIMITS[key]);
        if (value === null) return;
        applySize({ [key]: value });
      });
      // Leaving the field always shows the number that will be printed.
      input.addEventListener("change", () => applySize({ [key]: input.value }));
    }

    $("logo-toggle").addEventListener("change", () => applyLogo($("logo-toggle").checked));

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(fitSheetPreview, 150);
    });
    // Fonts change the height of the page head, which changes nothing about the width,
    // but the first measurement has to happen after layout.
    window.setTimeout(fitSheetPreview, 0);

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

    // Saved print size, if it is still a sensible one; the same for the logo choice.
    try {
      const storedSize = JSON.parse(read(SIZE_KEY, "null"));
      if (storedSize && typeof storedSize === "object") state.size = normaliseSize(storedSize);
    } catch {
      /* a corrupt value falls back to the standard sticker */
    }
    applySize(state.size, { remember: false });
    applyLogo(read(LOGO_KEY, "on") !== "off", { remember: false });

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
