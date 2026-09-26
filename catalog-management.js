// Personnalisations enregistrées séparément des données fournies avec le site.
const K_CATALOG_SETTINGS = "ps_catalog_settings_v1";
let catalogSettings = { version: 1, products: {}, deleted: [], dotations: {}, orderSites: {} };
let catalogBase = null;
let catalogReady = false;
let catalogStorageUnreadable = false;

function catalogMessage(id, message, error = false) {
  const node = document.getElementById(id);
  if (node) { node.textContent = message; node.classList.toggle("formError", error); }
}
function catalogCodeValid(code) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(code) && !["__proto__", "constructor", "prototype"].includes(code);
}
function catalogInteger(value, min = 0) {
  if (value === "" || !Number.isSafeInteger(Number(value)) || Number(value) < min) throw new Error(`Indique un nombre entier supérieur ou égal à ${min}.`);
  return Number(value);
}
function catalogClone(value) { return JSON.parse(JSON.stringify(value)); }
function getHistoricalProduct(code) {
  return getProduct(code) || catalogSettings.products[String(code)] || catalogBase?.products.find(p => p.code === String(code)) || null;
}
function catalogProductDeleted(code, name = "") {
  const original = code ? String(code) : catalogBase?.products.find(p => normalizeName(p.name) === normalizeName(name))?.code;
  return !!original && catalogSettings.deleted.includes(original);
}
// Références retirées de Commande uniquement ; le catalogue et les dotations restent disponibles.
const retiredOrderCodes = new Set([
  "208",
  "593",
  "2657",
  "2554",
  "554",
  "550",
  "4017",
  "3078",
  "3064",
  "142",
  "511",
  "1459",
  "4037",
  "1342",
  "1343",
  "2790",
  "3288",
  "3289",
  "2992",
  "3185",
  "3284",
  "1519",
  "556",
  "3066",
  "2646",
  "1765",
  "1768",
  "1775",
  "503",
  "2984",
  "3110",
  "3111",
  "1840",
  "1960",
  "2005",
  "2048",
  "2070",
  "1844",
  "2004",
  "2953",
  "2954",
  "2961"
]);
const retiredHospitalOrderCodes = new Set(["466", "2778", "3020", "3022", "3056", "3098", "3099", "4600", "4601", "391", "1527", "1564", "1589", "1642", "1680", "2339", "2505", "2978", "220", "1505", "1745", "1794", "2050", "2458", "222", "249", "252", "2645", "2985"]);
function orderReferenceRetired(code, site) {
  const value = String(code);
  return retiredOrderCodes.has(value) || (site === "hospital" && retiredHospitalOrderCodes.has(value));
}
const legacyOrderReferences = [
  {
    "code": "1459",
    "name": "ENSEMBLE LAVEMENT ENEMA"
  },
  {
    "code": "26010",
    "name": "BLOUSE DE VISITEUR ELASTIQUES BLANC"
  },
  {
    "code": "142",
    "name": "SPARADRAP NON TISSE"
  },
  {
    "code": "208",
    "name": "GANT LARGE LATEX NON POUDRES UU TAILLE 8/9"
  },
  {
    "code": "511",
    "name": "BRUMISATEUR EAU 400ML"
  },
  {
    "code": "550",
    "name": "BALAI COUR"
  },
  {
    "code": "554",
    "name": "BARQUETTE ALU 2000 cc"
  },
  {
    "code": "593",
    "name": "CHEMISE OUVERTE"
  },
  {
    "code": "1342",
    "name": "SAC DECHETS 110 L JAUNE"
  },
  {
    "code": "1343",
    "name": "SAC DECHETS 20 L JAUNE"
  },
  {
    "code": "2554",
    "name": "PINCE A ONGLES DE TYPE SECATEUR"
  },
  {
    "code": "2601",
    "name": "BLOUSE VISITEUR NON TISSE 110X130CM"
  },
  {
    "code": "2657",
    "name": "SURCHAUSSURE PE 40UBLEUE BASIC 41X45CM"
  },
  {
    "code": "2790",
    "name": "SAC DECHETS 50 L JAUNE"
  },
  {
    "code": "3064",
    "name": "DEBOUCHEUR ALCALIN"
  },
  {
    "code": "3078",
    "name": "RINCAGE LAVE VAISSELLE N BLEU 10L"
  },
  {
    "code": "3288",
    "name": "BARQUETTE ALU 500G"
  },
  {
    "code": "3289",
    "name": "BARQUETTE PLASTIQUE 500 cc"
  },
  {
    "code": "4017",
    "name": "FRANGE MICROFIBRES PR LAVAGE A PLAT"
  },
  {
    "code": "4037",
    "name": "REGLETTE SCRATCH POUR BALAYAGE HUMIDE"
  },
  {
    "code": "1459",
    "name": "ENSEMBLE LAVEMENT ENEMA CH24 1500ML"
  },
  {
    "code": "391",
    "name": "BISCUITS BOITE DE 500G TYPE BELIN"
  },
  {
    "code": "466",
    "name": "MUSCAT DE RIVESALTES"
  },
  {
    "code": "1519",
    "name": "CREME DE MASSAGE NEUTRE 5000ML"
  },
  {
    "code": "2005",
    "name": "MOELL FOURRE FRAISE"
  },
  {
    "code": "2778",
    "name": "PETILLANT CHARDONNAY DE PERRIERE 75CL"
  },
  {
    "code": "2992",
    "name": "ROULEAU CHAMOIS 1500 FEUILLES"
  },
  {
    "code": "3020",
    "name": "VIN ROUGE TABLE \"CUVEE DU PATRON\" 75cl"
  },
  {
    "code": "3022",
    "name": "VIN ROUGE SANS ALCOOL BONNE NOUVELLE"
  },
  {
    "code": "3056",
    "name": "CHAMPAGNE SANS ALCOOL (type champomy)"
  },
  {
    "code": "3098",
    "name": "VIN BLANC SANS ALCOOL BONNE NOUVELLE"
  },
  {
    "code": "3099",
    "name": "BIERE SS ALCOOL 25CL"
  },
  {
    "code": "4600",
    "name": "RICARD 1L"
  },
  {
    "code": "4601",
    "name": "PORTO SOUZA 75CL"
  },
  {
    "code": "556",
    "name": "CUVETTE RONDE 5L D.28"
  },
  {
    "code": "2646",
    "name": "CANULE DE GUEDEL STERILE POLYETHYLENE TAILLE 5/ TAILLE 3"
  },
  {
    "code": "3066",
    "name": "DETERGENT LIQUIDE VAISSELLE SUMA"
  },
  {
    "code": "3185",
    "name": "CHAMOISINE"
  },
  {
    "code": "3284",
    "name": "DRAP D'EXAMEN BLANC VALAROLL"
  },
  {
    "code": "503",
    "name": "LIMONADE BLANCHE VAL 25C"
  },
  {
    "code": "1765",
    "name": "VELOUTE HP HC CREME CHAMPIGNONS"
  },
  {
    "code": "1768",
    "name": "VELOUTE HP HC LEGUMES DU SOLEIL"
  },
  {
    "code": "1775",
    "name": "VELOUTE POTIRON"
  },
  {
    "code": "1840",
    "name": "CEREALNUT HP HC BISCUIT"
  },
  {
    "code": "1844",
    "name": "BONBONS HC PRALINE PROTEINE AU CHOCOLAT"
  },
  {
    "code": "1960",
    "name": "GALETTE SPECULOS"
  },
  {
    "code": "2004",
    "name": "MADELEINE LONGUES HP HC CHOCOLAT"
  },
  {
    "code": "2048",
    "name": "GATEAU FOURRE ABRICOT"
  },
  {
    "code": "2070",
    "name": "SPECULOOS X2"
  },
  {
    "code": "2953",
    "name": "DELI NUTRA CAKE CHOCOLAT"
  },
  {
    "code": "2954",
    "name": "DELI NUTRA CAKE FRAMBOISE"
  },
  {
    "code": "2961",
    "name": "PAIN BRIOCHE G-NUTRITION AVEC"
  },
  {
    "code": "2984",
    "name": "JUS DE CITRON PULCO"
  },
  {
    "code": "3110",
    "name": "CONFITURE FRAISE 30G X 120"
  },
  {
    "code": "3111",
    "name": "CONFITURE PRUNE 30G X 120"
  },
  {
    "code": "220",
    "name": "DELICAL CREME FLORIDINE PRALINE"
  },
  {
    "code": "222",
    "name": "EAU GEL SUCREE POT 125G GRENADINE HYDRA'FRUIT GRENADINE"
  },
  {
    "code": "249",
    "name": "EAU GELIFIEE INSTANT SACH 100G EPAIMIX ORANGE"
  },
  {
    "code": "252",
    "name": "EAU GELIFIEE INSTANT SACH 100G EPAIMIX FRAISE"
  },
  {
    "code": "1505",
    "name": "CLINUTREN FRUIT POMME BT 200ML"
  },
  {
    "code": "1527",
    "name": "FORTIMEL COMPACT PROTEIN BANANE"
  },
  {
    "code": "1564",
    "name": "DELICAL BOISSON CONCENTREE CAFE"
  },
  {
    "code": "1589",
    "name": "FORTIMEL COMPACT POTEIN FRAISE GIVREE"
  },
  {
    "code": "1642",
    "name": "FORTIMEL COMPACT SENSATION FRAISE GIVREE"
  },
  {
    "code": "1680",
    "name": "FORTIMEL JUCY POMME"
  },
  {
    "code": "1745",
    "name": "DELICAL RIZ AU LAIT VANILLE"
  },
  {
    "code": "1794",
    "name": "PROTIFRUIT GOURDE POMME"
  },
  {
    "code": "2050",
    "name": "DELICAL NUTRAPOTES POMME BANANE"
  },
  {
    "code": "2339",
    "name": "DELICAL BOISSON SANS SUCRE ORANGE"
  },
  {
    "code": "2458",
    "name": "DELICAL CREME FLORIDINE CAFE 125G"
  },
  {
    "code": "2505",
    "name": "FORTIMEL COMPACT PROTEIN FRAISE"
  },
  {
    "code": "2645",
    "name": "EAU GELIFIEE DESHYDRATEE PECHE ABRICOT"
  },
  {
    "code": "2978",
    "name": "FORTIMEL PROTEIN SENSATION 125ML NEUTRE"
  },
  {
    "code": "2985",
    "name": "CARTONS DASRI 50L"
  }
];
function retiredOrderCodeByName(name) {
  return legacyOrderReferences.find(p => (orderReferenceRetired(p.code, "hospital") || p.code === "2601") && normalizeName(p.name) === normalizeName(name))?.code || "";
}
function catalogOrderSites(code, settings = catalogSettings) {
  // Les cartons DASRI50L se commandent dans la palette EHPAD.
  if (String(code) === "2985") return ["ehpad"];
  if (Object.hasOwn(settings.orderSites, code)) return settings.orderSites[code];
  // Conserver le choix de l'ancienne blouse si la bonne référence n'a pas de choix propre.
  if (code === "26010") return settings.orderSites["2601"];
  return undefined;
}
function catalogOrderAllowed(code, site, settings = catalogSettings) {
  if (orderReferenceRetired(code, site) || String(code) === "2601") return false;
  // Absence de choix : conserver le placement existant. [] : aucune commande.
  const selectedSites = catalogOrderSites(String(code), settings);
  return selectedSites === undefined || selectedSites.includes(site);
}
function catalogProjection(settings) {
  const byCode = new Map(catalogBase.products.map(p => [p.code, p]));
  for (const p of Object.values(settings.products)) byCode.set(p.code, p);
  const deleted = new Set(settings.deleted);
  const activeProducts = [...byCode.values()].filter(p => !deleted.has(p.code));
  const maps = catalogClone(catalogBase.dotations);
  const orders = catalogClone(catalogBase.orders);
  for (const [sid, changes] of Object.entries(settings.dotations)) {
    maps[sid] = maps[sid] || {};
    orders[sid] = orders[sid] || [];
    for (const [code, qty] of Object.entries(changes)) {
      if (qty === null) delete maps[sid][code];
      else {
        maps[sid][code] = qty;
        if (!orders[sid].includes(code)) orders[sid].push(code);
      }
    }
  }
  for (const sid of Object.keys(maps)) {
    for (const code of deleted) delete maps[sid][code];
    orders[sid] = (orders[sid] || []).filter(code => Object.hasOwn(maps[sid], code));
  }
  // Tous les articles du catalogue commun peuvent être commandés à l'hôpital.
  // Les nouveaux articles peuvent être limités à un établissement lors de l'ajout.
  const allowed = p => catalogOrderAllowed(p.code, "hospital", settings);
  const hospitalItems = catalogBase.hospitalItems.filter(p => !deleted.has(p.code) && allowed(p));
  const seen = new Set(hospitalItems.map(p => p.code));
  for (const p of activeProducts) if (!seen.has(p.code) && allowed(p)) {
    hospitalItems.push({ code: p.code, name: p.name }); seen.add(p.code);
  }
  return { products: activeProducts, dotations: maps, orders, hospitalItems };
}
function applyCatalogSettings() {
  const projection = catalogProjection(catalogSettings);
  products = projection.products;
  dotations = projection.dotations;
  dotationsOrder = projection.orders;
  hospitalOrderItems = projection.hospitalItems;
}
// Appliquer une seule fois le relevé du 4e, puis laisser les futurs ajouts libres.
const K_MPRN_REFERENCE_UPDATE = "ps_mprn_releve_20260924_v1";

