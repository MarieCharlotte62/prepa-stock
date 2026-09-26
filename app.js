// app.js (COMPLET)
// - Prépa hôpital : parcours du magasin ; autres services : cartons -> packs -> petit.
// - Saisie: si U/pack>0 => saisie PACKS uniquement, sinon UNITÉS uniquement
// - Catalogue et dotations personnalisables, sauvegardés sur cet appareil.

const K_ENTRY = "ps_entry_json_v6";        // { serviceId: { code: { p:"", u:"" } } }
const K_DONE  = "ps_done_json_v9";         // { serviceId: { code: true } }
const K_PREP  = "ps_prepared_json_v9";     // { serviceId: { code: number } }
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

const ehpadGroceryServices = new Set(["EPICERIE_RESTAURANT", "EPICERIE_CHENES", "EPICERIE_PRUNIERS", "EPICERIE_MAGNOLIAS"]);
const ehpadJuiceCodes = new Set(["449", "3097", "3102", "3103", "3104", "3114"]);

function entryPackSize(sid, product) {
  // Le comptage à l’unité ne change pas le conditionnement du catalogue.
  if (ehpadGroceryServices.has(sid) && ehpadJuiceCodes.has(product.code)) return 0;
  return clampInt(product.unitsPerPack);
}

function unitsFromRestPackUnit(p, pk, u, sid) {
  const upp = entryPackSize(sid, p);
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
  if (["RESERVE_CHENES", "RESERVE_PRUNIERS", "RESERVE_MAGNOLIAS"].includes(sid) && ordered.includes("2985")) {
    return [...ordered.filter(code => code !== "2985"), "2985"];
  }
  return ordered;
}

// Parcours du magasin de l'hôpital : colonne Ordre du relevé Mag. Hôpital.
// À rang égal, conserver l'ordre des lignes du relevé. Les codes non classés restent à la fin.
const hospitalPreparationServices = new Set(["SSMC_2E_1700", "SSR_3E_1750", "MPRN_4E_1800"]);
const hospitalPreparationOrder = new Map([
  "3081", "4003", "3116", "2272", "2849", "4009", "3092", "2719", "1771", "2526", "2525", "2524",
  "2917", "1770", "1769", "309", "108", "107", "106", "2830", "689", "3100", "2492", "26010",
  "1515", "4004", "2654", "203", "2732", "661", "4027", "4028", "699", "690", "1971", "187",
  "577", "2853", "2959", "3027", "695", "3057", "2781", "546", "704", "1773", "2392", "2793",
  "430", "2753", "3227", "2983", "3178", "3010", "2418", "621", "628", "2358", "4033", "616",
  "4007", "4008", "4044", "2887", "657", "3004", "645", "718", "681", "569", "3218", "567",
  "3024", "698", "2936", "4048", "4049", "2979", "4051", "2934", "4034", "1721", "167", "706",
  "2251", "1231", "3065", "136", "1401", "256", "4002", "2549", "2219", "1417", "2733", "1002",
  "1911", "1903", "1684", "196", "2479", "228", "1959", "231", "2843", "3121", "230", "2472",
  "2714", "120", "1000", "1044", "1943", "1059", "766", "265", "2037", "1682", "3094", "2839",
  "178", "672", "266", "735", "561", "1896", "124", "271", "366", "1898", "1545", "3122"
].map((code, index) => [code, index]));

function sortPreparationLines(sid, lines) {
  if (hospitalPreparationServices.has(sid)) {
    const rank = code => hospitalPreparationOrder.get(String(code)) ?? Number.MAX_SAFE_INTEGER;
    return [...lines].sort((a, b) => rank(a.code) - rank(b.code));
  }
  return [
    ...lines.filter(x => x.group === 0),
    ...lines.filter(x => x.group === 1),
    ...lines.filter(x => x.group === 2),
  ];
}

// ---------------- Commande ----------------
const orderSites = ["hospital","ehpad"];
let orderSite = "hospital";
// Références de commande ajoutées avant de connaître leur code, avec leur ancienne clé.
const pendingHospitalOrderItems = [
  { key: "commande:nutrison-advance-cubison", code: "2980", name: "NUTRISON ADVANCE CUBISON 1000ML" }
];

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
  "26010": "lingerie",
  "3282": "lingerie",
  "2732": "lingerie",
  "2925": "vaisselle",
  "527": "vaisselle",
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
  "2980": "sondes diététiques",
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
  "3218": "produits de nettoyage",
  "3178": "produits de nettoyage",
  "2985": "collecteur d'aiguilles",
  "3327": "lingerie",
  "3328": "lingerie",
  "3329": "lingerie",
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
          "TENA FLEX MAXI XL (21)",
          { code: "2985", name: "CARTONS DASRI 50L" }
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

