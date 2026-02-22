// app.js (COMPLET)
// - Prépa tri: CARTONS -> PACKS -> PETIT PRODUIT (ordre interne conservé via dotations_order.json)
// - Saisie: si U/pack>0 => saisie PACKS uniquement, sinon UNITÉS uniquement
// - Consommation: clôture + sauvegarde écrit un log, affichable semaine/mois, export CSV
// - Onglets Produits/Services retirés de l'UI mais panels + code gardés

const K_ENTRY = "ps_entry_json_v6";        // { serviceId: { code: { p:"", u:"" } } }
const K_DONE  = "ps_done_json_v9";         // { serviceId: { code: true } }
const K_PREP  = "ps_prepared_json_v9";     // { serviceId: { code: number } }
const K_LOG   = "ps_consumption_log_v1";   // [ {ts, serviceId, code, qtyU} ]
const K_PLANNING = "ps_planning_v1";       // { site: { day: { idx: true } } }
const K_EPI  = "ps_epi_v1";                // { name: { e:"", h:"" } }
const K_ORDER = "ps_order_v1";             // { site: { key: { c:false } } }

let products = [];
let services = [];
let dotations = {};
let dotationsOrder = {};
let hospitalOrderItems = [];

let entry = load(K_ENTRY, {});
let done  = load(K_DONE, {});
let prepared = load(K_PREP, {});
let logEvents = load(K_LOG, []);
let planningState = load(K_PLANNING, {});
let epiState = load(K_EPI, {});
let orderState = load(K_ORDER, {});

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

// ---------------- Commande ----------------
const orderSites = ["hospital","ehpad"];
let orderSite = "hospital";

const hospitalCategoryOrder = [
  "gants",
  "sacs déchets",
  "protections hygieniques",
  "papier hygienique",
  "lingerie",
  "hygiene corporel",
  "vaisselle",
  "produits de nettoyage",
  "SHA",
  "fournitures médical",
  "collecteur d'aiguilles",
  "piles",
  "autres",
  "sondes diététiques",
  "boissons diététiques",
  "desserts diététiques",
  "biscuits diététiques",
  "eau gélifiée",
  "poudre diététiques",
  "autres produits diététiques",
  "eau",
  "boissons sucrées",
  "sirops",
  "confitures",
  "biscuits",
  "poudres et autres épicerie"
];

const hospitalCategoryMatchers = {
  "gants": ["gant"],
  "sacs déchets": ["sac dechets", "sac déchets"],
  "protections hygieniques": ["tena", "slip", "pants", "alese", "protege", "protection", "urinal", "change anat", "enveloppe hygienique", "protege bassin"],
  "papier hygienique": ["papier wc", "essuie", "rouleau", "bobine", "serviettes papier", "drap d'examen", "gants toilette", "valaclean", "chamoisine"],
  "lingerie": ["chemise", "blouse visiteur", "tablier impermeable", "charlotte", "charlottes", "surchaussure"],
  "hygiene corporel": ["savon", "shampoing", "dentifrice", "brosse a dents", "brosse cheveux", "mousse a raser", "eau de cologne", "coupe ongles", "coton tige", "savonnette", "gel hygiene intime", "gel douche", "brosse a ongles", "pince a ongle", "rasoir jetable", "prevention escar", "ppe montee", "batonnet ouate", "huile de soin", "rivadouce"],
  "vaisselle": ["assiette", "cuiller", "fourchette", "couteau", "tasse", "gobelet", "barquette", "bol", "film etirable", "filtre a cafe", "filtres a cafe", "verre a bec", "verre bec"],
  "produits de nettoyage": ["nettoyant", "deterg", "desinfect", "detartr", "surfanios", "surfa", "anios", "oxy ", "balai", "epong", "lavette", "frange", "pastilles lave vaisselle", "deboucheur", "rincage lave vaisselle", "desodorisant", "pot rond", "brosse wc", "liquide vaisselle", "creme a recurer", "lagor", "sel regenerant", "tampon abrasif", "gaze rose", "anti calcaire"],
  "SHA": ["sha ", "aniosoft", "oxyfloor", "solution hydro alcoolique"],
  "fournitures médical": ["masque", "canule", "sparadrap", "electrodes", "thermometre", "insufflateur", "filtre", "jersey", "filet tubulaire", "bande", "garrot", "chambre inhalation", "meopa", "cracheoir", "ecg", "laniere", "support sac a urine", "goupillon", "anti adhesif", "actimove", "couvre sonde", "bracelets identification", "tympan", "lunette a oxygene", "lunettes a oxygene", "abaisse langue", "batonnet citrone", "gratlang", "attache de jambe", "lavement enema", "coton hydrophile", "aquapak", "tubifast", "racc droit", "pansement tubulaire", "gel krystal", "reglette", "ecrase comprime", "tubulure", "corr-a-flex", "spray protecteur", "brava poudre", "stomie"],
  "collecteur d'aiguilles": ["collecteur d'aiguille", "fut jaune", "fut 30l"],
  "piles": ["pile ", "alcaline", "lithium", "lr03", "lr06", "lr14", "cr2032"],
  "sondes diététiques": ["sonde", "tubulure", "corr-a-flex", "sondalis", "nutrison"],
  "boissons diététiques": ["fresubin", "resource", "boisson diet", "fortimel", "diacare", "delical boisson", "jucy", "cubitan"],
  "desserts diététiques": ["dessert diet", "creme dessert", "delical creme", "delical brasse", "delical brassee", "delical riz au lait", "cremeline", "puree de fruit", "puree de fruits", "nutrapotes", "clinutren", "protifruit"],
  "biscuits diététiques": ["protibis", "bonbons hc", "madeleine hp hc", "madeleines hp hc", "nutra cake", "deli nutra cake", "pain brioche"],
  "eau gélifiée": ["eau gel", "eau gelifie", "eau gélifiée"],
  "poudre diététiques": ["poudre diet", "protifast", "forteocare", "thicken up", "clinutren thicken", "profitar", "protifar"],
  "autres produits diététiques": ["veloute"],
  "eau": ["eau minerale", "eau petillante", "hepar", "vichy", "lait 1/2 ecreme", "lait demi ecreme"],
  "boissons sucrées": ["coca", "jus ", "vin ", "champagne sans alcool", "biere ", "muscat", "porto", "ricard", "petillant chardonnay", "limonade"],
  "sirops": ["sirop"],
  "confitures": ["confiture", "gelee"],
  "biscuits": ["biscotte", "biscuit", "gateaux", "gateau", "moell", "speculo", "brownie", "fourre", "fourre abricot", "four fraise"],
  "poudres et autres épicerie": ["cafe", "chocolat poudre", "chocolat a tartiner", "sucre", "lait en poudre", "edulcorant", "vinaigre"]
};