function applyMprnReferenceUpdate() {
  if (catalogStorageUnreadable) return false;

  const sid = "MPRN_4E_1800";
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const failure = "La dotation du 4e n’a pas pu être mise à jour sur cet appareil. Vérifie l’espace disponible puis recharge la page.";
  let marker;
  try { marker = localStorage.getItem(K_MPRN_REFERENCE_UPDATE); }
  catch (_) { throw new Error(failure); }
  if (marker !== null) return false;
  if (!record(catalogBase?.dotations?.[sid])) throw new Error("La nouvelle dotation du 4e est introuvable. Recharge la page avant de poursuivre.");

  const nextSettings = catalogClone(catalogSettings);
  const nextEntry = catalogClone(entry), nextPrepared = catalogClone(prepared), nextDone = catalogClone(done);
  delete nextSettings.dotations[sid];
  const retained = catalogBase.dotations[sid];
  for (const state of [nextEntry, nextPrepared, nextDone]) {
    if (!record(state[sid])) continue;
    for (const code of Object.keys(state[sid])) if (!Object.hasOwn(retained, code)) delete state[sid][code];
  }

  const states = [
    [K_CATALOG_SETTINGS, catalogSettings, nextSettings], [K_ENTRY, entry, nextEntry],
    [K_PREP, prepared, nextPrepared], [K_DONE, done, nextDone]
  ];
  let originals;
  try {
    originals = states.map(([key]) => [key, localStorage.getItem(key)]);
    // Ne pas remplacer une sauvegarde illisible par les valeurs de repli de load().
    for (const [, raw] of originals) if (raw !== null && !record(JSON.parse(raw))) throw new Error("Format invalide");
  } catch (_) {
    throw new Error("La mise à jour du 4e est interrompue : des données enregistrées sont illisibles. Les données d’origine sont conservées.");
  }

  try {
    localStorage.setItem(K_MPRN_REFERENCE_UPDATE, JSON.stringify({
      version: 1, createdAt: new Date().toISOString(), originalValues: Object.fromEntries(originals)
    }));
    for (const [key, before, after] of states) {
      if (JSON.stringify(before) !== JSON.stringify(after)) localStorage.setItem(key, JSON.stringify(after));
    }
  } catch (_) {
    for (const [key, raw] of [...originals, [K_MPRN_REFERENCE_UPDATE, marker]]) {
      try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }
      catch (_) { /* La sauvegarde contient les valeurs précédentes si le stockage reste indisponible. */ }
    }
    throw new Error(failure);
  }
  catalogSettings = nextSettings;
  entry = nextEntry; prepared = nextPrepared; done = nextDone;
  return true;
}