// Quantités de référence : Fichier commande HOPITAL.XLS,
// onglet « base de donnée », colonne C (26/09/2026).
// Quantités des trois eaux réduites de moitié le 26/09/2026.
// Référence par défaut pour les commandes Hôpital et EHPAD, sans conversion.
// Affichage uniquement : aucune modification des coches ou des seuils.
const orderBaseQuantities = {
  "90": 105,
  "106": 5000,
  "107": 15000,
  "108": 15000,
  "120": 24,
  "124": 48,
  "136": 1000,
  "142": 120,
  "144": 288,
  "167": 60,
  "178": 200,
  "187": 500,
  "196": 100,
  "203": 12,
  "218": 144,
  "220": 24,
  "221": 288,
  "222": 96,
  "228": 5,
  "230": 5,
  "231": 5,
  "249": 96,
  "250": 96,
  "251": 96,
  "252": 96,
  "256": 5,
  "265": 100,
  "266": 40,
  "271": 60,
  "309": 4500,
  "366": 100,
  "386": 12,
  "390": 216,
  "391": 4,
  "392": 60,
  "397": 6000,
  "407": 30,
  "422": 30,
  "430": 48,
  "449": 72,
  "451": 864,
  "466": 4,
  "500": 6,
  "503": 24,
  "504": 60,
  "511": 12,
  "513": 5,
  "518": 72,
  "527": 30,
  "546": 24,
  "550": 5,
  "554": 100,
  "556": 24,
  "557": 15,
  "561": 80,
  "566": 96,
  "567": 30,
  "569": 24,
  "572": 12,
  "577": 50,
  "593": 1000,
  "605": 120,
  "607": 72,
  "613": 120,
  "614": 120,
  "616": 12,
  "621": 96,
  "628": 72,
  "632": 36,
  "634": 120,
  "639": 4,
  "645": 48,
  "646": 6000,
  "657": 600,
  "661": 6000,
  "672": 864,
  "681": 24,
  "689": 5000,
  "690": 1000,
  "695": 120,
  "698": 12,
  "699": 800,
  "704": 12,
  "706": 900,
  "718": 500,
  "719": 36,
  "728": 72,
  "735": 25,
  "766": 10,
  "830": 10,
  "978": 100,
  "1000": 50,
  "1002": 20,
  "1006": 90,
  "1044": 100,
  "1059": 6,
  "1071": 96,
  "1133": 100,
  "1148": 100,
  "1186": 96,
  "1203": 100,
  "1231": 100,
  "1232": 32,
  "1342": 400,
  "1343": 200,
  "1401": 4000,
  "1417": 3000,
  "1437": 144,
  "1455": 144,
  "1459": 100,
  "1485": 96,
  "1490": 288,
  "1508": 144,
  "1511": 40,
  "1515": 540,
  "1519": 3,
  "1527": 120,
  "1545": 100,
  "1561": 96,
  "1564": 96,
  "1589": 144,
  "1605": 144,
  "1642": 192,
  "1680": 48,
  "1682": 14,
  "1684": 100,
  "1687": 288,
  "1691": 288,
  "1693": 144,
  "1694": 144,
  "1710": 144,
  "1721": 72,
  "1736": 105,
  "1743": 144,
  "1745": 80,
  "1765": 48,
  "1767": 2400,
  "1768": 48,
  "1769": 450,
  "1770": 450,
  "1771": 2880,
  "1773": 24,
  "1775": 48,
  "1794": 24,
  "1840": 24,
  "1844": 1600,
  "1854": 96,
  "1896": 60,
  "1898": 10,
  "1903": 20,
  "1911": 20,
  "1939": 96,
  "1943": 300,
  "1959": 5,
  "1960": 60,
  "1970": 120,
  "1971": 960,
  "1985": 16,
  "2004": 24,
  "2005": 480,
  "2006": 480,
  "2014": 400,
  "2020": 480,
  "2037": 5,
  "2042": 96,
  "2048": 130,
  "2050": 24,
  "2064": 144,
  "2069": 48,
  "2070": 250,
  "2219": 50,
  "2225": 120,
  "2251": 144,
  "2272": 36,
  "2339": 48,
  "2358": 120,
  "2392": 24,
  "2418": 72,
  "2447": 36,
  "2458": 24,
  "2468": 128,
  "2472": 5,
  "2476": 120,
  "2477": 240,
  "2478": 144,
  "2479": 36,
  "2492": 6000,
  "2503": 144,
  "2504": 288,
  "2505": 288,
  "2522": 184,
  "2524": 864,
  "2525": 1728,
  "2526": 1728,
  "2549": 400,
  "2554": 15,
  "2567": 80,
  "2578": 252,
  "2586": 20,
  "2601": 100,
  "2627": 10,
  "2645": 384,
  "2654": 480,
  "2657": 1000,
  "2663": 120,
  "2714": 24,
  "2719": 640,
  "2732": 1000,
  "2733": 22,
  "2753": 12,
  "2778": 12,
  "2781": 24,
  "2788": 15,
  "2789": 50,
  "2790": 600,
  "2793": 50,
  "2827": 96,
  "2830": 6500,
  "2839": 100,
  "2843": 4,
  "2845": 4,
  "2849": 120,
  "2853": 24,
  "2856": 144,
  "2881": 2112,
  "2887": 4,
  "2912": 864,
  "2917": 16800,
  "2925": 90,
  "2932": 20,
  "2934": 200,
  "2936": 84,
  "2953": 50,
  "2954": 100,
  "2959": 100,
  "2978": 48,
  "2979": 100,
  "2980": 24,
  "2983": 24,
  "2984": 6,
  "2985": 100,
  "3004": 500,
  "3010": 8,
  "3017": 1600,
  "3020": 24,
  "3022": 36,
  "3024": 48,
  "3025": 6000,
  "3027": 6,
  "3031": 120,
  "3056": 12,
  "3057": 720,
  "3060": 240,
  "3064": 48,
  "3065": 160,
  "3066": 4,
  "3077": 12,
  "3078": 4,
  "3081": 252,
  "3091": 300,
  "3092": 864,
  "3094": 90,
  "3096": 600,
  "3097": 40,
  "3098": 36,
  "3099": 200,
  "3100": 2000,
  "3102": 72,
  "3103": 72,
  "3104": 72,
  "3105": 6,
  "3106": 6,
  "3107": 6,
  "3108": 6,
  "3109": 1200,
  "3110": 1200,
  "3111": 1200,
  "3113": 1200,
  "3114": 72,
  "3116": 315,
  "3118": 800,
  "3121": 6,
  "3122": 6,
  "3137": 6,
  "3138": 6,
  "3139": 6,
  "3140": 6,
  "3178": 6,
  "3185": 800,
  "3196": 1200,
  "3218": 6,
  "3227": 100,
  "3238": 15,
  "3282": 5000,
  "3284": 12,
  "3288": 2000,
  "3289": 1000,
  "3327": 100,
  "3328": 100,
  "3329": 100,
  "4002": 1080,
  "4003": 340,
  "4004": 200,
  "4006": 48,
  "4007": 6,
  "4008": 6,
  "4009": 360,
  "4017": 100,
  "4024": 648,
  "4027": 2000,
  "4028": 2000,
  "4033": 24,
  "4034": 200,
  "4037": 5,
  "4044": 8,
  "4045": 6000,
  "4046": 1000,
  "4048": 72,
  "4049": 60,
  "4051": 72,
  "4052": 200,
  "4053": 200,
  "4054": 50,
  "4056": 40,
  "4503": 84,
  "4600": 4,
  "4601": 4,
  "26010": 1000
};

// Quantités propres à la commande EHPAD.
const ehpadOrderBaseQuantities = {
  "3020": 18,
  "3022": 24,
  "3098": 30,
  "2778": 6,
  "518": 48,
  "3097": 30,
  "2932": 10
};

function getThreshold(site, key){
  const t = orderThresholds?.[site]?.[key];
  if (t == null || t === "") return null;
  return clampInt(t);
}

// L'épicerie et la diététique conservent leurs familles et leur ordre actuel.
const deferredHospitalOrderCategories = new Set([
  "sondes diététiques", "boissons diététiques", "desserts diététiques",
  "biscuits diététiques", "eau gélifiée", "poudre diététiques",
  "autres produits diététiques", "eau", "boissons sucrées", "sirops",
  "confitures", "biscuits", "poudres et autres épicerie"
].map(normalizeName));

