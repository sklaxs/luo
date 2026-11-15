# Luo - Cadrage du developpement

Version 0.2 - 15/11/2026

## 1. Contexte

La demarche actuelle de formalisation des plans de continuite d'activite (PCA) repose sur un
PowerPoint complete direction par direction, processus par processus. Cette methode presente
cinq limites connues :

1. Biais de perimetre : seule le systeme d'information de gestion est cadre. Le SI geographique,
le SI industriel et le SI batimentaire ne sont pas traites.
2. Biais de scenario : seul le scenario ransomware sur le SI de gestion est cadre. Le DDoS, la
panne logicielle, la coupure electrique, la coupure des liens reseaux, l'incendie de data
center ne le sont pas.
3. Cartographie incomplete : les processus sont cartes direction par direction, sans
cartographie macro validee par la direction generale.
4. Ressaisie : plus de 60 processus, autant de fichiers PowerPoint, aucune source de verite
unique. Les applications, referents, procedures et points de contact sont ressaisis partout.
5. Non suivi : l'avancement par direction et les actions recurrentes ne sont pas traces
de maniere consolidated.

La structure comporte 7 entites avec des directions distinctes, une direction informatique
operant pour toutes, et vise une huitieme entite a moyen terme. Un meme logiciel peut porter
un nom different par entite (rebranding).

## 2. Objectifs de Luo

Luo doit permettre, dans un seul outil :

- structurer les cartographies de processus macro (valides direction generale) puis micro
  (par direction), sur plusieurs entités, avec un modele extensible (8e entite sans reconfi);
- recenser les applications, avec leurs alias par entite, leur hebergement, les SI qui les
  operent, leur disponibilite habituelle et leurs periodes critiques (ex : paie);
- qualifier la dependance processus / application (niveau 1 a 4, justification, periodes de
  renforcement) puis la dependance du processus a l'informatique;
- definir plusieurs scenarios de crise informatique au-dela du seul ransomware SI de gestion;
- ventiler chaque processus en activites (maintenues, degradees, arretees, nouvelles) et
  construire le plan de continuite associe a un couple processus / scenario;
- tracer les procedures, actions recurrentes, fichiers a exporter, mots de passe, PC hors
  domaine et volets communication;
- suivre l'avancement de construction des plans, direction par direction, et piloter les
  actions par echeance avec relances;
- presenter les plans a la direction generale sans entrer dans le detail operationnel.

## 3. Principes directeurs

1. Source de verite unique : les donnees vivent dans le modele commun. Le livrable
   PowerPoint est une generation, pas un document a maintenir.
2. Contrat de donnees commun : un schema JSON versionne est partage par les deux versions
   de l'outil (locale et hebergee). Toute evolution du modele incremente ce schema.
3. Multi-SI : chaque application reference le ou les systemes d'information qui l'operent.
   Les scenarios declarent les SI impactes. Un processus est donc impacte ou non selon le
   scenario.
4. Multi-scenario : un meme plan de processus peut se decliner par scenario. Le scenario
   ransomware SI de gestion est le premier, pas l'unique.
5. Multi-entites : entites, directions et processus sont reles par identifiants. L'ajout
   d'une entite est une operation de donnee, pas de structure.
6. Donnees calculees et tracees : la note de processus, l'avancement et les applications
   impactees par scenario sont derives des donnees saisies, jamais ressaisies.
7. Sobriete fonctionnelle : chaque ecran repond a une tache ; pas de fonctionnalite sans
   cas d'usage issu de la demarche PCA ; la complexite est masquee, pas supprimee (voir 4).

## 4. Principes UX

L'effort UX est une exigence de premier rang, au meme titre que le modele de donnees. Trois
objectifs : que la personne comprenne ce qui lui est demande au moment ou on le lui demande,
que l'outil reste simple tant que faire se peut, et que la direction generale lise une
synthese sans se confronter au detail.

### 4.1 Comprendre ce qui est demande