// Appliquer une seule fois le relevé du 2e, puis laisser les futurs ajouts libres.
const K_SSMC_REFERENCE_UPDATE = "ps_ssmc_releve_20260924_v1";

function applySsmcReferenceUpdate() {
  if (catalogStorageUnreadable) return false;

  const sid = "SSMC_2E_1700";
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const failure = "La dotation du 2e n’a pas pu être mise à jour sur cet appareil. Vérifie l’espace disponible puis recharge la page.";
  let marker;
  try { marker = localStorage.getItem(K_SSMC_REFERENCE_UPDATE); }
  catch (_) { throw new Error(failure); }
  if (marker !== null) return false;
  if (!record(catalogBase?.dotations?.[sid])) throw new Error("La nouvelle dotation du 2e est introuvable. Recharge la page avant de poursuivre.");

  const nextSettings = catalogClone(catalogSettings);
  const nextEntry = catalogClone(entry), nextPrepared = catalogClone(prepared), nextDone = catalogClone(done);
  delete nextSettings.dotations[sid];
  const retained = catalogBase.dotations[sid];
  for (const state of [nextEntry, nextPrepared, nextDone]) {
    if (!record(state[sid])) continue;
    for (const code of Object.keys(state[sid])) if (!Object.hasOwn(retained, code)) delete state[sid][code];
  }

  const states = [
    [K_CATALOG_SETTINGS, catalogSettings, nextSettings], [K_ENTRY, entry, nextEntry],
    [K_PREP, prepared, nextPrepared], [K_DONE, done, nextDone]
  ];
  let originals;
  try {
    originals = states.map(([key]) => [key, localStorage.getItem(key)]);
    // Ne pas remplacer une sauvegarde illisible par les valeurs de repli de load().
    for (const [, raw] of originals) if (raw !== null && !record(JSON.parse(raw))) throw new Error("Format invalide");
  } catch (_) {
    throw new Error("La mise à jour du 2e est interrompue : des données enregistrées sont illisibles. Les données d’origine sont conservées.");
  }

  try {
    localStorage.setItem(K_SSMC_REFERENCE_UPDATE, JSON.stringify({
      version: 1, createdAt: new Date().toISOString(), originalValues: Object.fromEntries(originals)
    }));
    for (const [key, before, after] of states) {
      if (JSON.stringify(before) !== JSON.stringify(after)) localStorage.setItem(key, JSON.stringify(after));
    }
  } catch (_) {
    for (const [key, raw] of [...originals, [K_SSMC_REFERENCE_UPDATE, marker]]) {
      try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }
      catch (_) { /* La sauvegarde contient les valeurs précédentes si le stockage reste indisponible. */ }
    }
    throw new Error(failure);
  }
  catalogSettings = nextSettings;
  entry = nextEntry; prepared = nextPrepared; done = nextDone;
  return true;
}


// Appliquer les ajustements demandés une fois, sans réinitialiser les saisies.
const K_DOTATION_ADJUSTMENTS = "ps_dotation_adjustments_20260925_v1";

function applyDotationAdjustments() {
  if (catalogStorageUnreadable) return false;
  const failure = "Les ajustements des dotations n’ont pas pu être enregistrés. Vérifie l’espace disponible puis recharge la page.";
  let marker, original, backup;
  try {
    marker = localStorage.getItem(K_DOTATION_ADJUSTMENTS);
    if (marker !== null) {
      backup = JSON.parse(marker);
      if (backup?.applied === true) return false;
    }
    original = localStorage.getItem(K_CATALOG_SETTINGS);
    if (original !== null) {
      const parsed = JSON.parse(original);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Format invalide");
    }
  } catch (_) { throw new Error(failure); }

  const next = catalogClone(catalogSettings);
  for (const changes of Object.values(next.dotations)) {
    // Un retrait manuel reste un retrait ; seules les dotations présentes changent.
    if (Object.hasOwn(changes, "718") && changes["718"] !== null) changes["718"] = 1;
  }
  const thirdFloor = next.dotations["SSR_3E_1750"];
  if (thirdFloor) {
    delete thirdFloor["3178"];
    delete thirdFloor["4003"];
  }

  try {
    backup = backup || {
      version: 1, createdAt: new Date().toISOString(), applied: false,
      originalValues: { [K_CATALOG_SETTINGS]: original }
    };
    localStorage.setItem(K_DOTATION_ADJUSTMENTS, JSON.stringify(backup));
    if (JSON.stringify(next) !== JSON.stringify(catalogSettings)) {
      localStorage.setItem(K_CATALOG_SETTINGS, JSON.stringify(next));
    }
    // Un arrêt avant cette écriture laisse une mise à jour à reprendre au chargement.
    localStorage.setItem(K_DOTATION_ADJUSTMENTS, JSON.stringify({ ...backup, applied: true }));
  } catch (_) {
    for (const [key, raw] of [[K_CATALOG_SETTINGS, original], [K_DOTATION_ADJUSTMENTS, marker]]) {
      try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }
      catch (_) { /* Garder l’erreur initiale si le stockage reste indisponible. */ }
    }
    throw new Error(failure);
  }
  catalogSettings = next;
  return true;
}


// Mise à jour unique des fournitures EHPAD, avec reprise sans reconvertir les stocks.
const K_EHPAD_SUPPLIES_UPDATE = "ps_ehpad_supplies_20260925_v1";