function orderHospitalRowsByWarehouse(rows) {
  const categories = [];
  let category = null, part = null;
  for (const row of rows) {
    if (row.type === "category") {
      category = { header: row, parts: [], originalRows: [row] };
      categories.push(category);
      part = null;
      continue;
    }
    category.originalRows.push(row);
    if (row.type === "subcategory") {
      part = { header: row, items: [] };
      category.parts.push(part);
    } else {
      if (!part) {
        part = { header: null, items: [] };
        category.parts.push(part);
      }
      part.items.push(row);
    }
  }
  const rank = row => hospitalPreparationOrder.get(row.code) ?? Number.MAX_SAFE_INTEGER;
  const partRank = part => part.items.reduce((first, row) => Math.min(first, rank(row)), Number.MAX_SAFE_INTEGER);
  const categoryRank = category => category.parts.reduce((first, part) => Math.min(first, partRank(part)), Number.MAX_SAFE_INTEGER);
  const isDeferred = category => deferredHospitalOrderCategories.has(normalizeName(category.header.name));
  const warehouse = categories.filter(category => !isDeferred(category));
  const deferred = categories.filter(isDeferred);
  warehouse.sort((a, b) => categoryRank(a) - categoryRank(b));
  return [
    ...warehouse.flatMap(category => [
      category.header,
      ...[...category.parts].sort((a, b) => partRank(a) - partRank(b)).flatMap(part => [
        ...(part.header ? [part.header] : []),
        ...[...part.items].sort((a, b) => rank(a) - rank(b))
      ])
    ]),
    ...deferred.flatMap(category => category.originalRows)
  ];
}

