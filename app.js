// app.js (COMPLET)
// ✅ Inputs "numériques" en TEXT (inputmode=numeric) pour éviter la validation/fermeture iPhone
// ✅ Enter / "Suivant" => focus automatique sur le champ suivant (Saisie + Prépa)
// ✅ Saisie: si U/pack>0 => saisie PACKS uniquement, sinon UNITÉS uniquement
// ✅ Prépa: tri CARTONS -> PACKS -> PETIT PRODUIT (ordre interne conservé via dotations_order.json)
// ✅ Consommation: clôture + sauvegarde écrit un log, affichage semaine/mois, export CSV
// ✅ Onglets Produits/Services retirés de l'UI mais code conservé

const K_ENTRY = "ps_entry_json_v7";        // { serviceId: { code: { p:"", u:"" } } }
const K_DONE  = "ps_done_json_v10";        // { serviceId: { code: true } }
const K_PREP  = "ps_prepared_json_v10";    // { serviceId: { code: number } }
const K_LOG   = "ps_consumption_log_v1";   // [ {ts, serviceId, code, qtyU} ]

let products = [];
let services = [];
let dotations = {};
let dotationsOrder = {};

let entry = load(K_ENTRY, {});
let done  = load(K_DONE, {});
let prepared = load(K_PREP, {});
let logEvents = load(K_LOG, []);

// ---------------- Helpers ----------------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function clampInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.floor(x);
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function getProduct(code) {
  return products.find(p => String(p.code) === String(code)) || null;
}
function getService(id) {
  return services.find(s => String(s.id) === String(id)) || null;
}
function serviceName(id) {
  return getService(id)?.name ?? id ?? "Service";
}

function catLabel(c) {
  if (c === "Cartons") return "Cartons";
  if (c === "Pack") return "Paquet/Rouleau/Boîte";
  return "Petit produit";
}

function unitsFromRestPackUnit(p, pk, u) {
  const upp = clampInt(p.unitsPerPack);
  const packsUnits = upp > 0 ? clampInt(pk) * upp : 0;
  return packsUnits + clampInt(u);
}

function formatParenCartonPack(p, units) {
  let remaining = clampInt(units);
  const upc = clampInt(p.unitsPerCarton);
  const upp = clampInt(p.unitsPerPack);

  let cartons = 0;
  let packs = 0;

  if (upc > 0) {
    cartons = Math.floor(remaining / upc);
    remaining -= cartons * upc;
  }
  if (upp > 0) {
    packs = Math.floor(remaining / upp);
    remaining -= packs * upp;
  }

  const parts = [];
  if (cartons > 0) parts.push(`${cartons} carton${cartons>1?"s":""}`);
  if (packs > 0) parts.push(`${packs} pack${packs>1?"s":""}`);

  return parts.length ? `(${parts.join(" + ")})` : "";
}

function formatUnitsToBest(p, units) {
  let remaining = clampInt(units);
  const parts = [];
  const upc = clampInt(p.unitsPerCarton);
  const upp = clampInt(p.unitsPerPack);

  if (upc > 0) {
    const cartons = Math.floor(remaining / upc);
    if (cartons > 0) { parts.push(`${cartons} carton(s)`); remaining -= cartons * upc; }
  }
  if (upp > 0) {
    const packs = Math.floor(remaining / upp);
    if (packs > 0) { parts.push(`${packs} pack(s)`); remaining -= packs * upp; }
  }
  if (remaining > 0) parts.push(`${remaining} unité(s)`);
  return parts.length ? parts.join(" + ") : "0 unité";
}

function getOrderedCodesForService(sid) {
  const map = dotations?.[sid] || {};
  const order = Array.isArray(dotationsOrder?.[sid]) ? dotationsOrder[sid].map(String) : [];
  const codesInDot = Object.keys(map).map(String);

  const ordered = order.filter(c => c in map);
  for (const c of codesInDot) if (!ordered.includes(c)) ordered.push(c);
  return ordered;
}