function applyEhpadSuppliesUpdate() {
  if (catalogStorageUnreadable) throw new Error("La mise à jour EHPAD est interrompue : le catalogue enregistré est illisible. Récupère sa sauvegarde avant de poursuivre.");
  const failure = "La mise à jour EHPAD n’a pas pu être enregistrée. Les données de reprise sont conservées ; recharge la page lorsque l’espace de stockage est disponible.";
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const keys = [K_CATALOG_SETTINGS, K_ENTRY, K_PREP, K_DONE];
  const current = [catalogSettings, entry, prepared, done];
  const groceries = ["EPICERIE_RESTAURANT", "EPICERIE_CHENES", "EPICERIE_PRUNIERS", "EPICERIE_MAGNOLIAS"];
  const reserves = ["RESERVE_CHENES", "RESERVE_PRUNIERS", "RESERVE_CERISIERS", "RESERVE_MAGNOLIAS"];
  const juiceCodes = ["449", "3102", "3103", "3104", "3114", "3097"];
  const waterCodes = ["2578", "2912", "4024"];
  const reserveRemovals = ["556", "572", "2272", "1769", "1770"];
  let originalMarker, beforeValues, transaction, future;

  const integer = value => {
    if (value === "" || value == null) return 0;
    if ((typeof value !== "number" && typeof value !== "string") || !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
      throw new Error("Quantité invalide");
    }
    return Number(value);
  };
  const parseRecord = raw => {
    const value = JSON.parse(raw);
    if (!record(value)) throw new Error("Format invalide");
    return value;
  };

  try {
    originalMarker = localStorage.getItem(K_EHPAD_SUPPLIES_UPDATE);
    if (originalMarker !== null) {
      transaction = parseRecord(originalMarker);
      if (transaction.applied === true) return false;
      if (transaction.version !== 1 || transaction.applied !== false || !record(transaction.originalValues) || !record(transaction.futureValues)) {
        throw new Error("Sauvegarde de reprise invalide");
      }
      for (const key of keys) {
        if (!Object.hasOwn(transaction.originalValues, key) || !Object.hasOwn(transaction.futureValues, key)) throw new Error("Sauvegarde incomplète");
        const original = transaction.originalValues[key];
        if (original !== null && typeof original !== "string") throw new Error("Sauvegarde invalide");
        if (original !== null) parseRecord(original);
        if (typeof transaction.futureValues[key] !== "string") throw new Error("Valeur de reprise invalide");
        parseRecord(transaction.futureValues[key]);
      }
    }

    beforeValues = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
    for (const raw of Object.values(beforeValues)) if (raw !== null) parseRecord(raw);

    if (!transaction) {
      if (!record(catalogBase?.dotations) || !record(catalogSettings.products) || !record(catalogSettings.dotations)) throw new Error("Catalogue indisponible");
      for (const sid of [...groceries, ...reserves]) if (!record(catalogBase.dotations[sid])) throw new Error("Dotation EHPAD indisponible");
      const cakeProduct = catalogBase.products?.find(product => String(product.code) === "2020");
      if (cakeProduct?.unitsPerPack !== 48 || cakeProduct?.unitsPerCarton !== 0) throw new Error("Nouveau conditionnement indisponible");
      if (![96, 144].includes(catalogBase.dotations.EPICERIE_CHENES["2020"])) throw new Error("Nouvelle dotation des gâteaux indisponible");
      for (const sid of groceries) {
        if (waterCodes.some(code => Object.hasOwn(catalogBase.dotations[sid], code))) throw new Error("Anciennes dotations encore chargées");
      }
      for (const sid of reserves) {
        if (reserveRemovals.some(code => Object.hasOwn(catalogBase.dotations[sid], code))) throw new Error("Anciennes dotations encore chargées");
        if (sid !== "RESERVE_CERISIERS" && catalogBase.dotations[sid]["2985"] !== 10) throw new Error("Nouvelle dotation DASRI indisponible");
      }
      if (current.some(value => !record(value))) throw new Error("Saisies invalides");

      const next = current.map(value => catalogClone(value));
      const [settings, nextEntry, nextPrepared, nextDone] = next;
      const changesFor = sid => {
        const changes = settings.dotations[sid];
        if (changes !== undefined && !record(changes)) throw new Error("Dotation personnalisée invalide");
        return changes;
      };
      const clearRemoved = (sid, codes) => {
        const changes = changesFor(sid);
        for (const code of codes) {
          if (changes && Object.hasOwn(changes, code)) changes[code] = null;
          for (const state of [nextEntry, nextPrepared, nextDone]) {
            if (state[sid] !== undefined && !record(state[sid])) throw new Error("Saisie de service invalide");
            if (state[sid]) delete state[sid][code];
          }
        }
      };
      const oldPackSize = (code, fallback) => {
        const product = catalogSettings.products[code];
        return product && Object.hasOwn(product, "unitsPerPack") ? integer(product.unitsPerPack) : fallback;
      };
      const convertStock = (sid, code, packSize, asPacks) => {
        const service = nextEntry[sid];
        if (service === undefined) return;
        if (!record(service)) throw new Error("Saisie de service invalide");
        const value = service[code];
        if (value === undefined) return;
        if (!record(value)) throw new Error("Saisie produit invalide");
        const empty = item => item === "" || item == null;
        if (empty(value.p) && empty(value.u)) return;
        const units = integer(value.p) * packSize + integer(value.u);
        if (!Number.isSafeInteger(units)) throw new Error("Stock trop élevé");
        service[code] = {
          ...value,
          p: asPacks ? String(Math.floor(units / 48)) : "",
          u: asPacks ? (units % 48 === 0 ? "" : String(units % 48)) : String(units)
        };
      };
      const roundCakeTarget = value => {
        const qty = integer(value);
        const lower = Math.floor(qty / 48) * 48;
        const rest = qty - lower;
        if (rest === 0) return qty;
        if (rest === 24) {
          const chenesTarget = catalogBase.dotations.EPICERIE_CHENES["2020"];
          if (chenesTarget !== 96 && chenesTarget !== 144) throw new Error("Choix de dotation des gâteaux introuvable");
          return chenesTarget === 96 ? lower : lower + 48;
        }
        return rest < 24 ? lower : lower + 48;
      };

      for (const sid of groceries) {
        clearRemoved(sid, waterCodes);
        const changes = changesFor(sid);
        for (const code of juiceCodes) {
          if (changes && Object.hasOwn(changes, code) && changes[code] !== null) {
            const qty = integer(changes[code]);
            changes[code] = Math.abs(qty - 6) <= Math.abs(qty - 12) ? 6 : 12;
          }
          convertStock(sid, code, oldPackSize(code, code === "3097" ? 0 : 6), false);
        }
        if (changes && Object.hasOwn(changes, "2020") && changes["2020"] !== null) {
          changes["2020"] = roundCakeTarget(changes["2020"]);
        }
        convertStock(sid, "2020", oldPackSize("2020", 0), true);
      }
      for (const sid of reserves) {
        clearRemoved(sid, reserveRemovals);
        if (sid !== "RESERVE_CERISIERS") {
          const changes = changesFor(sid);
          if (changes) delete changes["2985"];
        }
      }
      if (Object.hasOwn(settings.products, "2020")) {
        if (!record(settings.products["2020"])) throw new Error("Produit personnalisé invalide");
        settings.products["2020"] = { ...settings.products["2020"], category: "Pack", unitsPerPack: 48, unitsPerCarton: 0 };
      }

      const futureValues = {};
      keys.forEach((key, index) => {
        const raw = beforeValues[key];
        futureValues[key] = raw !== null && JSON.stringify(current[index]) === JSON.stringify(next[index]) ? raw : JSON.stringify(next[index]);
      });
      transaction = {
        version: 1, createdAt: new Date().toISOString(), applied: false,
        originalValues: beforeValues, futureValues
      };
    }
    future = keys.map(key => parseRecord(transaction.futureValues[key]));
  } catch (_) {
    throw new Error("La mise à jour EHPAD est interrompue : des données ou leur sauvegarde sont illisibles. Les données enregistrées sont conservées.");
  }

  try {
    localStorage.setItem(K_EHPAD_SUPPLIES_UPDATE, JSON.stringify(transaction));
    for (const key of keys) {
      if (beforeValues[key] !== transaction.futureValues[key]) localStorage.setItem(key, transaction.futureValues[key]);
    }
    localStorage.setItem(K_EHPAD_SUPPLIES_UPDATE, JSON.stringify({ ...transaction, applied: true }));
  } catch (_) {
    let restored = true;
    for (const key of keys) {
      try {
        if (beforeValues[key] === null) localStorage.removeItem(key);
        else localStorage.setItem(key, beforeValues[key]);
      } catch (_) { restored = false; }
    }
    if (restored) {
      try {
        if (originalMarker === null) localStorage.removeItem(K_EHPAD_SUPPLIES_UPDATE);
        else localStorage.setItem(K_EHPAD_SUPPLIES_UPDATE, originalMarker);
      } catch (_) { /* Le marqueur en attente permet de reprendre au prochain chargement. */ }
    }
    // Si un retour arrière échoue, garder le journal : ses valeurs futures sont déjà converties.
    throw new Error(failure);
  }
  [catalogSettings, entry, prepared, done] = future;
  return true;
}