const hospitalCategoryMatchOrder = [
  "collecteur d'aiguilles",
  "SHA",
  "fournitures médical",
  "papier hygienique",
  "gants",
  "sacs déchets",
  "protections hygieniques",
  "lingerie",
  "hygiene corporel",
  "vaisselle",
  "produits de nettoyage",
  "piles",
  "sondes diététiques",
  "boissons diététiques",
  "desserts diététiques",
  "biscuits diététiques",
  "eau gélifiée",
  "poudre diététiques",
  "autres produits diététiques",
  "eau",
  "sirops",
  "confitures",
  "biscuits",
  "boissons sucrées",
  "poudres et autres épicerie"
];

const hospitalForcedCategoryByCode = {
  "265": "fournitures médical",
  "630": "produits de nettoyage",
  "661": "lingerie",
  "2492": "lingerie",
  "2657": "lingerie",
  "3282": "lingerie",
  "2732": "lingerie",
  "2925": "vaisselle",
  "3025": "vaisselle",
  "1231": "fournitures médical",
  "1232": "fournitures médical",
  "136": "fournitures médical",
  "422": "fournitures médical",
  "706": "fournitures médical",
  "1044": "fournitures médical",
  "1059": "fournitures médical",
  "1401": "fournitures médical",
  "1459": "fournitures médical",
  "1682": "fournitures médical",
  "1721": "fournitures médical",
  "2037": "fournitures médical",
  "2567": "fournitures médical",
  "2714": "fournitures médical",
  "2789": "fournitures médical",
  "2843": "fournitures médical",
  "2845": "fournitures médical",
  "3065": "fournitures médical",
  "4037": "fournitures médical",
  "4045": "fournitures médical",
  "430": "hygiene corporel",
  "451": "eau",
  "546": "hygiene corporel",
  "556": "produits de nettoyage",
  "577": "hygiene corporel",
  "704": "hygiene corporel",
  "2793": "hygiene corporel",
  "2251": "hygiene corporel",
  "2392": "hygiene corporel",
  "2549": "protections hygieniques",
  "2554": "hygiene corporel",
  "3057": "hygiene corporel",
  "3227": "hygiene corporel",
  "402": "sondes diététiques",
  "1071": "sondes diététiques",
  "1970": "sondes diététiques",
  "1985": "sondes diététiques",
  "2827": "sondes diététiques",
  "1505": "desserts diététiques",
  "1794": "desserts diététiques",
  "2476": "boissons diététiques",
  "2477": "boissons diététiques",
  "2478": "boissons diététiques",
  "2961": "biscuits diététiques",
  "3010": "produits de nettoyage",
  "3078": "produits de nettoyage",
  "2069": "poudre diététiques",
  "2799": "poudre diététiques",
  "2447": "poudre diététiques",
  "1765": "autres produits diététiques",
  "1768": "autres produits diététiques",
  "1775": "autres produits diététiques",
  "1844": "biscuits diététiques",
  "1854": "biscuits diététiques",
  "2004": "biscuits diététiques",
  "2042": "biscuits diététiques",
  "2953": "biscuits diététiques",
  "2954": "biscuits diététiques",
  "503": "boissons sucrées",
  "4002": "protections hygieniques",
  "4003": "protections hygieniques",
  "4051": "SHA",
  "1960": "biscuits",
  "2005": "biscuits",
  "2006": "biscuits",
  "2014": "biscuits",
  "2048": "biscuits",
  "2070": "biscuits",
  "2934": "SHA",
  "2936": "SHA",
  "2979": "SHA",
  "569": "produits de nettoyage",
  "628": "produits de nettoyage",
  "645": "produits de nettoyage",
  "681": "produits de nettoyage",
  "698": "produits de nettoyage",
  "718": "produits de nettoyage",
  "3004": "produits de nettoyage",
  "4008": "produits de nettoyage",
  "4034": "SHA",
  "4048": "SHA",
  "218": "desserts diététiques",
  "220": "desserts diététiques",
  "1693": "desserts diététiques",
  "1694": "desserts diététiques",
  "1710": "desserts diététiques",
  "1743": "desserts diététiques",
  "1745": "desserts diététiques",
  "1938": "desserts diététiques",
  "1939": "desserts diététiques",
  "2050": "desserts diététiques",
  "2064": "desserts diététiques",
  "2225": "desserts diététiques",
  "2458": "desserts diététiques"
};

