# Luo - Charte graphique

Reprise de la charte du projet **Paul** (`sklaxs/Paul`, `styles.css`), application 100 % locale
HTML + CSS + JavaScript vanilla. Luo version locale adopte la meme stack et les memes
composants : copier le bloc `:root` et les classes utilitaires ci-dessous dans `styles.css`.

## Tokens (variables CSS `:root`)

| Token | Valeur | Usage |
|---|---|---|
| `--bg` | `#f4f6fb` | fond de page |
| `--surface` | `#ffffff` | cartes, topbar, modales |
| `--ink` | `#17203a` | texte principal (bleu nuit) |
| `--muted` | `#64708b` | texte secondaire |
| `--line` | `#e3e8f2` | bordures |
| `--accent` | `#4f46e5` | indigo : boutons primaires, onglet actif, liens |
| `--accent-soft` | `#eef0ff` | fonds doux (hover onglets, chips) |
| `--danger` | `#dc2626` | erreurs, bouton danger |
| `--ok` | `#059669` | succes, statut fait/termine |
| `--warn` | `#d97706` | avertissement, statut en cours |
| `--p1` | `#dc2626` | priorite 1 / niveau 1 (badge pill) |
| `--p2` | `#ea580c` | priorite 2 / niveau 2 |
| `--p3` | `#ca8a04` | priorite 3 / niveau 3 |
| `--p4` | `#64748b` | priorite 4 / niveau 4 |
| `--radius` | `14px` | rayon des cartes |
| `--shadow` | `0 1px 2px rgba(23,32,58,.06), 0 8px 24px rgba(23,32,58,.07)` | ombre des cartes |

Pour Luo, les niveaux de dependance 1-4 et la note de processus reutilisent `--p1`..`--p4` ;
l'entourage rouge de selection des processus traites (cadrage 4.4) utilise `--danger`.

## Typographie

- Police : `"Segoe UI", "Inter", system-ui, -apple-system, sans-serif`
- Titres de page : 22px ; titres de section (cartes) : 15-18px ; corps : 13px ; en-tetes de
  tableaux : 11px, `uppercase`, `letter-spacing: .06em`, couleur `--muted`.

## Composants

- **Logo** : carre 42px, `border-radius: 12px`, degrade `linear-gradient(135deg, #4f46e5, #06b6d4)`, icone blanche centree.
- **Topbar** : sticky, fond `--surface`, bordure basse `--line`, padding `12px 20px` ; onglets `.tab` pill (padding `9px 16px`, radius 10px, actif = fond `--accent` texte blanc).
- **Boutons** `.btn` : bordure `--line`, radius 10px, padding `9px 14px`, 13px/600 ; `.primary` fond `--accent` ; `.danger` texte `--danger` ; `.small` `5px 10px` 12px.
- **Champs** : bordure `--line`, radius 9px, padding `8px 10px`, 13px ; focus : outline 2px `--accent-soft` + bordure `--accent`. `label.field` : colonne, gap 5px, 12px/600, `--muted`.
- **Cartes** `.card` : fond `--surface`, bordure `--line`, radius `--radius`, `--shadow`, padding 18px.
- **Tableaux** `table.data` : collapse, 13px ; `th` comme ci-dessus, padding `10px 12px` ; `td` padding `11px 12px`, bordure basse `--line` ; hover ligne `#f8faff`.
- **Badges** `.badge` : pill (`border-radius: 999px`, padding `3px 9px`, 11px/700, texte blanc) ; classes `.p1`..`.p4` et statuts (`en_cours` = `--warn`, `fait/termine` = `--ok`, `a_faire` = `--p4`).
- **Chips** `.chip` : pill fond `--accent-soft` texte `--accent`, avec pastille `.dot`.
- **KPI** `.kpi-grid` : grille `repeat(auto-fit, minmax(170px,1fr))`, valeur 26px/800, libelle 12px `--muted`.
- **Modale** : backdrop `rgba(15,23,42,.45)`, carte blanche max-width 640px, radius 16px, ombre forte, padding 24px ; grille de formulaire `.form-grid` 2 colonnes.
- **Deck 16:9** (livrables PCA) : `.slide` max-width 1067px, `aspect-ratio: 16/9`, fond blanc, radius 12px, padding `26px 34px` ; impression PDF `@page { size: 13.333in 7.5in; margin: 0 }` (voir bloc print de Paul).

## Fichiers de reference

- Projet Paul : `sklaxs/Paul` (branche `vibe/paul-rssi-board-dbd049`) — `styles.css` fait foi.
- Luo version locale : meme organisation en `index.html` / `styles.css` / `app.js`, 100 % local
  (IndexedDB), aucune dependance reseau.