// ---- Input helpers (iPhone friendly) ----
function numericTextValueToInt(v) {
  const raw = String(v ?? "");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return String(clampInt(digits));
}

// Permet "Entrée" / "Suivant" => focus champ suivant
function enableEnterToNext(container) {
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('input[data-p], input[data-u], input[data-prepared]'))
    .filter(el => !el.disabled);

  inputs.forEach((inp, idx) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[idx + 1];
        if (next) next.focus();
        else inp.blur();
      }
    });
  });
}

// ---------------- Sticky reminder (SAISIE) ----------------
function updateEntryReminderVisibility() {
  const reminder = document.getElementById("entryReminder");
  const entryPanel = document.getElementById("tab-entry");
  if (!reminder || !entryPanel) return;
  const isVisible = !entryPanel.classList.contains("hidden");
  reminder.classList.toggle("hidden", !isVisible);
}

// ---------------- Tabs ----------------
const tabButtons = document.querySelectorAll(".tab");
const panels = {
  products: document.getElementById("tab-products"),
  services: document.getElementById("tab-services"),
  dotations: document.getElementById("tab-dotations"),
  entry: document.getElementById("tab-entry"),
  prep: document.getElementById("tab-prep"),
  consumption: document.getElementById("tab-consumption"),
};

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const t = btn.dataset.tab;
    Object.values(panels).forEach(p => p && p.classList.add("hidden"));
    panels[t]?.classList.remove("hidden");

    if (t === "products") renderProducts();
    if (t === "services") renderServices();
    if (t === "dotations") { syncSelects(); renderDotations(); }
    if (t === "entry") { syncSelects(); renderEntry(); }
    if (t === "prep") { syncSelects(); renderPrep(); }
    if (t === "consumption") { renderConsumption(); }

    updateEntryReminderVisibility();
  });
});

// ---------------- Load JSONs ----------------
const productsLoadStatus = document.getElementById("productsLoadStatus");
document.getElementById("reloadAll")?.addEventListener("click", () => loadAll(true));

async function loadAll(showAlert = false) {
  try {
    if (productsLoadStatus) productsLoadStatus.textContent = "Chargement JSON…";

    const [pRes, sRes, dRes, oRes] = await Promise.all([
      fetch("products.json", { cache: "no-store" }),
      fetch("services.json", { cache: "no-store" }),
      fetch("dotations.json", { cache: "no-store" }),
      fetch("dotations_order.json", { cache: "no-store" })
    ]);

    if (!pRes.ok) throw new Error("products.json introuvable");
    if (!sRes.ok) throw new Error("services.json introuvable");
    if (!dRes.ok) throw new Error("dotations.json introuvable");
    if (!oRes.ok) throw new Error("dotations_order.json introuvable");

    const pData = await pRes.json();
    const sData = await sRes.json();
    const dData = await dRes.json();
    const oData = await oRes.json();

    products = (Array.isArray(pData) ? pData : [])
      .map(p => ({
        code: String(p.code ?? "").trim(),
        name: String(p.name ?? "").trim(),
        category: (p.category === "Cartons" || p.category === "Pack" || p.category === "Petit") ? p.category : "Petit",
        unitsPerCarton: clampInt(p.unitsPerCarton),
        unitsPerPack: clampInt(p.unitsPerPack),
      }))
      .filter(p => p.code && p.name);

    services = (Array.isArray(sData) ? sData : [])
      .map(s => ({ id: String(s.id ?? "").trim(), name: String(s.name ?? "").trim() }))
      .filter(s => s.id && s.name)
      .sort((a,b)=>a.name.localeCompare(b.name, "fr"));

    dotations = (dData && typeof dData === "object") ? dData : {};
    dotationsOrder = (oData && typeof oData === "object") ? oData : {};

    for (const s of services) {
      entry[s.id] = entry[s.id] || {};
      done[s.id]  = done[s.id]  || {};
      prepared[s.id] = prepared[s.id] || {};
    }
    save(K_ENTRY, entry);
    save(K_DONE, done);
    save(K_PREP, prepared);

    if (productsLoadStatus) {
      productsLoadStatus.textContent = `OK ✅ (${products.length} produits • ${services.length} services)`;
    }

    renderProducts();
    renderServices();
    syncSelects();
    renderDotations();
    renderEntry();
    renderPrep();
    renderConsumption();

    updateEntryReminderVisibility();

    if (showAlert) alert("JSON rechargés ✅");
  } catch (e) {
    console.error(e);
    if (productsLoadStatus) {
      productsLoadStatus.textContent = "Erreur: vérifie que l'app est servie en https (GitHub Pages) et que les JSON existent.";
    }
  }
}

