-- Schema i-Rindra pour o2switch (PostgreSQL) -- genere depuis les modeles SQLAlchemy
-- A importer dans phpPgAdmin (base sc3hara3701_i_rindra)

CREATE TYPE role_utilisateur AS ENUM ('direction', 'equipe', 'client');
CREATE TYPE statut_sante AS ENUM ('vert', 'orange', 'rouge');
CREATE TYPE statut_tache AS ENUM ('a_faire', 'en_cours', 'en_revue', 'termine');
CREATE TYPE priorite_tache AS ENUM ('basse', 'moyenne', 'haute');
CREATE TABLE client (
	id SERIAL NOT NULL, 
	nom VARCHAR(150) NOT NULL, 
	contact VARCHAR(150), 
	email VARCHAR(150), 
	telephone VARCHAR(30), 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id)
);
CREATE INDEX ix_client_id ON client (id);
CREATE TABLE utilisateur (
	id SERIAL NOT NULL, 
	nom VARCHAR(100) NOT NULL, 
	prenom VARCHAR(100) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	mot_de_passe_hash VARCHAR(255) NOT NULL, 
	role role_utilisateur NOT NULL, 
	client_id INTEGER, 
	metier VARCHAR(100), 
	actif BOOLEAN NOT NULL, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES client (id) ON DELETE SET NULL
);
CREATE INDEX ix_utilisateur_id ON utilisateur (id);
CREATE UNIQUE INDEX ix_utilisateur_email ON utilisateur (email);
CREATE TABLE projet (
	id SERIAL NOT NULL, 
	nom VARCHAR(200) NOT NULL, 
	description TEXT, 
	client_id INTEGER NOT NULL, 
	responsable_id INTEGER, 
	date_debut DATE, 
	date_fin_prevue DATE, 
	statut_sante statut_sante NOT NULL, 
	avancement_pct INTEGER NOT NULL, 
	archive BOOLEAN NOT NULL, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	modifie_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	CONSTRAINT chk_avancement_pct CHECK (avancement_pct BETWEEN 0 AND 100), 
	FOREIGN KEY(client_id) REFERENCES client (id) ON DELETE RESTRICT, 
	FOREIGN KEY(responsable_id) REFERENCES utilisateur (id) ON DELETE SET NULL
);
CREATE INDEX ix_projet_client_id ON projet (client_id);
CREATE INDEX ix_projet_responsable_id ON projet (responsable_id);
CREATE INDEX ix_projet_id ON projet (id);
CREATE TABLE notification (
	id SERIAL NOT NULL, 
	destinataire_id INTEGER NOT NULL, 
	type VARCHAR(50) NOT NULL, 
	message TEXT NOT NULL, 
	lien VARCHAR(255), 
	lu BOOLEAN NOT NULL, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	FOREIGN KEY(destinataire_id) REFERENCES utilisateur (id) ON DELETE CASCADE
);
CREATE INDEX ix_notification_destinataire_id ON notification (destinataire_id);
CREATE INDEX ix_notification_id ON notification (id);
CREATE TABLE projet_membre (
	id SERIAL NOT NULL, 
	projet_id INTEGER NOT NULL, 
	utilisateur_id INTEGER NOT NULL, 
	role_dans_projet VARCHAR(60), 
	PRIMARY KEY (id), 
	CONSTRAINT uq_projet_membre UNIQUE (projet_id, utilisateur_id), 
	FOREIGN KEY(projet_id) REFERENCES projet (id) ON DELETE CASCADE, 
	FOREIGN KEY(utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE
);
CREATE INDEX ix_projet_membre_projet_id ON projet_membre (projet_id);
CREATE INDEX ix_projet_membre_utilisateur_id ON projet_membre (utilisateur_id);
CREATE INDEX ix_projet_membre_id ON projet_membre (id);
CREATE TABLE tache (
	id SERIAL NOT NULL, 
	projet_id INTEGER NOT NULL, 
	titre VARCHAR(200) NOT NULL, 
	description TEXT, 
	statut statut_tache NOT NULL, 
	priorite priorite_tache NOT NULL, 
	echeance DATE, 
	responsable_id INTEGER, 
	ordre INTEGER NOT NULL, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	modifie_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	FOREIGN KEY(projet_id) REFERENCES projet (id) ON DELETE CASCADE, 
	FOREIGN KEY(responsable_id) REFERENCES utilisateur (id) ON DELETE SET NULL
);
CREATE INDEX ix_tache_responsable_id ON tache (responsable_id);
CREATE INDEX ix_tache_id ON tache (id);
CREATE INDEX ix_tache_projet_id ON tache (projet_id);
CREATE TABLE jalon (
	id SERIAL NOT NULL, 
	titre VARCHAR(200) NOT NULL, 
	description TEXT, 
	projet_id INTEGER NOT NULL, 
	echeance DATE NOT NULL, 
	atteint BOOLEAN, 
	date_atteint TIMESTAMP WITH TIME ZONE, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	modifie_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	FOREIGN KEY(projet_id) REFERENCES projet (id) ON DELETE CASCADE
);
CREATE INDEX ix_jalon_id ON jalon (id);
CREATE INDEX ix_jalon_projet_id ON jalon (projet_id);
CREATE TABLE fichier (
	id SERIAL NOT NULL, 
	projet_id INTEGER NOT NULL, 
	nom VARCHAR(255) NOT NULL, 
	chemin_ou_url TEXT NOT NULL, 
	type_mime VARCHAR(100), 
	taille_octets BIGINT, 
	televerse_par INTEGER, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	FOREIGN KEY(projet_id) REFERENCES projet (id) ON DELETE CASCADE, 
	FOREIGN KEY(televerse_par) REFERENCES utilisateur (id) ON DELETE SET NULL
);
CREATE INDEX ix_fichier_id ON fichier (id);
CREATE INDEX ix_fichier_projet_id ON fichier (projet_id);
CREATE TABLE commentaire_tache (
	id SERIAL NOT NULL, 
	tache_id INTEGER NOT NULL, 
	utilisateur_id INTEGER, 
	contenu TEXT NOT NULL, 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	FOREIGN KEY(tache_id) REFERENCES tache (id) ON DELETE CASCADE, 
	FOREIGN KEY(utilisateur_id) REFERENCES utilisateur (id) ON DELETE SET NULL
);
CREATE INDEX ix_commentaire_tache_id ON commentaire_tache (id);
CREATE INDEX ix_commentaire_tache_tache_id ON commentaire_tache (tache_id);
CREATE TABLE saisie_temps (
	id SERIAL NOT NULL, 
	tache_id INTEGER NOT NULL, 
	utilisateur_id INTEGER NOT NULL, 
	duree_min INTEGER NOT NULL, 
	date DATE DEFAULT CURRENT_DATE NOT NULL, 
	note VARCHAR(500), 
	cree_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	modifie_le TIMESTAMP WITH TIME ZONE DEFAULT now(), 
	PRIMARY KEY (id), 
	CONSTRAINT chk_duree_min_positive CHECK (duree_min > 0), 
	FOREIGN KEY(tache_id) REFERENCES tache (id) ON DELETE CASCADE, 
	FOREIGN KEY(utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE
);
CREATE INDEX ix_saisie_temps_utilisateur_id ON saisie_temps (utilisateur_id);
CREATE INDEX ix_saisie_temps_id ON saisie_temps (id);
CREATE INDEX ix_saisie_temps_tache_id ON saisie_temps (tache_id);
