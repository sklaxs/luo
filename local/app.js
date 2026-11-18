/* =========================================================================
   Luo v1 — version locale (100 % local : HTML/CSS/JS vanilla, IndexedDB)
   Contrat de donnees : schema/luo.schema.json v0.2
   Charte graphique : docs/charte-graphique.md (reprise de Paul)
   ========================================================================= */
(function () {
'use strict';

/* ================= 1. Logique pure (exportee pour tests node) ============ */

var URGENCE = { imperatif: 4, '3_jours': 3, '1_semaine': 2, '1_mois': 1, '1_trimestre': 1 };
var SEUIL_PRIORITAIRE = 12;   // note >= 12 = processus prioritaire (cadrage v0.3 §5)
var SEUIL_PRESELECTION = 9;   // preselection "a traiter" >= 9 via la matrice 4x4 (cadrage v0.3 §4.4)
var NIVEAU_LIB = { 1: 'mineur', 2: 'faible', 3: 'significatif', 4: 'critique' };

function byId(data, coll, id) {
  var list = data[coll] || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/* Applications impactees par un scenario : SI operant impacte OU hebergee sur un site impacte */
function appsImpactees(data, scenario) {
  var si = {}, sites = {};
  (scenario.si_impactes || []).forEach(function (id) { si[id] = 1; });
  (scenario.sites_impactes || []).forEach(function (id) { sites[id] = 1; });
  return (data.applications || []).filter(function (a) {
    if (a.actif === false) return false;
    var ok = (a.si_operants || []).some(function (id) { return !!si[id]; });
    if (!ok && a.hebergement && a.hebergement.sites) {
      ok = a.hebergement.sites.some(function (s) { return !!sites[s.site_id]; });
    }
    return ok;
  }).map(function (a) { return a.id; });
}

/* dependance_tic = niveau max des dependances aux applications impactees (null si aucune) */
function dependanceTic(data, micro, scenario) {
  var imp = {};
  appsImpactees(data, scenario).forEach(function (id) { imp[id] = 1; });
  var max = 0;
  (micro.dependances_applications || []).forEach(function (d) {
    if (imp[d.application_id]) max = Math.max(max, d.niveau);
  });
  return max > 0 ? max : null;
}

function urgenceDe(priorite) { return URGENCE[priorite] || 1; }

/* note = dependance_tic x urgence (1-16), calculee pour un scenario */
function noteCalculee(data, micro, scenario) {
  if (!scenario) return null;
  var dep = dependanceTic(data, micro, scenario);
  if (dep === null) return null;
  return dep * urgenceDe(micro.priorite_service);
}

/* note affichee : valeur stockee si modifiee manuellement, sinon calculee */
function noteAffichee(data, micro, scenarioId) {
  var scenario = byId(data, 'scenarios', scenarioId);
  var stockee = (micro.notes_par_scenario || []).filter(function (n) { return n.scenario_id === scenarioId; })[0];
  var calc = noteCalculee(data, micro, scenario);
  if (stockee && stockee.modifie_manuellement) {
    return { valeur: stockee.valeur, dep: stockee.dependance_tic, modifiee: true };
  }
  if (calc === null) return null;
  return { valeur: calc, dep: dependanceTic(data, micro, scenario), modifiee: false };
}

/* avancement d'un plan, calcule depuis les etapes (jamais saisi) */
function avancementPlan(plan) {
  var et = plan.etapes || [];
  if (!et.length) return 0;
  var fait = et.filter(function (e) { return e.statut === 'fait'; }).length;
  return Math.round(100 * fait / et.length);
}

/* preselection automatique : processus micro de note >= 9 pour le scenario */
function selectionPreselectionnee(data, scenarioId) {
  var out = [];
  (data.processus_micro || []).forEach(function (m) {
    var n = noteAffichee(data, m, scenarioId);
    if (n && n.valeur >= SEUIL_PRESELECTION) out.push(m.id);
  });
  return out;
}

var CMDB_COLONNES = ['id_externe', 'nom_officiel', 'editeur', 'categorie', 'hebergement_mode', 'localisation', 'accessibilite', 'si_operants', 'criticite_niveau', 'criticite_justification'];

var LuoCalc = {
  URGENCE: URGENCE, SEUIL_PRIORITAIRE: SEUIL_PRIORITAIRE, SEUIL_PRESELECTION: SEUIL_PRESELECTION,
  NIVEAU_LIB: NIVEAU_LIB, byId: byId, appsImpactees: appsImpactees, dependanceTic: dependanceTic,
  urgenceDe: urgenceDe, noteCalculee: noteCalculee, noteAffichee: noteAffichee,
  avancementPlan: avancementPlan, selectionPreselectionnee: selectionPreselectionnee,
  parseCSV: parseCSV, importCSVRows: importCSVRows, exportCSVRows: exportCSVRows, CMDB_COLONNES: CMDB_COLONNES
};
if (typeof module !== 'undefined' && module.exports) { module.exports = LuoCalc; }
if (typeof window === 'undefined') { return; }

/* ================= 2. Etat + persistance (IndexedDB / localStorage) ====== */

var DB_NAME = 'luo', STORE = 'doc', DOC_ID = 'courant';
var state = {
  data: null,            // document conforme au schema v0.2
  tab: 'dashboard',
  scenarioId: null,      // scenario courant (sélection, dashboard)
  selection: {},         // id micro -> true (sélection "à traiter", état UI)
  forces: {},            // id micro -> true (forçage manuel < seuil)
  planId: null,          // plan ouvert
  wizardStep: 0,
  entiteId: 'toutes',    // filtre cartographie par entité
  macroOuvert: null,     // macro dont la rangée de micro est dépliée
  cartoVue: 'graphique', // 'graphique' | 'liste'
  db: null
};

function defaultData() {
  return {
    version_schema: '0.2.0',
    organisation: { nom: 'Nouvelle organisation', reference_pca: 'Classeur rouge' },
    sites: [], entites: [], systemes_information: [], directions: [],
    applications: [], processus_macro: [], processus_micro: [],
    scenarios: [], plans_continuite: [], actions: []
  };
}

function save() {
  var payload = JSON.stringify(state.data);
  try {
    if (state.db) {
      var tx = state.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id: DOC_ID, json: payload });
    } else {
      localStorage.setItem('luo.doc', payload);
    }
  } catch (e) { console.error('save failed', e); }
}

function load() {
  return new Promise(function (resolve) {
    if (!('indexedDB' in window)) { state.db = null; fin(); return; }
    try {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () {
        state.db = req.result;
        var tx = state.db.transaction(STORE, 'readonly');
        var g = tx.objectStore(STORE).get(DOC_ID);
        g.onsuccess = function () { fin(g.result ? g.result.json : null); };
        g.onerror = function () { fin(null); };
      };
      req.onerror = function () { state.db = null; fin(null); };
    } catch (e) { state.db = null; fin(null); }
    function fin(json) {
      if (!json) { try { json = localStorage.getItem('luo.doc'); } catch (e) {} }
      if (json) { try { state.data = JSON.parse(json); } catch (e) { state.data = null; } }
      resolve();
    }
  });
}

/* ================= 3. Helpers UI ========================================= */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }
function fmtDate(d) { return d ? esc(d) : '—'; }
function notePill(n) {
  if (!n) return '<span class="legend-inline">non impacté</span>';
  var cls = 'note-' + n.valeur;
  var star = n.valeur >= LuoCalc.SEUIL_PRIORITAIRE ? ' ★ prioritaire' : '';
  return '<span class="note-pill ' + cls + '" title="note ' + n.valeur + '/16' + (n.modifiee ? ' (modifiée en atelier)' : ' (calculée)') + '">' + n.valeur + '/16' + star + (n.modifiee ? ' ✎' : '') + '</span>';
}
function avBar(pct) {
  return '<div class="av-bar"><div style="width:' + pct + '%"></div></div><span class="legend-inline">' + pct + ' %</span>';
}
function modal(html) {
  var root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + html + '</div></div>';
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
function toast(msg) {
  var t = h('<div style="position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;z-index:99">' + esc(msg) + '</div>');
  document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
}
function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function today() { return new Date().toISOString().slice(0, 10); }

/* ================= 4. Navigation + rendu global ========================== */

var TABS = [
  ['dashboard', 'Tableau de bord'], ['selection', 'Sélection'], ['cartographie', 'Cartographie'],
  ['applications', 'Applications'], ['scenarios', 'Scénarios'], ['plans', 'Plans'],
  ['actions', 'Actions'], ['donnees', 'Données']
];

function render() {
  var main = document.getElementById('main');
  var renderers = {
    dashboard: renderDashboard, selection: renderSelection, cartographie: renderCartographie,
    applications: renderApplications, scenarios: renderScenarios, plans: renderPlans,
    actions: renderActions, donnees: renderDonnees
  };
  main.innerHTML = '';
  (renderers[state.tab] || renderDashboard)();
  var tabs = document.querySelectorAll('#tabs .tab');
  tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === state.tab); });
}

function scenarioSelect(extraClass) {
  var opts = (state.data.scenarios || []).map(function (s) {
    return '<option value="' + esc(s.id) + '"' + (s.id === state.scenarioId ? ' selected' : '') + '>' + esc(s.nom) + '</option>';
  }).join('');
  return '<select class="' + (extraClass || '') + '" onchange="LuoUI.setScenario(this.value)">' +
    (opts || '<option value="">(aucun scénario)</option>') + '</select>';
}

function pageHead(titre, sousTitre, actions) {
  return '<div class="page-head"><div><h2>' + esc(titre) + '</h2><p>' + esc(sousTitre || '') + '</p></div>' +
    '<div class="toolbar">' + (actions || '') + '</div></div>';
}

/* ================= 5. Tableau de bord (vue executive) =================== */