// ---------------- Render Products (code conservé) ----------------
function renderProducts() {
  const countEl = document.getElementById("productsCount");
  if (countEl) countEl.textContent = `${products.length} produit(s)`;

  const tbody = document.querySelector("#productsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Aucun produit chargé.</td></tr>`;
    return;
  }

  const sorted = [...products].sort((a,b)=>{
    const ca = catLabel(a.category).localeCompare(catLabel(b.category), "fr");
    if (ca !== 0) return ca;
    return String(a.code).localeCompare(String(b.code), "fr", { numeric:true });
  });

  for (const p of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.code)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(catLabel(p.category))}</td>
      <td>${clampInt(p.unitsPerCarton)}</td>
      <td>${clampInt(p.unitsPerPack)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ---------------- Render Services (code conservé) ----------------
function renderServices() {
  const tbody = document.querySelector("#servicesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!services.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="muted">Aucun service chargé.</td></tr>`;
    return;
  }

  for (const s of services) {
    const count = Object.keys(dotations?.[s.id] || {}).length;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(s.name)}</td><td>${count}</td>`;
    tbody.appendChild(tr);
  }
}

// ---------------- SELECTS ----------------
const d_service = document.getElementById("d_service");
const e_service = document.getElementById("e_service");
const p_service = document.getElementById("p_service");

function fillSelectServices(sel, items, placeholder) {
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  sel.appendChild(opt0);

  for (const s of items) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function syncSelects() {
  fillSelectServices(d_service, services, "Choisir...");
  fillSelectServices(e_service, services, "Choisir...");
  fillSelectServices(p_service, services, "Choisir...");

  if (services.length) {
    if (d_service && !services.some(s => s.id === d_service.value)) d_service.value = services[0].id;
    if (e_service && !services.some(s => s.id === e_service.value)) e_service.value = services[0].id;
    if (p_service && !services.some(s => s.id === p_service.value)) p_service.value = services[0].id;
  }
}

d_service?.addEventListener("change", renderDotations);
e_service?.addEventListener("change", () => { renderEntry(); renderPrep(); });
p_service?.addEventListener("change", renderPrep);

// ---------------- DOTATIONS VIEW ----------------
function renderDotations() {
  const sid = d_service?.value;
  const tbody = document.querySelector("#dotationsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!sid) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Sélectionne un service.</td></tr>`;
    return;
  }

  const map = dotations?.[sid] || {};
  const codes = getOrderedCodesForService(sid);

  if (!codes.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Aucune dotation pour ce service.</td></tr>`;
    return;
  }

  let idx = 0;
  for (const code of codes) {
    const p = getProduct(code);
    if (!p) continue;

    idx++;
    const target = clampInt(map[code]);
    const eq = formatUnitsToBest(p, target);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx}</td>
      <td>${escapeHtml(code)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td><strong>${target}</strong></td>
      <td class="muted">${escapeHtml(eq)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ---------------- ENTRY ----------------
document.getElementById("clearEntry")?.addEventListener("click", () => {
  const sid = e_service?.value;
  if (!sid) return;
  entry[sid] = {};
  prepared[sid] = {};
  done[sid] = {};
  save(K_ENTRY, entry);
  save(K_PREP, prepared);
  save(K_DONE, done);
  renderEntry();
  renderPrep();
});

function renderEntry() {
  const sid = e_service?.value;
  const tbody = document.querySelector("#entryTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!sid) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Sélectionne un service.</td></tr>`;
    return;
  }

  const map = dotations?.[sid] || {};
  const codes = getOrderedCodesForService(sid);

  if (!codes.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Aucune dotation sur ce service.</td></tr>`;
    return;
  }

  entry[sid] = entry[sid] || {};

  let idx = 0;
  for (const code of codes) {
    const p = getProduct(code);
    if (!p) continue;

    idx++;
    const target = clampInt(map[code]);
    const cur = entry[sid][code] || { p:"", u:"" };

    const upp = clampInt(p.unitsPerPack);
    const packEnabled = upp > 0;
    const unitEnabled = upp === 0;

    const allEmpty =
      (cur.p === "" || cur.p == null) &&
      (cur.u === "" || cur.u == null);

    const prepU = allEmpty
      ? 0
      : Math.max(0, target - unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx}</td>
      <td>${escapeHtml(code)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>
        <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
          ${packEnabled ? "" : "disabled"}
          value="${escapeHtml(cur.p ?? "")}"
          data-p="${escapeHtml(code)}">
      </td>
      <td>
        <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
          ${unitEnabled ? "" : "disabled"}
          value="${escapeHtml(cur.u ?? "")}"
          data-u="${escapeHtml(code)}">
      </td>
      <td><strong>${prepU}</strong> <span class="muted">u</span></td>
    `;
    tbody.appendChild(tr);
  }

  // Input listeners (sanitize digits)
  tbody.querySelectorAll("input[data-p]").forEach(inp =>
    inp.addEventListener("input", () => {
      const code = inp.getAttribute("data-p");
      const sanitized = numericTextValueToInt(inp.value);
      if (inp.value !== sanitized) inp.value = sanitized;
      updateEntryCell(sid, code, "p", sanitized);
    })
  );

  tbody.querySelectorAll("input[data-u]").forEach(inp =>
    inp.addEventListener("input", () => {
      const code = inp.getAttribute("data-u");
      const sanitized = numericTextValueToInt(inp.value);
      if (inp.value !== sanitized) inp.value = sanitized;
      updateEntryCell(sid, code, "u", sanitized);
    })
  );

  // Enter/Suivant => next input
  enableEnterToNext(tbody);

  updateEntryReminderVisibility();
}