// Mise à jour unique des gâteaux EHPAD ; le journal rejoue des valeurs déjà converties.
const K_EHPAD_CAKES_UPDATE = "ps_ehpad_cakes_20260925_v1";

function applyEhpadCakesUpdate() {
  if (catalogStorageUnreadable) throw new Error("La mise à jour des gâteaux EHPAD est interrompue : le catalogue enregistré est illisible. Récupère sa sauvegarde avant de poursuivre.");
  const failure = "La mise à jour des gâteaux EHPAD n’a pas pu être enregistrée. Les données de reprise sont conservées ; recharge la page lorsque l’espace de stockage est disponible.";
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const keys = [K_CATALOG_SETTINGS, K_ENTRY, K_PREP, K_DONE];
  const current = [catalogSettings, entry, prepared, done];
  const groceries = ["EPICERIE_RESTAURANT", "EPICERIE_CHENES", "EPICERIE_PRUNIERS", "EPICERIE_MAGNOLIAS"];
  let originalMarker, beforeValues, transaction, future;

  const integer = value => {
    if (value === "" || value == null) return 0;
    if ((typeof value !== "number" && typeof value !== "string") || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error("Quantité invalide");
    return Number(value);
  };
  const parseRecord = raw => {
    const value = JSON.parse(raw);
    if (!record(value)) throw new Error("Format invalide");
    return value;
  };

  try {
    originalMarker = localStorage.getItem(K_EHPAD_CAKES_UPDATE);
    if (originalMarker !== null) {
      transaction = parseRecord(originalMarker);
      if (transaction.applied === true) return false;
      if (transaction.version !== 1 || transaction.applied !== false || !record(transaction.originalValues) || !record(transaction.futureValues)) throw new Error("Sauvegarde de reprise invalide");
      for (const key of keys) {
        if (!Object.hasOwn(transaction.originalValues, key) || !Object.hasOwn(transaction.futureValues, key)) throw new Error("Sauvegarde incomplète");
        const original = transaction.originalValues[key];
        if (original !== null && typeof original !== "string") throw new Error("Sauvegarde invalide");
        if (original !== null) parseRecord(original);
        if (typeof transaction.futureValues[key] !== "string") throw new Error("Valeur de reprise invalide");
        parseRecord(transaction.futureValues[key]);
      }
    }
    beforeValues = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
    for (const raw of Object.values(beforeValues)) if (raw !== null) parseRecord(raw);

    if (!transaction) {
      if (!record(catalogBase?.dotations) || !record(catalogSettings.products) || !record(catalogSettings.dotations)) throw new Error("Catalogue indisponible");
      for (const sid of groceries) {
        const map = catalogBase.dotations[sid];
        if (!record(map) || Object.hasOwn(map, "2005") || (Object.hasOwn(map, "2020") && integer(map["2020"]) > 96)) throw new Error("Anciennes dotations encore chargées");
      }
      const strawberryProduct = catalogBase.products?.find(product => String(product.code) === "2006");
      if (strawberryProduct?.unitsPerPack !== 120 || strawberryProduct?.unitsPerCarton !== 120 || catalogBase.dotations.EPICERIE_CHENES["2006"] !== 120) throw new Error("Nouveau conditionnement indisponible");
      if (current.some(value => !record(value))) throw new Error("Saisies invalides");

      const next = current.map(value => catalogClone(value));
      const [settings, nextEntry, nextPrepared, nextDone] = next;
      const oldPackSize = code => {
        const product = catalogSettings.products[code];
        return product && Object.hasOwn(product, "unitsPerPack") ? integer(product.unitsPerPack) : 0;
      };
      const packs2005 = oldPackSize("2005"), packs2006 = oldPackSize("2006");
      const empty = value => value === "" || value == null;
      const stockPresent = value => !!value && !(empty(value.p) && empty(value.u));
      const stockUnits = (value, packSize) => stockPresent(value) ? integer(value.p) * packSize + integer(value.u) : 0;

      for (const sid of groceries) {
        let changes = settings.dotations[sid];
        if (changes !== undefined && !record(changes)) throw new Error("Dotation personnalisée invalide");
        if (changes && Object.hasOwn(changes, "2020") && changes["2020"] !== null) changes["2020"] = Math.min(integer(changes["2020"]), 96);

        const hasOld = !!changes && Object.hasOwn(changes, "2005");
        const hasNew = !!changes && Object.hasOwn(changes, "2006");
        const oldTarget = hasOld ? (changes["2005"] === null ? null : integer(changes["2005"])) : (sid === "EPICERIE_CHENES" ? 120 : null);
        if (hasOld || hasNew) {
          if (hasNew && changes["2006"] === null) {
            // Le remplacement réactive la nouvelle référence si l’ancienne est encore dotée.
            if (oldTarget !== null) changes["2006"] = oldTarget;
          } else if (hasNew) {
            const newTarget = integer(changes["2006"]);
            changes["2006"] = oldTarget === null ? newTarget : Math.max(oldTarget, newTarget);
          } else if (hasOld) {
            changes["2006"] = oldTarget;
          }
          delete changes["2005"];
        }

        for (const state of [nextEntry, nextPrepared, nextDone]) {
          if (state[sid] !== undefined && !record(state[sid])) throw new Error("Saisie de service invalide");
        }
        const oldStock = nextEntry[sid]?.["2005"];
        const newStock = nextEntry[sid]?.["2006"];
        if ((oldStock !== undefined && !record(oldStock)) || (newStock !== undefined && !record(newStock))) throw new Error("Saisie produit invalide");
        const contributes = (code, stock) => stockPresent(stock) || Object.hasOwn(nextPrepared[sid] || {}, code) || Object.hasOwn(nextDone[sid] || {}, code);
        const contributors = [
          { present: contributes("2005", oldStock), done: nextDone[sid]?.["2005"] === true },
          { present: contributes("2006", newStock), done: nextDone[sid]?.["2006"] === true }
        ].filter(item => item.present);

        if (oldStock !== undefined || newStock !== undefined) {
          nextEntry[sid] = nextEntry[sid] || {};
          const combined = { ...(oldStock || {}), ...(newStock || {}) };
          if (stockPresent(oldStock) || stockPresent(newStock)) {
            const units = stockUnits(oldStock, packs2005) + stockUnits(newStock, packs2006);
            if (!Number.isSafeInteger(units)) throw new Error("Stock trop élevé");
            combined.p = String(Math.floor(units / 120));
            combined.u = units % 120 === 0 ? "" : String(units % 120);
          }
          nextEntry[sid]["2006"] = combined;
          delete nextEntry[sid]["2005"];
        }
        if (Object.hasOwn(nextPrepared[sid] || {}, "2005") || Object.hasOwn(nextPrepared[sid] || {}, "2006")) {
          const quantity = integer(nextPrepared[sid]?.["2005"]) + integer(nextPrepared[sid]?.["2006"]);
          if (!Number.isSafeInteger(quantity)) throw new Error("Quantité préparée trop élevée");
          nextPrepared[sid] = nextPrepared[sid] || {};
          nextPrepared[sid]["2006"] = quantity;
          delete nextPrepared[sid]["2005"];
        }
        if (contributors.length || nextDone[sid]) {
          nextDone[sid] = nextDone[sid] || {};
          if (contributors.length && contributors.every(item => item.done)) nextDone[sid]["2006"] = true;
          else delete nextDone[sid]["2006"];
          delete nextDone[sid]["2005"];
        }
      }

      if (Object.hasOwn(settings.products, "2006")) {
        if (!record(settings.products["2006"])) throw new Error("Produit personnalisé invalide");
        settings.products["2006"] = { ...settings.products["2006"], category: "Cartons", unitsPerCarton: 120, unitsPerPack: 120 };
      }
      const futureValues = {};
      keys.forEach((key, index) => {
        const raw = beforeValues[key];
        futureValues[key] = raw !== null && JSON.stringify(current[index]) === JSON.stringify(next[index]) ? raw : JSON.stringify(next[index]);
      });
      transaction = { version: 1, createdAt: new Date().toISOString(), applied: false, originalValues: beforeValues, futureValues };
    }
    future = keys.map(key => parseRecord(transaction.futureValues[key]));
  } catch (_) {
    throw new Error("La mise à jour des gâteaux EHPAD est interrompue : des données ou leur sauvegarde sont illisibles. Les données enregistrées sont conservées.");
  }

  try {
    localStorage.setItem(K_EHPAD_CAKES_UPDATE, JSON.stringify(transaction));
    for (const key of keys) if (beforeValues[key] !== transaction.futureValues[key]) localStorage.setItem(key, transaction.futureValues[key]);
    localStorage.setItem(K_EHPAD_CAKES_UPDATE, JSON.stringify({ ...transaction, applied: true }));
  } catch (_) {
    let restored = true;
    for (const key of keys) {
      try {
        if (beforeValues[key] === null) localStorage.removeItem(key);
        else localStorage.setItem(key, beforeValues[key]);
      } catch (_) { restored = false; }
    }
    if (restored) {
      try {
        if (originalMarker === null) localStorage.removeItem(K_EHPAD_CAKES_UPDATE);
        else localStorage.setItem(K_EHPAD_CAKES_UPDATE, originalMarker);
      } catch (_) { /* Un journal en attente sera repris au prochain chargement. */ }
    }
    throw new Error(failure);
  }
  [catalogSettings, entry, prepared, done] = future;
  return true;
}


// Corriger les sélections de Commande sans modifier les saisies des réserves.
const K_ORDER_REFERENCES_BACKUP = "ps_order_references_20260925_v5";
function applyOrderReferenceUpdate() {
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const failure = "La mise à jour des commandes n’a pas pu être enregistrée. Les sélections sont conservées. Recharge la page pour réessayer.";
  let raw, backupRaw, next;
  try {
    raw = localStorage.getItem(K_ORDER);
    if (raw === null) return false;
    next = JSON.parse(raw);
    if (!record(next)) throw new Error("Commandes invalides");
    for (const site of ["hospital", "ehpad"]) {
      if (Object.hasOwn(next, site) && !record(next[site])) throw new Error("Commande invalide");
    }
    backupRaw = localStorage.getItem(K_ORDER_REFERENCES_BACKUP);
  } catch (_) { throw new Error(failure); }
  const references = [...legacyOrderReferences, ...catalogBase.products, ...catalogBase.hospitalItems, ...Object.values(catalogSettings.products)];
  const aliases = new Map(references
    .filter(p => orderReferenceRetired(p.code, "hospital") || p.code === "2601" || p.code === "26010")
    .map(p => [normalizeName(p.name), p.code]));
  let changed = false;
  for (const site of ["hospital", "ehpad"]) {
    const map = next[site];
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const resolvedReference = pendingHospitalOrderItems.find(item => item.code && item.key === key);
      if (resolvedReference) {
        const legacy = map[key], current = map[resolvedReference.code];
        if (!record(legacy) || (current !== undefined && !record(current))) throw new Error(failure);
        map[resolvedReference.code] = current === undefined ? legacy : { ...legacy, ...current, c: !!legacy.c || !!current.c };
        delete map[key];
        changed = true;
        continue;
      }
      const code = orderReferenceRetired(key, "hospital") || key === "2601" ? key : aliases.get(normalizeName(key));
      if (!code || (!["2601", "26010"].includes(code) && !orderReferenceRetired(code, site))) continue;
      if (code === "2601" || code === "26010") {
        const legacy = map[key], current = map["26010"];
        if (!record(legacy) || (current !== undefined && !record(current))) throw new Error(failure);
        map["26010"] = current === undefined ? legacy : { ...legacy, ...current, c: !!legacy.c || !!current.c };
      }
      delete map[key];
      changed = true;
    }
  }
  if (!changed) return false;
  try {
    if (backupRaw === null) localStorage.setItem(K_ORDER_REFERENCES_BACKUP, JSON.stringify({
      version: 1, createdAt: new Date().toISOString(), originalValues: { [K_ORDER]: raw }
    }));
    save(K_ORDER, next);
  } catch (_) {
    for (const [key, value] of [[K_ORDER, raw], [K_ORDER_REFERENCES_BACKUP, backupRaw]]) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch (_) { /* Conserver les valeurs en mémoire si le stockage reste indisponible. */ }
    }
    throw new Error(failure);
  }
  orderState = next;
  return true;
}