- Saisie par etapes type assistant : un ecran, une question, une reponse. L'utilisateur ne
  voit jamais l'integralite de la fiche en cours de construction.
- Libelles en langage metier, jamais en jargon informatique. Les echelles sont explicites
  au moment du choix : la dependance 1 a 4 affiche sa legende (mineur, faible, significatif,
  critique) avec un exemple, pas dans une aide a part.
- Justifications guidees : chaque champ qualitatif est precede de la question a laquelle il
  repond (pourquoi cette dependance, comment cette activite est degradee).
- Mode atelier : questionnaire imprimable genere par processus pour preparer et mener
  l'atelier avec le referent interne. L'outil le produit depuis les donnees deja saisies
  et sert de support de ressaisie, jamais de double saisie parallele.
- Aides contextuelles : infobulle par champ, exemple pre-rempli grise dans les champs libres.
- Tout champ requis explique sa raison. Rien d'obligatoire cache ou implicite.

### 4.2 Maitriser la complexite

- Un perimetre par ecran : la fiche plan complete n'est jamais affichee d'un bloc, la
  navigation se fait par sections.
- Options avancees repliees par defaut (periodes de renforcement, urgences de
  retablissement, prerequis metier, periodes critiques des applications).
- Reutilisation systematique : referents, points de contact, applications et procedures
  saisis une fois sont proposes automatiquement partout ou ils sont pertonents.
- Pas de parametrage superflu au demarrage : les enumerations du schema font foi ; aucune
  gestion de typologies personnalisables avant qu'un besoin reel n'apparaisse.