function updateEntryCell(sid, code, key, value) {
  entry[sid] = entry[sid] || {};
  entry[sid][code] = entry[sid][code] || { p:"", u:"" };

  const p = getProduct(code);
  const upp = p ? clampInt(p.unitsPerPack) : 0;

  // règle: si pack>0 -> on n'autorise que packs ; sinon que unités
  if (upp > 0) {
    if (key === "u") return;
    entry[sid][code].u = "";
  } else {
    if (key === "p") return;
    entry[sid][code].p = "";
  }

  const v = String(value ?? "").trim();
  entry[sid][code][key] = (v === "") ? "" : String(clampInt(v));
  save(K_ENTRY, entry);

  const cur = entry[sid][code];
  const allEmpty =
    (cur.p === "" || cur.p == null) &&
    (cur.u === "" || cur.u == null);

  if (allEmpty) {
    prepared[sid] = prepared[sid] || {};
    delete prepared[sid][code];
    done[sid] = done[sid] || {};
    delete done[sid][code];
    save(K_PREP, prepared);
    save(K_DONE, done);
  }

  renderEntry();
  renderPrep();
}

// ---------------- PREP ----------------
document.getElementById("checkAll")?.addEventListener("click", () => {
  const sid = p_service?.value;
  if (!sid) return;

  const map = dotations?.[sid] || {};
  const codes = getOrderedCodesForService(sid);

  done[sid] = done[sid] || {};
  prepared[sid] = prepared[sid] || {};

  for (const code of codes) {
    const p = getProduct(code);
    if (!p) continue;

    const cur = entry?.[sid]?.[code] ?? { p:"", u:"" };
    const allEmpty =
      (cur.p === "" || cur.p == null) &&
      (cur.u === "" || cur.u == null);
    if (allEmpty) continue;

    const target = clampInt(map[code]);
    const remainU = unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0);
    const needU = Math.max(0, target - remainU);
    if (needU <= 0) continue;

    done[sid][code] = true;
    prepared[sid][code] = needU;
  }

  save(K_DONE, done);
  save(K_PREP, prepared);
  renderPrep();
});

