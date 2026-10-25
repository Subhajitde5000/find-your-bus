/* global qrcode */
/*
 * The private QR studio.
 *
 * Draws the two kinds of sticker from the same link format the website reads
 * (`src/lib/qr.ts`), so a sticker printed here and a link built by the app cannot drift
 * apart. Everything happens in this browser: no server, no upload, no analytics.
 */
(function () {
  "use strict";

  var STORE_HOST = "cholo.qr.host";
  var STORE_SHEET = "cholo.qr.sheet";

  // qrcode-generator only encodes Latin-1 by default; stop names and Bengali text in a
  // link need real UTF-8 bytes.
  if (typeof qrcode === "function" && qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  }

  var state = {
    tab: "bus",
    host: "",
    route: null,
    stop: null,
    ec: "M",
    stopEc: "M",
    current: null,
  };

  var routes = [];
  var stops = [];

  // ---------------------------------------------------------------- small helpers

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () {
      el.classList.remove("show");
    }, 2200);
  }

  function readStore(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* private mode: the tool still works, it just forgets */
    }
  }

  function normaliseHost(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function hostProblem(host) {
    if (!host) return "Add the site address first — the QR needs an absolute https link.";
    if (!/^https?:\/\//i.test(host)) return "The address must start with https:// (or http:// for a local test).";
    if (host.replace(/^https?:\/\//i, "").indexOf("/") >= 0) return "Use the site root only: no path after the domain.";
    if (/^http:\/\//i.test(host) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
      return "http:// links cannot be App Links. Use the https address for anything you print.";
    }
    return "";
  }

  // ---------------------------------------------------------------- the link format

  function busUrl(host, route, options) {
    var params = new URLSearchParams();
    params.set("r", route.number);
    if (options.direction === "return") params.set("d", "r");
    else if (options.direction === "outbound") params.set("d", "o");
    if (options.busReg) params.set("bus", options.busReg);
    if (options.boarding) params.set("from", options.boarding);
    if (options.destination) params.set("to", options.destination);
    return host + "/qr/bus?" + params.toString();
  }

  function stopUrl(host, stop) {
    var params = new URLSearchParams();
    params.set("s", stop.name);
    return host + "/qr/stop?" + params.toString();
  }

  function shortCode(item) {
    if (item.kind === "stop") return "STOP " + item.title;
    var direction = item.direction === "outbound" ? " O" : item.direction === "return" ? " R" : "";
    return "BUS " + item.route + direction;
  }

  function buildBusItem() {
    var host = normaliseHost(state.host);
    var problem = hostProblem(host);
    if (!state.route) return { error: "Pick a route first." };
    if (problem) return { error: problem };
    var direction = $("direction").value;
    var busReg = $("bus-reg").value.trim();
    var boarding = $("boarding").value;
    var destination = $("destination").value;
    var url = busUrl(host, state.route, {
      direction: direction,
      busReg: busReg,
      boarding: boarding,
      destination: destination,
    });
    return {
      item: {
        kind: "bus",
        url: url,
        ec: state.ec,
        route: state.route.number,
        direction: direction,
        busReg: busReg,
        title: "Bus " + state.route.number,
        sub:
          state.route.origin + " to " + state.route.destination +
          (busReg ? " · " + busReg : ""),
        call: "Scan to find the stop and the bus you are on",
        foot: "cholo · Kolkata bus guide · works offline",
      },
    };
  }

  function buildStopItem() {
    var host = normaliseHost(state.host);
    var problem = hostProblem(host);
    if (!state.stop) return { error: "Pick a bus stop first." };
    if (problem) return { error: problem };
    return {
      item: {
        kind: "stop",
        url: stopUrl(host, state.stop),
        ec: state.stopEc,
        title: state.stop.name,
        sub: state.stop.buses + (state.stop.buses === 1 ? " route calls here" : " routes call here"),
        call: "Scan for today’s buses from this stop",
        foot: "cholo · Kolkata bus guide · works offline",
      },
    };
  }

  // ---------------------------------------------------------------- drawing a QR

  function makeQr(text, ec) {
    var code = qrcode(0, ec || "M");
    code.addData(text);
    code.make();
    return code;
  }

  /** A crisp SVG, drawn module by module, with a four-module quiet zone. */
  function qrSvg(text, ec, px) {
    var code = makeQr(text, ec);
    var count = code.getModuleCount();
    var quiet = 4;
    var total = count + quiet * 2;
    var paths = [];
    for (var row = 0; row < count; row += 1) {
      var col = 0;
      while (col < count) {
        if (!code.isDark(row, col)) {
          col += 1;
          continue;
        }
        var start = col;
        while (col < count && code.isDark(row, col)) col += 1;
        paths.push("M" + (start + quiet) + " " + (row + quiet) + "h" + (col - start) + "v1h-" + (col - start) + "z");
      }
    }
    var size = px || 512;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + total + " " + total +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>' +
      '<path d="' + paths.join("") + '" fill="#173a2e"/>' +
      "</svg>"
    );
  }

  function qrCanvas(text, ec, target) {
    var code = makeQr(text, ec);
    var count = code.getModuleCount();
    var quiet = 4;
    var total = count + quiet * 2;
    var scale = Math.max(1, Math.floor(target / total));
    var size = total * scale;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#173a2e";
    for (var row = 0; row < count; row += 1) {
      for (var col = 0; col < count; col += 1) {
        if (!code.isDark(row, col)) continue;
        ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    }
    return canvas;
  }

  /** The sticker as it will be printed. Used by the preview and the sheet. */
  function stickerMarkup(item, options) {
    var size = (options && options.size) || 320;
    return (
      '<div class="sticker">' +
      '<div class="sticker-top">' +
      '<span class="sticker-brand">' +
      '<span class="sticker-brand-mark" aria-hidden="true">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>' +
      '<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>' +
      '<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>' +
      "</svg></span>" +
      "cholo<span>.</span></span>" +
      '<span class="sticker-kind">' + (item.kind === "bus" ? "On bus" : "At bus stop") + "</span>" +
      "</div>" +
      '<div class="sticker-qr">' + qrSvg(item.url, item.ec, size) + "</div>" +
      '<p class="sticker-title">' + escapeHtml(item.title) + "</p>" +
      '<p class="sticker-sub">' + escapeHtml(item.sub) + "</p>" +
      '<p class="sticker-call">' + escapeHtml(item.call) + "</p>" +
      '<span class="sticker-code">' + escapeHtml(shortCode(item)) + "</span>" +
      '<span class="sticker-foot">' + escapeHtml(item.foot) + "</span>" +
      "</div>"
    );
  }

  // ---------------------------------------------------------------- preview

  function showPreview(item) {
    state.current = item;
    $("preview-empty").hidden = true;
    $("preview-body").hidden = false;
    $("preview-sticker").innerHTML = stickerMarkup(item, { size: 560 });
    $("preview-url").textContent = item.url;
    var problem = hostProblem(normaliseHost(state.host));
    var warn = $("preview-warn");
    if (problem) {
      warn.hidden = false;
      warn.textContent = problem;
    } else {
      warn.hidden = true;
      warn.textContent = "";
    }
  }

  function clearPreview(message) {
    state.current = null;
    $("preview-body").hidden = true;
    $("preview-empty").hidden = false;
    if (message) toast(message);
  }

  // ---------------------------------------------------------------- sheet

  /*
   * The sheet lives in memory and is *also* written to localStorage.
   *
   * Storage is not always available: opening this page straight from a file:// path in
   * some browsers gives an opaque origin where localStorage throws, and private windows
   * do the same. The sheet must still work there, so the in-memory list is the truth and
   * the browser copy is only there so a reload does not lose the batch.
   */
  var sheetItems = (function () {
    var saved = readStore(STORE_SHEET, []);
    return Array.isArray(saved) ? saved.filter(function (item) { return item && item.url; }) : [];
  })();

  function saveSheet() {
    writeStore(STORE_SHEET, sheetItems);
  }

  function renderSheet() {
    var sheet = sheetItems;
    $("sheet-count").textContent = sheet.length + (sheet.length === 1 ? " sticker" : " stickers");
    $("sheet-empty").hidden = sheet.length > 0;
    $("sheet-grid").innerHTML = sheet
      .map(function (item, index) {
        return (
          '<div class="sheet-item">' +
          '<button type="button" class="sheet-remove" data-index="' + index + '" aria-label="Remove this sticker">×</button>' +
          stickerMarkup(item, { size: 280 }) +
          "</div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(document.querySelectorAll(".sheet-remove"), function (button) {
      button.addEventListener("click", function () {
        var index = Number(button.getAttribute("data-index"));
        sheetItems = sheetItems.filter(function (item, position) { return position !== index; });
        saveSheet();
        renderSheet();
        toast("Removed from the sheet.");
      });
    });
  }

  function addToSheet(item) {
    if (sheetItems.some(function (existing) { return existing.url === item.url; })) {
      toast("That sticker is already on the sheet.");
      return;
    }
    sheetItems.push(item);
    saveSheet();
    renderSheet();
    toast("Added to the print sheet.");
  }

  // ---------------------------------------------------------------- search lists

  function showSuggest(listEl, items, renderButton, onPick) {
    listEl.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Nothing matches.";
      listEl.appendChild(empty);
      listEl.hidden = false;
      return;
    }
    items.forEach(function (value) {
      var li = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.innerHTML = renderButton(value);
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
        onPick(value);
      });
      li.appendChild(button);
      listEl.appendChild(li);
    });
    listEl.hidden = false;
  }

  function routeMatches(query) {
    var needle = query.trim().toLowerCase();
    if (!needle) return routes.slice(0, 12);
    var numeric = routes.filter(function (route) {
      return route.number.toLowerCase().indexOf(needle) === 0;
    });
    var textual = routes.filter(function (route) {
      return (
        numeric.indexOf(route) < 0 &&
        (route.number.toLowerCase().indexOf(needle) >= 0 ||
          route.origin.toLowerCase().indexOf(needle) >= 0 ||
          route.destination.toLowerCase().indexOf(needle) >= 0)
      );
    });
    return numeric.concat(textual).slice(0, 12);
  }

  function stopMatches(query) {
    var needle = query.trim().toLowerCase();
    if (!needle) return stops.slice(0, 12);
    var starts = stops.filter(function (stop) { return stop.name.toLowerCase().indexOf(needle) === 0; });
    var contains = stops.filter(function (stop) {
      return starts.indexOf(stop) < 0 && stop.name.toLowerCase().indexOf(needle) >= 0;
    });
    return starts.concat(contains).slice(0, 12);
  }

  function routeLabel(route) {
    return (
      "<strong>" + escapeHtml(route.number) + "</strong>" +
      "<span>" + escapeHtml(route.origin + " to " + route.destination) + "</span>" +
      '<span style="margin-left:auto">' + escapeHtml(route.type) + "</span>"
    );
  }

  function stopLabel(stop) {
    return (
      "<strong>" + escapeHtml(stop.name) + "</strong>" +
      '<span style="margin-left:auto">' + stop.buses + (stop.buses === 1 ? " bus" : " buses") + "</span>"
    );
  }

  function selectRoute(route) {
    state.route = route;
    $("route-search").value = route.number;
    $("route-suggest").hidden = true;
    var picked = $("route-picked");
    picked.hidden = false;
    picked.innerHTML =
      "<strong>" + escapeHtml(route.number) + "</strong>" +
      "<span>" + escapeHtml(route.origin + " → " + route.destination) + " · " + escapeHtml(route.type) +
      (route.operator ? " · " + escapeHtml(route.operator) : "") + "</span>" +
      '<span class="badge">' + route.stops + " stops</span>";

    var boarding = $("boarding");
    var destination = $("destination");
    var options = '<option value="">Not set' + (boarding === document.activeElement ? "" : "") + "</option>";
    boarding.innerHTML = '<option value="">Not set — the phone decides</option>';
    destination.innerHTML = '<option value="">Not set</option>';
    (route.stopsList || []).forEach(function (name) {
      boarding.insertAdjacentHTML("beforeend", '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + "</option>");
      destination.insertAdjacentHTML("beforeend", '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + "</option>");
    });
    void options;
  }

  function selectStop(stop) {
    state.stop = stop;
    $("stop-search").value = stop.name;
    $("stop-suggest").hidden = true;
    var picked = $("stop-picked");
    picked.hidden = false;
    picked.innerHTML =
      "<strong>" + escapeHtml(stop.name) + "</strong>" +
      "<span>" + stop.buses + (stop.buses === 1 ? " route calls here" : " routes call here") +
      (stop.located ? "" : " · not placed on the map") + "</span>";
  }

  // ---------------------------------------------------------------- host field

  function renderHostState() {
    var host = normaliseHost($("host").value);
    state.host = host;
    var problem = hostProblem(host);
    var chip = $("host-state");
    if (!host) {
      chip.className = "host-state";
      chip.textContent = "No address yet";
    } else if (problem) {
      chip.className = "host-state bad";
      chip.textContent = "Needs fixing";
    } else {
      chip.className = "host-state ok";
      chip.textContent = "Links will start with " + host;
    }
    writeStore(STORE_HOST, host);
  }

  // ---------------------------------------------------------------- data

  function applyData(nextRoutes, nextStops) {
    routes = nextRoutes;
    stops = nextStops;
    $("data-chip").textContent = routes.length + " routes · " + stops.length + " stops";
    $("load-error").hidden = true;
  }

  function buildFromDataset(data) {
    var busCount = {};
    var rawRoutes = (data && data.routes) || [];
    var rawStops = (data && data.stops) || [];
    rawRoutes.forEach(function (route) {
      (route.stops || []).forEach(function (name) {
        busCount[name] = (busCount[name] || 0) + 1;
      });
    });
    var nextRoutes = rawRoutes
      .map(function (route) {
        return {
          number: String(route.number),
          origin: String(route.origin || ""),
          destination: String(route.destination || ""),
          type: String(route.type || "Non-AC"),
          operator: String(route.operator || ""),
          stops: (route.stops || []).length,
          stopsList: route.stops || [],
        };
      })
      .sort(function (a, b) { return a.number.localeCompare(b.number, "en", { numeric: true, sensitivity: "base" }); });
    var nextStops = rawStops
      .map(function (stop) {
        return {
          name: String(stop.name),
          located: typeof stop.lat === "number" && typeof stop.lng === "number",
          buses: busCount[stop.name] || 0,
        };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "en", { sensitivity: "base" }); });
    return { routes: nextRoutes, stops: nextStops };
  }

  function loadData() {
    if (Array.isArray(window.QR_ROUTES) && Array.isArray(window.QR_STOPS)) {
      applyData(window.QR_ROUTES, window.QR_STOPS);
      return;
    }
    $("load-error").hidden = false;
    $("data-chip").textContent = "Data file missing";
  }

  // ---------------------------------------------------------------- events

  function wire() {
    // Host
    state.host = normaliseHost(readStore(STORE_HOST, "")) || "https://";
    $("host").value = state.host === "https://" ? "" : state.host;
    renderHostState();
    $("host").addEventListener("input", renderHostState);

    // Tabs
    function setTab(tab) {
      state.tab = tab;
      $("tab-bus").setAttribute("aria-selected", String(tab === "bus"));
      $("tab-stop").setAttribute("aria-selected", String(tab === "stop"));
      $("panel-bus").hidden = tab !== "bus";
      $("panel-stop").hidden = tab !== "stop";
    }
    $("tab-bus").addEventListener("click", function () { setTab("bus"); });
    $("tab-stop").addEventListener("click", function () { setTab("stop"); });

    // Route search
    var routeSearch = $("route-search");
    routeSearch.addEventListener("input", function () {
      if (!routeSearch.value.trim()) {
        state.route = null;
        $("route-picked").hidden = true;
      }
      showSuggest($("route-suggest"), routeMatches(routeSearch.value), routeLabel, selectRoute);
    });
    routeSearch.addEventListener("focus", function () {
      showSuggest($("route-suggest"), routeMatches(routeSearch.value), routeLabel, selectRoute);
    });
    routeSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var first = routeMatches(routeSearch.value)[0];
        if (first) selectRoute(first);
      }
      if (event.key === "Escape") $("route-suggest").hidden = true;
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest || !event.target.closest("#route-search, #route-suggest")) $("route-suggest").hidden = true;
      if (!event.target.closest || !event.target.closest("#stop-search, #stop-suggest")) $("stop-suggest").hidden = true;
    });

    // Stop search
    var stopSearch = $("stop-search");
    stopSearch.addEventListener("input", function () {
      if (!stopSearch.value.trim()) {
        state.stop = null;
        $("stop-picked").hidden = true;
      }
      showSuggest($("stop-suggest"), stopMatches(stopSearch.value), stopLabel, selectStop);
    });
    stopSearch.addEventListener("focus", function () {
      showSuggest($("stop-suggest"), stopMatches(stopSearch.value), stopLabel, selectStop);
    });
    stopSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var first = stopMatches(stopSearch.value)[0];
        if (first) selectStop(first);
      }
      if (event.key === "Escape") $("stop-suggest").hidden = true;
    });

    // Form controls
    $("direction").addEventListener("change", function () { /* used when creating */ });
    $("ec").addEventListener("change", function () { state.ec = $("ec").value; });
    $("stop-ec").addEventListener("change", function () { state.stopEc = $("stop-ec").value; });

    $("bus-create").addEventListener("click", function () {
      var result = buildBusItem();
      if (result.error) {
        toast(result.error);
        return;
      }
      showPreview(result.item);
    });
    $("stop-create").addEventListener("click", function () {
      var result = buildStopItem();
      if (result.error) {
        toast(result.error);
        return;
      }
      showPreview(result.item);
    });

    $("bus-reset").addEventListener("click", function () {
      state.route = null;
      $("route-search").value = "";
      $("route-picked").hidden = true;
      $("bus-reg").value = "";
      $("boarding").innerHTML = '<option value="">Not set — the phone decides</option>';
      $("destination").innerHTML = '<option value="">Not set</option>';
      clearPreview("Cleared.");
    });
    $("stop-reset").addEventListener("click", function () {
      state.stop = null;
      $("stop-search").value = "";
      $("stop-picked").hidden = true;
      clearPreview("Cleared.");
    });

    // Preview actions
    $("copy-link").addEventListener("click", function () {
      if (!state.current) return;
      var url = state.current.url;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { toast("Link copied."); },
          function () { toast("Could not copy — select the link by hand."); }
        );
      } else {
        toast("Copy is blocked here — select the link by hand.");
      }
    });

    $("download-png").addEventListener("click", function () {
      if (!state.current) return;
      var canvas = qrCanvas(state.current.url, state.current.ec, 1024);
      var link = document.createElement("a");
      var name = state.current.kind === "bus" ? "cholo-bus-" + state.current.route : "cholo-stop-" + state.current.title;
      link.download = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-qr.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast("PNG downloaded.");
    });

    $("download-svg").addEventListener("click", function () {
      if (!state.current) return;
      var svg = qrSvg(state.current.url, state.current.ec, 1024);
      var blob = new Blob([svg], { type: "image/svg+xml" });
      var link = document.createElement("a");
      var name = state.current.kind === "bus" ? "cholo-bus-" + state.current.route : "cholo-stop-" + state.current.title;
      link.download = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-qr.svg";
      link.href = URL.createObjectURL(blob);
      link.click();
      window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
      toast("SVG downloaded.");
    });

    $("add-sheet").addEventListener("click", function () {
      if (!state.current) return;
      addToSheet(state.current);
    });

    $("print-sheet").addEventListener("click", function () {
      if (!sheetItems.length) {
        toast("The sheet is empty — add a sticker first.");
        return;
      }
      window.print();
    });

    $("clear-sheet").addEventListener("click", function () {
      if (!sheetItems.length) return;
      sheetItems = [];
      saveSheet();
      renderSheet();
      toast("Sheet cleared.");
    });

    // Fallback data load
    $("load-data").addEventListener("click", function () {
      $("load-error").hidden = false;
      $("data-file").click();
    });
    $("data-file").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          var next = buildFromDataset(data);
          if (!next.routes.length || !next.stops.length) throw new Error("no routes or stops in that file");
          applyData(next.routes, next.stops);
          toast("Loaded " + next.routes.length + " routes and " + next.stops.length + " stops.");
        } catch (error) {
          $("data-chip").textContent = "Could not read that file";
          toast("That file could not be read: " + error.message);
        }
      };
      reader.readAsText(file);
    });

    renderSheet();
  }

  loadData();
  wire();
})();
