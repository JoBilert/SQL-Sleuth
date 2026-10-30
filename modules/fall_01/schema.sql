-- Schema für "Der verschwundene Schlüssel"
-- 3 Tabellen: personen, raeume, beweise

CREATE TABLE personen (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    rolle TEXT NOT NULL,           -- 'lord', 'butler', 'maid', 'neffe', 'detektiv'
    schulden INTEGER DEFAULT 0,    -- Spielschulden in Pfund
    alibi TEXT                     -- Wo war die Person zur Tatzeit?
);

CREATE TABLE raeume (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    beschreibung TEXT
);

CREATE TABLE beweise (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL,    -- FK zu personen
    raum_id INTEGER NOT NULL,      -- FK zu raeume
    typ TEXT NOT NULL,             -- 'fingerprint', 'zeugnis', 'gegenstand', 'spur'
    beschreibung TEXT,
    zeit TEXT NOT NULL,            -- Uhrzeit HH:MM
    fingerprint_match BOOLEAN DEFAULT 0  -- 1 = passt zum Täter
);

-- Seed Data

INSERT INTO personen (id, name, rolle, schulden, alibi) VALUES
(1, 'Lord Arthur Blackwell', 'lord', 0, 'Im Studierzimmer, las'),
(2, 'James Higgins', 'butler', 500, 'In der Küche, bereitete Tee zu'),
(3, 'Mary Ellis', 'maid', 0, 'Im Schlafzimmer, putzte'),
(4, 'Edward Blackwell', 'neffe', 200, 'Im Garten, spazierte'),
(5, 'Inspector Alistair Crowe', 'detektiv', 0, 'Nicht anwesend');

INSERT INTO raeume (id, name, beschreibung) VALUES
(1, 'Studierzimmer', 'Lord Blackwells Arbeitszimmer mit dem Tresor'),
(2, 'Bibliothek', 'Große Büchersammlung, Zugang zum Studierzimmer'),
(3, 'Küche', 'Hauswirtschaftsraum'),
(4, 'Schlafzimmer', 'Gästezimmer im Obergeschoss'),
(5, 'Garten', 'Hinter dem Haus, Rosengarten'),
(6, 'Eingangshalle', 'Hauptzugang mit Garderobe');

INSERT INTO beweise (id, person_id, raum_id, typ, beschreibung, zeit, fingerprint_match) VALUES
-- Zeugen: Mary war in der Bibliothek (neben Studierzimmer)
(1, 3, 2, 'zeugnis', 'Hörte Schritte im Studierzimmer um 20:10', '20:10', 0),
-- Edward war im Garten
(2, 4, 5, 'zeugnis', 'Sah niemanden am Studierzimmer-Fenster', '20:15', 0),
-- Butler war in der Küche (Alibi)
(3, 2, 3, 'zeugnis', 'Bereitete Tee für Lord Blackwell', '20:05', 0),
-- Fingerabdruck auf dem Brief im Studierzimmer
(4, 2, 1, 'fingerprint', 'Fingerabdruck auf versiegeltem Brief im Tresor', '20:12', 1),
-- Lord Blackwells eigener Fingerabdruck (Kontrolle)
(5, 1, 1, 'fingerprint', 'Fingerabdruck auf Schreibtisch', '19:45', 0),
-- Mysteriöser Gegenstand: Einbruchsspuren am Fenster
(6, 4, 1, 'spur', 'Kratzspuren am Fensterrahmen', '20:18', 0),
-- Mary fand einen verdächtigen Gegenstand
(7, 3, 1, 'gegenstand', 'Ein verkrümmtes Drahtstück (Dietrich?) unter dem Schreibtisch', '20:25', 0);