document.getElementById("uncheckAll")?.addEventListener("click", () => {
  const sid = p_service?.value;
  if (!sid) return;
  done[sid] = {};
  save(K_DONE, done);
  renderPrep();
});

function renderPrep() {
  const sid = p_service?.value;
  const list = document.getElementById("prepList");
  const summary = document.getElementById("prepSummary");
  if (!list || !summary) return;

  list.innerHTML = "";
  summary.textContent = "";

  if (!sid) {
    list.innerHTML = `<div class="muted">Sélectionne un service.</div>`;
    return;
  }

  const map = dotations?.[sid] || {};
  const codes = getOrderedCodesForService(sid);

  done[sid] = done[sid] || {};
  prepared[sid] = prepared[sid] || {};

  const raw = [];

  for (const code of codes) {
    const p = getProduct(code);
    if (!p) continue;

    const cur = entry?.[sid]?.[code] ?? { p:"", u:"" };
    const allEmpty =
      (cur.p === "" || cur.p == null) &&
      (cur.u === "" || cur.u == null);
    if (allEmpty) continue;

    const target = clampInt(map[code]);
    const remainU = unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0);
    const needU = Math.max(0, target - remainU);

    if (needU <= 0) {
      delete prepared[sid][code];
      delete done[sid][code];
      continue;
    }

    const preparedU = (prepared?.[sid]?.[code] == null) ? null : clampInt(prepared[sid][code]);
    const isDone = !!done?.[sid]?.[code];
    const paren = formatParenCartonPack(p, needU);

    let group = 2; // 0 cartons, 1 packs, 2 petit
    if (clampInt(p.unitsPerCarton) > 0) group = 0;
    else if (clampInt(p.unitsPerPack) > 0) group = 1;

    raw.push({ code, name: p.name, needU, paren, isDone, preparedU, group });
  }

  const lines = [
    ...raw.filter(x => x.group === 0),
    ...raw.filter(x => x.group === 1),
    ...raw.filter(x => x.group === 2),
  ];

  save(K_PREP, prepared);
  save(K_DONE, done);

  if (!lines.length) {
    list.innerHTML = `<div class="muted">Rien à préparer ✅</div>`;
    summary.textContent = `${serviceName(sid)}`;
    return;
  }

  for (const l of lines) {
    const preparedDisplay = (l.preparedU == null) ? "" : String(l.preparedU);
    const filled = (l.preparedU != null && l.preparedU > 0) || l.isDone;

    const row = document.createElement("div");
    row.className = "prepRow" + (filled ? " filled" : "") + (l.isDone ? " done" : "");
    row.innerHTML = `
      <div class="prodCell" title="${escapeHtml(l.name)}">
        <span class="codeBadge">${escapeHtml(l.code)}</span>
        <span class="prodName">${escapeHtml(l.name)}</span>
      </div>

      <div class="needCell right">
        <span class="needMain">${l.needU}</span><span class="unit">u</span>
        ${l.paren ? `<span class="needParen"> ${escapeHtml(l.paren)}</span>` : ``}
      </div>

      <div class="prepCell right">
        <input class="prepInput"
          type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
          value="${escapeHtml(preparedDisplay)}"
          data-prepared="${escapeHtml(l.code)}"
        />
      </div>

      <div class="doneCell center">
        <input class="checkbox" type="checkbox" ${l.isDone ? "checked":""} data-done="${escapeHtml(l.code)}">
      </div>
    `;
    list.appendChild(row);
  }

  // Input "préparé" (sanitize digits)
  list.querySelectorAll("input[data-prepared]").forEach(inp => {
    inp.addEventListener("input", () => {
      const code = inp.getAttribute("data-prepared");
      const sanitized = numericTextValueToInt(inp.value);
      if (inp.value !== sanitized) inp.value = sanitized;

      const v = String(sanitized ?? "").trim();

      prepared[sid] = prepared[sid] || {};
      done[sid] = done[sid] || {};

      const p = getProduct(code);
      const target = clampInt(dotations?.[sid]?.[code] ?? 0);
      const cur = entry?.[sid]?.[code] ?? { p:"", u:"" };
      const remainU = p ? unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0) : 0;
      const needU = Math.max(0, target - remainU);

      if (v === "") {
        delete prepared[sid][code];
        delete done[sid][code];
      } else {
        const val = clampInt(v);
        const capped = Math.min(val, needU);
        prepared[sid][code] = capped;
        if (capped >= needU && needU > 0) done[sid][code] = true;
        else delete done[sid][code];
      }

      save(K_PREP, prepared);
      save(K_DONE, done);
      renderPrep();
    });
  });

  // Checkbox “fait”
  list.querySelectorAll("input[data-done]").forEach(chk => {
    chk.addEventListener("change", () => {
      const code = chk.getAttribute("data-done");

      done[sid] = done[sid] || {};
      prepared[sid] = prepared[sid] || {};

      const p = getProduct(code);
      const target = clampInt(dotations?.[sid]?.[code] ?? 0);
      const cur = entry?.[sid]?.[code] ?? { p:"", u:"" };
      const remainU = p ? unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0) : 0;
      const needU = Math.max(0, target - remainU);

      if (chk.checked) {
        done[sid][code] = true;
        prepared[sid][code] = needU;
      } else {
        delete done[sid][code];
      }

      save(K_DONE, done);
      save(K_PREP, prepared);
      renderPrep();
    });
  });

  // Enter/Suivant => next input
  enableEnterToNext(list);

  // Summary
  let doneCount = 0;
  let totalNeed = 0;
  let totalPrepared = 0;

  for (const l of lines) {
    totalNeed += l.needU;
    const pu = clampInt(prepared?.[sid]?.[l.code] ?? 0);
    totalPrepared += Math.min(pu, l.needU);
    if (!!done?.[sid]?.[l.code]) doneCount++;
  }

  summary.textContent =
    `${serviceName(sid)} • ${doneCount}/${lines.length} “fait” • Total à préparer: ${totalNeed} u • Total préparé: ${totalPrepared} u`;
}