function categorizeHospitalItem(item){
  const code = String(item?.code ?? "").trim();
  if (hospitalForcedCategoryByCode[code]) return hospitalForcedCategoryByCode[code];
  const text = normalizeName(`${item?.name || ""}`);
  for (const cat of hospitalCategoryMatchOrder) {
    if (cat === "autres") continue;
    const needles = hospitalCategoryMatchers[cat] || [];
    if (needles.some(n => text.includes(normalizeName(n)))) return cat;
  }
  return "autres";
}

function groupHospitalOrderItems(items){
  const grouped = {};
  for (const cat of hospitalCategoryOrder) grouped[cat] = [];
  for (const item of items) {
    const cat = categorizeHospitalItem(item);
    grouped[cat].push(item);
  }
  return grouped;
}

const medicalSubcategoryOrder = ["Bandage", "Oxygène", "Petit matériel médical"];
const medicalSubcategoryMatchers = {
  "Bandage": ["bande", "jersey", "filet tubulaire", "pansement", "sparadrap", "tubifast", "contention", "actimove"],
  "Oxygène": ["oxygene", "o2", "lunette", "masque a oxygene", "masque anesthesie", "nebulis", "tracheotom", "chambre inhalation", "canule", "insufflateur", "meopa", "kit pour meopa", "tubulure", "corr-a-flex", "coor a flex", "aquapak", "aquapack"]
};

function categorizeMedicalSubgroup(item){
  const text = normalizeName(`${item?.name || ""}`);
  for (const sub of ["Oxygène", "Bandage"]) {
    const needles = medicalSubcategoryMatchers[sub] || [];
    if (needles.some(n => text.includes(normalizeName(n)))) return sub;
  }
  return "Petit matériel médical";
}

function groupMedicalItems(items){
  const grouped = {};
  for (const sub of medicalSubcategoryOrder) grouped[sub] = [];
  for (const item of items) {
    const sub = categorizeMedicalSubgroup(item);
    grouped[sub].push(item);
  }
  return grouped;
}

const orderCatalog = {
  hospital: { type: "products" },
  ehpad: {
    type: "custom",
    categories: [
      {
        name: "Eau",
        items: [
          "EAU MINERALE 1.5 L CRISTALINE",
          "EAU MINERALE 0,5 L CRISTALINE",
          "EAU PETILLANTE ST AMAND 0.5 L",
          "LAIT 1/2 ECREME"
        ]
      },
      {
        name: "Boissons",
        items: [
          "VIN ROUGE TABLE \"CUVEE DU PATRON\" 75cl",
          "VIN ROUGE SANS ALCOOL BONNE NOUVELLE",
          "VIN BLANC SANS ALCOOL BONNE NOUVELLE",
          "CHAMPAGNE SANS ALCOOL (type champomy)",
          "PETILLANT CHARDONNAY DE PERRIERE 75CL",
          "MUSCAT DE RIVESALTES",
          "RICARD 1L",
          "PORTO SOUZA 75CL",
          "BIERE SS ALCOOL 25CL",
          "VINAIGRE D'ALCOOL BLANC",
          "JUS DE PRUNEAU 1L",
          "JUS ORANGE 1L",
          "JUS ANANAS 1L",
          "JUS RAISIN 1L",
          "JUS POMME 1L",
          "JUS MULTRIFRUITS",
          "SIROP D'ORANGE",
          "SIROP MENTHE",
          "SIROP GRENADINE",
          "SIROP CITRON",
          "COCA COLA 0,50L"
        ]
      },
      {
        name: "Poudres et confiture",
        items: [
          "LAIT EN POUDRE",
          "CAFE MOULU",
          "CHOCOLAT POUDRE",
          "SUCRE MORCEAUX",
          "CONFITURE ABRICOT 30G X",
          "GELEE DE GROSEILLES 30G",
          "CHOCOLAT A TARTINER",
          "EDULCORANT POUDRE TYPE CANDEREL"
        ]
      },
      {
        name: "Biscuit",
        items: [
          "BISCOTTES SANS SEL (72)",
          "BISCUIT PETIT DEJEUNER gouters secs",
          "BISCUITS BOITE DE 500G TYPE BELIN",
          "MOELL FOURRE FRAISE",
          "GATEAUX MOELLEUX NATURE"
        ]
      },
      {
        name: "Palette",
        items: [
          "BLOUSE DE VISITEUR ELASTIQUES BLANC",
          "SAC DECHETS 110 L NOIR",
          "SAC DECHETS 30 L NOIR",
          "ESSUIE MAINS PLIE V BLANC",
          "ALESE 60X90",
          "TENA Slip Maxi M (24)",
          "TENA Slip Maxi L (24)",
          "TENA Slip Maxi XL (24)",
          "TENA pants L (30)",
          "TENA PANTS NORMAL XL (30)",
          "TENA FLEX MAXI XL (21)"
        ]
      }
    ]
  }
};