function renderOrder(){
  const tbody = document.querySelector("#orderTable tbody");
  const listBody = document.querySelector("#orderListTable tbody");
  if (!tbody || !listBody) return;
  const status = document.getElementById("orderStatus");
  if (status) status.textContent = "";
  const clearButton = document.getElementById("orderClear");
  if (clearButton) clearButton.setAttribute("aria-label", `Tout décocher dans la commande ${orderSiteLabel(orderSite)}`);

  tbody.innerHTML = "";
  listBody.innerHTML = "";

  if (!products.length){
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Aucun produit chargé.</td></tr>`;
    listBody.innerHTML = `<tr><td colspan="2" class="muted">Aucun produit sélectionné.</td></tr>`;
    return;
  }

  const cat = orderCatalog[orderSite];
  let rows = [];

  if (orderSite === "hospital") {
    const pending = pendingHospitalOrderItems.filter(item => {
      if (item.code) return false;
      const savedProduct = Object.values(catalogSettings.products).find(p => normalizeName(p.name) === normalizeName(item.name));
      return !findProductByName(item.name) && !hospitalOrderItems.some(p => normalizeName(p.name) === normalizeName(item.name)) &&
        !catalogProductDeleted(savedProduct?.code || "", item.name);
    });
    const grouped = groupHospitalOrderItems([...hospitalOrderItems, ...pending]);
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
            const code = String(it.code ?? "");
            const p = getProduct(code);
            const name = p?.name || it.name || code;
            rows.push({
              type: "item",
              key: it.key || pendingHospitalOrderItems.find(item => !item.code && normalizeName(item.name) === normalizeName(name))?.key || code,
              code,
              name,
              thresholdKey: code
            });
          }
        }
      } else {
        for (const it of items) {
          const code = String(it.code ?? "");
          const p = getProduct(code);
          const name = p?.name || it.name || code;
          rows.push({
            type: "item",
            key: it.key || pendingHospitalOrderItems.find(item => !item.code && normalizeName(item.name) === normalizeName(name))?.key || code,
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
        if (catalogProductDeleted(rawCode, name)) continue;
        const p = rawCode ? getProduct(rawCode) : findProductByName(name);
        const code = rawCode || (p?.code ? String(p.code) : retiredOrderCodeByName(name));
        if (!catalogOrderAllowed(code, orderSite)) continue;
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
    const sorted = products.filter(p => catalogOrderAllowed(p.code, orderSite)).sort((a,b)=>a.name.localeCompare(b.name, "fr"));
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

  if (orderSite === "hospital") rows = orderHospitalRowsByWarehouse(rows);

  if (orderSite === "ehpad") {
    const present = new Set(rows.filter(r => r.type === "item").map(r => r.code));
    const extra = products.filter(p => catalogOrderSites(p.code)?.includes("ehpad") && catalogOrderAllowed(p.code, "ehpad") && !present.has(p.code));
    if (extra.length) rows.push({ type: "category", name: "Produits ajoutés au catalogue" });
    for (const p of extra) rows.push({ type: "item", key: p.code, code: p.code, name: p.name, thresholdKey: p.code });
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

    const entry = orderState?.[orderSite]?.[r.key] || { c: false };
    const t = orderSite === "ehpad"
      ? (ehpadOrderBaseQuantities[String(r.code)] ?? orderBaseQuantities[String(r.code)])
      : orderBaseQuantities[String(r.code)];
    const tDisplay = Number.isFinite(t) ? t.toLocaleString("fr-FR") : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="${r.code ? "" : "pendingCode"}">${escapeHtml(r.code || "Code à renseigner")}</span></td>
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
      .filter(([key, value]) => {
        if (!value?.c) return false;
        const reference = pendingHospitalOrderItems.find(item => item.key === key);
        const name = reference?.name || key;
        const product = getHistoricalProduct(reference?.code || key) || findProductByName(name) ||
          Object.values(catalogSettings.products).find(item => normalizeName(item.name) === normalizeName(name)) ||
          catalogBase?.products.find(item => normalizeName(item.name) === normalizeName(name));
        return !catalogProductDeleted(product?.code || "", name) && catalogOrderAllowed(product?.code || retiredOrderCodeByName(name), orderSite);
      })
      .map(([key]) => key);

    if (orderSite === "hospital") {
      const positions = new Map(rows.filter(row => row.type === "item").map((row, index) => [row.key, index]));
      const rank = key => {
        if (positions.has(key)) return positions.get(key);
        const reference = pendingHospitalOrderItems.find(item => item.key === key);
        const product = getProduct(reference?.code || key) || findProductByName(reference?.name || key);
        return positions.get(product?.code) ?? Number.MAX_SAFE_INTEGER;
      };
      selected.sort((a, b) => rank(a) - rank(b));
    }

    if (!selected.length){
      listBody.innerHTML = `<tr><td colspan="2" class="muted">Aucun produit sélectionné.</td></tr>`;
      return;
    }

    for (const key of selected) {
      const row = rows.find(item => item.type === "item" && item.key === key);
      const reference = pendingHospitalOrderItems.find(item => item.key === key);
      const p = getProduct(reference?.code || key) || findProductByName(reference?.name || key);
      const code = row ? (row.code || "Code à renseigner") : (p?.code ? String(p.code) : (String(key).length <= 12 ? String(key) : "—"));
      const name = row?.name || p?.name || reference?.name || key;
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
      if (status) status.textContent = "";
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
  "Tabliers imperméables",
  "Charlottes",
  "SHA 100ML",
  "SHA 500ML",
  "SHA 1L",
  "Anios oxyfloor",
  "BIDON surfanios en Litre",
  "Lingette wipanios",
  "Gants"
];

// Références du catalogue ; code des surblouses confirmé par Marie.
const epiProductCodes = {
  "Masques FFP2": [
    "2732"
  ],
  "Masques chirurgicaux": [
    "661"
  ],
  "Surblouses imperméables": [
    "26010"
  ],
  "Tabliers imperméables": [
    "2492"
  ],
  "Charlottes": [
    "3282"
  ],
  "SHA 100ML": [
    "2979"
  ],
  "SHA 500ML": [
    "4048"
  ],
  "SHA 1L": [
    "4051"
  ],
  "Anios oxyfloor": [
    "4034"
  ],
  "BIDON surfanios en Litre": [
    "2887"
  ],
  "Lingette wipanios": [
    "2936"
  ]
};

let epiFocusedInput = null;

function focusNextEpiInput(input) {
  if (!input?.isConnected) return;
  const column = input.dataset.col;
  const inputs = [...document.querySelectorAll(`#epiTable .epiInput[data-col="${column}"]`)];
  const next = inputs[inputs.indexOf(input) + 1];
  if (next) {
    next.focus();
    next.select();
    next.scrollIntoView({ block: "center", inline: "nearest" });
  } else {
    input.blur();
    epiFocusedInput = null;
    document.getElementById("epiNext").disabled = true;
    document.getElementById("epiNext").textContent = "Ligne suivante ↓";
  }
}

function renderEpi(){
  const tbody = document.querySelector("#epiTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  epiFocusedInput = null;
  const nextButton = document.getElementById("epiNext");
  nextButton.disabled = true;
  nextButton.textContent = "Ligne suivante ↓";

  for (const [index, name] of epiItems.entries()) {
    epiState[name] = epiState[name] || { e:"", h:"" };
    const row = document.createElement("tr");
    const eVal = epiState[name].e ?? "";
    const hVal = epiState[name].h ?? "";
    const allEmpty = (eVal === "" || eVal == null) && (hVal === "" || hVal == null);
    const total = allEmpty ? "" : String(clampInt(eVal) + clampInt(hVal));
    const enterHint = index === epiItems.length - 1 ? "done" : "next";

    // L’ordre de navigation descend toute la colonne avant l’autre établissement.
    row.innerHTML = `
      <td>${escapeHtml(name)}${epiProductCodes[name]?.length ? `<span class="epiProductCode">(${escapeHtml(epiProductCodes[name].join(", "))})</span>` : ""}</td>
      <td>
        <input class="epiInput" type="number" min="0" step="1" inputmode="numeric" enterkeyhint="${enterHint}" tabindex="${index + 1}" aria-label="${escapeHtml(name)} — Stock EHPAD" data-epi="${escapeHtml(name)}" data-col="e" value="${escapeHtml(eVal)}">
      </td>
      <td>
        <input class="epiInput" type="number" min="0" step="1" inputmode="numeric" enterkeyhint="${enterHint}" tabindex="${epiItems.length + index + 1}" aria-label="${escapeHtml(name)} — Stock Hôpital" data-epi="${escapeHtml(name)}" data-col="h" value="${escapeHtml(hVal)}">
      </td>
      <td class="epiTotal">${escapeHtml(total)}</td>
    `;
    tbody.appendChild(row);
  }

  tbody.querySelectorAll(".epiInput").forEach(inp => {
    inp.addEventListener("focus", () => {
      epiFocusedInput = inp;
      nextButton.disabled = false;
      nextButton.textContent = inp.enterKeyHint === "done" ? "Terminer" : "Ligne suivante ↓";
    });
    inp.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === "Next") {
        event.preventDefault();
        focusNextEpiInput(inp);
      }
    });
    inp.addEventListener("input", () => {
      const name = inp.getAttribute("data-epi");
      const col = inp.getAttribute("data-col");
      const v = String(inp.value ?? "").trim();
      epiState[name] = epiState[name] || { e:"", h:"" };
      epiState[name][col] = (v === "") ? "" : String(clampInt(v));
      save(K_EPI, epiState);
      document.getElementById("epiStatus").textContent = "";

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

document.getElementById("epiNext")?.addEventListener("pointerdown", event => event.preventDefault());
document.getElementById("epiNext")?.addEventListener("click", () => focusNextEpiInput(epiFocusedInput));
document.getElementById("epiClear")?.addEventListener("click", () => {
  if (!confirm("Effacer toutes les saisies EPI des colonnes EHPAD et Hôpital ?")) return;
  const status = document.getElementById("epiStatus");
  try {
    save(K_EPI, {});
    epiState = {};
    renderEpi();
    status.textContent = "Toutes les saisies EPI ont été effacées.";
  } catch (_) {
    status.textContent = "L’effacement n’a pas pu être enregistré. Les saisies sont conservées.";
  }
});

document.getElementById("orderClear")?.addEventListener("click", () => {
  if (!confirm(`Tout décocher dans la commande ${orderSiteLabel(orderSite)} ?`)) return;
  const status = document.getElementById("orderStatus");
  try {
    const next = JSON.parse(JSON.stringify(orderState));
    for (const entry of Object.values(next[orderSite] || {})) {
      if (entry && typeof entry === "object") entry.c = false;
    }
    save(K_ORDER, next);
    orderState = next;
    renderOrder();
    status.textContent = `Toutes les cases de la commande ${orderSiteLabel(orderSite)} ont été décochées.`;
  } catch (_) {
    status.textContent = "Le décochage n’a pas pu être enregistré. La sélection est conservée.";
  }
});


// ---------------- Planning ----------------
const planningDays = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi"];
const planningTasks = {
  hospital: {
    Lundi: [
      "Armoire piluliers SMR2",
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
      "Sortie magh2 diététique ehpad"
    ],
    Mercredi: [
      "Armoire piluliers SMR3",
      "Récupération fiche pharmacie"
    ],
    Jeudi: [
      "Rangement",
      "Préparation-livraison pharmacie",
      "Commande"
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
      "Livraison des colis",
      "EPI"
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

// Déplacer aussi les coches existantes, une seule fois et en une seule écriture.
function updatePlanningDays() {
  const marker = "_hospitalDays20260925";
  try {
    const next = JSON.parse(localStorage.getItem(K_PLANNING) || "{}");
    const record = value => value && typeof value === "object" && !Array.isArray(value);
    if (!record(next)) throw new Error("Planning invalide");
    if (next[marker]) { planningState = next; return; }
    const hospital = next.hospital;
    if (hospital != null) {
      if (!record(hospital)) throw new Error("Planning invalide");
      for (const day of ["Lundi", "Mardi", "Jeudi", "Vendredi"]) {
        if (hospital[day] != null && !record(hospital[day])) throw new Error("Planning invalide");
      }
      if (hospital.Lundi) {
        const monday = {};
        for (const [index, checked] of Object.entries(hospital.Lundi)) {
          if (index === "1") {
            hospital.Vendredi = hospital.Vendredi || {};
            hospital.Vendredi[10] = checked;
          } else monday[/^\d+$/.test(index) && Number(index) > 1 ? Number(index) - 1 : index] = checked;
        }
        hospital.Lundi = monday;
      }
      if (hospital.Mardi && Object.hasOwn(hospital.Mardi, "12")) {
        hospital.Jeudi = hospital.Jeudi || {};
        hospital.Jeudi[2] = hospital.Mardi[12];
        delete hospital.Mardi[12];
      }
    }
    next[marker] = true;
    save(K_PLANNING, next);
    planningState = next;
  } catch (_) {
    throw new Error("Le planning n’a pas pu être mis à jour. Les données enregistrées sont conservées. Vérifie l’espace disponible puis recharge la page.");
  }
}

const K_PLANNING_CUSTOM = "ps_planning_custom_v1";
let planningData = null;
let planningReady = false;
let planningEditing = false;

function planningSiteLabel(site) {
  return site === "ehpad" ? "EHPAD" : "Hôpital";
}

function planningMessage(message, error = false) {
  const status = document.getElementById("planningStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("formError", error);
  status.classList.toggle("muted", !error);
}

function validatePlanningData(value) {
  const record = x => x && typeof x === "object" && !Array.isArray(x);
  if (!record(value) || value.version !== 1 || !record(value.sites)) throw new Error("Planning invalide");
  const result = { version: 1, sites: {} }, ids = new Set();
  if (Object.keys(value.sites).some(site => !["hospital", "ehpad"].includes(site))) throw new Error("Établissement invalide");
  for (const site of ["hospital", "ehpad"]) {
    const days = value.sites[site];
    if (!record(days) || Object.keys(days).some(day => !planningDays.includes(day))) throw new Error("Jours invalides");
    result.sites[site] = {};
    for (const day of planningDays) {
      if (!Array.isArray(days[day])) throw new Error("Journée invalide");
      result.sites[site][day] = days[day].map(task => {
        if (!record(task) || typeof task.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id) || ids.has(task.id)
          || typeof task.label !== "string" || !task.label.trim() || task.label.length > 200 || typeof task.checked !== "boolean") throw new Error("Tâche invalide");
        ids.add(task.id);
        return { id: task.id, label: task.label, checked: task.checked };
      });
    }
  }
  return result;
}

function initPlanningManagement() {
  try {
    const raw = localStorage.getItem(K_PLANNING_CUSTOM);
    if (raw !== null) {
      planningData = validatePlanningData(JSON.parse(raw));
    } else {
      // Reprendre les coches par indice une seule fois, après les corrections des jours.
      updatePlanningDays();
      planningData = { version: 1, sites: {} };
      for (const site of ["hospital", "ehpad"]) {
        planningData.sites[site] = {};
        planningDays.forEach((day, dayIndex) => {
          planningData.sites[site][day] = planningTasks[site][day].map((label, index) => ({
            id: `default-${site}-${dayIndex}-${index}`, label,
            checked: !!planningState?.[site]?.[day]?.[index]
          }));
        });
      }
    }
    planningReady = true;
  } catch (_) {
    planningData = null;
    planningReady = false;
    planningMessage("Le planning enregistré ne peut pas être chargé. Il a été conservé sans modification. Recharge la page ; si le problème persiste, demande de l’aide.", true);
  }
}

function clonePlanning() {
  return JSON.parse(JSON.stringify(planningData));
}

function commitPlanning(next) {
  if (!planningReady) throw new Error("Le planning n’est pas disponible.");
  const validated = validatePlanningData(next);
  try { save(K_PLANNING_CUSTOM, validated); }
  catch (_) { throw new Error("Enregistrement impossible. La modification n’a pas été appliquée. Vérifie l’espace disponible sur cet appareil, puis réessaie."); }
  // Une seule écriture conserve ensemble les tâches, leur ordre et leurs coches.
  planningData = validated;
}

function findPlanningTask(data, site, id) {
  if (!data?.sites?.[site]) return null;
  for (const day of planningDays) {
    const index = data.sites[site][day].findIndex(task => task.id === id);
    if (index >= 0) return { day, index, task: data.sites[site][day][index] };
  }
  return null;
}

function updatePlanningDayMeta(card) {
  const tasks = card.querySelectorAll('input[type="checkbox"]');
  const checked = [...tasks].filter(input => input.checked).length;
  card.querySelector(".dayMeta").textContent = tasks.length ? `${checked}/${tasks.length} fait` : "";
  card.classList.toggle("done", tasks.length > 0 && checked === tasks.length);
}

function focusPlanningTask(id, action) {
  const row = [...document.querySelectorAll(".planningTask")].find(el => el.dataset.taskId === id);
  if (!row) return;
  const button = row.querySelector(`[data-planning-action="${action}"]:not(:disabled)`);
  const target = button || row.querySelector('input[type="checkbox"]');
  target?.focus({ preventScroll: true });
  row.scrollIntoView({ block: "nearest", behavior: "instant" });
}

function renderPlanning() {
  const root = document.getElementById("planningContent");
  if (!root) return;
  const manage = document.getElementById("planningManage");
  if (manage) {
    manage.disabled = !planningReady;
    manage.textContent = planningEditing ? "Terminer" : "Gérer mon planning";
    manage.setAttribute("aria-expanded", String(planningEditing));
  }
  document.getElementById("planningEditor")?.classList.toggle("hidden", !planningEditing || !planningReady);
  const editSite = document.getElementById("planningEditSite");
  if (editSite) editSite.textContent = `Ajouter une tâche — ${planningSiteLabel(planningSite)}`;
  const clear = document.getElementById("planningClear");
  if (clear) clear.disabled = !planningReady;
  if (!planningReady) { root.innerHTML = ""; return; }

  const grid = document.createElement("div");
  grid.className = "planningGrid" + (planningEditing ? " isEditing" : "");
  for (const day of planningDays) {
    const tasks = planningData.sites[planningSite][day];
    const card = document.createElement("div");
    card.className = "dayCard";
    card.dataset.day = day;
    card.innerHTML = `<div class="dayTitle">${day}</div><div class="dayMeta muted"></div>`;
    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted planningEmpty";
      empty.textContent = "Aucune tâche.";
      card.appendChild(empty);
    }
    tasks.forEach((task, index) => {
      const row = document.createElement("div");
      row.className = "planningTask";
      row.dataset.taskId = task.id;
      row.innerHTML = `
        <label class="taskItem${task.checked ? " done" : ""}">
          <input type="checkbox" id="pl-${task.id}" data-task-id="${task.id}" data-site="${planningSite}" data-day="${day}" ${task.checked ? "checked" : ""}>
          <span>${escapeHtml(task.label)}</span>
        </label>
        ${planningEditing ? `<div class="planningTaskTools">
          <div class="planningTaskOrder">
            <button type="button" class="planningArrow" data-planning-action="up" ${index === 0 ? "disabled" : ""} aria-label="Monter : ${escapeHtml(task.label)}" title="Monter">↑</button>
            <button type="button" class="planningArrow" data-planning-action="down" ${index === tasks.length - 1 ? "disabled" : ""} aria-label="Descendre : ${escapeHtml(task.label)}" title="Descendre">↓</button>
            <button type="button" class="planningDelete" data-planning-action="delete" aria-label="Supprimer : ${escapeHtml(task.label)}">Supprimer</button>
          </div>
          <div class="planningTaskMove">
            <select data-planning-day aria-label="Jour de destination : ${escapeHtml(task.label)}">${planningDays.map(destination => `<option value="${destination}" ${destination === day ? "selected" : ""}>${destination}</option>`).join("")}</select>
            <button type="button" class="btn ghost" data-planning-action="move" disabled>Déplacer</button>
          </div>
        </div>` : ""}`;
      card.appendChild(row);
    });
    grid.appendChild(card);
    updatePlanningDayMeta(card);
  }
  root.replaceChildren(grid);
}

document.getElementById("planningManage")?.addEventListener("click", () => {
  if (!planningReady) return;
  planningEditing = !planningEditing;
  planningMessage("");
  renderPlanning();
});

document.getElementById("planningTaskForm")?.addEventListener("submit", event => {
  event.preventDefault();
  if (!planningReady) return;
  const input = document.getElementById("planningTaskName");
  const day = document.getElementById("planningTaskDay").value;
  const label = input.value.trim();
  if (!label || label.length > 200 || !planningDays.includes(day)) {
    planningMessage("Indique le nom de la tâche et son jour.", true);
    input.focus();
    return;
  }
  try {
    const next = clonePlanning();
    const id = `task-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    next.sites[planningSite][day].push({ id, label, checked: false });
    commitPlanning(next);
    input.value = "";
    renderPlanning();
    planningMessage(`Tâche ajoutée le ${day.toLocaleLowerCase("fr-FR")} — ${planningSiteLabel(planningSite)}.`);
    input.focus();
  } catch (error) { planningMessage(error.message, true); }
});

document.getElementById("planningContent")?.addEventListener("change", event => {
  if (!planningReady) return;
  const input = event.target;
  const row = input.closest(".planningTask");
  if (!row) return;
  const current = findPlanningTask(planningData, planningSite, row.dataset.taskId);
  if (!current) return;
  if (input.matches("[data-planning-day]")) {
    row.querySelector('[data-planning-action="move"]').disabled = input.value === current.day;
    return;
  }
  if (!input.matches('input[type="checkbox"][data-task-id]')) return;
  try {
    const next = clonePlanning();
    findPlanningTask(next, planningSite, current.task.id).task.checked = input.checked;
    commitPlanning(next);
    row.querySelector(".taskItem").classList.toggle("done", input.checked);
    updatePlanningDayMeta(row.closest(".dayCard"));
    planningMessage("");
  } catch (error) {
    input.checked = current.task.checked;
    planningMessage(error.message, true);
  }
});

document.getElementById("planningContent")?.addEventListener("click", event => {
  const button = event.target.closest("[data-planning-action]");
  if (!button || button.disabled || !planningReady || !planningEditing) return;
  const row = button.closest(".planningTask"), id = row.dataset.taskId;
  const current = findPlanningTask(planningData, planningSite, id);
  if (!current) return;
  const action = button.dataset.planningAction;
  if (action === "delete" && !confirm(`Supprimer « ${current.task.label} » du ${current.day.toLocaleLowerCase("fr-FR")} — ${planningSiteLabel(planningSite)} ?`)) return;
  try {
    const next = clonePlanning(), list = next.sites[planningSite][current.day];
    let message = "Ordre des tâches modifié.";
    let focusId = id;
    if (action === "up" || action === "down") {
      const destination = current.index + (action === "up" ? -1 : 1);
      if (destination < 0 || destination >= list.length) return;
      [list[current.index], list[destination]] = [list[destination], list[current.index]];
    } else if (action === "move") {
      const day = row.querySelector("[data-planning-day]").value;
      if (!planningDays.includes(day) || day === current.day) return;
      const [task] = list.splice(current.index, 1);
      next.sites[planningSite][day].push(task);
      message = `Tâche déplacée le ${day.toLocaleLowerCase("fr-FR")}.`;
    } else if (action === "delete") {
      list.splice(current.index, 1);
      focusId = list[Math.min(current.index, list.length - 1)]?.id;
      message = "Tâche supprimée.";
    } else return;
    commitPlanning(next);
    renderPlanning();
    planningMessage(message);
    if (focusId) focusPlanningTask(focusId, action);
    else document.getElementById("planningManage")?.focus({ preventScroll: true });
  } catch (error) { planningMessage(error.message, true); }
});

document.getElementById("planningClear")?.addEventListener("click", () => {
  if (!planningReady) return;
  const label = planningSiteLabel(planningSite);
  if (!confirm(`Voulez-vous vraiment tout décocher pour ${label} ?`)) return;
  try {
    const next = clonePlanning();
    for (const day of planningDays) next.sites[planningSite][day].forEach(task => { task.checked = false; });
    commitPlanning(next);
    renderPlanning();
    planningMessage(`Toutes les tâches de ${label} sont décochées.`);
  } catch (error) { planningMessage(error.message, true); }
});

document.querySelectorAll(".subtab").forEach(btn => {
  btn.addEventListener("click", () => {
    const isPlan = !!btn.dataset.plan;
    const isOrder = !!btn.dataset.order;

    if (isPlan) {
      document.querySelectorAll('.subtab[data-plan]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      planningSite = btn.dataset.plan || "hospital";
      if (planningReady) planningMessage("");
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
const tabButtons = document.querySelectorAll(".tab, .managementTab");
const panels = {
  planning: document.getElementById("tab-planning"),
  epi: document.getElementById("tab-epi"),
  order: document.getElementById("tab-order"),
  products: document.getElementById("tab-products"),
  services: document.getElementById("tab-services"),
  dotations: document.getElementById("tab-dotations"),
  entry: document.getElementById("tab-entry"),
  prep: document.getElementById("tab-prep"),
};

function showTab(t){
  if (!t || !panels[t]) return;

  const changed = panels[t].classList.contains("hidden");
  tabButtons.forEach(b => {
    const active = b.dataset.tab === t;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const management = t === "products" || t === "dotations";
  document.getElementById("managementNav")?.classList.toggle("hidden", !management);
  moreToggle?.classList.toggle("active", ["order", "epi", "products", "dotations"].includes(t));
  moreMenu?.querySelectorAll(".menuItem").forEach(item => {
    const active = item.dataset.tab === t || (management && item.dataset.tab === "products");
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
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

  closeMoreMenu();
  if (changed) window.scrollTo({ top: 0, behavior: "instant" });
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
  if (moreToggle.contains(target) || moreMenu.contains(target)) return;
  closeMoreMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && moreMenu?.classList.contains("open")) {
    closeMoreMenu();
    moreToggle?.focus();
  }
});

// ---------------- Flèche retour haut (Complément / Prépar.) ----------------
document.querySelectorAll("[data-back-top]").forEach(btn => {
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

// ---------------- Load JSONs ----------------
const productsLoadStatus = document.getElementById("productsLoadStatus");
document.getElementById("reloadAll")?.addEventListener("click", () => loadAll(true));

async function loadAll(showAlert = false) {
  try {
    if (productsLoadStatus) productsLoadStatus.textContent = "Chargement…";
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

    captureCatalogBase();

    for (const s of services) {
      entry[s.id] = entry[s.id] || {};
      done[s.id]  = done[s.id]  || {};
      prepared[s.id] = prepared[s.id] || {};
    }
    save(K_ENTRY, entry);
    save(K_DONE, done);
    save(K_PREP, prepared);

    if (productsLoadStatus) {
      productsLoadStatus.textContent = "";
    }
    setTopbarHeightVar();

    renderProducts();
    renderServices();
    renderOrder();
    syncSelects();
    renderDotations();
    renderEntry();
    renderPrep();

  
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
  renderCatalogManagement();
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

// Même classement des réserves dans Complémentation et Préparation.
const workflowServiceGroups = [
  { label: "Hôpital", items: [
    ["SSMC_2E_1700", "2e — SSMC (1700)"],
    ["SSR_3E_1750", "3e — SSR (1750)"],
    ["MPRN_4E_1800", "4e — MPRN (1800)"]
  ] },
  { label: "EHPAD", items: [
    ["EPICERIE_CHENES", "Épicerie Chênes"],
    ["RESERVE_CHENES", "Réserve Chênes"],
    ["RESERVE_PRUNIERS", "Réserve Pruniers"],
    ["RESERVE_CERISIERS", "Réserve Cerisiers"],
    ["EPICERIE_PRUNIERS", "Épicerie Pruniers"],
    ["EPICERIE_MAGNOLIAS", "Épicerie Magnolias"],
    ["RESERVE_MAGNOLIAS", "Réserve Magnolias"],
    ["EPICERIE_RESTAURANT", "Épicerie Restaurant"]
  ] }
];

function fillWorkflowServices(select) {
  if (!select) return;
  const current = select.value;
  const available = new Map(services.map(service => [service.id, service]));
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choisir...";
  select.replaceChildren(placeholder);
  const appendGroup = (label, items) => {
    const group = document.createElement("optgroup");
    group.label = label;
    for (const [id, name] of items) {
      if (!available.has(id)) continue;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = name;
      group.appendChild(option);
      available.delete(id);
    }
    if (group.children.length) select.appendChild(group);
  };
  workflowServiceGroups.forEach(group => appendGroup(group.label, group.items));
  // Garder accessibles d’éventuelles nouvelles réserves non encore classées.
  appendGroup("Autres réserves", [...available.values()].map(service => [service.id, service.name]));
  const options = [...select.options];
  select.value = current && options.some(option => option.value === current)
    ? current : (options.find(option => option.value)?.value || "");
}

function syncSelects() {
  fillSelectServices(d_service, services, "Choisir...");
  fillWorkflowServices(e_service);
  fillWorkflowServices(p_service);

  if (services.length) {
    if (d_service && !services.some(s => s.id === d_service.value)) d_service.value = services[0].id;
  }
}

d_service?.addEventListener("change", renderDotations);
e_service?.addEventListener("change", () => { renderEntry(); renderPrep(); });
p_service?.addEventListener("change", renderPrep);

// ---------------- DOTATIONS VIEW ----------------
function renderDotations() {
  renderDotationPicker();
  const sid = d_service?.value;
  const tbody = document.querySelector("#dotationsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!sid) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Sélectionne un service.</td></tr>`;
    return;
  }

  const map = dotations?.[sid] || {};
  const codes = getOrderedCodesForService(sid);

  if (!codes.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Aucune dotation pour ce service.</td></tr>`;
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
      <td><button type="button" class="btn danger" data-remove-dotation="${escapeHtml(code)}" aria-label="Retirer ${escapeHtml(p.name)} de cette dotation">Retirer</button></td>
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

    const upp = entryPackSize(sid, p);
    const packEnabled = upp > 0;
    const unitEnabled = upp === 0;

    const allEmpty =
      (cur.p === "" || cur.p == null) &&
      (cur.u === "" || cur.u == null);

    const prepU = allEmpty
      ? 0
      : Math.max(0, target - unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0, sid));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx}</td>
      <td>${escapeHtml(code)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="entryAmount${packEnabled ? "" : " unavailable"}" data-label="Packs restants">
        <input type="number" min="0" step="1" inputmode="numeric" enterkeyhint="next" aria-label="Packs restants — ${escapeHtml(p.name)}"
          ${packEnabled ? "" : "disabled"}
          value="${escapeHtml(cur.p ?? "")}"
          data-p="${code}">
      </td>
      <td class="entryAmount${unitEnabled ? "" : " unavailable"}" data-label="Unités restantes">
        <input type="number" min="0" step="1" inputmode="numeric" enterkeyhint="next" aria-label="Unités restantes — ${escapeHtml(p.name)}"
          ${unitEnabled ? "" : "disabled"}
          value="${escapeHtml(cur.u ?? "")}"
          data-u="${code}">
      </td>
      <td class="entryResult" data-label="À préparer"><strong class="prepValue">${prepU}</strong> <span class="muted">u</span></td>
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

}

function updateEntryCell(sid, code, key, value, inputEl) {
  entry[sid] = entry[sid] || {};
  entry[sid][code] = entry[sid][code] || { p:"", u:"" };

  const p = getProduct(code);
  const upp = p ? entryPackSize(sid, p) : 0;

  // Une nouvelle saisie de packs remplace le comptage précédent du produit.
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
      : Math.max(0, target - unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0, sid));

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
    const remainU = unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0, sid);
    const needU = Math.max(0, target - remainU);
    if (needU <= 0 && !(clampInt(prepared[sid][code] ?? 0) > 0)) continue;

    done[sid][code] = true;
    prepared[sid][code] = Math.max(clampInt(prepared[sid][code] ?? 0), needU);
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
    const remainU = unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0, sid);
    const needU = Math.max(0, target - remainU);

    const preparedU = (prepared?.[sid]?.[code] == null) ? null : clampInt(prepared[sid][code]);
    // Une baisse de dotation ne doit pas effacer une quantité déjà préparée.
    if (needU <= 0 && !(preparedU > 0)) {
      delete prepared[sid][code];
      delete done[sid][code];
      continue;
    }
    const isDone = !!done?.[sid]?.[code];
    const paren = formatParenCartonPack(p, needU);

    // group: 0 cartons, 1 packs, 2 petit produit
    let group = 2;
    if (clampInt(p.unitsPerCarton) > 0) group = 0;
    else if (clampInt(p.unitsPerPack) > 0) group = 1;

    raw.push({ code, name: p.name, needU, paren, isDone, preparedU, group });
  }

  // Le parcours du magasin prime sur les conditionnements pour l'hôpital.
  const lines = sortPreparationLines(sid, raw);

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
        <input class="prepInput" inputmode="numeric" aria-label="Quantité préparée — ${escapeHtml(l.name)}"
          type="number" min="0" step="1"
          value="${escapeHtml(preparedDisplay)}"
          data-prepared="${escapeHtml(l.code)}"
        />
      </div>

      <div class="doneCell center">
        <input class="checkbox" aria-label="Préparation terminée — ${escapeHtml(l.name)}" type="checkbox" ${l.isDone ? "checked":""} data-done="${escapeHtml(l.code)}">
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
      const remainU = p ? unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0, sid) : 0;
      const needU = Math.max(0, target - remainU);

      if (v === "") {
        delete prepared[sid][code];
        delete done[sid][code];
      } else {
        const val = clampInt(v);
        prepared[sid][code] = val;
        if (val > 0 && val >= needU) done[sid][code] = true;
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
        if (String(val) !== String(v)) inp.value = String(val);
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
      const remainU = p ? unitsFromRestPackUnit(p, cur.p || 0, cur.u || 0, sid) : 0;
      const needU = Math.max(0, target - remainU);

      if (chk.checked && Math.max(clampInt(prepared[sid][code] ?? 0), needU) > 0) {
        done[sid][code] = true;
        prepared[sid][code] = Math.max(clampInt(prepared[sid][code] ?? 0), needU);
      } else {
        delete done[sid][code];
        chk.checked = false;
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
    totalPrepared += pu;
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
    totalPrepared += pu;
    if (!!done?.[sid]?.[code]) doneCount++;
  });

  summary.textContent =
    `${serviceName(sid)} • ${doneCount}/${rows.length} "fait" • Total à préparer: ${totalNeed} u • Total préparé: ${totalPrepared} u`;
}

// Vider seulement le complément et la préparation de la réserve sélectionnée.
document.getElementById("closeNoSave")?.addEventListener("click", () => {
  const sid = p_service?.value || e_service?.value;
  if (!sid || !confirm(`Vider le complément et la préparation de ${serviceName(sid)} ?`)) return;
  const nextEntry = { ...entry, [sid]: {} };
  const nextDone = { ...done, [sid]: {} };
  const nextPrepared = { ...prepared, [sid]: {} };
  const changes = [[K_ENTRY, nextEntry], [K_DONE, nextDone], [K_PREP, nextPrepared]];
  let previous = [];
  try {
    previous = changes.map(([key]) => [key, localStorage.getItem(key)]);
    for (const [key, value] of changes) save(key, value);
  } catch (_) {
    for (const [key, value] of previous) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch (_) { /* Conserver la saisie en mémoire en cas de stockage indisponible. */ }
    }
    alert("Impossible de vider les saisies. Elles ont été conservées. Réessaie après avoir vérifié l’espace disponible.");
    return;
  }
  entry = nextEntry; done = nextDone; prepared = nextPrepared;
  renderEntry();
  renderPrep();
});

// ---------------- Boot ----------------
function boot() {
  try {
    initPlanningManagement();
    initCatalogManagement();
  }
  catch (error) {
    if (productsLoadStatus) productsLoadStatus.textContent = error.message;
    setTopbarHeightVar();
    return;
  }
  setTopbarHeightVar();
  syncSelects();
  loadAll(false);
  renderPlanning();
  renderOrder();
}
boot();

function setTopbarHeightVar(){
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  const navigation = document.querySelector(".tabs");
  const navHeight = navigation?.offsetHeight || 0;
  document.documentElement.style.setProperty("--header-h", `${topbar.offsetHeight}px`);
  document.documentElement.style.setProperty("--topbar-h", `${topbar.offsetHeight + navHeight}px`);
  document.documentElement.style.setProperty("--bottom-nav-h", "0px");
}

window.addEventListener("resize", setTopbarHeightVar);

if (typeof ResizeObserver !== "undefined") {
  const layoutObserver = new ResizeObserver(setTopbarHeightVar);
  document.querySelectorAll(".topbar, .tabs").forEach(el => layoutObserver.observe(el));
}