// ---------------- Clôture / Consommation ----------------
document.getElementById("closeSave")?.addEventListener("click", () => closeService(true));
document.getElementById("closeNoSave")?.addEventListener("click", () => closeService(false));

function closeService(withSave) {
  const sid = p_service?.value || e_service?.value;
  if (!sid) return;

  if (withSave) {
    const items = prepared?.[sid] || {};
    const ts = Date.now();

    for (const [code, qty] of Object.entries(items)) {
      const qtyU = clampInt(qty);
      if (qtyU <= 0) continue;
      logEvents.push({ ts, serviceId: sid, code: String(code), qtyU });
    }
    save(K_LOG, logEvents);
  }

  entry[sid] = {};
  done[sid] = {};
  prepared[sid] = {};

  save(K_ENTRY, entry);
  save(K_DONE, done);
  save(K_PREP, prepared);

  renderEntry();
  renderPrep();
  renderConsumption();
}

// ---------------- Consommation ----------------
const c_mode = document.getElementById("c_mode");
const c_date = document.getElementById("c_date");
const c_range = document.getElementById("c_range");

c_mode?.addEventListener("change", renderConsumption);
c_date?.addEventListener("change", renderConsumption);

function toISODate(d){
  const z = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}
function startOfWeek(d){
  const x = new Date(d);
  const day = (x.getDay()+6)%7;
  x.setDate(x.getDate()-day);
  x.setHours(0,0,0,0);
  return x;
}
function endOfWeek(d){
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate()+7);
  return e;
}
function startOfMonth(d){
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0,0,0,0);
  return x;
}
function endOfMonth(d){
  const x = new Date(d.getFullYear(), d.getMonth()+1, 1);
  x.setHours(0,0,0,0);
  return x;
}

