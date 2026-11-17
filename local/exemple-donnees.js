// Donnees exemple Luo (schema v0.2) - genere depuis schema/exemple-donnees.json
window.LUO_EXEMPLE = {
  "version_schema": "0.2.0",
  "organisation": {
    "nom": "Organisation exemple",
    "reference_pca": "Classeur rouge"
  },
  "entites": [
    {
      "id": "ent-a",
      "nom": "Entite A",
      "code": "A",
      "active": true
    },
    {
      "id": "ent-b",
      "nom": "Entite B",
      "code": "B",
      "active": true
    }
  ],
  "systemes_information": [
    {
      "id": "si-gestion",
      "nom": "SI de gestion",
      "type": "gestion",
      "sites_hebergement": [
        "dc-paris",
        "dc-lyon"
      ]
    },
    {
      "id": "si-indus",
      "nom": "SI industriel",
      "type": "industriel",
      "sites_hebergement": [
        "site-usine-nord"
      ]
    }
  ],
  "sites": [
    {
      "id": "dc-paris",
      "nom": "DC Paris",
      "localisation": "Paris, France",
      "type": "data_center"
    },
    {
      "id": "dc-lyon",
      "nom": "DC Lyon",
      "localisation": "Lyon, France",
      "type": "data_center"
    },
    {
      "id": "site-usine-nord",
      "nom": "Usine nord",
      "localisation": "Nord, France",
      "type": "site_metier"
    }
  ],
  "directions": [
    {
      "id": "dir-rh-a",
      "nom": "Direction RH - Entite A",
      "entite_id": "ent-a",
      "directeur": {
        "nom": "Durand",
        "fonction": "Directrice RH"
      }
    },
    {
      "id": "dir-eau-b",
      "nom": "Direction eau et assainissement - Entite B",
      "entite_id": "ent-b",
      "directeur": {
        "nom": "Le Goff",
        "fonction": "Directeur"
      }
    },
    {
      "id": "dir-jur-a",
      "nom": "Direction affaires generales et juridiques - Entite A",
      "entite_id": "ent-a",
      "directeur": {
        "nom": "Roche",
        "fonction": "Directrice"
      }
    }
  ],
  "applications": [
    {
      "id": "app-paie",
      "nom_officiel": "Silae Paie",
      "alias": [
        {
          "entite_id": "ent-a",
          "nom_local": "Portail paie A"
        },
        {
          "entite_id": "ent-b",
          "nom_local": "Mon espace paie"
        }
      ],
      "editeur": "Silae",
      "categorie": "metier",
      "hebergement": {
        "mode": "saas",
        "accessibilite": "internet",
        "sites": [
          {
            "site_id": "dc-paris",
            "role": "actif"
          },
          {
            "site_id": "dc-lyon",
            "role": "passif"
          }
        ]
      },
      "si_operants": [
        "si-gestion"
      ],
      "criticite": {
        "niveau": 4,
        "justification": "Production mensuelle des bulletins et virements."
      },
      "disponibilite": {
        "horaires_habituels": "7h-20h",
        "jours": "lundi-dimanche",
        "periodes_critiques": [
          {
            "description": "Edition des paies",
            "mois_debut": 1,
            "mois_fin": 12,
            "jours_mois": [
              25,
              26
            ]
          }
        ]
      },
      "disponible_sans_si_interne": {
        "valeur": true,
        "justification": "SaaS accessible depuis Internet, messagerie requise pour l'authentification unique."
      },
      "cmdb": {
        "id_externe": "CMDB-0042",
        "dernier_import": "2026-11-15",
        "source": "Export CMDB mensuel"
      },
      "actif": true
    },
    {
      "id": "app-scada",
      "nom_officiel": "SCADA production eau",
      "alias": [],
      "editeur": "Editeur supervision",
      "categorie": "supervision industrielle",
      "hebergement": {
        "mode": "interne",
        "accessibilite": "reseau_interne",
        "sites": [
          {
            "site_id": "site-usine-nord",
            "role": "actif"
          }
        ]
      },
      "si_operants": [
        "si-indus"
      ],
      "criticite": {
        "niveau": 4,
        "justification": "Conduite de la production d'eau potable."
      },
      "disponible_sans_si_interne": {
        "valeur": false,
        "justification": "Hebergee sur le SI industriel impacte."
      },
      "actif": true
    }
  ],
  "processus_macro": [
    {
      "id": "mac-paie",
      "nom": "Gestion de la paie",
      "description": "Production des elements variables, calcul, validation et virement des paies.",
      "validation": {
        "date": "2026-10-02",
        "validateur": "Direction generale"
      },
      "niveau_sensibilite": 4,
      "typologie": "support"
    },
    {
      "id": "mac-eau",
      "nom": "Production et distribution d'eau potable",
      "description": "Pompage, traitement, distribution, controle qualite.",
      "validation": {
        "date": "2026-10-02",
        "validateur": "Direction generale"
      },
      "niveau_sensibilite": 4,
      "typologie": "realisation"
    },
    {
      "id": "mac-rh",
      "nom": "Gestion des ressources humaines",
      "description": "Processus macro transverse de support, opere par la DRH ; les directions metier s'y appuient via leurs processus locaux (s'appuie_sur).",
      "validation": {
        "date": "2026-10-02",
        "validateur": "Direction generale"
      },
      "niveau_sensibilite": 2,
      "typologie": "support",
      "direction_operante_id": "dir-rh-a"
    }
  ],
  "processus_micro": [
    {
      "id": "mic-paie-a",
      "nom": "Paie entite A",
      "macro_id": "mac-paie",
      "direction_id": "dir-rh-a",
      "priorite_service": "imperatif",
      "typologie": "support",
      "referent_interne": {
        "personne": {
          "nom": "Martin",
          "fonction": "Responsable paie",
          "email": "martin@exemple.fr"
        },
        "date_validation": "2026-11-10",
        "prochaine_revalidation": "2027-11-10"
      },
      "points_contact_usager": [
        {
          "type": "physique",
          "libelle": "Bureau RH, batiment administratif, 2e etage",
          "localisation": "Siège entite A"
        },
        {
          "type": "telephone_portable",
          "libelle": "Portable du service RH (astreinte)"
        }
      ],
      "dependances_applications": [
        {
          "application_id": "app-paie",
          "niveau": 4,
          "justification": "Calcul et edition des bulletins impossibles autrement.",
          "periodes_renforcement": [
            {
              "description": "Edition des paies",
              "mois_debut": 1,
              "mois_fin": 12,
              "jours_mois": [
                25,
                26
              ]
            }
          ]
        }
      ],
      "notes_par_scenario": [
        {
          "scenario_id": "sce-rw-gestion",
          "dependance_tic": 4,
          "valeur": 16,
          "date_calcul": "2026-11-15",
          "modifie_manuellement": false
        }
      ]
    },
    {
      "id": "mic-eau-b",
      "nom": "Conduite production eau",
      "macro_id": "mac-eau",
      "direction_id": "dir-eau-b",
      "priorite_service": "imperatif",
      "typologie": "realisation",
      "referent_interne": {
        "personne": {
          "nom": "Peron",
          "fonction": "Chef de centre",
          "telephone": "06 00 00 00 00"
        },
        "date_validation": "2026-11-12",
        "prochaine_revalidation": "2027-11-12"
      },
      "points_contact_usager": [
        {
          "type": "telephone_portable",
          "libelle": "Astreinte exploitation 24/7"
        }
      ],
      "dependances_applications": [
        {
          "application_id": "app-scada",
          "niveau": 4,
          "justification": "Supervision et conduite des organes de production."
        }
      ]
    },
    {
      "id": "mic-rh-a",
      "nom": "Gestion des absences et conges",
      "macro_id": "mac-rh",
      "direction_id": "dir-rh-a",
      "priorite_service": "1_semaine",
      "typologie": "support",
      "dependances_applications": []
    },
    {
      "id": "mic-absences-jur",
      "nom": "Declaration des absences - direction juridique",
      "direction_id": "dir-jur-a",
      "priorite_service": "3_jours",
      "typologie": "support",
      "s'appuie_sur": [
        "mic-rh-a"
      ],
      "dependances_applications": []
    }
  ],
  "scenarios": [
    {
      "id": "sce-rw-gestion",
      "nom": "Mise en securite du SI de gestion consecutive a un ransomware",
      "type": "ransomware",
      "description": "Ransomware detecte sur le SI de gestion. Mise en securite : coupure des echanges reseaux du SI de gestion, le temps de l'investigation, pour eviter la propagation et preserver les preuves.",
      "postulats": [
        "Messagerie interne indisponible",
        "Gestionnaire de mots de passe interne inaccessible",
        "Acces Internet maintenu depuis les reseaux non compromises",
        "SI industriel, geographique et batimentaire non impactes"
      ],
      "si_impactes": [
        "si-gestion"
      ],
      "sites_impactes": [
        "dc-paris",
        "dc-lyon"
      ],
      "entites_impactees": [
        "ent-a",
        "ent-b"
      ],
      "duree_indisponibilite_estimee": {
        "min_jours": 3,
        "max_jours": 21
      },
      "mesures_si_attendues": [
        {
          "nom": "Restauration des sauvegardes saines",
          "description": "Plan de remediation par la direction informatique et ses prestataires.",
          "prerequis_metier": [
            "Listing des applications a retablir en priorite par processus"
          ]
        },
        {
          "nom": "Mise a disposition de PC hors domaine reconfigurees",
          "prerequis_metier": [
            "Donnees exportees a jour",
            "Mots de passe exportes ou memorises"
          ]
        }
      ]
    },
    {
      "id": "sce-rw-indus",
      "nom": "Mise en securite du SI industriel consecutive a un ransomware",
      "type": "ransomware",
      "description": "Ransomware detecte sur le SI industriel. Conduite en mode manuel, SI de gestion maintenu.",
      "postulats": [
        "SI de gestion operationnel : messagerie et gestionnaire de mots de passe disponibles",
        "Postes de gestion disponibles pour piloter la crise",
        "Supervision indisponible jusqu'a remediation"
      ],
      "si_impactes": [
        "si-indus"
      ],
      "sites_impactes": [
        "site-usine-nord"
      ],
      "entites_impactees": [
        "ent-b"
      ],
      "duree_indisponibilite_estimee": {
        "min_jours": 2,
        "max_jours": 14
      },
      "mesures_si_attendues": [
        {
          "nom": "Analyse forensique et remediation du SI industriel",
          "prerequis_metier": [
            "Dossier papier par installation (plans, configurations)",
            "Procedures de conduite manuelle testees",
            "Releves manuels journaliers des grandeurs de conduite",
            "Moyens de communication hors bande operables"
          ]
        }
      ]
    }
  ],
  "plans_continuite": [
    {
      "id": "pca-paie-a-rw",
      "processus_id": "mic-paie-a",
      "scenario_id": "sce-rw-gestion",
      "statut": "valide",
      "etapes": [
        {
          "nom": "cartographie",
          "statut": "fait",
          "date": "2026-10-02"
        },
        {
          "nom": "identification_applications",
          "statut": "fait",
          "date": "2026-10-15"
        },
        {
          "nom": "qualification",
          "statut": "fait",
          "date": "2026-10-20"
        },
        {
          "nom": "atelier_referent",
          "statut": "fait",
          "date": "2026-11-10"
        },
        {
          "nom": "activites",
          "statut": "fait",
          "date": "2026-11-10"
        },
        {
          "nom": "procedures_actions",
          "statut": "en_cours"
        },
        {
          "nom": "revue_dg",
          "statut": "a_faire"
        },
        {
          "nom": "validation",
          "statut": "a_faire"
        }
      ],
      "activites": [
        {
          "nom": "Collecte des elements variables",
          "mode": "degradee",
          "modalites": "Saisie sur tableur hors domaine, ressaisie au retablissement, renfort ponctuel d'un agent du service.",
          "application_ids": [
            "app-paie"
          ]
        },
        {
          "nom": "Edition et virement des paies",
          "mode": "maintenue",
          "modalites": "SaaS accessible depuis Internet, authentification sans messagerie interne via mots de passe exportes.",
          "application_ids": [
            "app-paie"
          ]
        },
        {
          "nom": "Transmission des bulletins aux agents",
          "mode": "arrete",
          "modalites": "Distribution papier au service RH impossible a l'echelle ; reprise au retablissement.",
          "duree_arret_min_jours": 10,
          "urgence_retablissement": 2
        }
      ],
      "procedures": [
        {
          "nom": "Procedure d'export des donnees de paie",
          "statut": "a_creer",
          "support": "tableur",
          "reference_document": "Classeur rouge RH, onglet exports",
          "responsable_maj": "Martin",
          "frequence_maj": "Mensuelle, le 24"
        }
      ],
      "actions_recurrentes": [
        {
          "nom": "Export mensuel des donnees de paie vers PC hors domaine",
          "frequence": "Mensuelle (le 24)",
          "responsable": "Martin",
          "livrable": "Fichier chiffre sur PC hors domaine RH",
          "derniere_execution": "2026-11-14",
          "prochaine_echeance": "2026-12-14"
        }
      ],
      "fichiers_a_exporter": [
        {
          "nom": "Listing agents",
          "contenu": "Matricule, nom, service, IBAN masque",
          "format": "CSV",
          "frequence": "Mensuelle",
          "responsable": "Martin",
          "lieu_stockage": "PC hors domaine RH"
        }
      ],
      "mots_de_passe": [
        {
          "application_id": "app-paie",
          "strategie": "export",
          "gestionnaire": "KeePass direction",
          "responsable": "Durand"
        }
      ],
      "pc_hors_domaine": [
        {
          "nom": "PC-RH-01",
          "utilisateur": "Martin",
          "localisation": "Bureau RH, coffre ferme",
          "configuration": "LibreOffice, lecteur PDF, pas de domaine",
          "donnees": "Exports mensuels de paie"
        }
      ],
      "communication": {
        "interne": {
          "reste_operationnel": [
            "Paie calculee et viree aux dates prevues"
          ],
          "plus_operationnel": [
            "Transmission des bulletins numeriques"
          ],
          "modalites_sollicitation": "Accueil RH au siege, portable d'astreinte",
          "referent": {
            "nom": "Durand"
          },
          "suppleant": {
            "nom": "Martin"
          }
        },
        "externe": {
          "reste_operationnel": [
            "Virements aux prestataires"
          ],
          "plus_operationnel": [],
          "modalites_sollicitation": "Standard entite A",
          "referent": {
            "nom": "Durand"
          }
        }
      }
    }
  ],
  "actions": [
    {
      "id": "act-1",
      "descriptif": "Rediger la procedure d'export des donnees de paie et la deposer au classeur rouge RH.",
      "type": "construction",
      "processus_id": "mic-paie-a",
      "plan_id": "pca-paie-a-rw",
      "referent": {
        "nom": "Martin"
      },
      "acteur": "RSSI",
      "date_cible": "2026-11-30",
      "statut": "en_cours",
      "recurrence": {
        "frequence": "Ponctuelle puis revalidation annuelle",
        "relances": [
          {
            "delai_jours": 7,
            "canal": "notification_locale"
          }
        ]
      }
    },
    {
      "id": "act-2",
      "descriptif": "Challenger la definition du plan de continuite paie avec le referent interne.",
      "type": "revalidation",
      "processus_id": "mic-paie-a",
      "acteur": "RSSI",
      "date_cible": "2027-11-10",
      "statut": "a_faire",
      "recurrence": {
        "frequence": "Annuelle",
        "relances": [
          {
            "delai_jours": 30,
            "canal": "email"
          }
        ]
      }
    }
  ],
  "utilisateurs": [
    {
      "id": "usr-rssi",
      "nom": "Anthony GUILLERM",
      "email": "anthony.guillerm@exemple.fr",
      "role": "rssi"
    },
    {
      "id": "usr-board-b",
      "nom": "Membre du board entite B",
      "email": "board-b@exemple.fr",
      "role": "board",
      "entites_autorisees": [
        "ent-b"
      ]
    },
    {
      "id": "usr-dir-eau",
      "nom": "Le Goff",
      "email": "legoff@exemple.fr",
      "role": "directeur",
      "directions_autorisees": [
        "dir-eau-b"
      ]
    }
  ]
};