- Terminologie unique : un concept, un libelle, dans l'outil comme dans les livrables.
- Erreurs exprimees en consequence metier (ce processus reste incomplet car sa priorite
  de service n'est pas validee), pas en message technique.

### 4.3 Presenter a la direction generale sans entrer dans le detail

- Vue executive par processus : un ecran de synthese avec la note, la priorite de service,
  la repartition des activites (maintenues, degradees, arretees, nouvelles), les durees
  d'arret minimales et l'avancement. Sans les procedures, ni les fichiers a exporter, ni
  la saisie detaillee.
- Vue d'ensemble par direction et par entite : processus les plus prioritaires, avancement,
  actions en retard, revalidations a echeance.
- Deux gabarits de generation de livrable : executif (support de direction generale,
  condense, une a deux diapositives par processus) et complet (fiche referent, alimente le
  classeur rouge). Le gabarit executif est derive du complet, pas redige separement.
- Role board de la version hebergee : acces a la vue executive uniquement.

## 5. Schema de donnees

Reference : schema/luo.schema.json (JSON Schema 2020-12). Un fichier de donnees Luo est un
document JSON conforme a ce schema, utilisable tel quel en import/export par la version
locale, et servi par l'API de la version hebergee.

Objets et relations :

- entite : 7 entites, extensible.
- systeme_information : gestion, geographique, industriel, batimentaire, autre.
- direction : rattachee a une entite.
- application : nom officiel unique + alias par entite, hebergement (interne, SaaS, cloud,
  prestataire, poste), contrat, SI operants (plusieurs possibles), criticite 1-4,
  disponibilite habituelle et periodes critiques, disponibilite attendue sans SI interne,
  reference CMDB. Les applications decommisionnees restent presentes avec actif = false.
- processus_macro : cartographie globale, validee direction generale, avec niveau de
  sensibilite pour orienter les priorites de construction.
- processus_micro : rattache a une direction et a un processus macro. Contient la priorite
  de service (imperatif, 3 jours, 1 semaine, 1 mois, 1 trimestre), le referent interne avec
  date de validation et prochaine revalidation annuelle, les points de contact usager
  (physique, telephone, portable, mail, accueil, avec localisation), les dependances
  application par application (niveau, justification, periodes de renforcement), et la note
  de processus calculee.
- scenario : format libre. Nom, type, description, postulats (messagerie indisponible, acces
  Internet maintenu ou non, etc.), SI impactes, sites et entites impactes, duree estimee,
  mesures SI attendues avec prerequis metier.
- plan_continuite : couple (processus, scenario). Statut, etapes de construction
  (cartographie, identification des applications, qualification, atelier referent, activites,
  procedures et actions, revue DG, validation), avancement calcule, activites en 4 modes,
  procedures, actions recurrentes, fichiers a exporter, mots de passe, PC hors domaine,
  communication interne et externe.
- action : descriptif, type (construction, recherche, revalidation, test), referent, acteur,
  date cible, statut, recurrence avec relances.
- utilisateur : version hebergee uniquement.

Regle de calcul proposee pour la note de processus (a retravailler ensemble, conforme a ce
qui a ete evoque) :

- dependance_tic du processus = niveau maximal de dependance des applications impactees
  par le scenario ;
- urgence derivee de la priorite de service : imperatif = 4, 3 jours = 3, 1 semaine = 2,
  1 mois ou 1 trimestre = 1 ;
- note = dependance_tic x urgence, de 1 a 16 ;
- seuil propose : note superieure ou egale a 12 = processus prioritaire dans le PCA du
  scenario considere.

L'outil doit afficher cette note comme proposition modifiable, pour garder la main sur la
qualification finale en atelier.

Regle de derivation des applications impactees par scenario : une application est impactee
si au moins un SI operant est liste dans si_impactes, ou si son hebergement est localise sur
un site impacte. Les applications hebergees hors SI interne (SaaS, Internet) restent
disponibles sauf si le scenario vise explicitement le SI de gestion (messagerie, gestionnaire
de mots de passe). C'est le role des postulats du scenario de trancher ces cas limites.

## 6. Modules fonctionnels

### 6.1 Entites et cartographie

- Saisie des entites, directions, referents de direction.
- Cartographie macro : visualisation de l'ensemble des processus macro, validation DG,
  niveau de sensibilite pour orienter ou commencer.
- Navigation proposee : processus macro -> directions qui l'operent (toutes entités) ->
  processus micro de chaque direction. La gymnastique macro / micro s'appuiera sur les
  pratiques usuelles de cartographie des processus (typologie ISO 9001 : processus de
  pilotage, de realisation, de support) ; a documenter avant implementation.

### 6.2 Applications

- Import CSV depuis la CMDB : colonnes id externe, nom officiel, editeur, hebergement,
  SI operants, criticite. Reimport regulier : reconciliation par id externe, ajout des
  nouvelles applications, passage en actif = false des absentes, jamais de suppression.
- Export CSV vers la CMDB ou l'outil GRC : nom, criticite, dependances processus, note.
- Gestion des alias : le nom officiel fait foi, l'alias entite sert a la saisie et a la
  recherche. Une recherche doit trouver l'application quel que soit le nom local utilise.
- Disponibilite : horaires habituels, jours, periodes critiques calendarisees.

### 6.3 Qualification

- Par processus : selection des applications dependantes, niveau 1-4 avec justification
  obligatoire, periodes de renforcement (ex : dependance accrue en fin de mois pour la paie).
- Priorite de service du processus, validable en atelier avec le directeur puis le referent
  interne (double validation tracee).
- Note de processus calculee par scenario, modifiable.
- Mode atelier : generation du questionnaire imprimable du processus pour l'atelier.

### 6.4 Scenarios

Catalogue initial propose (chacun devant justifier un PCA des sa duree estimee depasse la
demi-journee) :

1. Ransomware avec mise en securite du SI de gestion (scenario actuel).
2. Ransomware avec mise en securite du SI industriel.
3. Ransomware avec mise en securite du SI geographique.
4. Ransomware avec mise en securite du SI batimentaire.
5. DDoS prolonge sur les services exposes.
6. Panne logicielle majeure (éditeur, SaaS) ou regression apres mise a jour.
7. Coupure electrique prolongee des sites.
8. Coupure des liens reseaux principaux (opérateur, boucle locale).
9. Incendie ou sinistre d'un data center.
10. Compromission d'un compte d'administration d'un SaaS critique.

Format libre pour la description, avec postulats obligatoires pour fixer les regles de
derivation (messagerie, Internet, mots de passe).

### 6.5 Mesures SI attendues et prerequis metier

Chaque scenario liste les mesures que la direction informatique operera, et pour chacune
le travail attendu de la direction metier en amont. Exemples pour un ransomware SI de
gestion : export des mots de passe des applications hebergees, donnees exportees sur PC
hors domaine, listing des fichiers a exporter. Exemples proposes pour un ransomware SI
industriel (reponse a la question ouverte) :

- dossier papier par installation : plans, schemas, configurations des automates et
  organes de commande, nomenclatures des capteurs ;
- procedures de conduite en mode manuel consignees et testees (vannes, by-pass, modes
  degradés documentes) ;
- consignes de releve manuel chronique des grandeurs utiles (compteurs, pressions,
  temperatures), avec points de mesure arretes et periodicite ;
- moyens de communication hors bande entre exploitation, supervision et direction
  informatique (radios, telephones portable du reseau de gestion) ;
- listing papier des prestataires de maintenance et integrateurs avec numeros d'astreinte ;
- consignation pendant l'indisponibilite : journal des actions manuelles effectuees, pour
  resynchroniser le SI au retablissement ;
- convention ecrite avec la direction informatique sur les fenetres de reprise et les
  priorites de retablissement des organes de conduite.

### 6.6 Plans de continuite

Pour chaque couple processus / scenario, la fiche reprend la structure actuelle du
PowerPoint, en richer :

- referent interne, avec echeance de revalidation annuelle automatique (action generee) ;
- points de contact usager multiples et types ;
- activites : maintenue, degradee (avec modalites : triage, renforts externes, charge
  accrue), arrete (avec duree minimale et rang d'urgence de retablissement), nouvelle ;
- procedures : existantes (papier, tableur) ou a creer (ex : procedure d'export de
  donnees), reference, responsable et frequence de mise a jour, presence au classeur rouge ;
- actions recurrentes de maintien du plan : livrable, frequence, responsable, derniere
  execution, prochaine echeance ;
- fichiers a exporter : contenu, format, frequence, responsable, lieu de stockage (PC
  hors domaine) ;
- mots de passe : strategie par application (export, memorisation, non necessaire) ;
- PC hors domaine : inventaire, configuration, donnees presentes ;
- communication interne et externe : ce qui reste operationnel, ce qui ne l'est plus,
  modalites de sollicitation, referent communication et suppleant, exportables vers les
  equipes communication.

La fiche est construite ecran par ecran selon les principes UX (section 4), jamais affichee
comme un formulaire unique.

### 6.7 Reporting

- Avancement par direction : pourcentage issu des etapes de chaque plan, vue par entite
  et globale.
- Vue direction generale : synthese executive par direction (processus prioritaires,
  avancement, actions en retard, revalidations dues), sans detail operationnel. C'est la
  vue par defaut du role board.
- Vue referents : date de derniere validation, prochaine revalidation annuelle, alertes.
- Vue applications : couverture de la cartographie (applications sans processus dependant,
  processus critiques sans application identifiee).

### 6.8 Actions et relances

- Action : descriptif, referent, acteur, date cible, statut, notes. En version locale,
  suivi par le RSSI seul, avec interrogation ponctuelle des acteurs.
- Actions recurrentes : frequence, relances parametrables (delai en jours, canal).
- Version hebergee : envoi de mails automatiques avant echeance, lien vers l'action,
  traitement fait / non fait depuis le mail.

## 7. Architecture

Deux versions construites en parallele, meme contrat de donnees.

### 7.1 Version locale

- Application HTML / JavaScript, execution integrale sur le poste du RSSI, aucune
  dependance reseau.
- Stockage : IndexedDB (ou localStorage selon volume), persistant entre sessions.
- Import / export JSON complet (fichier conforme au schema) : sauvegarde, restauration,
  transfert vers la version hebergee.
- Import / export CSV des applications (aller-retour CMDB).
- Generation du livrable : export du plan de processus en presentation (bibliotheque de
  generation type PptxGenJS) avec les deux gabarits executif et complet, et en classeur
  rouge imprimable (PDF).
- Relances : notifications locales uniquement.

### 7.2 Version hebergee

- Back-end Django (maturite securitaire : CSRF, auth, permissions, audit) avec API REST.
- Modele de donnees : miroir du schema JSON ; l'import / export JSON sert de pont avec la
  version locale.
- Authentification et roles :
  - rssi : administration complete, tous perimetres ;
  - board : lecture seule des PCA de son entite, vue executive uniquement ;
  - directeur : lecture et ecriture des processus de sa direction ;
  - referent : edition des processus dont il est referent.
- Relances mail automatiques planifiees (taches periodiques type Celery) sur les actions
  et revalidations.
- Journalisation des acces et modifications.

### 7.3 Compatibilite locale / hebergee

Le schema JSON versionne est le contrat. Toute evolution se fait dans le schema d'abord,
puis dans les deux versions. Les versions de donnees importees plus anciennes sont migrees
vers la version courante a l'import (regles de migration versionnees).

## 8. Livrables generes

- Presentation de direction generale par processus (structure actuelle du PowerPoint :
  cartographie, evaluation du besoin de continuite, logiciels, plan, elements globaux,
  communication interne et externe), declinable par scenario, en deux gabarits : executif
  (synthese par processus, une a deux diapositives) et complet (fiche referent).
- Classeur rouge : document consolide de la direction regroupant procedures, actions
  recurrentes, fichiers a exporter, inventaire des PC hors domaine, mots de passe.
- Vue de synthese board : avancement par direction, processus prioritaires, echeances.

## 9. Roadmap proposee

MVP version locale :

1. Maquettes UX des parcours de saisie (assistant par etape) et de la vue executive,
   validees avant implementation.
2. Modele de donnees + import / export JSON.
3. Entites, directions, SI, cartographie macro et micro.
4. Applications, import CSV, alias, disponibilite.
5. Qualification processus (dependances, priorite, note calculee), questionnaire atelier.
6. Scenario ransomware SI de gestion + derivation des applications impactees.
7. Fiche plan de continuite complete (activites, procedures, actions recurrentes,
   exports, mots de passe, PC hors domaine, communication), ecran par ecran.
8. Reporting avancement par direction + vue executive direction generale.
9. Generation du livrable presentation, gabarits executif et complet.

MVP version hebergee :

1. Modele Django miroir du schema, API REST, import / export JSON.
2. Authentification et roles (rssi, board, directeur, referent).
3. Edition des processus par les directions et referents.
4. Relances mail.
5. Vue executive board.

Ensuite : autres scenarios du catalogue, generation classeur rouge, revalidations
automatiques, export GRC.

## 10. Points ouverts

1. Formule de la note de processus : la proposition dependance x urgence (1-16, seuil 12)
   doit etre validee ou remplacee (matrice ?).
2. Typologie macro / micro : s'appuyer sur une reference type ISO 9001 a trancher.
3. Granularite des plans : un plan par couple processus / scenario, ou un plan par
   processus declinable en sections par scenario ? Le schema retient le couple.
4. Regles de reconciliation CMDB : colonnes exactes du CSV, identifiant technique.
5. Perimetre de la version hebergee sur le SI : hebergement interne ou cloud de
   collectivite, conditions de son ouverture aux directions.
6. Contenu exact du gabarit executif : nombre de diapositives, niveau de detail des
   activites, a valider sur un cas reel avant generalisation.