function renderConsumption(){
  const mode = c_mode?.value || "week";
  let base = c_date?.value ? new Date(c_date.value+"T00:00:00") : new Date();
  if (c_date && !c_date.value) c_date.value = toISODate(base);

  const from = (mode==="month") ? startOfMonth(base) : startOfWeek(base);
  const to = (mode==="month") ? endOfMonth(base) : endOfWeek(base);

  if (c_range) {
    c_range.textContent = `Période : ${toISODate(from)} → ${toISODate(new Date(to.getTime()-1))}`;
  }

  const events = (logEvents || []).filter(ev => ev.ts >= from.getTime() && ev.ts < to.getTime());

  const byProduct = {};
  const byService = {};

  for (const ev of events) {
    const code = String(ev.code);
    const sid = String(ev.serviceId);
    const qty = clampInt(ev.qtyU);

    byProduct[code] = (byProduct[code]||0) + qty;
    byService[sid] = (byService[sid]||0) + qty;
  }

  const tbP = document.querySelector("#c_table_products tbody");
  if (tbP) {
    tbP.innerHTML = "";
    const rows = Object.entries(byProduct).sort((a,b)=>b[1]-a[1]);

    if (!rows.length){
      tbP.innerHTML = `<tr><td colspan="3" class="muted">Aucune consommation sur la période.</td></tr>`;
    } else {
      for (const [code,total] of rows) {
        const p = getProduct(code);
        tbP.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(code)}</strong></td>
            <td>${escapeHtml(p?.name || "")}</td>
            <td><strong>${total}</strong></td>
          </tr>`;
      }
    }
  }

  const tbS = document.querySelector("#c_table_services tbody");
  if (tbS) {
    tbS.innerHTML = "";
    const rows = Object.entries(byService).sort((a,b)=>b[1]-a[1]);

    if (!rows.length){
      tbS.innerHTML = `<tr><td colspan="2" class="muted">Aucune consommation sur la période.</td></tr>`;
    } else {
      for (const [sid,total] of rows) {
        tbS.innerHTML += `
          <tr>
            <td>${escapeHtml(serviceName(sid))}</td>
            <td><strong>${total}</strong></td>
          </tr>`;
      }
    }
  }
}

document.getElementById("c_export")?.addEventListener("click", () => {
  const rows = [["date","service","code","produit","qtyU"]];
  for (const ev of (logEvents||[])) {
    const d = new Date(ev.ts);
    const date = toISODate(d);
    const sid = ev.serviceId;
    const code = ev.code;
    const p = getProduct(code);
    rows.push([date, serviceName(sid), code, p?.name || "", String(ev.qtyU)]);
  }

  const csv = rows.map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "consommation.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("c_clear")?.addEventListener("click", () => {
  if (!confirm("Effacer TOUT l'historique consommation ?")) return;
  logEvents = [];
  save(K_LOG, logEvents);
  renderConsumption();
});

// ---------------- Plein écran SAISIE ----------------
const fsBtn = document.getElementById("toggleFullscreenEntry");
if (fsBtn) {
  fsBtn.addEventListener("click", () => {
    const isOn = document.body.classList.toggle("fullscreen-entry");
    fsBtn.textContent = isOn ? "❌ Quitter plein écran" : "🔍 Plein écran";
  });
}

// ---------------- Boot ----------------
function boot() {
  syncSelects();
  loadAll(false);
  updateEntryReminderVisibility();
}
boot();