function renderDashboard() {
  var d = state.data, main = document.getElementById('main');
  var sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
  var micros = d.processus_micro || [];
  var plans = d.plans_continuite || [];
  var actions = d.actions || [];
  var avTotal = plans.length ? Math.round(plans.reduce(function (s, p) { return s + LuoCalc.avancementPlan(p); }, 0) / plans.length) : 0;
  var enRetard = actions.filter(function (a) {
    return a.statut !== 'fait' && a.statut !== 'annule' && a.date_cible && a.date_cible < today();
  }).length;
  var prioritaires = micros.filter(function (m) {
    var n = state.scenarioId ? LuoCalc.noteAffichee(d, m, state.scenarioId) : null;
    return n && n.valeur >= LuoCalc.SEUIL_PRIORITAIRE;
  }).length;
  var selCount = Object.keys(state.selection).filter(function (k) { return state.selection[k]; }).length;

  var html = pageHead('Tableau de bord', 'Vue de synthèse — ' + esc(d.organisation.nom),
    scenarioSelect());
  html += '<div class="kpi-grid">' +
    '<div class="kpi"><div class="v">' + micros.length + '</div><div class="l">processus micro</div></div>' +
    '<div class="kpi"><div class="v">' + (d.applications || []).filter(function(a){return a.actif!==false;}).length + '</div><div class="l">applications actives</div></div>' +
    '<div class="kpi"><div class="v">' + plans.length + '</div><div class="l">plans de continuité</div></div>' +
    '<div class="kpi"><div class="v">' + avTotal + ' %</div><div class="l">avancement global des plans</div></div>' +
    '<div class="kpi"><div class="v">' + prioritaires + '</div><div class="l">processus prioritaires (note ≥ 12' + (sc ? ', scénario « ' + esc(sc.nom.slice(0, 30)) + '…' : '') + ')</div></div>' +
    '<div class="kpi"><div class="v">' + enRetard + '</div><div class="l">actions en retard</div></div>' +
    '<div class="kpi"><div class="v">' + selCount + '</div><div class="l">processus sélectionnés « à traiter »</div></div>' +
    '</div>';

  // avancement par direction
  html += '<div class="card"><div class="section-title">Avancement par direction</div>';
  var dirs = d.directions || [];
  if (!dirs.length) { html += '<div class="empty">Aucune direction définie.</div>'; }
  else {
    html += '<table class="data"><thead><tr><th>Direction</th><th>Entité</th><th>Processus</th><th>Plans</th><th>Avancement</th></tr></thead><tbody>';
    dirs.forEach(function (dir) {
      var ms = micros.filter(function (m) { return m.direction_id === dir.id; });
      var ps = plans.filter(function (p) { return ms.some(function (m) { return m.id === p.processus_id; }); });
      var av = ps.length ? Math.round(ps.reduce(function (s, p) { return s + LuoCalc.avancementPlan(p); }, 0) / ps.length) : 0;
      var ent = LuoCalc.byId(d, 'entites', dir.entite_id);
      html += '<tr><td>' + esc(dir.nom) + '</td><td>' + esc(ent ? ent.nom : '—') + '</td><td>' + ms.length + '</td><td>' + ps.length + '</td><td>' + avBar(av) + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';

  // processus prioritaires du scénario courant
  html += '<div class="card" style="margin-top:16px"><div class="section-title">Processus prioritaires' + (sc ? ' — ' + esc(sc.nom) : '') + '</div>';
  if (!sc) { html += '<div class="empty">Sélectionnez un scénario pour voir les notes de processus.</div>'; }
  else {
    var rows = micros.map(function (m) {
      var n = LuoCalc.noteAffichee(d, m, sc.id);
      return { m: m, n: n };
    }).filter(function (r) { return r.n && r.n.valeur >= LuoCalc.SEUIL_PRIORITAIRE; })
      .sort(function (a, b) { return b.n.valeur - a.n.valeur; });
    if (!rows.length) html += '<div class="empty">Aucun processus prioritaire pour ce scénario.</div>';
    else {
      html += '<table class="data"><thead><tr><th>Processus</th><th>Direction</th><th>Priorité de service</th><th>Dépendance TIC</th><th>Note</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var dir = LuoCalc.byId(d, 'directions', r.m.direction_id);
        html += '<tr><td>' + esc(r.m.nom) + '</td><td>' + esc(dir ? dir.nom : '—') + '</td><td>' + esc(r.m.priorite_service) + '</td><td>' + r.n.dep + ' (' + esc(LuoCalc.NIVEAU_LIB[r.n.dep]) + ')</td><td>' + notePill(r.n) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
  }
  html += '</div>';
  main.innerHTML = html;
}

/* ================= 6. Sélection : matrice 4x4 + cartographie ============= */

function selectionEffective() {
  var eff = {};
  var pre = LuoCalc.selectionPreselectionnee(state.data, state.scenarioId);
  pre.forEach(function (id) { eff[id] = true; });
  Object.keys(state.forces).forEach(function (id) { if (state.forces[id]) eff[id] = true; });
  return eff;
}

function renderSelection() {
  var d = state.data, main = document.getElementById('main');
  var sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
  var html = pageHead('Sélection des processus à traiter',
    'Matrice 4×4 (dépendance TIC × urgence) à gauche, cartographie à droite. Présélection automatique : note ≥ 9. Un processus en dessous se force en cliquant. Entourage rouge = traité.',
    scenarioSelect());
  if (!sc) {
    html += '<div class="card"><div class="empty">Créez d\'abord un scénario (onglet Scénarios), puis revenez ici.</div></div>';
    main.innerHTML = html; return;
  }
  var eff = selectionEffective();
  var micros = d.processus_micro || [];

  // matrice 4x4 : lignes dependance 4..1, colonnes urgence 4..1
  var cells = {}; // "dep-urg" -> [{m, note}]
  micros.forEach(function (m) {
    var n = LuoCalc.noteAffichee(d, m, sc.id);
    if (!n) return;
    var urg = LuoCalc.urgenceDe(m.priorite_service);
    var key = n.dep + '-' + urg;
    (cells[key] = cells[key] || []).push({ m: m, note: n });
  });
  html += '<div class="sel-grid"><div class="card"><div class="section-title">Matrice dépendance × urgence (note = produit)</div>';
  html += '<table class="matrice"><thead><tr><th>dépendance TIC ↓ / urgence →</th>' +
    [4, 3, 2, 1].map(function (u) { return '<th>urg. ' + u + '</th>'; }).join('') + '</tr></thead><tbody>';
  [4, 3, 2, 1].forEach(function (dep) {
    html += '<tr><th>dép. ' + dep + ' ' + esc(LuoCalc.NIVEAU_LIB[dep]) + '</th>';
    [4, 3, 2, 1].forEach(function (urg) {
      var note = dep * urg;
      var cls = note >= 12 ? 'n12' : note >= 9 ? 'n9' : note >= 6 ? 'n6' : 'n1';
      var items = cells[dep + '-' + urg] || [];
      var sel = items.length && items.every(function (it) { return eff[it.m.id]; });
      var force = items.some(function (it) { return state.forces[it.m.id]; });
      html += '<td class="' + cls + (sel ? ' selectionnee' : '') + '" onclick="LuoUI.toggleCell(' + dep + ',' + urg + ')">' +
        '<span class="cell-note">' + note + '</span>' +
        '<span class="cell-noms">' + items.map(function (it) { return esc(it.m.nom) + (state.forces[it.m.id] ? ' <span class="force">forcé</span>' : ''); }).join('<br>') + '</span></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<p class="legend-inline">Rouge ≥ 12 (prioritaire) · orange 9-11 (présélectionné) · jaune 6-8 · gris &lt; 6. Clic sur une case = (dé)sélectionne tous les processus de la case.</p></div>';

  // cartographie à droite
  html += '<div class="card"><div class="section-title">Cartographie des processus (clic = sélectionner / forcer)</div><div class="carto-list">';
  var macros = d.processus_macro || [];
  var orphelins = micros.filter(function (m) { return !m.macro_id || !LuoCalc.byId(d, 'processus_macro', m.macro_id); });
  macros.forEach(function (mac) {
    var ms = micros.filter(function (m) { return m.macro_id === mac.id; });
    if (!ms.length) return;
    html += '<div class="carto-macro"><h4>' + esc(mac.nom) + ' <span class="chip">' + esc(mac.typologie || '—') + '</span></h4>';
    ms.forEach(function (m) { html += procItem(m, eff); });
    html += '</div>';
  });
  if (orphelins.length) {
    html += '<div class="carto-macro"><h4>Sans macro</h4>';
    orphelins.forEach(function (m) { html += procItem(m, eff); });
    html += '</div>';
  }
  if (!micros.length) html += '<div class="empty">Aucun processus micro défini.</div>';
  html += '</div></div></div>';
  main.innerHTML = html;
}

function procItem(m, eff) {
  var d = state.data;
  var n = state.scenarioId ? LuoCalc.noteAffichee(d, m, state.scenarioId) : null;
  var sel = !!eff[m.id];
  return '<div class="proc-item' + (sel ? ' selectionne' : '') + '" onclick="LuoUI.toggleProc(\'' + esc(m.id) + '\')">' +
    '<span>' + esc(m.nom) + '</span> <span class="typ">' + esc(m.typologie || '—') + ' · ' + esc(m.priorite_service) + '</span>' +
    '<span class="note-badge">' + notePill(n) + '</span></div>';
}

/* ================= 7. Cartographie (entités, sites, SI, directions, processus) ============ */

function renderCartoListe() {
  var d = state.data, main = document.getElementById('main');
  var html = pageHead('Cartographie (vue liste)', 'Entités, sites, SI, directions, processus macro et micro (typologie ISO 9001).',
    '<button class="btn" onclick="LuoUI.addEntite()">+ Entité</button>' +
    '<button class="btn" onclick="LuoUI.addSite()">+ Site</button>' +
    '<button class="btn" onclick="LuoUI.addSI()">+ SI</button>' +
    '<button class="btn" onclick="LuoUI.addDirection()">+ Direction</button>' +
    '<button class="btn" onclick="LuoUI.addMacro()">+ Processus macro</button>' +
    '<button class="btn primary" onclick="LuoUI.addMicro()">+ Processus micro</button>');

  // Entités
  html += '<div class="card"><div class="section-title">Entités</div>' +
    tableSimple(d.entites, ['id', 'nom', 'code'], 'entite', 'LuoUI.del');
  // Sites
  html += '<div class="card" style="margin-top:16px"><div class="section-title">Sites (localisation géographique)</div>' +
    tableSimple(d.sites, ['id', 'nom', 'localisation', 'type'], 'site', 'LuoUI.del');
  // SI
  html += '<div class="card" style="margin-top:16px"><div class="section-title">Systèmes d\'information</div>';
  if (!d.systemes_information.length) html += '<div class="empty">Aucun SI.</div>';
  else {
    html += '<table class="data"><thead><tr><th>id</th><th>Nom</th><th>Type</th><th>Sites d\'hébergement</th><th></th></tr></thead><tbody>';
    d.systemes_information.forEach(function (s) {
      var sites = (s.sites_hebergement || []).map(function (sid) { var st = LuoCalc.byId(d, 'sites', sid); return st ? st.nom : sid; }).join(', ');
      html += '<tr><td>' + esc(s.id) + '</td><td>' + esc(s.nom) + '</td><td>' + esc(s.type || '—') + '</td><td>' + esc(sites || '—') + '</td>' +
        '<td><button class="btn small danger" onclick="LuoUI.del(\'systemes_information\',\'' + esc(s.id) + '\')">Suppr.</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  // Directions
  html += '<div class="card" style="margin-top:16px"><div class="section-title">Directions</div>' +
    tableSimple(d.directions, ['id', 'nom', 'entite_id'], 'direction', 'LuoUI.del');
  // Processus macro
  html += '<div class="card" style="margin-top:16px"><div class="section-title">Processus macro (cartographie globale, validée DG)</div>';
  if (!d.processus_macro.length) html += '<div class="empty">Aucun processus macro.</div>';
  else {
    html += '<table class="data"><thead><tr><th>id</th><th>Nom</th><th>Typologie</th><th>Sensibilité</th><th>Direction opérante</th><th></th></tr></thead><tbody>';
    d.processus_macro.forEach(function (m) {
      var dop = m.direction_operante_id ? LuoCalc.byId(d, 'directions', m.direction_operante_id) : null;
      html += '<tr><td>' + esc(m.id) + '</td><td>' + esc(m.nom) + '</td><td><span class="chip">' + esc(m.typologie || '—') + '</span></td><td>' + (m.niveau_sensibilite || '—') + '</td><td>' + esc(dop ? dop.nom : '—') + '</td>' +
        '<td><button class="btn small danger" onclick="LuoUI.del(\'processus_macro\',\'' + esc(m.id) + '\')">Suppr.</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  // Processus micro
  html += '<div class="card" style="margin-top:16px"><div class="section-title">Processus micro (par direction)</div>';
  if (!d.processus_micro.length) html += '<div class="empty">Aucun processus micro.</div>';
  else {
    html += '<table class="data"><thead><tr><th>id</th><th>Nom</th><th>Macro</th><th>Direction</th><th>Typologie</th><th>Priorité</th><th>S\'appuie sur</th><th></th></tr></thead><tbody>';
    d.processus_micro.forEach(function (m) {
      var mac = m.macro_id ? LuoCalc.byId(d, 'processus_macro', m.macro_id) : null;
      var dir = LuoCalc.byId(d, 'directions', m.direction_id);
      var ap = (m["s'appuie_sur"] || []).map(function (id) { return esc(id); }).join(', ');
      html += '<tr><td>' + esc(m.id) + '</td><td>' + esc(m.nom) + '</td><td>' + esc(mac ? mac.nom : '—') + '</td><td>' + esc(dir ? dir.nom : '—') + '</td><td><span class="chip">' + esc(m.typologie || (mac ? mac.typologie : '—')) + '</span></td><td>' + esc(m.priorite_service) + '</td><td>' + ap + '</td>' +
        '<td><button class="btn small" onclick="LuoUI.editMicro(\'' + esc(m.id) + '\')">Éditer</button> <button class="btn small danger" onclick="LuoUI.del(\'processus_micro\',\'' + esc(m.id) + '\')">Suppr.</button></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  main.innerHTML = html;
}

function tableSimple(list, cols, label, delFn) {
  if (!list || !list.length) return '<div class="empty">Aucun élément.</div>';
  var html = '<table class="data"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>';
  list.forEach(function (it) {
    html += '<tr>' + cols.map(function (c) { return '<td>' + esc(it[c] == null ? '—' : it[c]) + '</td>'; }).join('') +
      '<td><button class="btn small danger" onclick="' + delFn + '(\'' + label + 's\',\'' + esc(it.id) + '\')">Suppr.</button></td></tr>';
  });
  return html + '</tbody></table>';
}

/* ================= 8. Applications + CSV CMDB ============================ */

function renderApplications() {
  var d = state.data, main = document.getElementById('main');
  var q = (state.appQuery || '').toLowerCase();
  var apps = (d.applications || []).filter(function (a) {
    if (!q) return true;
    if ((a.nom_officiel || '').toLowerCase().indexOf(q) >= 0) return true;
    return (a.alias || []).some(function (al) { return (al.nom_local || '').toLowerCase().indexOf(q) >= 0; });
  });
  var html = pageHead('Applications', 'Nom officiel unique, alias par entité, hébergement (sites actif/passif), SI opérants, criticité.',
    '<input type="text" placeholder="Rechercher (nom ou alias)…" value="' + esc(state.appQuery || '') + '" oninput="LuoUI.setQuery(this.value)">' +
    '<button class="btn" onclick="LuoUI.addApp()">+ Application</button>' +
    '<button class="btn" onclick="document.getElementById(\'csv-in\').click()">Import CSV CMDB</button>' +
    '<button class="btn" onclick="LuoUI.exportCSV()">Export CSV</button>' +
    '<input type="file" id="csv-in" accept=".csv" style="display:none" onchange="LuoUI.importCSV(this)">');
  if (!apps.length) html += '<div class="card"><div class="empty">Aucune application.</div></div>';
  else {
    html += '<div class="card"><table class="data"><thead><tr><th>Nom officiel</th><th>Alias</th><th>Hébergement</th><th>Sites (rôle)</th><th>SI opérants</th><th>Criticité</th><th>CMDB</th><th>Actif</th><th></th></tr></thead><tbody>';
    apps.forEach(function (a) {
      var heb = a.hebergement || {};
      var sites = (heb.sites || []).map(function (s) {
        var st = LuoCalc.byId(d, 'sites', s.site_id);
        return esc(st ? st.nom : s.site_id) + ' (' + esc(s.role || 'actif') + ')';
      }).join(', ');
      var sis = (a.si_operants || []).map(function (id) { var s = LuoCalc.byId(d, 'systemes_information', id); return s ? s.nom : id; }).join(', ');
      var alias = (a.alias || []).map(function (al) { return esc(al.nom_local); }).join(' ; ');
      html += '<tr><td><strong>' + esc(a.nom_officiel) + '</strong>' + (a.editeur ? '<br><span class="legend-inline">' + esc(a.editeur) + '</span>' : '') + '</td>' +
        '<td>' + alias + '</td><td>' + esc(heb.mode || '—') + ' / ' + esc(heb.accessibilite || '—') + '</td><td>' + sites + '</td>' +
        '<td>' + esc(sis || '—') + '</td><td>' + (a.criticite ? a.criticite.niveau + ' ' + esc(LuoCalc.NIVEAU_LIB[a.criticite.niveau]) : '—') + '</td>' +
        '<td>' + esc(a.cmdb ? a.cmdb.id_externe : '—') + '</td><td>' + (a.actif === false ? '<span class="badge" style="background:var(--p4)">non</span>' : '<span class="badge status-termine">oui</span>') + '</td>' +
        '<td><button class="btn small danger" onclick="LuoUI.del(\'applications\',\'' + esc(a.id) + '\')">Suppr.</button></td></tr>';
    });
    html += '</tbody></table></div>';
  }
  main.innerHTML = html;
}

function parseCSV(text) {
  // séparateur ;, UTF-8, guillemets " "
  var rows = [], cur = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ';') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else field += c;
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function importCSVRows(rows, d) {
  // ligne d'en-tête attendue = CMDB_COLONNES
  var header = rows[0].map(function (c) { return c.trim(); });
  var idx = {};
  CMDB_COLONNES.forEach(function (c, i) { idx[c] = header.indexOf(c) >= 0 ? header.indexOf(c) : i; });
  var ajoutes = 0, maj = 0, desactives = 0;
  var vus = {};
  rows.slice(1).forEach(function (r) {
    var idExt = (r[idx.id_externe] || '').trim();
    if (!idExt) return;
    vus[idExt] = true;
    var nom = (r[idx.nom_officiel] || '').trim();
    var ex = (d.applications || []).filter(function (a) { return a.cmdb && a.cmdb.id_externe === idExt; })[0];
    var siIds = (r[idx.si_operants] || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var loc = (r[idx.localisation] || '').trim();
    var site = loc ? (d.sites || []).filter(function (s) { return s.nom.toLowerCase() === loc.toLowerCase(); })[0] : null;
    var app = {
      id: ex ? ex.id : uid('app'),
      nom_officiel: nom || ('CMDB ' + idExt),
      editeur: (r[idx.editeur] || '').trim() || undefined,
      categorie: (r[idx.categorie] || '').trim() || undefined,
      hebergement: {
        mode: (r[idx.hebergement_mode] || '').trim() || 'inconnu',
        accessibilite: (r[idx.accessibilite] || '').trim() || undefined,
        sites: site ? [{ site_id: site.id, role: 'actif' }] : []
      },
      si_operants: siIds,
      criticite: { niveau: parseInt(r[idx.criticite_niveau], 10) || 1, justification: (r[idx.criticite_justification] || '').trim() },
      cmdb: { id_externe: idExt, dernier_import: today(), source: 'Import CSV CMDB' },
      actif: true
    };
    if (ex) { // reconciliation : on garde id/alias/dependances, on met à jour les champs CMDB
      ['nom_officiel', 'editeur', 'categorie', 'hebergement', 'si_operants', 'criticite', 'cmdb', 'actif'].forEach(function (k) { ex[k] = app[k]; });
      maj++;
    } else {
      d.applications.push(app); ajoutes++;
    }
  });
  // absentes du CSV -> actif = false (jamais de suppression)
  (d.applications || []).forEach(function (a) {
    if (a.cmdb && a.cmdb.id_externe && !vus[a.cmdb.id_externe] && a.actif !== false) { a.actif = false; desactives++; }
  });
  return { ajoutes: ajoutes, maj: maj, desactives: desactives };
}

function exportCSVRows(d) {
  var rows = [CMDB_COLONNES.join(';')];
  (d.applications || []).forEach(function (a) {
    var heb = a.hebergement || {};
    var loc = (heb.sites && heb.sites[0]) ? (LuoCalc.byId(d, 'sites', heb.sites[0].site_id) || {}).nom || '' : '';
    var cells = [
      a.cmdb ? a.cmdb.id_externe : '', a.nom_officiel, a.editeur || '', a.categorie || '',
      heb.mode || '', loc, heb.accessibilite || '', (a.si_operants || []).join('|'),
      a.criticite ? a.criticite.niveau : '', a.criticite ? (a.criticite.justification || '') : ''
    ];
    rows.push(cells.map(function (c) { c = String(c == null ? '' : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'));
  });
  return rows.join('\n');
}

/* ================= 9. Scénarios ========================================== */

function renderScenarios() {
  var d = state.data, main = document.getElementById('main');
  var html = pageHead('Scénarios de crise informatique', 'Chaque scénario déclare ses SI impactés, ses sites impactés et ses entités impactées.',
    '<button class="btn primary" onclick="LuoUI.addScenario()">+ Scénario</button>');
  var scs = d.scenarios || [];
  if (!scs.length) html += '<div class="card"><div class="empty">Aucun scénario. Le premier du catalogue : ransomware avec mise en sécurité du SI de gestion.</div></div>';
  scs.forEach(function (s) {
    var actif = s.id === state.scenarioId;
    html += '<div class="card" style="margin-top:14px;border-left:4px solid ' + (actif ? 'var(--accent)' : 'var(--line)') + '">' +
      '<div class="section-title">' + esc(s.nom) + ' <span class="chip">' + esc(s.type) + '</span>' +
      (actif ? ' <span class="chip">scénario courant</span>' : '') + '</div>' +
      '<dl class="kv">' +
      '<dt>SI impactés</dt><dd>' + (s.si_impactes || []).map(function (id) { var x = LuoCalc.byId(d, 'systemes_information', id); return esc(x ? x.nom : id); }).join(', ') + '</dd>' +
      '<dt>Sites impactés</dt><dd>' + (s.sites_impactes || []).map(function (id) { var x = LuoCalc.byId(d, 'sites', id); return esc(x ? x.nom + ' (' + (x.localisation || '') + ')' : id); }).join(', ') + '</dd>' +
      '<dt>Entités impactées</dt><dd>' + (s.entites_impactees || []).map(function (id) { var x = LuoCalc.byId(d, 'entites', id); return esc(x ? x.nom : id); }).join(', ') + '</dd>' +
      '<dt>Durée estimée</dt><dd>' + (s.duree_indisponibilite_estimee ? s.duree_indisponibilite_estimee.min_jours + '–' + s.duree_indisponibilite_estimee.max_jours + ' jours' : '—') + '</dd>' +
      '<dt>Postulats</dt><dd>' + (s.postulats || []).map(esc).join('<br>') + '</dd>' +
      '<dt>Applications impactées (dérivé)</dt><dd>' + appsImpactees(d, s).map(function (id) { return esc((LuoCalc.byId(d, 'applications', id) || {}).nom_officiel || id); }).join(', ') + '</dd>' +
      '</dl>' +
      '<div class="toolbar" style="margin-top:10px">' +
      '<button class="btn small" onclick="LuoUI.setScenario(\'' + esc(s.id) + '\');LuoUI.go(\'selection\')">Voir la sélection (matrice 4×4)</button>' +
      '<button class="btn small danger" onclick="LuoUI.del(\'scenarios\',\'' + esc(s.id) + '\')">Suppr.</button></div></div>';
  });
  main.innerHTML = html;
}

/* ================= 10. Plans de continuité (couple processus × scénario) === */

var ETAPES_PLAN = ['cartographie', 'identification_applications', 'qualification', 'atelier_referent', 'activites', 'procedures_actions', 'revue_dg', 'validation'];
var WIZARD_STEPS = ['Étapes', 'Activités', 'Procédures', 'Actions récurrentes', 'Fichiers à exporter', 'Mots de passe', 'PC hors domaine', 'Communication'];

function renderPlans() {
  var d = state.data, main = document.getElementById('main');
  if (state.planId && LuoCalc.byId(d, 'plans_continuite', state.planId)) { renderPlanWizard(); return; }
  var html = pageHead('Plans de continuité', 'Un plan par couple (processus micro, scénario). Avancement calculé depuis les étapes.',
    '<button class="btn primary" onclick="LuoUI.addPlan()">+ Plan</button>' +
    '<button class="btn" onclick="LuoUI.printDeck()">Livrable 16:9 (imprimer/PDF)</button>');
  var plans = d.plans_continuite || [];
  if (!plans.length) html += '<div class="card"><div class="empty">Aucun plan. Créez-en un pour un couple processus / scénario.</div></div>';
  else {
    html += '<div class="card"><table class="data"><thead><tr><th>Plan</th><th>Processus</th><th>Scénario</th><th>Statut</th><th>Avancement</th><th></th></tr></thead><tbody>';
    plans.forEach(function (p) {
      var m = LuoCalc.byId(d, 'processus_micro', p.processus_id);
      var s = LuoCalc.byId(d, 'scenarios', p.scenario_id);
      html += '<tr><td>' + esc(p.id) + '</td><td>' + esc(m ? m.nom : p.processus_id) + '</td><td>' + esc(s ? s.nom : p.scenario_id) + '</td>' +
        '<td><span class="badge status-' + esc(p.statut) + '">' + esc(p.statut || 'brouillon') + '</span></td><td>' + avBar(LuoCalc.avancementPlan(p)) + '</td>' +
        '<td><button class="btn small primary" onclick="LuoUI.openPlan(\'' + esc(p.id) + '\')">Ouvrir (assistant)</button></td></tr>';
    });
    html += '</tbody></table></div>';
  }
  main.innerHTML = html;
}

function renderPlanWizard() {
  var d = state.data, main = document.getElementById('main');
  var p = LuoCalc.byId(d, 'plans_continuite', state.planId);
  var m = LuoCalc.byId(d, 'processus_micro', p.processus_id);
  var s = LuoCalc.byId(d, 'scenarios', p.scenario_id);
  var step = Math.min(state.wizardStep, WIZARD_STEPS.length - 1);
  var html = pageHead('Plan ' + esc(p.id), esc(m ? m.nom : '') + ' × ' + esc(s ? s.nom : ''),
    '<button class="btn" onclick="LuoUI.closePlan()">← Liste des plans</button>' +
    '<button class="btn" onclick="LuoUI.printDeck()">Livrable 16:9</button>');
  html += '<div class="card"><div class="wizard"><div class="wizard-steps">' +
    WIZARD_STEPS.map(function (w, i) {
      return '<button class="wstep' + (i === step ? ' active' : '') + '" onclick="LuoUI.wizardGo(' + i + ')">' + (i + 1) + '. ' + esc(w) + '</button>';
    }).join('') + '</div><div class="wizard-body">' + wizardBody(p, m, s, step) + '</div>' +
    '<div class="wizard-nav"><button class="btn" ' + (step === 0 ? 'disabled' : '') + ' onclick="LuoUI.wizardGo(' + (step - 1) + ')">← Précédent</button>' +
    '<span class="legend-inline">Avancement calculé : ' + LuoCalc.avancementPlan(p) + ' % · un écran, une section</span>' +
    '<button class="btn primary" ' + (step === WIZARD_STEPS.length - 1 ? 'disabled' : '') + ' onclick="LuoUI.wizardGo(' + (step + 1) + ')">Suivant →</button></div></div></div>';
  main.innerHTML = html;
}

function wizardBody(p, m, s, step) {
  var d = state.data;
  if (step === 0) { // étapes de construction
    return '<div class="section-title">Étapes de construction du plan</div>' +
      ETAPES_PLAN.map(function (e) {
        var cur = (p.etapes || []).filter(function (x) { return x.nom === e; })[0] || { nom: e, statut: 'a_faire' };
        return '<label class="etape-check"><input type="checkbox" ' + (cur.statut === 'fait' ? 'checked' : '') +
          ' onchange="LuoUI.toggleEtape(\'' + esc(p.id) + '\',\'' + e + '\',this.checked)"> ' + esc(e) +
          ' <span class="legend-inline">' + esc(cur.statut) + (cur.date ? ' (' + esc(cur.date) + ')' : '') + '</span></label>';
      }).join('') +
      '<div style="margin-top:10px">' + avBar(LuoCalc.avancementPlan(p)) + '</div>' +
      '<div class="section-title">Statut du plan</div>' +
      '<select onchange="LuoUI.setPlanStatut(\'' + esc(p.id) + '\',this.value)">' +
      ['brouillon', 'en_revue', 'valide', 'obsolete'].map(function (st) {
        return '<option ' + (p.statut === st ? 'selected' : '') + '>' + st + '</option>';
      }).join('') + '</select>';
  }
  if (step === 1) { // activités en 4 modes
    var modes = ['maintenue', 'degradee', 'arrete', 'nouvelle'];
    return '<div class="section-title">Activités du processus en crise</div>' +
      (p.activites || []).map(function (a, i) {
        return '<div class="list-row"><span class="badge p' + (modes.indexOf(a.mode) + 1) + '">' + esc(a.mode) + '</span> <span class="grow"><strong>' + esc(a.nom) + '</strong><br><span class="legend-inline">' + esc(a.modalites || '') + (a.duree_arret_min_jours ? ' · arrêt min ' + a.duree_arret_min_jours + ' j' : '') + '</span></span>' +
          '<button class="btn small danger" onclick="LuoUI.delPlanItem(\'' + esc(p.id) + '\',\'activites\',' + i + ')">Suppr.</button></div>';
      }).join('') +
      '<div class="form-grid mt"><label class="field full">Nom de l\'activité<input type="text" id="act-nom"></label>' +
      '<label class="field">Mode<select id="act-mode">' + modes.map(function (md) { return '<option>' + md + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Durée d\'arrêt min (jours, si mode arrêté)<input type="number" id="act-duree" min="0"></label>' +
      '<label class="field full">Modalités (comment on dégrade / maintient sans informatique)<textarea id="act-mod"></textarea></label></div>' +
      '<div class="toolbar mt"><button class="btn primary" onclick="LuoUI.addActivite(\'' + esc(p.id) + '\')">Ajouter l\'activité</button></div>';
  }
  if (step === 2) { // procédures
    return '<div class="section-title">Procédures (existantes ou à créer)</div>' +
      (p.procedures || []).map(function (a, i) {
        return '<div class="list-row"><span class="grow"><strong>' + esc(a.nom) + '</strong> <span class="chip">' + esc(a.statut || '') + '</span> <span class="chip">' + esc(a.support || '') + '</span><br><span class="legend-inline">' + esc(a.reference_document || '') + ' · maj : ' + esc(a.frequence_maj || '—') + '</span></span>' +
          '<button class="btn small danger" onclick="LuoUI.delPlanItem(\'' + esc(p.id) + '\',\'procedures\',' + i + ')">Suppr.</button></div>';
      }).join('') +
      '<div class="form-grid mt"><label class="field full">Nom de la procédure<input type="text" id="pr-nom"></label>' +
      '<label class="field">Statut<select id="pr-statut"><option>existante</option><option>a_creer</option></select></label>' +
      '<label class="field">Support<select id="pr-support"><option>papier</option><option>tableur</option><option>traitement_texte</option><option>numerique_externe</option><option>autre</option></select></label>' +
      '<label class="field full">Référence (classeur rouge…)<input type="text" id="pr-ref"></label></div>' +
      '<div class="toolbar mt"><button class="btn primary" onclick="LuoUI.addProcedure(\'' + esc(p.id) + '\')">Ajouter</button></div>';
  }
  if (step === 3) { // actions récurrentes
    return '<div class="section-title">Actions récurrentes de maintien du plan</div>' +
      (p.actions_recurrentes || []).map(function (a, i) {
        return '<div class="list-row"><span class="grow"><strong>' + esc(a.nom) + '</strong><br><span class="legend-inline">fréquence : ' + esc(a.frequence) + ' · livrable : ' + esc(a.livrable || '—') + ' · prochaine échéance : ' + fmtDate(a.prochaine_echeance) + '</span></span>' +
          '<button class="btn small danger" onclick="LuoUI.delPlanItem(\'' + esc(p.id) + '\',\'actions_recurrentes\',' + i + ')">Suppr.</button></div>';
      }).join('') +
      '<div class="form-grid mt"><label class="field full">Nom<input type="text" id="ar-nom"></label>' +
      '<label class="field">Fréquence<input type="text" id="ar-freq" placeholder="Mensuelle (le 24)"></label>' +
      '<label class="field">Livrable<input type="text" id="ar-liv"></label>' +
      '<label class="field">Prochaine échéance<input type="date" id="ar-ech"></label></div>' +
      '<div class="toolbar mt"><button class="btn primary" onclick="LuoUI.addActionRec(\'' + esc(p.id) + '\')">Ajouter</button></div>';
  }
  if (step === 4) { // fichiers à exporter
    return '<div class="section-title">Fichiers à exporter (PC hors domaine)</div>' +
      (p.fichiers_a_exporter || []).map(function (a, i) {
        return '<div class="list-row"><span class="grow"><strong>' + esc(a.nom) + '</strong> <span class="chip">' + esc(a.format || '') + '</span><br><span class="legend-inline">' + esc(a.contenu || '') + ' · ' + esc(a.frequence || '') + ' · stockage : ' + esc(a.lieu_stockage || '—') + '</span></span>' +
          '<button class="btn small danger" onclick="LuoUI.delPlanItem(\'' + esc(p.id) + '\',\'fichiers_a_exporter\',' + i + ')">Suppr.</button></div>';
      }).join('') +
      '<div class="form-grid mt"><label class="field">Nom<input type="text" id="fx-nom"></label><label class="field">Format<input type="text" id="fx-fmt" placeholder="CSV"></label>' +
      '<label class="field">Fréquence<input type="text" id="fx-freq"></label><label class="field">Lieu de stockage<input type="text" id="fx-lieu"></label>' +
      '<label class="field full">Contenu<input type="text" id="fx-contenu"></label></div>' +
      '<div class="toolbar mt"><button class="btn primary" onclick="LuoUI.addFichier(\'' + esc(p.id) + '\')">Ajouter</button></div>';
  }
  if (step === 5) { // mots de passe
    return '<div class="section-title">Stratégie d\'accès aux mots de passe</div>' +
      (p.mots_de_passe || []).map(function (a, i) {
        return '<div class="list-row"><span class="grow"><strong>' + esc((LuoCalc.byId(d, 'applications', a.application_id) || {}).nom_officiel || a.application_id) + '</strong> <span class="chip">' + esc(a.strategie) + '</span><br><span class="legend-inline">' + esc(a.gestionnaire || '') + '</span></span>' +
          '<button class="btn small danger" onclick="LuoUI.delPlanItem(\'' + esc(p.id) + '\',\'mots_de_passe\',' + i + ')">Suppr.</button></div>';
      }).join('') +
      '<div class="form-grid mt"><label class="field">Application<select id="mdp-app">' + (d.applications || []).map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nom_officiel) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">Stratégie<select id="mdp-strat"><option>export</option><option>memorisation</option><option>non_necessaire</option></select></label>' +
      '<label class="field full">Gestionnaire<input type="text" id="mdp-gest" placeholder="KeePass direction"></label></div>' +
      '<div class="toolbar mt"><button class="btn primary" onclick="LuoUI.addMdp(\'' + esc(p.id) + '\')">Ajouter</button></div>';
  }
  if (step === 6) { // PC hors domaine
    return '<div class="section-title">Inventaire des PC hors domaine</div>' +
      (p.pc_hors_domaine || []).map(function (a, i) {
        return '<div class="list-row"><span class="grow"><strong>' + esc(a.nom) + '</strong><br><span class="legend-inline">' + esc(a.localisation || '') + ' · ' + esc(a.configuration || '') + ' · données : ' + esc(a.donnees || '') + '</span></span>' +
          '<button class="btn small danger" onclick="LuoUI.delPlanItem(\'' + esc(p.id) + '\',\'pc_hors_domaine\',' + i + ')">Suppr.</button></div>';
      }).join('') +
      '<div class="form-grid mt"><label class="field">Nom<input type="text" id="pc-nom" placeholder="PC-RH-01"></label><label class="field">Localisation<input type="text" id="pc-loc"></label>' +
      '<label class="field full">Configuration<input type="text" id="pc-conf"></label><label class="field full">Données présentes<input type="text" id="pc-don"></label></div>' +
      '<div class="toolbar mt"><button class="btn primary" onclick="LuoUI.addPC(\'' + esc(p.id) + '\')">Ajouter</button></div>';
  }
  // step 7 : communication
  var com = p.communication || { interne: {}, externe: {} };
  return '<div class="section-title">Communication interne et externe</div>' +
    ['interne', 'externe'].map(function (volet) {
      var v = com[volet] || {};
      return '<div class="card" style="margin-bottom:12px"><strong>Volet ' + volet + '</strong>' +
        '<dl class="kv" style="margin-top:8px">' +
        '<dt>Reste opérationnel</dt><dd>' + (v.reste_operationnel || []).map(esc).join('<br>') + '</dd>' +
        '<dt>Plus opérationnel</dt><dd>' + (v.plus_operationnel || []).map(esc).join('<br>') + '</dd>' +
        '<dt>Modalités de sollicitation</dt><dd>' + esc(v.modalites_sollicitation || '—') + '</dd>' +
        '<dt>Référent</dt><dd>' + esc(v.referent ? v.referent.nom : '—') + '</dd></dl>' +
        '<div class="form-grid"><label class="field full">Reste opérationnel (un par ligne)<textarea id="com-' + volet + '-ok">' + (v.reste_operationnel || []).join('\n') + '</textarea></label>' +
        '<label class="field full">Plus opérationnel (un par ligne)<textarea id="com-' + volet + '-ko">' + (v.plus_operationnel || []).join('\n') + '</textarea></label>' +
        '<label class="field full">Modalités de sollicitation<input type="text" id="com-' + volet + '-mod" value="' + esc(v.modalites_sollicitation || '') + '"></label>' +
        '<label class="field">Référent communication<input type="text" id="com-' + volet + '-ref" value="' + esc(v.referent ? v.referent.nom : '') + '"></label></div>' +
        '<div class="toolbar"><button class="btn primary" onclick="LuoUI.saveCom(\'' + esc(p.id) + '\',\'' + volet + '\')">Enregistrer le volet ' + volet + '</button></div></div>';
    }).join('');
}

/* ================= 11. Actions =========================================== */

function renderActions() {
  var d = state.data, main = document.getElementById('main');
  var html = pageHead('Actions et relances', 'Suivi par le RSSI en version locale (notifications locales).',
    '<button class="btn primary" onclick="LuoUI.addAction()">+ Action</button>');
  var acts = d.actions || [];
  if (!acts.length) html += '<div class="card"><div class="empty">Aucune action.</div></div>';
  else {
    html += '<div class="card"><table class="data"><thead><tr><th>Descriptif</th><th>Type</th><th>Processus</th><th>Acteur</th><th>Date cible</th><th>Statut</th><th></th></tr></thead><tbody>';
    acts.forEach(function (a) {
      var enRetard = a.statut !== 'fait' && a.statut !== 'annule' && a.date_cible && a.date_cible < today();
      var m = a.processus_id ? LuoCalc.byId(d, 'processus_micro', a.processus_id) : null;
      html += '<tr' + (enRetard ? ' style="background:#fef2f2"' : '') + '><td>' + esc(a.descriptif) + '</td><td>' + esc(a.type || '—') + '</td><td>' + esc(m ? m.nom : '—') + '</td><td>' + esc(a.acteur || '—') + '</td><td>' + fmtDate(a.date_cible) + (enRetard ? ' <span class="badge p1">en retard</span>' : '') + '</td>' +
        '<td><select onchange="LuoUI.setActionStatut(\'' + esc(a.id) + '\',this.value)">' +
        ['a_faire', 'en_cours', 'fait', 'annule'].map(function (st) { return '<option ' + (a.statut === st ? 'selected' : '') + '>' + st + '</option>'; }).join('') +
        '</select></td><td><button class="btn small danger" onclick="LuoUI.del(\'actions\',\'' + esc(a.id) + '\')">Suppr.</button></td></tr>';
    });
    html += '</tbody></table></div>';
  }
  main.innerHTML = html;
}

/* ================= 12. Données : import/export JSON, exemple ============= */

function renderDonnees() {
  var d = state.data, main = document.getElementById('main');
  var stats = Object.keys(d).map(function (k) {
    return Array.isArray(d[k]) ? '<tr><td>' + esc(k) + '</td><td>' + d[k].length + '</td></tr>' : '';
  }).join('');
  var html = pageHead('Données', 'Document JSON conforme au schéma v0.2 — source de vérité unique, stocké en local (IndexedDB).',
    '<button class="btn primary" onclick="LuoUI.exportJSON()">Export JSON</button>' +
    '<button class="btn" onclick="document.getElementById(\'json-in\').click()">Import JSON</button>' +
    '<input type="file" id="json-in" accept=".json,application/json" style="display:none" onchange="LuoUI.importJSON(this)">' +
    '<button class="btn" onclick="LuoUI.loadExemple()">Charger l\'exemple</button>' +
    '<button class="btn danger" onclick="LuoUI.reset()">Réinitialiser</button>');
  html += '<div class="card"><div class="section-title">Contenu courant (schéma ' + esc(d.version_schema || '?') + ')</div>' +
    '<table class="data"><tbody>' + stats + '</tbody></table>' +
    '<p class="legend-inline mt">Organisation : ' + esc(d.organisation ? d.organisation.nom : '—') + ' · référence PCA : ' + esc(d.organisation ? d.organisation.reference_pca : '—') + '</p>' +
    '<p class="legend-inline">Contrat : <code>schema/luo.schema.json</code> (JSON Schema 2020-12, v0.2). L\'export produit un document conforme, réimportable tel quel.</p></div>';
  main.innerHTML = html;
}

/* ================= 13. Livrable deck 16:9 (gabarit exécutif) ============= */

function buildDeck() {
  var d = state.data;
  var sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
  var eff = selectionEffective();
  var slides = '';
  // slide de synthèse
  var micros = d.processus_micro || [];
  var nbSel = micros.filter(function (m) { return eff[m.id]; }).length;
  var plans = d.plans_continuite || [];
  var avTotal = plans.length ? Math.round(plans.reduce(function (s, p) { return s + LuoCalc.avancementPlan(p); }, 0) / plans.length) : 0;
  slides += '<div class="slide"><h2>Luo — Synthèse PCA</h2><h3>' + esc(d.organisation.nom) + (sc ? ' — scénario : ' + esc(sc.nom) : '') + '</h3><div class="slide-body">' +
    '<table class="data"><tbody>' +
    '<tr><td>Processus sélectionnés « à traiter »</td><td><strong>' + nbSel + ' / ' + micros.length + '</strong></td></tr>' +
    '<tr><td>Plans de continuité</td><td>' + plans.length + '</td></tr>' +
    '<tr><td>Avancement global</td><td><strong>' + avTotal + ' %</strong></td></tr>' +
    '<tr><td>Applications actives</td><td>' + (d.applications || []).filter(function (a) { return a.actif !== false; }).length + '</td></tr>' +
    '</tbody></table></div></div>';
  // 1 slide par processus sélectionné (gabarit exécutif)
  micros.filter(function (m) { return eff[m.id]; }).forEach(function (m) {
    var n = sc ? LuoCalc.noteAffichee(d, m, sc.id) : null;
    var plan = plans.filter(function (p) { return p.processus_id === m.id && (!sc || p.scenario_id === sc.id); })[0];
    var acts = plan ? (plan.activites || []) : [];
    var dir = LuoCalc.byId(d, 'directions', m.direction_id);
    slides += '<div class="slide"><h2>' + esc(m.nom) + '</h2><h3>' + esc(dir ? dir.nom : '') + ' · priorité de service : ' + esc(m.priorite_service) + ' · note : ' + (n ? n.valeur + '/16' : '—') + (plan ? ' · avancement ' + LuoCalc.avancementPlan(plan) + ' %' : '') + '</h3><div class="slide-body"><table class="data"><thead><tr><th>Activité</th><th>Mode</th><th>Modalités</th></tr></thead><tbody>' +
      (acts.length ? acts.map(function (a) { return '<tr><td>' + esc(a.nom) + '</td><td>' + esc(a.mode) + '</td><td>' + esc(a.modalites || '') + '</td></tr>'; }).join('') : '<tr><td colspan="3">Aucune activité définie (plan non construit).</td></tr>') +
      '</tbody></table></div></div>';
  });
  return slides;
}

function printDeck() {
  if (!state.scenarioId) { toast('Sélectionnez d\'abord un scénario (onglet Sélection ou Scénarios).'); return; }
  document.getElementById('print-root').innerHTML = buildDeck();
  window.print();
}

/* ================= 14. Actions utilisateur (LuoUI) ====================== */

// selection effective avec exclusions manuelles des présélectionnés
function selectionEffective() {
  var eff = {};
  LuoCalc.selectionPreselectionnee(state.data, state.scenarioId).forEach(function (id) {
    if (!state.exclusions[id]) eff[id] = true;
  });
  Object.keys(state.forces).forEach(function (id) { if (state.forces[id]) eff[id] = true; });
  return eff;
}
state.exclusions = {};

function field(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function fieldChecked(id) { var el = document.getElementById(id); return el ? el.checked : false; }

var LuoUI = {
  go: function (tab) { state.tab = tab; if (tab !== 'plans') state.planId = null; state.wizardStep = 0; render(); },
  setScenario: function (id) { state.scenarioId = id || null; render(); },
  setQuery: function (q) { state.appQuery = q; renderApplications(); },

  toggleCell: function (dep, urg) {
    var d = state.data, sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
    if (!sc) return;
    var eff = selectionEffective();
    var items = (d.processus_micro || []).filter(function (m) {
      var n = LuoCalc.noteAffichee(d, m, sc.id);
      return n && n.dep === dep && LuoCalc.urgenceDe(m.priorite_service) === urg;
    });
    if (!items.length) return;
    var allSel = items.every(function (m) { return eff[m.id]; });
    items.forEach(function (m) {
      var n = LuoCalc.noteAffichee(d, m, sc.id);
      if (allSel) {
        delete state.selection[m.id]; delete state.forces[m.id];
        if (n.valeur >= LuoCalc.SEUIL_PRESELECTION) state.exclusions[m.id] = true;
      } else {
        delete state.exclusions[m.id];
        state.selection[m.id] = true;
        if (n.valeur < LuoCalc.SEUIL_PRESELECTION) state.forces[m.id] = true;
      }
    });
    render();
  },
  toggleProc: function (id) {
    var d = state.data, sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
    var m = LuoCalc.byId(d, 'processus_micro', id);
    if (!m) return;
    var eff = selectionEffective();
    var n = sc ? LuoCalc.noteAffichee(d, m, sc.id) : null;
    if (eff[id]) {
      delete state.selection[id]; delete state.forces[id];
      if (n && n.valeur >= LuoCalc.SEUIL_PRESELECTION) state.exclusions[id] = true;
    } else {
      delete state.exclusions[id];
      state.selection[id] = true;
      if (n && n.valeur < LuoCalc.SEUIL_PRESELECTION) state.forces[id] = true;
    }
    render();
  },

  del: function (coll, id) {
    if (!confirm('Supprimer ' + id + ' de ' + coll + ' ?')) return;
    state.data[coll] = (state.data[coll] || []).filter(function (x) { return x.id !== id; });
    save(); render(); toast('Supprimé : ' + id);
  },

  /* ---- ajouts simples (modales) ---- */
  addEntite: function () {
    modal('<h3>Nouvelle entité</h3><div class="form-grid">' +
      '<label class="field">id<input type="text" id="f-id" value="' + uid('ent') + '"></label>' +
      '<label class="field">Nom<input type="text" id="f-nom"></label>' +
      '<label class="field">Code<input type="text" id="f-code"></label></div>' +
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
      '<button class="btn primary" onclick="LuoUI.saveSimple(\'entites\',{id:field(\'f-id\'),nom:field(\'f-nom\'),code:field(\'f-code\'),active:true})">Créer</button></div>');
  },
  addSite: function () {
    modal('<h3>Nouveau site (localisation géographique)</h3><div class="form-grid">' +
      '<label class="field">id<input type="text" id="f-id" value="' + uid('site') + '"></label>' +
      '<label class="field">Nom<input type="text" id="f-nom" placeholder="DC Paris"></label>' +
      '<label class="field">Localisation (ville, pays)<input type="text" id="f-loc" placeholder="Paris, France"></label>' +
      '<label class="field">Type<select id="f-type"><option>data_center</option><option>site_metier</option><option>autre</option></select></label></div>' +
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
      '<button class="btn primary" onclick="LuoUI.saveSimple(\'sites\',{id:field(\'f-id\'),nom:field(\'f-nom\'),localisation:field(\'f-loc\'),type:field(\'f-type\')})">Créer</button></div>');
  },
  addSI: function () {
    var opts = (state.data.sites || []).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.nom) + '</option>'; }).join('');
    modal('<h3>Nouveau système d\'information</h3><div class="form-grid">' +
      '<label class="field">id<input type="text" id="f-id" value="' + uid('si') + '"></label>' +
      '<label class="field">Nom<input type="text" id="f-nom"></label>' +
      '<label class="field">Type<select id="f-type"><option>gestion</option><option>geographique</option><option>industriel</option><option>batimentaire</option><option>autre</option></select></label>' +
      '<label class="field">Sites d\'hébergement<select id="f-sites" multiple size="4">' + opts + '</select></label></div>' +
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
      '<button class="btn primary" onclick="LuoUI.saveSI()">Créer</button></div>');
  },
  saveSI: function () {
    var sel = document.getElementById('f-sites');
    var sites = Array.prototype.map.call(sel.selectedOptions, function (o) { return o.value; });
    LuoUI.saveSimple('systemes_information', { id: field('f-id'), nom: field('f-nom'), type: field('f-type'), sites_hebergement: sites });
  },
  addDirection: function () {
    var opts = (state.data.entites || []).map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nom) + '</option>'; }).join('');
    modal('<h3>Nouvelle direction</h3><div class="form-grid">' +
      '<label class="field">id<input type="text" id="f-id" value="' + uid('dir') + '"></label>' +
      '<label class="field">Nom<input type="text" id="f-nom"></label>' +
      '<label class="field">Entité<select id="f-ent">' + opts + '</select></label></div>' +
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
      '<button class="btn primary" onclick="LuoUI.saveSimple(\'directions\',{id:field(\'f-id\'),nom:field(\'f-nom\'),entite_id:field(\'f-ent\')})">Créer</button></div>');
  },
  addMacro: function () {
    var dopts = (state.data.directions || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
    modal('<h3>Nouveau processus macro</h3><div class="form-grid">' +
      '<label class="field">id<input type="text" id="f-id" value="' + uid('mac') + '"></label>' +
      '<label class="field">Nom<input type="text" id="f-nom"></label>' +
      '<label class="field">Typologie ISO 9001<select id="f-typ"><option>pilotage</option><option>realisation</option><option>support</option><option>autre</option></select></label>' +
      '<label class="field">Sensibilité (1-4)<input type="number" id="f-sens" min="1" max="4" value="2"></label>' +
      '<label class="field">Direction opérante (support/pilotage transverse)<select id="f-dop"><option value="">(aucune)</option>' + dopts + '</select></label></div>' +
      '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
      '<button class="btn primary" onclick="LuoUI.saveMacro()">Créer</button></div>');
  },
  saveMacro: function () {
    var obj = { id: field('f-id'), nom: field('f-nom'), typologie: field('f-typ'), niveau_sensibilite: parseInt(field('f-sens'), 10) || 2 };
    if (field('f-dop')) obj.direction_operante_id = field('f-dop');
    LuoUI.saveSimple('processus_macro', obj);
  },
  saveSimple: function (coll, obj) {
    if (!obj.id || !obj.nom) { toast('id et nom requis'); return; }
    state.data[coll] = state.data[coll] || [];
    state.data[coll].push(obj);
    save(); closeModal(); render(); toast('Créé : ' + obj.id);
  }
};

/* ---- processus micro : création / édition (qualification) ---- */
function microForm(m) {
  var d = state.data;
  m = m || {};
  var macs = (d.processus_macro || []).map(function (x) { return '<option value="' + esc(x.id) + '"' + (m.macro_id === x.id ? ' selected' : '') + '>' + esc(x.nom) + '</option>'; }).join('');
  var dirs = (d.directions || []).map(function (x) { return '<option value="' + esc(x.id) + '"' + (m.direction_id === x.id ? ' selected' : '') + '>' + esc(x.nom) + '</option>'; }).join('');
  var prios = ['imperatif', '3_jours', '1_semaine', '1_mois', '1_trimestre'].map(function (p) { return '<option' + (m.priorite_service === p ? ' selected' : '') + '>' + p + '</option>'; }).join('');
  var typs = ['pilotage', 'realisation', 'support', 'autre'].map(function (t) { return '<option' + (m.typologie === t ? ' selected' : '') + '>' + t + '</option>'; }).join('');
  var ap = (d.processus_micro || []).filter(function (x) { return x.id !== m.id; }).map(function (x) {
    var sel = (m["s'appuie_sur"] || []).indexOf(x.id) >= 0 ? ' selected' : '';
    return '<option value="' + esc(x.id) + '"' + sel + '>' + esc(x.nom) + '</option>';
  }).join('');
  return '<div class="form-grid">' +
    '<label class="field">id<input type="text" id="f-id" value="' + esc(m.id || uid('mic')) + '"' + (m.id ? ' readonly' : '') + '></label>' +
    '<label class="field">Nom<input type="text" id="f-nom" value="' + esc(m.nom || '') + '"></label>' +
    '<label class="field">Processus macro<select id="f-macro"><option value="">(aucun)</option>' + macs + '</select></label>' +
    '<label class="field">Direction<select id="f-dir">' + dirs + '</select></label>' +
    '<label class="field">Priorité de service<select id="f-prio">' + prios + '</select></label>' +
    '<label class="field">Typologie ISO 9001<select id="f-typ"><option value="">(héritée du macro)</option>' + typs + '</select></label>' +
    '<label class="field full">S\'appuie sur (processus d\'autres directions, ex. DRH)<select id="f-ap" multiple size="4">' + ap + '</select></label></div>';
}

LuoUI.addMicro = function () {
  modal('<h3>Nouveau processus micro</h3>' + microForm(null) +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
    '<button class="btn primary" onclick="LuoUI.saveMicro()">Créer</button></div>');
};
LuoUI.editMicro = function (id) {
  var m = LuoCalc.byId(state.data, 'processus_micro', id);
  if (!m) return;
  var d = state.data;
  // dépendances applications avec niveaux 1-4 cliquables
  var deps = (m.dependances_applications || []);
  var depRows = (d.applications || []).filter(function (a) { return a.actif !== false; }).map(function (a) {
    var cur = deps.filter(function (x) { return x.application_id === a.id; })[0];
    var btns = [0, 1, 2, 3, 4].map(function (n) {
      var on = (cur && cur.niveau === n) || (!cur && n === 0);
      return '<button class="btn small dep-niv' + (on ? ' on n' + Math.max(n, 1) : '') + '" onclick="LuoUI.setDep(\'' + esc(id) + '\',\'' + esc(a.id) + '\',' + n + ')">' + (n === 0 ? '—' : n) + '</button>';
    }).join(' ');
    return '<div class="list-row"><span class="grow">' + esc(a.nom_officiel) + '</span><span>' + btns + '</span></div>';
  }).join('');
  // note manuelle (proposition modifiable) pour le scénario courant
  var sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
  var stockee = sc ? (m.notes_par_scenario || []).filter(function (n) { return n.scenario_id === sc.id; })[0] : null;
  var noteCalc = sc ? LuoCalc.noteCalculee(d, m, sc) : null;
  modal('<h3>Processus micro : ' + esc(m.nom || id) + '</h3>' + microForm(m) +
    '<div class="section-title">Dépendances application par application (niveau 1-4, légende au clic)</div>' +
    '<p class="legend-inline">1 mineur · 2 faible · 3 significatif · 4 critique</p>' + depRows +
    '<div class="section-title">Note du processus' + (sc ? ' — ' + esc(sc.nom) : '') + '</div>' +
    '<p class="legend-inline">Note calculée : ' + (noteCalc === null ? 'non impacté par ce scénario' : noteCalc + '/16 (dépendance ' + LuoCalc.dependanceTic(d, m, sc) + ' × urgence ' + LuoCalc.urgenceDe(m.priorite_service) + ')') +
    (stockee && stockee.modifie_manuellement ? ' · valeur atelier : ' + stockee.valeur + '/16' : '') + '</p>' +
    (sc ? '<div class="form-grid"><label class="field">Valeur affichée (modifiable en atelier)<input type="number" id="f-note" min="1" max="16" value="' + (stockee ? stockee.valeur : (noteCalc || '')) + '"></label>' +
    '<label class="field" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="f-note-mod"' + (stockee && stockee.modifie_manuellement ? ' checked' : '') + '> modifiée manuellement</label></div>' : '') +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
    '<button class="btn primary" onclick="LuoUI.saveMicro(\'' + esc(id) + '\')">Enregistrer</button></div>');
};
LuoUI.setDep = function (micId, appId, niveau) {
  var m = LuoCalc.byId(state.data, 'processus_micro', micId);
  if (!m) return;
  m.dependances_applications = m.dependances_applications || [];
  var cur = m.dependances_applications.filter(function (x) { return x.application_id === appId; })[0];
  if (niveau === 0) {
    m.dependances_applications = m.dependances_applications.filter(function (x) { return x.application_id !== appId; });
  } else if (cur) { cur.niveau = niveau; }
  else { m.dependances_applications.push({ application_id: appId, niveau: niveau, justification: '' }); }
  save();
  LuoUI.editMicro(micId);
};
LuoUI.saveMicro = function (id) {
  var d = state.data;
  var ex = id ? LuoCalc.byId(d, 'processus_micro', id) : null;
  var obj = ex || { id: field('f-id'), dependances_applications: [], notes_par_scenario: [] };
  obj.nom = field('f-nom');
  obj.macro_id = field('f-macro') || undefined;
  obj.direction_id = field('f-dir');
  obj.priorite_service = field('f-prio');
  var typ = field('f-typ'); if (typ) obj.typologie = typ; else delete obj.typologie;
  var sel = document.getElementById('f-ap');
  obj["s'appuie_sur"] = sel ? Array.prototype.map.call(sel.selectedOptions, function (o) { return o.value; }) : [];
  // note manuelle
  var sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
  var noteVal = field('f-note'), mod = fieldChecked('f-note-mod');
  if (sc && noteVal !== '') {
    obj.notes_par_scenario = obj.notes_par_scenario || [];
    var n = obj.notes_par_scenario.filter(function (x) { return x.scenario_id === sc.id; })[0];
    if (!n) { n = { scenario_id: sc.id }; obj.notes_par_scenario.push(n); }
    n.valeur = parseInt(noteVal, 10);
    n.dependance_tic = LuoCalc.dependanceTic(d, obj, sc) || 1;
    n.date_calcul = today();
    n.modifie_manuellement = mod;
  }
  if (!ex) d.processus_micro.push(obj);
  save(); closeModal(); render(); toast('Processus enregistré : ' + obj.id);
};

/* ---- applications ---- */
LuoUI.addApp = function () {
  modal('<h3>Nouvelle application</h3><div class="form-grid">' +
    '<label class="field">id<input type="text" id="f-id" value="' + uid('app') + '"></label>' +
    '<label class="field">Nom officiel<input type="text" id="f-nom"></label>' +
    '<label class="field">Éditeur<input type="text" id="f-ed"></label>' +
    '<label class="field">Hébergement<select id="f-mode"><option>interne</option><option>saas</option><option>cloud_public</option><option>prestataire</option><option>poste_travail</option><option>inconnu</option></select></label>' +
    '<label class="field">Criticité (1-4)<input type="number" id="f-crit" min="1" max="4" value="2"></label></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
    '<button class="btn primary" onclick="LuoUI.saveApp()">Créer</button></div>');
};
LuoUI.saveApp = function () {
  var obj = {
    id: field('f-id'), nom_officiel: field('f-nom'), editeur: field('f-ed') || undefined,
    hebergement: { mode: field('f-mode'), sites: [] },
    criticite: { niveau: parseInt(field('f-crit'), 10) || 1, justification: '' },
    si_operants: [], actif: true
  };
  if (!obj.nom_officiel) { toast('Nom officiel requis'); return; }
  state.data.applications.push(obj); save(); closeModal(); render(); toast('Application créée : ' + obj.id);
};
LuoUI.importCSV = function (input) {
  var f = input.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function () {
    var rows = parseCSV(String(r.result));
    if (!rows.length) { toast('CSV vide'); return; }
    var res = importCSVRows(rows, state.data);
    save(); render();
    toast('Import CMDB : ' + res.ajoutes + ' ajoutées, ' + res.maj + ' mises à jour, ' + res.desactives + ' désactivées (jamais supprimées)');
  };
  r.readAsText(f, 'UTF-8');
  input.value = '';
};
LuoUI.exportCSV = function () {
  var blob = new Blob([exportCSVRows(state.data)], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'luo-applications-cmdb.csv'; a.click();
  toast('Export CSV CMDB (' + CMDB_COLONNES.join(';') + ')');
};

/* ---- scénarios ---- */
LuoUI.addScenario = function () {
  var d = state.data;
  var siOpts = (d.systemes_information || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
  var siteOpts = (d.sites || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
  var entOpts = (d.entites || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
  modal('<h3>Nouveau scénario</h3><div class="form-grid">' +
    '<label class="field">id<input type="text" id="f-id" value="' + uid('sce') + '"></label>' +
    '<label class="field">Nom<input type="text" id="f-nom" placeholder="Mise en sécurité du SI de gestion (ransomware)"></label>' +
    '<label class="field">Type<select id="f-type"><option>ransomware</option><option>ddos</option><option>panne_logicielle</option><option>coupure_electrique</option><option>coupure_reseau</option><option>incendie</option><option>sinistre_batiment</option><option>compromission_saas</option><option>autre</option></select></label>' +
    '<label class="field">Durée min (jours)<input type="number" id="f-min" value="3"></label>' +
    '<label class="field">Durée max (jours)<input type="number" id="f-max" value="21"></label>' +
    '<label class="field">SI impactés<select id="f-si" multiple size="4">' + siOpts + '</select></label>' +
    '<label class="field">Sites impactés<select id="f-sites" multiple size="4">' + siteOpts + '</select></label>' +
    '<label class="field">Entités impactées<select id="f-ent" multiple size="4">' + entOpts + '</select></label>' +
    '<label class="field full">Postulats (un par ligne)<textarea id="f-post">Messagerie interne indisponible\nAccès Internet maintenu</textarea></label></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
    '<button class="btn primary" onclick="LuoUI.saveScenario()">Créer</button></div>');
};
LuoUI.saveScenario = function () {
  function multi(id) { var s = document.getElementById(id); return Array.prototype.map.call(s.selectedOptions, function (o) { return o.value; }); }
  var obj = {
    id: field('f-id'), nom: field('f-nom'), type: field('f-type'),
    si_impactes: multi('f-si'), sites_impactes: multi('f-sites'), entites_impactees: multi('f-ent'),
    duree_indisponibilite_estimee: { min_jours: parseInt(field('f-min'), 10) || 0, max_jours: parseInt(field('f-max'), 10) || 0 },
    postulats: field('f-post').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
    mesures_si_attendues: []
  };
  if (!obj.nom) { toast('Nom requis'); return; }
  state.data.scenarios.push(obj);
  if (!state.scenarioId) state.scenarioId = obj.id;
  save(); closeModal(); render(); toast('Scénario créé : ' + obj.id);
};

/* ---- plans ---- */
LuoUI.addPlan = function () {
  var d = state.data;
  var mOpts = (d.processus_micro || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
  var sOpts = (d.scenarios || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
  modal('<h3>Nouveau plan de continuité (couple processus × scénario)</h3><div class="form-grid">' +
    '<label class="field">Processus micro<select id="f-proc">' + mOpts + '</select></label>' +
    '<label class="field">Scénario<select id="f-sce">' + sOpts + '</select></label></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
    '<button class="btn primary" onclick="LuoUI.savePlan()">Créer</button></div>');
};
LuoUI.savePlan = function () {
  var proc = field('f-proc'), sce = field('f-sce');
  if (!proc || !sce) { toast('Processus et scénario requis'); return; }
  var plan = {
    id: uid('pca'), processus_id: proc, scenario_id: sce, statut: 'brouillon',
    etapes: ETAPES_PLAN.map(function (n) { return { nom: n, statut: 'a_faire' }; }),
    activites: [], procedures: [], actions_recurrentes: [], fichiers_a_exporter: [],
    mots_de_passe: [], pc_hors_domaine: [], communication: { interne: {}, externe: {} }
  };
  state.data.plans_continuite.push(plan);
  save(); closeModal();
  state.planId = plan.id; state.wizardStep = 0; state.tab = 'plans'; render();
  toast('Plan créé : ' + plan.id);
};
LuoUI.openPlan = function (id) { state.planId = id; state.wizardStep = 0; state.tab = 'plans'; render(); };
LuoUI.closePlan = function () { state.planId = null; render(); };
LuoUI.wizardGo = function (i) { state.wizardStep = i; render(); };
LuoUI.toggleEtape = function (planId, nom, checked) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  p.etapes = p.etapes || [];
  var e = p.etapes.filter(function (x) { return x.nom === nom; })[0];
  if (!e) { e = { nom: nom }; p.etapes.push(e); }
  e.statut = checked ? 'fait' : 'a_faire';
  if (checked) e.date = today(); else delete e.date;
  save(); render();
};
LuoUI.setPlanStatut = function (planId, statut) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  p.statut = statut; save(); render();
};
LuoUI.delPlanItem = function (planId, key, idx) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p || !p[key]) return;
  p[key].splice(idx, 1); save(); render();
};
LuoUI.addActivite = function (planId) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  var nom = field('act-nom'); if (!nom) { toast('Nom requis'); return; }
  var a = { nom: nom, mode: field('act-mode'), modalites: field('act-mod') };
  var d = field('act-duree'); if (d) a.duree_arret_min_jours = parseInt(d, 10);
  p.activites = p.activites || []; p.activites.push(a); save(); render();
};
LuoUI.addProcedure = function (planId) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  var nom = field('pr-nom'); if (!nom) { toast('Nom requis'); return; }
  p.procedures = p.procedures || [];
  p.procedures.push({ nom: nom, statut: field('pr-statut'), support: field('pr-support'), reference_document: field('pr-ref') });
  save(); render();
};
LuoUI.addActionRec = function (planId) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  var nom = field('ar-nom'); if (!nom) { toast('Nom requis'); return; }
  p.actions_recurrentes = p.actions_recurrentes || [];
  p.actions_recurrentes.push({ nom: nom, frequence: field('ar-freq'), livrable: field('ar-liv'), prochaine_echeance: field('ar-ech') || undefined });
  save(); render();
};
LuoUI.addFichier = function (planId) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  var nom = field('fx-nom'); if (!nom) { toast('Nom requis'); return; }
  p.fichiers_a_exporter = p.fichiers_a_exporter || [];
  p.fichiers_a_exporter.push({ nom: nom, format: field('fx-fmt'), frequence: field('fx-freq'), lieu_stockage: field('fx-lieu'), contenu: field('fx-contenu') });
  save(); render();
};
LuoUI.addMdp = function (planId) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  p.mots_de_passe = p.mots_de_passe || [];
  p.mots_de_passe.push({ application_id: field('mdp-app'), strategie: field('mdp-strat'), gestionnaire: field('mdp-gest') });
  save(); render();
};
LuoUI.addPC = function (planId) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  var nom = field('pc-nom'); if (!nom) { toast('Nom requis'); return; }
  p.pc_hors_domaine = p.pc_hors_domaine || [];
  p.pc_hors_domaine.push({ nom: nom, localisation: field('pc-loc'), configuration: field('pc-conf'), donnees: field('pc-don') });
  save(); render();
};
LuoUI.saveCom = function (planId, volet) {
  var p = LuoCalc.byId(state.data, 'plans_continuite', planId); if (!p) return;
  p.communication = p.communication || { interne: {}, externe: {} };
  var v = p.communication[volet] = p.communication[volet] || {};
  v.reste_operationnel = field('com-' + volet + '-ok').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  v.plus_operationnel = field('com-' + volet + '-ko').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  v.modalites_sollicitation = field('com-' + volet + '-mod');
  var ref = field('com-' + volet + '-ref'); if (ref) v.referent = { nom: ref };
  save(); render(); toast('Volet ' + volet + ' enregistré');
};

/* ---- actions ---- */
LuoUI.addAction = function () {
  var d = state.data;
  var mOpts = (d.processus_micro || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>'; }).join('');
  modal('<h3>Nouvelle action</h3><div class="form-grid">' +
    '<label class="field full">Descriptif<input type="text" id="f-desc"></label>' +
    '<label class="field">Type<select id="f-type"><option>construction</option><option>recherche</option><option>revalidation</option><option>test</option><option>autre</option></select></label>' +
    '<label class="field">Processus<select id="f-proc"><option value="">(aucun)</option>' + mOpts + '</select></label>' +
    '<label class="field">Acteur<input type="text" id="f-acteur" value="RSSI"></label>' +
    '<label class="field">Date cible<input type="date" id="f-date"></label></div>' +
    '<div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button>' +
    '<button class="btn primary" onclick="LuoUI.saveAction()">Créer</button></div>');
};
LuoUI.saveAction = function () {
  var desc = field('f-desc'); if (!desc) { toast('Descriptif requis'); return; }
  state.data.actions.push({
    id: uid('act'), descriptif: desc, type: field('f-type'),
    processus_id: field('f-proc') || undefined, acteur: field('f-acteur'),
    date_cible: field('f-date') || undefined, statut: 'a_faire'
  });
  save(); closeModal(); render(); toast('Action créée');
};
LuoUI.setActionStatut = function (id, statut) {
  var a = LuoCalc.byId(state.data, 'actions', id); if (!a) return;
  a.statut = statut; save(); render();
};

/* ---- données : JSON ---- */
LuoUI.exportJSON = function () {
  var blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'luo-export-' + today() + '.json'; a.click();
  toast('Export JSON conforme au schéma ' + state.data.version_schema);
};
LuoUI.importJSON = function (input) {
  var f = input.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function () {
    try {
      var doc = JSON.parse(String(r.result));
      if (!doc.version_schema) throw new Error('version_schema absente');
      state.data = doc; state.planId = null; save(); render();
      toast('Import OK — schéma ' + doc.version_schema + ' (' + (doc.processus_micro || []).length + ' processus)');
    } catch (e) { toast('Import refusé : ' + e.message); }
  };
  r.readAsText(f, 'UTF-8');
  input.value = '';
};
LuoUI.loadExemple = function () {
  if (!window.LUO_EXEMPLE) { toast('exemple-donnees.js introuvable'); return; }
  state.data = JSON.parse(JSON.stringify(window.LUO_EXEMPLE));
  if (!state.scenarioId && state.data.scenarios.length) state.scenarioId = state.data.scenarios[0].id;
  save(); render(); toast('Exemple chargé (schéma ' + state.data.version_schema + ')');
};
LuoUI.reset = function () {
  if (!confirm('Réinitialiser toutes les données locales ?')) return;
  state.data = defaultData(); state.planId = null; state.scenarioId = null; save(); render(); toast('Données réinitialisées');
};

LuoUI.printDeck = printDeck;

/* ================= 7b. Cartographie graphique (vue par entité) ========== */

var TYPO_BANDS = [
  ['pilotage', 'Piloter', '#7c3aed'],
  ['realisation', 'Réaliser — valeur pour l\'usager', '#0891b2'],
  ['support', 'Support', '#d97706'],
  ['autre', 'Autre', '#64748b']
];

function dirsDeEntite(d, ent) {
  return (d.directions || []).filter(function (x) { return x.entite_id === ent; }).map(function (x) { return x.id; });
}
function macrosVisibles(d) {
  var macros = d.processus_macro || [];
  if (state.entiteId === 'toutes') return macros;
  var dirsEnt = dirsDeEntite(d, state.entiteId);
  var microsEnt = (d.processus_micro || []).filter(function (m) { return dirsEnt.indexOf(m.direction_id) >= 0; }).map(function (m) { return m.macro_id; });
  return macros.filter(function (mac) {
    if (mac.direction_operante_id) return dirsEnt.indexOf(mac.direction_operante_id) >= 0; // transverse opéré dans l'entité
    return microsEnt.indexOf(mac.id) >= 0;
  });
}
function microsDeMacro(d, macId) {
  var ms = (d.processus_micro || []).filter(function (m) { return m.macro_id === macId; });
  if (state.entiteId === 'toutes') return ms;
  var dirsEnt = dirsDeEntite(d, state.entiteId);
  return ms.filter(function (m) { return dirsEnt.indexOf(m.direction_id) >= 0; });
}

function renderCartographie() {
  var d = state.data, main = document.getElementById('main');
  if (state.cartoVue === 'liste') { renderCartoListe(); return; }
  var entites = d.entites || [];
  var tabs = '<button class="entite-tab' + (state.entiteId === 'toutes' ? ' active' : '') + '" onclick="LuoUI.setEntite(\'toutes\')">Toutes entités</button>' +
    entites.map(function (e) {
      return '<button class="entite-tab' + (state.entiteId === e.id ? ' active' : '') + '" onclick="LuoUI.setEntite(\'' + esc(e.id) + '\')">' + esc(e.nom) + '</button>';
    }).join('');
  var entNom = state.entiteId !== 'toutes' ? ((LuoCalc.byId(d, 'entites', state.entiteId) || {}).nom || '') : '';
  var html = pageHead('Cartographie des processus' + (entNom ? ' — ' + esc(entNom) : ''),
    'Vue graphique par entité. Clic sur une tuile = déplier ses processus micro ; clic sur un micro = détail et activités. Entourage rouge = sélectionné « à traiter ».',
    '<span class="entite-tabs">' + tabs + '</span>' +
    '<button class="btn small" onclick="LuoUI.setCartoVue(\'liste\')">Vue liste</button>' +
    '<button class="btn" onclick="LuoUI.addEntite()">+ Entité</button>' +
    '<button class="btn" onclick="LuoUI.addSite()">+ Site</button>' +
    '<button class="btn" onclick="LuoUI.addSI()">+ SI</button>' +
    '<button class="btn" onclick="LuoUI.addDirection()">+ Direction</button>' +
    '<button class="btn primary" onclick="LuoUI.addMacro()">+ Macro</button>' +
    '<button class="btn primary" onclick="LuoUI.addMicro()">+ Micro</button>');
  var eff = selectionEffective();
  var macros = macrosVisibles(d);
  html += '<div class="carto-map">' +
    '<div class="carto-side left">Besoins des directions utilisatrices · Orientations</div>' +
    '<div class="carto-side right">Valeur produite pour les usagers</div>';
  if (!macros.length) html += '<div class="empty">Aucun processus macro pour cette entité — ajoutez-en avec « + Macro ».</div>';
  TYPO_BANDS.forEach(function (band) {
    var typ = band[0], label = band[1], color = band[2];
    var list = macros.filter(function (m) { return (m.typologie || 'autre') === typ; });
    if (!list.length) return;
    var transverses = list.filter(function (m) { return !!m.direction_operante_id; });
    var propres = list.filter(function (m) { return !m.direction_operante_id; });
    function tile(m) {
      var ms = microsDeMacro(d, m.id);
      var selCount = ms.filter(function (x) { return eff[x.id]; }).length;
      return '<div class="carto-tile typ-' + typ + (state.macroOuvert === m.id ? ' ouverte' : '') + '" onclick="LuoUI.toggleMacro(\'' + esc(m.id) + '\')">' +
        '<span class="code">' + esc(m.id) + '</span>' +
        '<span class="label">' + esc(m.nom) + '</span>' +
        '<span class="meta">sensibilité ' + (m.niveau_sensibilite || '—') + ' · ' + ms.length + ' micro' + (selCount ? ' · ' + selCount + ' sélectionné(s)' : '') + '</span></div>';
    }
    function subrow(m) {
      if (state.macroOuvert !== m.id) return '';
      var ms = microsDeMacro(d, m.id);
      if (!ms.length) return '<div class="carto-subrow"><span class="legend-inline">Aucun processus micro rattaché — ajoutez-en avec « + Micro ».</span></div>';
      return '<div class="carto-subrow">' + ms.map(function (mm) {
        var dir = LuoCalc.byId(d, 'directions', mm.direction_id);
        var n = state.scenarioId ? LuoCalc.noteAffichee(d, mm, state.scenarioId) : null;
        return '<div class="carto-sub' + (eff[mm.id] ? ' selectionne' : '') + '" onclick="LuoUI.openMicroDetail(\'' + esc(mm.id) + '\')">' +
          '<span class="code">' + esc(mm.id) + ' · ' + esc(dir ? dir.nom : '—') + '</span>' +
          '<span class="label">' + esc(mm.nom) + '</span>' +
          '<span class="meta">' + esc(mm.priorite_service) + ' · ' + notePill(n) + '</span></div>';
      }).join('') + '</div>';
    }
    html += '<div class="carto-band"><span class="dot" style="background:' + color + '"></span>' + esc(label) + '</div>';
    if (propres.length) {
      html += '<div class="carto-row">' + propres.map(tile).join('') + '</div>';
      propres.forEach(function (m) { html += subrow(m); });
    }
    if (transverses.length) {
      html += '<div class="carto-dashed"><div class="carto-band"><span class="dot" style="background:' + color + '"></span>' + esc(label) + ' — transverses</div>' +
        '<div class="carto-row">' + transverses.map(tile).join('') + '</div>';
      transverses.forEach(function (m) { html += subrow(m); });
      html += '</div>';
    }
  });
  html += '</div>';
  html += '<div class="carto-legend"><span><span class="dot" style="background:#7c3aed"></span>pilotage</span><span><span class="dot" style="background:#0891b2"></span>réalisation</span><span><span class="dot" style="background:#d97706"></span>support</span><span><span class="dot" style="background:var(--danger)"></span>sélectionné « à traiter »</span></div>';
  main.innerHTML = html;
}

LuoUI.setEntite = function (id) { state.entiteId = id; state.macroOuvert = null; render(); };
LuoUI.setCartoVue = function (v) { state.cartoVue = v; render(); };
LuoUI.toggleMacro = function (id) { state.macroOuvert = (state.macroOuvert === id ? null : id); render(); };

LuoUI.openMicroDetail = function (id) {
  var d = state.data;
  var m = LuoCalc.byId(d, 'processus_micro', id);
  if (!m) return;
  var dir = LuoCalc.byId(d, 'directions', m.direction_id);
  var mac = m.macro_id ? LuoCalc.byId(d, 'processus_macro', m.macro_id) : null;
  var sc = LuoCalc.byId(d, 'scenarios', state.scenarioId);
  var n = sc ? LuoCalc.noteAffichee(d, m, sc.id) : null;
  var deps = (m.dependances_applications || []).map(function (x) {
    var a = LuoCalc.byId(d, 'applications', x.application_id);
    return esc(a ? a.nom_officiel : x.application_id) + ' — niveau ' + x.niveau + ' ' + esc(LuoCalc.NIVEAU_LIB[x.niveau] || '');
  }).join('<br>') || '—';
  var ap = (m["s'appuie_sur"] || []).map(function (x) { var p = LuoCalc.byId(d, 'processus_micro', x); return esc(p ? p.nom : x); }).join(', ') || '—';
  var plans = (d.plans_continuite || []).filter(function (p) { return p.processus_id === id; });
  var planSc = sc ? plans.filter(function (p) { return p.scenario_id === sc.id; })[0] : plans[0];
  var acts = (planSc && planSc.activites) ? planSc.activites : [];
  var actHtml = acts.length ? acts.map(function (a) {
    return '<div class="list-row"><span class="badge p' + (['maintenue', 'degradee', 'arrete', 'nouvelle'].indexOf(a.mode) + 1) + '">' + esc(a.mode) + '</span> <span class="grow"><strong>' + esc(a.nom) + '</strong><br><span class="legend-inline">' + esc(a.modalites || '') + '</span></span></div>';
  }).join('') : '<div class="empty">Aucune activité définie' + (planSc ? ' pour ce plan' : '') + '.</div>';
  modal('<h3>' + esc(m.nom) + '</h3>' +
    '<dl class="kv">' +
    '<dt>id</dt><dd>' + esc(m.id) + '</dd>' +
    '<dt>Macro</dt><dd>' + esc(mac ? mac.nom : '—') + '</dd>' +
    '<dt>Direction</dt><dd>' + esc(dir ? dir.nom : '—') + '</dd>' +
    '<dt>Typologie</dt><dd>' + esc(m.typologie || (mac ? mac.typologie : '—')) + '</dd>' +
    '<dt>Priorité de service</dt><dd>' + esc(m.priorite_service) + '</dd>' +
    '<dt>Note' + (sc ? ' — ' + esc(sc.nom.slice(0, 40)) + '…' : '') + '</dt><dd>' + notePill(n) + '</dd>' +
    '<dt>S\'appuie sur</dt><dd>' + ap + '</dd>' +
    '<dt>Dépendances applis</dt><dd>' + deps + '</dd>' +
    '</dl>' +
    '<div class="section-title">Activités du processus' + (planSc ? ' — plan ' + esc(planSc.id) : '') + '</div>' + actHtml +
    '<div class="modal-actions">' +
    (planSc ? '<button class="btn primary" onclick="LuoUI.openPlan(\'' + esc(planSc.id) + '\')">Ouvrir le plan</button>' : '') +
    '<button class="btn" onclick="LuoUI.editMicro(\'' + esc(m.id) + '\')">Éditer</button>' +
    '<button class="btn danger" onclick="LuoUI.del(\'processus_micro\',\'' + esc(m.id) + '\');closeModal()">Supprimer</button>' +
    '<button class="btn" onclick="closeModal()">Fermer</button></div>');
};

/* ================= 15. Init ============================================= */

window.LuoUI = LuoUI;
window.closeModal = closeModal;
document.querySelectorAll('#tabs .tab').forEach(function (t) {
  t.addEventListener('click', function () { LuoUI.go(t.dataset.tab); });
});
load().then(function () {
  if (!state.data) {
    if (window.LUO_EXEMPLE) {
      state.data = JSON.parse(JSON.stringify(window.LUO_EXEMPLE));
      save();
      toast('Données exemple chargées (schéma ' + state.data.version_schema + ') — onglet Données pour réinitialiser');
    } else { state.data = defaultData(); save(); }
  }
  if (!state.scenarioId && (state.data.scenarios || []).length) state.scenarioId = state.data.scenarios[0].id;
  render();
});

})();
