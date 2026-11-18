# Luo — version locale (v1)

Application web **100 % locale** (HTML + CSS + JavaScript vanilla, aucune dépendance externe,
aucun appel réseau) : ouvrir `index.html` dans un navigateur (double-clic, fonctionne en
`file://`). Données persistées en **IndexedDB** (fallback `localStorage`).

## Contrat de données

Tout document manipulé est conforme à `schema/luo.schema.json` **v0.2** (JSON Schema 2020-12) :
entités, **sites** (localisation géographique), SI, directions, applications (hébergement
**multi-sites actif/passif**), processus macro/micro (typologie ISO 9001, `s'appuie_sur`),
scénarios (`sites_impactes` en ids), plans de continuité (couple processus × scénario),
actions. **Import / export JSON** complet dans l'onglet Données.

## Fonctions v1

| Onglet | Fonction |
|---|---|
| **Tableau de bord** | KPIs, avancement par direction, processus prioritaires (note ≥ 12) pour le scénario courant |
| **Sélection** | **Matrice 4×4** dépendance TIC × urgence à gauche, **cartographie à droite avec entourage rouge** ; présélection automatique **note ≥ 9**, forçage manuel en dessous ; sélection au niveau processus micro |
| **Cartographie** | **Vue graphique par entité, aplatie** : un seul niveau de tuiles = les **processus** (micro), groupés par typologie (pilotage/réalisation/support, transverses en zone pointillée), bandeaux latéraux. **Clic direct sur un processus = détail** (priorité, note, dépendances, `s'appuie_sur`) **et activités du plan** — le niveau macro reste dans le modèle (validation DG) mais n'est plus une étape de navigation. Entourage rouge = sélectionné « à traiter ». Onglets d'entité avec **✎ pour renommer** ; « Vue liste » pour le CRUD complet (✎ sur chaque ligne) |
| **Applications** | Recherche nom/alias, import **CSV CMDB** (`;` UTF-8, réconciliation sur `id_externe`, absentes → `actif=false`, jamais supprimées), export CSV |
| **Scénarios** | SI / sites / entités impactés, postulats, **applications impactées dérivées** |
| **Plans** | Un plan par couple (processus, scénario), **assistant écran par écran** (étapes → activités 4 modes → procédures → actions récurrentes → fichiers à exporter → mots de passe → PC hors domaine → communication), avancement calculé depuis les étapes |
| **Actions** | Suivi, actions en retard |
| **Données** | Export/import JSON, charger l'exemple, réinitialiser. **L'exemple embarqué = tes 2 entités : « Agglomération » (`ent-agglomeration`) et « Ville centre » (`ent-ville-centre`)** (voir `schema/exemple-donnees.json`) |

**Livrable 16:9** (gabarit exécutif : synthèse + 1 slide par processus sélectionné) : bouton
« Livrable 16:9 » puis impression PDF (`@page 13.333in × 7.5in`), sur la charte graphique de Paul
(`docs/charte-graphique.md`).

## Calculs (cadrage v0.3)

- `note = dependance_tic × urgence` (1-16), par scénario, stockée dans `notes_par_scenario` ;
  seuil **≥ 12 = prioritaire**, présélection « à traiter » **≥ 9** ; modifiable en atelier
  (`modifie_manuellement`).
- `dependance_tic` = niveau max des dépendances aux applications impactées par le scénario
  (SI opérant impacté **ou** hébergée sur un site impacté).
- `urgence` : impératif=4, 3 jours=3, 1 semaine=2, 1 mois/1 trimestre=1.
- `avancement` du plan = % d'étapes « fait » (calculé, jamais saisi).

## Fichiers

- `index.html` — structure (topbar + onglets)
- `styles.css` — charte graphique Paul + composants Luo (matrice, cartographie, assistant)
- `app.js` — état (IndexedDB), logique métier (exportée en `LuoCalc` pour tests node), rendus
- `exemple-donnees.js` — jeu de données exemple (généré depuis `schema/exemple-donnees.json` : entités **Agglomération** et **Ville centre**)

## Tests

```bash
node --check local/app.js
node -e "const C=require('./local/app.js'); const d=require('./schema/exemple-donnees.json'); console.log(C.noteCalculee(d, C.byId(d,'processus_micro','mic-paie-a'), C.byId(d,'scenarios','sce-rw-gestion')))"  # 16
```