function captureCatalogBase() {
  catalogBase = { products: catalogClone(products), dotations: catalogClone(dotations), orders: catalogClone(dotationsOrder), hospitalItems: catalogClone(hospitalOrderItems) };
  applyMprnReferenceUpdate();
  applySsmcReferenceUpdate();
  applyDotationAdjustments();
  applyEhpadSuppliesUpdate();
  applyEhpadCakesUpdate();
  applyOrderReferenceUpdate();
  applyCatalogSettings();
  catalogReady = true;
}
function commitCatalogSettings(next, restoring = false) {
  if (!catalogReady) throw new Error("Attends la fin du chargement du catalogue.");
  if (catalogStorageUnreadable && !restoring) throw new Error("Les données enregistrées sont illisibles. Télécharge une copie de secours avant de reprendre une sauvegarde valide.");
  for (const sid of ["EPICERIE_RESTAURANT", "EPICERIE_CHENES", "EPICERIE_PRUNIERS", "EPICERIE_MAGNOLIAS"]) {
    if (next.dotations[sid]?.["2020"] > 96) throw new Error("La dotation des gâteaux nature est limitée à 96 unités (2 packs).");
  }
  const future = catalogProjection(next);
  const nextEntry = catalogClone(entry), nextPrepared = catalogClone(prepared), nextDone = catalogClone(done), nextOrder = catalogClone(orderState);
  for (const [sid, map] of Object.entries(dotations)) {
    for (const code of Object.keys(map)) if (!Object.hasOwn(future.dotations[sid] || {}, code)) {
      if (nextEntry[sid]) delete nextEntry[sid][code];
      if (nextPrepared[sid]) delete nextPrepared[sid][code];
      if (nextDone[sid]) delete nextDone[sid][code];
    }
  }
  for (const p of products) if (!future.products.some(item => item.code === p.code)) {
    for (const sid of Object.keys(nextEntry)) delete nextEntry[sid][p.code];
    for (const sid of Object.keys(nextPrepared)) delete nextPrepared[sid][p.code];
    for (const sid of Object.keys(nextDone)) delete nextDone[sid][p.code];
    for (const site of Object.keys(nextOrder)) {
      delete nextOrder[site][p.code]; delete nextOrder[site][p.name];
      for (const reference of pendingHospitalOrderItems) {
        if (reference.code ? reference.code === p.code : normalizeName(reference.name) === normalizeName(p.name)) delete nextOrder[site][reference.key];
      }
    }
  }
  const changes = [[K_CATALOG_SETTINGS, next], [K_ENTRY, nextEntry], [K_PREP, nextPrepared], [K_DONE, nextDone], [K_ORDER, nextOrder]];
  const previous = changes.map(([key]) => [key, localStorage.getItem(key)]);
  try { for (const [key, value] of changes) localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) {
    for (const [key, value] of previous) {
      try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (_) { /* conserver l'erreur initiale */ }
    }
    throw new Error("Enregistrement impossible. La modification n’a pas été appliquée. Vérifie l’espace disponible sur cet appareil.");
  }
  catalogSettings = next;
  catalogStorageUnreadable = false;
  entry = nextEntry; prepared = nextPrepared; done = nextDone; orderState = nextOrder;
  applyCatalogSettings();
  renderProducts(); renderDotations(); renderServices(); renderEntry(); renderPrep(); renderOrder();
  if (productsLoadStatus) productsLoadStatus.textContent = "";
}
function renderCatalogManagement() {
  const list = document.getElementById("catalogList");
  if (!list) return;
  const query = normalizeName(document.getElementById("catalogSearch")?.value || "");
  const filtered = products.filter(p => normalizeName(`${p.code} ${p.name}`).includes(query)).sort((a,b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  document.getElementById("productsCount").textContent = `${filtered.length} produit(s) affiché(s) sur ${products.length}`;
  list.innerHTML = filtered.length ? filtered.map(p => `<article class="catalogItem">
    <div><strong>${escapeHtml(p.name)}</strong><div class="muted">Code ${escapeHtml(p.code)} · ${escapeHtml(catLabel(p.category))}</div>
    <div class="muted">${p.unitsPerPack ? `${p.unitsPerPack} unités / paquet` : "À l’unité"}${p.unitsPerCarton ? ` · ${p.unitsPerCarton} unités / carton` : ""}</div></div>
    <button type="button" class="catalogDelete" data-delete-product="${escapeHtml(p.code)}" aria-label="Supprimer ${escapeHtml(p.name)} (code ${escapeHtml(p.code)})">Supprimer</button>
  </article>`).join("") : '<p class="muted">Aucun produit correspondant.</p>';
}
function renderDotationPicker() {
  const select = document.getElementById("d_product");
  if (!select) return;
  const selected = select.value, sid = d_service?.value;
  const query = normalizeName(document.getElementById("d_product_search")?.value || "");
  const available = products.filter(p => !Object.hasOwn(dotations[sid] || {}, p.code) && normalizeName(`${p.code} ${p.name}`).includes(query)).sort((a,b) => a.code.localeCompare(b.code,"fr",{numeric:true}));
  select.innerHTML = '<option value="">Choisir un produit…</option>' + available.map(p => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</option>`).join("");
  if (available.some(p => p.code === selected)) select.value = selected;
  document.getElementById("d_product_count").textContent = `${available.length} produit(s) disponible(s). Les produits déjà présents dans cette réserve sont exclus.`;
  document.querySelector('#dotationAddForm button[type="submit"]').disabled = !catalogReady || !sid;
}
function validateCatalogSettings(input) {
  const record = x => x && typeof x === "object" && !Array.isArray(x);
  if (!record(input) || input.version !== 1 || !record(input.products) || !Array.isArray(input.deleted) || !record(input.dotations) || !record(input.orderSites)) throw new Error("Ce fichier n’est pas une sauvegarde du catalogue et des dotations.");
  const valid = { version: 1, products: {}, deleted: [], dotations: {}, orderSites: {} };
  for (const [code, p] of Object.entries(input.products)) {
    if (!catalogCodeValid(code) || !record(p) || p.code !== code || typeof p.name !== "string" || !p.name.trim() || p.name.length > 200 || !["Petit","Pack","Cartons"].includes(p.category)) throw new Error("Un produit de la sauvegarde est invalide.");
    valid.products[code] = { code, name: p.name.trim(), category: p.category, unitsPerCarton: catalogInteger(p.unitsPerCarton), unitsPerPack: catalogInteger(p.unitsPerPack) };
  }
  const known = new Set([...(catalogBase?.products || []).map(p => p.code), ...Object.keys(valid.products)]);
  for (const code of input.deleted) {
    if (typeof code !== "string" || !catalogCodeValid(code) || (catalogBase && !known.has(code))) throw new Error("La sauvegarde contient un code supprimé inconnu.");
    if (!valid.deleted.includes(code)) valid.deleted.push(code);
  }
  for (const [sid, changes] of Object.entries(input.dotations)) {
    if (!catalogCodeValid(sid) || !record(changes) || (catalogBase && !services.some(s => s.id === sid))) throw new Error("La sauvegarde contient une réserve inconnue.");
    valid.dotations[sid] = {};
    for (const [code, qty] of Object.entries(changes)) {
      if (!catalogCodeValid(code) || (catalogBase && !known.has(code))) throw new Error("Une dotation contient un produit absent du catalogue.");
      valid.dotations[sid][code] = qty === null ? null : catalogInteger(qty, 1);
    }
  }
  for (const [code, sites] of Object.entries(input.orderSites)) {
    if (!catalogCodeValid(code) || (catalogBase && !known.has(code)) || !Array.isArray(sites) || sites.some(s => !["hospital","ehpad"].includes(s))) throw new Error("Un établissement de commande est invalide.");
    valid.orderSites[code] = [...new Set(sites)];
  }
  return valid;
}
// Corriger l'ancien code papier sans perdre les saisies déjà enregistrées.
const K_CODE2272_BACKUP = "ps_code2272_backup_v1";
const correctedPaperName = "MAXI JUMBO COLIS DE 6 ROULEAUX DE 380M";
const correctedSaltName = "SEL REGENERANT REF DM05";

function normaliseCorrectedCatalogCodes(input) {
  const next = catalogClone(input);
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  if (!record(next)) return next;
  const has = (map, key) => record(map) && Object.hasOwn(map, key);
  if (has(next.products, "2772")) {
    if (!has(next.products, "2272")) next.products["2272"] = next.products["2772"];
    delete next.products["2772"];
  }
  if (record(next.products?.["2272"])) {
    next.products["2272"].code = "2272";
    next.products["2272"].name = correctedPaperName;
  }
  if (record(next.dotations)) for (const map of Object.values(next.dotations)) {
    if (has(map, "2772")) {
      if (!has(map, "2272")) map["2272"] = map["2772"];
      delete map["2772"];
    }
  }
  if (has(next.orderSites, "2772")) {
    if (!has(next.orderSites, "2272")) next.orderSites["2272"] = next.orderSites["2772"];
    delete next.orderSites["2772"];
  }
  if (record(next.products?.["698"])) next.products["698"].name = correctedSaltName;
  if (record(next.products?.["2980"])) next.products["2980"].name = "NUTRISON ADVANCE CUBISON 1000ML";
  // Une suppression du doublon erroné ne doit pas masquer la bonne référence.
  if (Array.isArray(next.deleted)) next.deleted = next.deleted.filter(code => code !== "2772");
  return next;
}

function migrateCorrectedProductCode() {
  // L'avertissement de lecture existant reste affiché ; ne pas écraser la sauvegarde.
  if (catalogStorageUnreadable) return false;
  const record = value => value && typeof value === "object" && !Array.isArray(value);
  const nextSettings = normaliseCorrectedCatalogCodes(catalogSettings);
  const nextEntry = catalogClone(entry), nextPrepared = catalogClone(prepared);
  const nextDone = catalogClone(done), nextOrder = catalogClone(orderState);
  function renameServiceCodes(state, merge) {
    if (!record(state)) return;
    for (const map of Object.values(state)) {
      if (!record(map) || !Object.hasOwn(map, "2772")) continue;
      map["2272"] = Object.hasOwn(map, "2272") ? merge(map["2272"], map["2772"]) : map["2772"];
      delete map["2772"];
    }
  }
  const filledEntry = value => record(value) && [value.p, value.u].some(cell => cell !== null && cell !== undefined && String(cell).trim() !== "");
  renameServiceCodes(nextEntry, (current, legacy) => filledEntry(current) ? current : legacy);
  renameServiceCodes(nextPrepared, (current, legacy) => clampInt(current) + clampInt(legacy));
  renameServiceCodes(nextDone, (current, legacy) => !!current || !!legacy);
  const paperAliases = new Set([
    "2772", "COLIS DE 6 ROULEAUX DE 380M", "MAXI JUMBO COLIS DE 6 ROULEAUX", correctedPaperName
  ]);
  if (record(nextOrder)) for (const map of Object.values(nextOrder)) {
    if (!record(map)) continue;
    for (const key of Object.keys(map)) {
      if (!paperAliases.has(key.trim().replace(/\s+/g, " ").toUpperCase())) continue;
      const legacy = map[key];
      if (!Object.hasOwn(map, "2272")) map["2272"] = legacy;
      else map["2272"] = { ...legacy, ...map["2272"], c: !!map["2272"]?.c || !!legacy?.c };
      delete map[key];
    }
  }
  const states = [
    [K_CATALOG_SETTINGS, catalogSettings, nextSettings], [K_ENTRY, entry, nextEntry],
    [K_PREP, prepared, nextPrepared], [K_DONE, done, nextDone],
    [K_ORDER, orderState, nextOrder]
  ];
  if (!states.some(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))) return false;
  const originals = states.map(([key]) => [key, localStorage.getItem(key)]);
  // load() emploie un repli si le JSON est illisible : ne jamais sauvegarder ce repli ici.
  for (const [, raw] of originals) if (raw !== null) {
    try { JSON.parse(raw); }
    catch (_) { throw new Error("La correction du code 2272 n’a pas été enregistrée : une sauvegarde est illisible. Les données d’origine sont conservées."); }
  }
  const previousBackup = localStorage.getItem(K_CODE2272_BACKUP);
  try {
    if (previousBackup === null) localStorage.setItem(K_CODE2272_BACKUP, JSON.stringify({
      version: 1, createdAt: new Date().toISOString(), originalValues: Object.fromEntries(originals)
    }));
    for (const [key, , value] of states) localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    for (const [key, raw] of [...originals, [K_CODE2272_BACKUP, previousBackup]]) {
      try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }
      catch (_) { /* La copie de secours contient aussi les anciennes valeurs. */ }
    }
    throw new Error("La correction du code 2272 n’a pas pu être enregistrée. Les saisies n’ont pas été modifiées. Vérifie l’espace disponible sur cet appareil.");
  }
  catalogSettings = nextSettings; entry = nextEntry; prepared = nextPrepared;
  done = nextDone; orderState = nextOrder;
  return true;
}


function initCatalogManagement() {
  try {
    const saved = localStorage.getItem(K_CATALOG_SETTINGS);
    if (saved) catalogSettings = validateCatalogSettings(JSON.parse(saved));
  } catch (_) {
    // Ne jamais remplacer une sauvegarde illisible par des valeurs vides.
    catalogStorageUnreadable = true;
    catalogMessage("catalogStatus", "Les modifications enregistrées n’ont pas pu être lues. Exporte une copie de secours avant de poursuivre.", true);
  }
  try { migrateCorrectedProductCode(); }
  catch (error) {
    catalogStorageUnreadable = true;
    throw error;
  }
  document.querySelectorAll("[data-open-catalog]").forEach(button => button.addEventListener("click", () => showTab("products")));
  document.getElementById("catalogSearch").addEventListener("input", renderCatalogManagement);
  document.getElementById("d_product_search").addEventListener("input", renderDotationPicker);
  document.getElementById("catalogForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      if (!catalogReady) throw new Error("Attends la fin du chargement du catalogue.");
      const code = document.getElementById("catalogCode").value.trim();
      const name = document.getElementById("catalogName").value.trim();
      if (!catalogCodeValid(code)) throw new Error("Indique un code produit valide (lettres ou chiffres, sans espace).");
      if (!name || name.length > 200) throw new Error("Indique le nom du produit (200 caractères maximum).");
      if (code === "2772") throw new Error("Le code de ce produit est 2272. Recherche 2272 dans le catalogue.");
      if (getHistoricalProduct(code)) throw new Error("Ce code existe déjà dans le catalogue, éventuellement parmi les produits supprimés.");
      const unitsPerCarton = catalogInteger(document.getElementById("catalogCarton").value);
      const unitsPerPack = catalogInteger(document.getElementById("catalogPack").value);
      const category = document.getElementById("catalogCategory").value;
      if (category === "Pack" && !unitsPerPack) throw new Error("Indique le nombre d’unités dans un paquet.");
      if (category === "Cartons" && !unitsPerCarton) throw new Error("Indique le nombre d’unités dans un carton.");
      const site = document.getElementById("catalogSites").value;
      if (!["hospital", "ehpad", "both", "none"].includes(site)) throw new Error("Choisis où afficher ce produit dans Commande, ou Aucun.");
      const next = catalogClone(catalogSettings);
      next.products[code] = { code, name, category, unitsPerCarton, unitsPerPack };
      next.orderSites[code] = site === "none" ? [] : site === "both" ? ["hospital","ehpad"] : [site];
      commitCatalogSettings(next);
      event.target.reset();
      catalogMessage("catalogStatus", `${name} ajouté.`);
    } catch (error) { catalogMessage("catalogStatus", error.message, true); }
  });
  document.getElementById("dotationAddForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      const sid = d_service.value, code = document.getElementById("d_product").value;
      const p = getProduct(code);
      if (!getService(sid) || !p) throw new Error("Choisis une réserve et un produit du catalogue.");
      if (Object.hasOwn(dotations[sid] || {}, code)) throw new Error("Ce produit est déjà présent dans la dotation.");
      const qty = catalogInteger(document.getElementById("d_quantity").value, 1);
      const next = catalogClone(catalogSettings);
      next.dotations[sid] = next.dotations[sid] || {};
      next.dotations[sid][code] = qty;
      commitCatalogSettings(next);
      catalogMessage("dotationStatus", `${p.name} ajouté à ${serviceName(sid)} : ${qty} unité(s). Enregistré sur cet appareil.`);
    } catch (error) { catalogMessage("dotationStatus", error.message, true); }
  });
  document.getElementById("catalogList").addEventListener("click", event => {
    const button = event.target.closest("[data-delete-product]");
    if (!button) return;
    const code = button.dataset.deleteProduct, p = getProduct(code);
    if (!p) return;
    const affected = services.filter(s => Object.hasOwn(dotations[s.id] || {}, code)).map(s => s.name);
    const scope = affected.length ? `\nIl sera retiré des dotations suivantes : ${affected.join(", ")}.` : "\nIl n’est présent dans aucune dotation.";
    if (!confirm(`Supprimer ${p.name} (code ${code}) du catalogue et des commandes ?${scope}\nSes saisies de complément et de préparation en cours seront aussi retirées.`)) return;
    try {
      const next = catalogClone(catalogSettings);
      if (!next.deleted.includes(code)) next.deleted.push(code);
      commitCatalogSettings(next);
      catalogMessage("catalogStatus", `${p.name} supprimé.`);
    } catch (error) { catalogMessage("catalogStatus", error.message, true); }
  });
  document.getElementById("dotationsTable").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-dotation]");
    if (!button) return;
    const sid = d_service.value, code = button.dataset.removeDotation, p = getProduct(code);
    if (!p || !confirm(`Retirer ${p.name} de la dotation de ${serviceName(sid)} ?\nSa saisie de complément et de préparation en cours pour cette réserve sera retirée. Le produit reste dans le catalogue.`)) return;
    try {
      const next = catalogClone(catalogSettings);
      next.dotations[sid] = next.dotations[sid] || {};
      next.dotations[sid][code] = null;
      commitCatalogSettings(next);
      catalogMessage("dotationStatus", `${p.name} retiré de ${serviceName(sid)}. Enregistré sur cet appareil.`);
    } catch (error) { catalogMessage("dotationStatus", error.message, true); }
  });
}