// Quantités de déclenchement fixes
// Exemple:
// orderThresholds.hospital["A123"] = 5;
// orderThresholds.ehpad["COCA COLA 0,50L"] = 10;
const orderThresholds = { hospital: {}, ehpad: {} };

function orderSiteLabel(site){
  return site === "ehpad" ? "EHPAD" : "Hôpital";
}

function normalizeName(s){
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findProductByName(name){
  const n = normalizeName(name);
  return products.find(p => normalizeName(p.name) === n) || null;
}

function getOrderEntry(site, key){
  orderState[site] = orderState[site] || {};
  orderState[site][key] = orderState[site][key] || { c:false };
  return orderState[site][key];
}

function getThreshold(site, key){
  const t = orderThresholds?.[site]?.[key];
  if (t == null || t === "") return null;
  return clampInt(t);
}

function renderOrder(){
  const tbody = document.querySelector("#orderTable tbody");
  const listBody = document.querySelector("#orderListTable tbody");
  if (!tbody || !listBody) return;

  tbody.innerHTML = "";
  listBody.innerHTML = "";

  if (!products.length){
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Aucun produit chargé.</td></tr>`;
    listBody.innerHTML = `<tr><td colspan="2" class="muted">Aucun produit sélectionné.</td></tr>`;
    return;
  }

  const cat = orderCatalog[orderSite];
  const rows = [];

  if (orderSite === "hospital" && hospitalOrderItems.length) {
    const grouped = groupHospitalOrderItems(hospitalOrderItems);
    for (const groupName of hospitalCategoryOrder) {
      const items = grouped[groupName] || [];
      if (!items.length) continue;

      const label = groupName === "SHA" ? groupName : `${groupName.charAt(0).toUpperCase()}${groupName.slice(1)}`;
      rows.push({ type: "category", name: label });

      if (groupName === "fournitures médical") {
        const med = groupMedicalItems(items);
        for (const subName of medicalSubcategoryOrder) {
          const subItems = med[subName] || [];
          if (!subItems.length) continue;
          rows.push({ type: "subcategory", name: subName });
          for (const it of subItems) {
            const code = String(it.code);
            const p = getProduct(code);
            const name = p?.name || it.name || code;
            rows.push({
              type: "item",
              key: code,
              code,
              name,
              thresholdKey: code
            });
          }
        }
      } else {
        for (const it of items) {
          const code = String(it.code);
          const p = getProduct(code);
          const name = p?.name || it.name || code;
          rows.push({
            type: "item",
            key: code,
            code,
            name,
            thresholdKey: code
          });
        }
      }
    }
  } else if (cat?.type === "custom") {
    for (const group of (cat.categories || [])) {
      rows.push({ type: "category", name: group.name });
      for (const item of group.items) {
        const isObj = item && typeof item === "object";
        const name = isObj ? String(item.name ?? "") : String(item);
        const rawCode = isObj ? String(item.code ?? "") : "";
        const p = rawCode ? getProduct(rawCode) : findProductByName(name);
        const code = rawCode || (p?.code ? String(p.code) : "");
        const displayName = p?.name || name;
        const key = code || name;
        rows.push({
          type: "item",
          key,
          code,
          name: displayName,
          thresholdKey: code || name
        });
      }
    }
  } else {
    const sorted = [...products].sort((a,b)=>a.name.localeCompare(b.name, "fr"));
    for (const p of sorted) {
      rows.push({
        type: "item",
        key: String(p.code),
        code: String(p.code),
        name: p.name,
        thresholdKey: String(p.code)
      });
    }
  }

  for (const r of rows) {
    if (r.type === "category") {
      const tr = document.createElement("tr");
      tr.className = "orderCategory";
      tr.innerHTML = `<td colspan="4">${escapeHtml(r.name)}</td>`;
      tbody.appendChild(tr);
      continue;
    }

    if (r.type === "subcategory") {
      const tr = document.createElement("tr");
      tr.className = "orderSubcategory";
      tr.innerHTML = `<td colspan="4">${escapeHtml(r.name)}</td>`;
      tbody.appendChild(tr);
      continue;
    }

    const entry = getOrderEntry(orderSite, r.key);
    const t = getThreshold(orderSite, r.thresholdKey);
    const tDisplay = (t == null) ? "—" : String(t);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.code || "—")}</td>
      <td><span class="orderProduct">${escapeHtml(r.name)}</span></td>
      <td class="right"><strong>${escapeHtml(tDisplay)}</strong></td>
      <td class="center">
        <input class="orderCheck" type="checkbox"
          data-order-key="${escapeHtml(r.key)}" ${entry.c ? "checked":""}>
      </td>
    `;
    tbody.appendChild(tr);
  }

  function updateOrderList(){
    listBody.innerHTML = "";
    const selected = Object.entries(orderState?.[orderSite] || {})
      .filter(([,v]) => !!v?.c)
      .map(([key]) => key);

    if (!selected.length){
      listBody.innerHTML = `<tr><td colspan="2" class="muted">Aucun produit sélectionné.</td></tr>`;
      return;
    }

    for (const key of selected) {
      const p = getProduct(key) || findProductByName(key);
      const code = p?.code ? String(p.code) : (String(key).length <= 12 ? String(key) : "—");
      const name = p?.name || key;
      listBody.innerHTML += `
        <tr>
          <td><strong>${escapeHtml(code)}</strong></td>
          <td>${escapeHtml(name)}</td>
        </tr>
      `;
    }
  }

  tbody.querySelectorAll(".orderCheck").forEach(chk => {
    chk.addEventListener("change", () => {
      const key = chk.getAttribute("data-order-key");
      const entry = getOrderEntry(orderSite, key);
      entry.c = !!chk.checked;
      save(K_ORDER, orderState);
      updateOrderList();
    });
  });

  updateOrderList();
}

// ---------------- EPI ----------------
const epiItems = [
  "Masques FFP2",
  "Masques chirurgicaux",
  "Surblouses imperméables",
  "Blouses non tissées",
  "Tabliers imperméables",
  "Surlunettes",
  "Visière pexiglas",
  "Charlottes",
  "SHA 100ML",
  "SHA 500ML",
  "SHA 1L",
  "Anios oxyfloor",
  "BIDON surfanios en Litre",
  "Lingette wipanios",
  "Gants"
];

function renderEpi(){
  const tbody = document.querySelector("#epiTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const name of epiItems) {
    epiState[name] = epiState[name] || { e:"", h:"" };
    const row = document.createElement("tr");
    const eVal = epiState[name].e ?? "";
    const hVal = epiState[name].h ?? "";

    const allEmpty = (eVal === "" || eVal == null) && (hVal === "" || hVal == null);
    const total = allEmpty ? "" : String(clampInt(eVal) + clampInt(hVal));

    row.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td>
        <input class="epiInput" type="number" min="0" step="1" data-epi="${escapeHtml(name)}" data-col="e" value="${escapeHtml(eVal)}">
      </td>
      <td>
        <input class="epiInput" type="number" min="0" step="1" data-epi="${escapeHtml(name)}" data-col="h" value="${escapeHtml(hVal)}">
      </td>
      <td class="epiTotal">${escapeHtml(total)}</td>
    `;
    tbody.appendChild(row);
  }

  tbody.querySelectorAll(".epiInput").forEach(inp => {
    inp.addEventListener("input", () => {
      const name = inp.getAttribute("data-epi");
      const col = inp.getAttribute("data-col");
      const v = String(inp.value ?? "").trim();
      epiState[name] = epiState[name] || { e:"", h:"" };
      epiState[name][col] = (v === "") ? "" : String(clampInt(v));
      save(K_EPI, epiState);

      const row = inp.closest("tr");
      if (!row) return;
      const eVal = epiState[name].e ?? "";
      const hVal = epiState[name].h ?? "";
      const allEmpty = (eVal === "" || eVal == null) && (hVal === "" || hVal == null);
      const total = allEmpty ? "" : String(clampInt(eVal) + clampInt(hVal));
      const totalCell = row.querySelector(".epiTotal");
      if (totalCell) totalCell.textContent = total;
    });
  });
}

// ---------------- Planning ----------------
const planningDays = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi"];
const planningTasks = {
  hospital: {
    Lundi: [
      "Armoire piluliers SMR2",
      "EPI",
      "Relevés EH & boissons 2e - 3e - 4e",
      "Récupérer les feuilles épiceries - diététiques",
      "Préparation EH & boisson 4e",
      "Livraison EH & boisson 4e",
      "Préparation EH & boisson 3e",
      "Livraison EH & boisson 3e",
      "Préparation EH & boisson 2e",
      "Livraison EH & boisson 2e",
      "Sortie magh2 4e - 3e - 2e",
      "Préparation et mise à disposition rolls ehpad"
    ],
    Mardi: [
      "Armoire piluliers SMR4",
      "Préparation épicerie 4e",
      "Sortie magh2 épicerie 4e",
      "Livraison épicerie 4e",
      "Préparation épicerie 3e",
      "Sortie magh2 épicerie 3e",
      "Livraison épicerie 3e",
      "Préparation épicerie 2e",
      "Sortie magh2 épicerie 2e",
      "Livraison épicerie 2e",
      "Préparation diététique ehpad",
      "Sortie magh2 diététique ehpad",
      "Commande"
    ],
    Mercredi: [
      "Armoire piluliers SMR3"
    ],
    Jeudi: [
      "Rangement"
    ],
    Vendredi: [
      "Relevé EH pour le week-end",
      "Préparation EH 4e",
      "Livraison EH 4e",
      "Préparation EH 3e",
      "Livraison EH 3e",
      "Préparation EH 2e",
      "Livraison EH 2e",
      "Sortie magh2 EH 4e - 3e - 2e",
      "Mettre enveloppe BL à l'accueil",
      "Livraison des colis"
    ]
  },
  ehpad: {
    Lundi: [
      "Relevé des 8 réserves",
      "Préparation épicerie prunier",
      "Livraison épicerie prunier",
      "Préparation épicerie magnolias",
      "Livraison épicerie magnolias",
      "Préparation épicerie chênes",
      "Livraison épicerie chênes",
      "Préparation épicerie restaurant",
      "Livraison épicerie restaurant",
      "Récupération feuille diététique"
    ],
    Mardi: [
      "Préparation réserve prunier",
      "Livraison réserve prunier",
      "Préparation réserve cerisier",
      "Livraison réserve cerisier",
      "Préparation réserve magnolias",
      "Livraison réserve magnolias",
      "Préparation réserve chênes",
      "Livraison réserve chêne"
    ],
    Mercredi: [
      "Sortie magh2",
      "Livraison produits diététiques"
    ],
    Jeudi: [
      "Récupération des BL",
      "Rangement"
    ],
    Vendredi: [
      "Relevé pour le week-end",
      "Préparation & Livraison",
      "Sortie magh2",
      "Compter les EPI",
      "Remplir fiche navette"
    ]
  }
};

let planningSite = "hospital";

function planningSiteLabel(site){
  return site === "ehpad" ? "EHPAD" : "Hôpital";
}

function setPlanningChecked(site, day, idx, checked){
  planningState[site] = planningState[site] || {};
  planningState[site][day] = planningState[site][day] || {};
  planningState[site][day][idx] = !!checked;
  save(K_PLANNING, planningState);
}

function getPlanningChecked(site, day, idx){
  return !!planningState?.[site]?.[day]?.[idx];
}

function renderPlanning(){
  const root = document.getElementById("planningContent");
  if (!root) return;

  const grid = document.createElement("div");
  grid.className = "planningGrid";

  for (const day of planningDays) {
    const tasks = planningTasks?.[planningSite]?.[day] || [];
    const card = document.createElement("div");
    card.className = "dayCard";
    card.innerHTML = `
      <div class="dayTitle">${day}</div>
      <div class="dayMeta muted"></div>
    `;

    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Aucune tâche.";
      card.appendChild(empty);
    } else {
      tasks.forEach((label, idx) => {
        const id = `pl-${planningSite}-${day}-${idx}`.replace(/\s+/g,"-");
        const line = document.createElement("label");
        line.className = "taskItem";
        line.innerHTML = `
          <input type="checkbox" id="${id}" data-site="${planningSite}" data-day="${day}" data-idx="${idx}">
          <span>${escapeHtml(label)}</span>
        `;
        card.appendChild(line);
      });
    }

    grid.appendChild(card);
  }

  root.innerHTML = "";
  root.appendChild(grid);

  function updateDayMeta(card){
    const total = card.querySelectorAll('input[type="checkbox"]').length;
    const done = card.querySelectorAll('input[type="checkbox"]:checked').length;
    const meta = card.querySelector(".dayMeta");
    if (meta) meta.textContent = total ? `${done}/${total} fait` : "";
    card.classList.toggle("done", total > 0 && done === total);
  }

  root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const site = cb.getAttribute("data-site");
    const day = cb.getAttribute("data-day");
    const idx = Number(cb.getAttribute("data-idx"));
    cb.checked = getPlanningChecked(site, day, idx);
    const line = cb.closest(".taskItem");
    if (line) line.classList.toggle("done", cb.checked);
    cb.addEventListener("change", () => {
      setPlanningChecked(site, day, idx, cb.checked);
      if (line) line.classList.toggle("done", cb.checked);
      const card = cb.closest(".dayCard");
      if (card) updateDayMeta(card);
    });
  });

  root.querySelectorAll(".dayCard").forEach(updateDayMeta);
}

document.querySelectorAll(".subtab").forEach(btn => {
  btn.addEventListener("click", () => {
    const isPlan = !!btn.dataset.plan;
    const isOrder = !!btn.dataset.order;

    if (isPlan) {
      document.querySelectorAll('.subtab[data-plan]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      planningSite = btn.dataset.plan || "hospital";
      renderPlanning();
      return;
    }

    if (isOrder) {
      document.querySelectorAll('.subtab[data-order]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      orderSite = btn.dataset.order || "hospital";
      renderOrder();
    }
  });
});

document.getElementById("planningClear")?.addEventListener("click", () => {
  const label = planningSiteLabel(planningSite);
  if (!confirm(`Voulez-vous vraiment tout décocher pour ${label} ?`)) return;
  planningState[planningSite] = {};
  save(K_PLANNING, planningState);
  renderPlanning();
});

// ---------------- Sticky reminder (SAISIE) ----------------
function updateEntryReminderVisibility() {
  const reminder = document.getElementById("entryReminder");
  const entryPanel = document.getElementById("tab-entry");
  if (!reminder || !entryPanel) return;
  const isVisible = !entryPanel.classList.contains("hidden");
  reminder.classList.toggle("hidden", !isVisible);
  document.body.classList.toggle("show-entry-reminder", isVisible);
}

function focusNextNumberInput(currentEl, scope) {
  const root = typeof scope === "string" ? document.querySelector(scope) : scope;
  if (!root || !currentEl) return;
  const inputs = Array.from(root.querySelectorAll('input[type="number"]:not([disabled])'));
  const idx = inputs.indexOf(currentEl);
  if (idx < 0) return;
  const next = inputs[idx + 1];
  if (!next) return;
  next.focus();
  if (typeof next.select === "function") next.select();
}

// ---------------- Tabs ----------------
const tabButtons = document.querySelectorAll(".tab");
const panels = {
  planning: document.getElementById("tab-planning"),
  epi: document.getElementById("tab-epi"),
  order: document.getElementById("tab-order"),
  products: document.getElementById("tab-products"),
  services: document.getElementById("tab-services"),
  dotations: document.getElementById("tab-dotations"),
  entry: document.getElementById("tab-entry"),
  prep: document.getElementById("tab-prep"),
  consumption: document.getElementById("tab-consumption"),
};

function showTab(t){
  if (!t || !panels[t]) return;

  tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  Object.values(panels).forEach(p => p && p.classList.add("hidden"));
  panels[t]?.classList.remove("hidden");

  if (t === "planning") renderPlanning();
  if (t === "epi") renderEpi();
  if (t === "order") renderOrder();
  if (t === "products") renderProducts();
  if (t === "services") renderServices();
  if (t === "dotations") { syncSelects(); renderDotations(); }
  if (t === "entry") { syncSelects(); renderEntry(); }
  if (t === "prep") { syncSelects(); renderPrep(); }
  if (t === "consumption") { renderConsumption(); }

  updateEntryReminderVisibility();
  closeMoreMenu();
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

// --- Menu déroulant (responsive) ---
const moreToggle = document.getElementById("moreMenuToggle");
const moreMenu = document.getElementById("moreMenu");

function closeMoreMenu(){
  if (!moreMenu || !moreToggle) return;
  moreMenu.classList.remove("open");
  moreToggle.setAttribute("aria-expanded", "false");
}

function toggleMoreMenu(){
  if (!moreMenu || !moreToggle) return;
  const open = moreMenu.classList.toggle("open");
  moreToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

moreToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMoreMenu();
});

moreMenu?.querySelectorAll(".menuItem").forEach(item => {
  item.addEventListener("click", () => {
    const t = item.dataset.tab;
    showTab(t);
  });
});

document.addEventListener("click", (e) => {
  if (!moreMenu || !moreToggle) return;
  if (!moreMenu.classList.contains("open")) return;
  const target = e.target;
  if (target === moreToggle || moreMenu.contains(target)) return;
  closeMoreMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMoreMenu();
});

// ---------------- Load JSONs ----------------
const productsLoadStatus = document.getElementById("productsLoadStatus");
document.getElementById("reloadAll")?.addEventListener("click", () => loadAll(true));

async function loadAll(showAlert = false) {
  try {
    if (productsLoadStatus) productsLoadStatus.textContent = "Chargement JSON…";
    setTopbarHeightVar();

    const [pRes, sRes, dRes, oRes, hRes] = await Promise.all([
      fetch("products.json", { cache: "no-store" }),
      fetch("services.json", { cache: "no-store" }),
      fetch("dotations.json", { cache: "no-store" }),
      fetch("dotations_order.json", { cache: "no-store" }),
      fetch("order_hospital.json", { cache: "no-store" })
    ]);

    if (!pRes.ok) throw new Error("products.json introuvable");
    if (!sRes.ok) throw new Error("services.json introuvable");
    if (!dRes.ok) throw new Error("dotations.json introuvable");
    if (!oRes.ok) throw new Error("dotations_order.json introuvable");

    const pData = await pRes.json();
    const sData = await sRes.json();
    const dData = await dRes.json();
    const oData = await oRes.json();
    const hData = hRes.ok ? await hRes.json() : [];

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
    hospitalOrderItems = (Array.isArray(hData) ? hData : [])
      .map(it => ({ code: String(it?.code ?? "").trim(), name: String(it?.name ?? "").trim() }))
      .filter(it => it.code && it.name);

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
    setTopbarHeightVar();

    renderProducts();
    renderServices();
    renderOrder();
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
    setTopbarHeightVar();
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
  if (!confirm("Vider la saisie pour ce service ?")) return;
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
        <input type="number" min="0" step="1"
          ${packEnabled ? "" : "disabled"}
          value="${escapeHtml(cur.p ?? "")}"
          data-p="${code}">
      </td>
      <td>
        <input type="number" min="0" step="1"
          ${unitEnabled ? "" : "disabled"}
          value="${escapeHtml(cur.u ?? "")}"
          data-u="${code}">
      </td>
      <td><strong class="prepValue">${prepU}</strong> <span class="muted">u</span></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("input[data-p]").forEach(inp => {
    inp.addEventListener("input", () => updateEntryCell(sid, inp.getAttribute("data-p"), "p", inp.value, inp));
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusNextNumberInput(inp, "#entryTable");
      }
    });
  });
  tbody.querySelectorAll("input[data-u]").forEach(inp => {
    inp.addEventListener("input", () => updateEntryCell(sid, inp.getAttribute("data-u"), "u", inp.value, inp));
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusNextNumberInput(inp, "#entryTable");
      }
    });
  });

  updateEntryReminderVisibility();
}

function updateEntryCell(sid, code, key, value, inputEl) {
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

  // si tout vide -> on enlève aussi les données prépa/done pour ce produit
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

  // Update only the current row to avoid re-rendering (keeps mobile keyboard open)
  const row = inputEl?.closest("tr");
  if (row) {
    if (upp > 0 && key === "p") {
      const unitInput = row.querySelector("input[data-u]");
      if (unitInput) unitInput.value = "";
    }
    if (upp === 0 && key === "u") {
      const packInput = row.querySelector("input[data-p]");
      if (packInput) packInput.value = "";
    }

    const target = clampInt(dotations?.[sid]?.[code] ?? 0);
    const cur = entry[sid][code] || { p:"", u:"" };
    const allEmptyNow =
      (cur.p === "" || cur.p == null) &&
      (cur.u === "" || cur.u == null);
    const prepU = (!p || allEmptyNow)
      ? 0
      : Math.max(0, target - unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0));

    const prepValueEl = row.querySelector(".prepValue");
    if (prepValueEl) prepValueEl.textContent = String(prepU);
  }
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

  // Construire RAW dans l'ordre dotations_order
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

    // group: 0 cartons, 1 packs, 2 petit produit
    let group = 2;
    if (clampInt(p.unitsPerCarton) > 0) group = 0;
    else if (clampInt(p.unitsPerPack) > 0) group = 1;

    raw.push({ code, name: p.name, needU, paren, isDone, preparedU, group });
  }

  // TRI : cartons -> packs -> petit, sans casser l'ordre interne
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
    row.dataset.code = l.code;
    row.dataset.need = String(l.needU);
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
          type="number" min="0" step="1"
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

  // Input "préparé"
  list.querySelectorAll("input[data-prepared]").forEach(inp => {
    inp.addEventListener("input", () => {
      const code = inp.getAttribute("data-prepared");
      const v = String(inp.value ?? "").trim();

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

      const row = inp.closest(".prepRow");
      if (row) {
        row.dataset.need = String(needU);
        const chk = row.querySelector("input[data-done]");
        const isDone = !!done?.[sid]?.[code];
        if (chk) chk.checked = isDone;

        const preparedVal = clampInt(prepared?.[sid]?.[code] ?? 0);
        const filled = (preparedVal > 0) || isDone;
        row.classList.toggle("done", isDone);
        row.classList.toggle("filled", filled);
      }

      if (v !== "") {
        const val = clampInt(v);
        const capped = Math.min(val, needU);
        if (String(capped) !== String(v)) inp.value = String(capped);
      }

      updatePrepSummaryFromDom(sid);
    });
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusNextNumberInput(inp, "#prepList");
      }
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
      const row = chk.closest(".prepRow");
      if (row) {
        row.dataset.need = String(needU);
        const inp = row.querySelector("input[data-prepared]");
        const preparedVal = clampInt(prepared?.[sid]?.[code] ?? 0);
        if (inp) inp.value = preparedVal ? String(preparedVal) : "";

        const isDone = !!done?.[sid]?.[code];
        const filled = (preparedVal > 0) || isDone;
        row.classList.toggle("done", isDone);
        row.classList.toggle("filled", filled);
      }

      updatePrepSummaryFromDom(sid);
    });
  });

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
function updatePrepSummaryFromDom(sid) {
  const list = document.getElementById("prepList");
  const summary = document.getElementById("prepSummary");
  if (!list || !summary) return;

  const rows = list.querySelectorAll(".prepRow");
  if (!rows.length) {
    summary.textContent = `${serviceName(sid)}`;
    return;
  }

  let doneCount = 0;
  let totalNeed = 0;
  let totalPrepared = 0;

  rows.forEach(row => {
    const code = row.dataset.code;
    const needU = clampInt(row.dataset.need);
    totalNeed += needU;
    const pu = clampInt(prepared?.[sid]?.[code] ?? 0);
    totalPrepared += Math.min(pu, needU);
    if (!!done?.[sid]?.[code]) doneCount++;
  });

  summary.textContent =
    `${serviceName(sid)} • ${doneCount}/${rows.length} "fait" • Total à préparer: ${totalNeed} u • Total préparé: ${totalPrepared} u`;
}

document.getElementById("closeSave")?.addEventListener("click", () => {
  if (!confirm("Clôturer et sauvegarder la consommation pour ce service ?")) return;
  closeService(true);
});
document.getElementById("closeNoSave")?.addEventListener("click", () => {
  if (!confirm("Vider la saisie/prépa sans sauvegarder la consommation ?")) return;
  closeService(false);
});

function closeService(withSave) {
  const sid = p_service?.value || e_service?.value;
  if (!sid) return;

  // 1) sauver la consommation = ce que tu as réellement préparé (prepared[sid])
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

  // 2) vider brouillon (saisie + fait + préparé)
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

// ---------------- Consommation (semaine/mois) ----------------
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
  const day = (x.getDay()+6)%7; // lundi=0
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

  const byProduct = {}; // code -> totalU
  const byService = {}; // sid -> totalU

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
  setTopbarHeightVar();
  syncSelects();
  loadAll(false);
  renderPlanning();
  renderOrder();
  updateEntryReminderVisibility();
}
boot();

function setTopbarHeightVar(){
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  document.documentElement.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
}

window.addEventListener("resize", setTopbarHeightVar);
