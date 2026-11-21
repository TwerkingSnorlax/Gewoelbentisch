# Gewölbentisch

Ein Battlemap-Editor im Browser für Dungeons, Gebäude, Tempel und mehr.
Läuft auf PC und iPad und exportiert Karten als PNG und als Universal VTT (`.dd2vtt`),
z. B. für Encounter+ oder Foundry VTT.

## Funktionen

| Werkzeug | Taste | Bedienung |
|---|---|---|
| Verschieben | `1` | Ansicht ziehen (alternativ: Leertaste halten oder mittlere Maustaste) |
| Auswahl | `2` | Objekt antippen und ziehen; Leiste über dem Objekt: Drehen, Duplizieren, Löschen (auch `R`, `Strg/⌘ + D`, `Entf`) |
| Raum | `3` | Rechteck ziehen. Modus *Hinzufügen/Entfernen* unten in der Statusleiste (`X`) |
| Pinsel | `4` | Gänge frei malen. Rechte Maustaste radiert |
| Radierer | `5` | Felder und Objekte entfernen |
| Tür | `6` | Auf einen Durchgang tippen (Kante zwischen zwei Bodenfeldern) |
| Licht | `7` | Lichtquelle auf ein Feld setzen oder entfernen |
| Objekt | `8` | Objekt aus der Palette wählen und antippen. `R` dreht |
| Marke | `9` | Nummerierte Raummarke setzen; antippen öffnet die Beschreibung |

- **Bodenmaterialien:** Stein, Holz, Marmor, Erde, Wasser – unten in der Statusleiste bei Raum und Pinsel als kleine
  Vorschau mit echter Textur und Namen (im Außenbereich: Pflaster, Holzsteg, Steinplatten, Erdweg, Wasser).
- **Stile** (Karte → Stil): Gewölbe, Tempel, Taverne, Höhle, Wald, Grasland. Bestimmen Fels, Wände und Standard-Boden.
  **Wald** ist geschlossen: Ein dichtes Blätterdach bildet die Ränder der Lichtungen (im VTT Wände).
  **Grasland** ist freistehend: Die ganze Karte ist begehbare Wiese ohne automatische Wände; gemalt werden Wege, Wasser
  oder Pflaster mit weichen Rändern. Fels-Felder zwischen zwei Räumen werden als massive Innenwand gezeichnet.
- **Objekte:** 28 selbst gezeichnete Objekte in fünf Gruppen (Gewölbe & Tempel, Einrichtung, Lager, Feuer, Natur mit
  Laub-, Nadel- und großem Baum (gezackte Blattbüschel mit Schatten), Busch, Baumstumpf, Baumstamm, Zelt). Säulen, Statuen, Felsbrocken und Bäume blockieren im VTT die Sicht; Kamin, Lagerfeuer und Feuerschale leuchten.
- **Ebenen:** Boden & Wände, Objekte, Türen, Lichter, Raster – jeweils ein- und ausblendbar und sperrbar.
  Ausgeblendete Ebenen fehlen auch im Export.
- **Zufallsgenerator:** erzeugt eine komplette Karte mit Anfang und Ziel, Räumen mit Aufgabe und einer Geschichte:
  - Gewölbe/Höhle: Eingang vom Kartenrand, Weg über Wachstube, Halle usw. zum Ziel (Grabkammer, Schatzkammer, Lager der
    Bestie …), Nebenräume wie Lager, Kerker, Gruft; die Tür zum Ziel ist immer verschlossen.
  - Tempel: Treppe vom Rand → Vorhalle → Hauptschiff mit Säulen → Allerheiligstes; Seitenräume (Kapelle, Priesterzellen,
    Bibliothek, Sakristei, Krypta-Abgang).
  - Taverne: Gebäude auf der Wiese mit Weg zum Eingang, Schankraum mit Theke und Kamin, dahinter Küche, Vorratskammer,
    Treppe, Gästezimmer.
  - Wald/Grasland: ein Weg von Rand zu Rand durch Lichtungen (Lager, Ruine, Teich, Hain, Jägerrast).
  - Jeder Raum bekommt eine nummerierte **Raummarke** mit Titel und Beschreibung, die Karte einen Namen und eine
    Hintergrundgeschichte. Alles steht unter **Räume** und lässt sich bearbeiten. Raummarken erscheinen im Editor und
    im PNG, nicht im VTT-Bild (das sehen die Spieler). Gleicher Startwert ergibt dieselbe Karte.
- Wände entstehen automatisch an den Rändern der Bodenflächen.
- **Karte wächst automatisch** (Karte → Schalter, Vorgabe an): Wer über den Rand hinaus malt, einen Raum zieht oder
  Objekte und Lichter setzt, vergrößert die Karte in diese Richtung (auch nach links/oben, bis 200 Felder), mit
  2 Feldern Rand. Die Ansicht bleibt dabei stehen. „Auf Inhalt zuschneiden“ entfernt überflüssigen Rand.
- Zoomen mit Mausrad, Trackpad oder zwei Fingern. `F` passt die Karte ein, `G` schaltet das Raster um.
- Rückgängig/Wiederholen: `Strg/⌘ + Z`, `Strg/⌘ + Y` (bzw. `Strg/⌘ + Shift + Z`).
- Speichern/Öffnen als Projektdatei (`.gewoelbe.json`), `Strg/⌘ + S` / `Strg/⌘ + O`.
- Die aktuelle Karte wird automatisch im Browser zwischengespeichert.

### Offline und Aktualisierung

Die App wird als eine einzige HTML-Datei gebaut. Ein Service Worker (`public/sw.js`) hält sie offline bereit:

- Der Start erfolgt immer sofort aus dem Cache, auch ohne Internet.
- Im Hintergrund wird nach einer neuen Version gesucht: beim Öffnen, alle 15 Minuten und beim Zurückwechseln zur App.
- Gibt es eine, erscheint oben die Leiste **„Neue Version verfügbar“** mit *Jetzt neu laden* (speichert die Karte
  und lädt neu) oder *Später* (aktiv beim nächsten Öffnen).
- Auf dem iPad: In Safari *Teilen → Zum Home-Bildschirm*. Dann startet Gewölbentisch wie eine App im Vollbild.
- Die laufende Version steht unter *Karte* (Baudatum und Commit, dazu „offline bereit“).

### Export

- **PNG:** 70 Pixel pro Feld (bei sehr großen Karten automatisch weniger, damit es auch auf dem iPad klappt).
- **VTT (`.dd2vtt`):** Universal VTT 0.3 mit Kartenbild, Raster, Wänden (Sichtlinien), Türen (Portale),
  sichtblockierenden Objekten und Lichtern (inkl. Feuerstellen).
  Lichtfarbe unter *Karte → Lichter im VTT-Export*: Neutral (weiß, Vorgabe), Warm oder Nicht exportieren.
  Encounter+ übernimmt die Lichtfarbe nur, wenn im Import-Dialog „Colored Lights“ eingeschaltet ist.

## Entwicklung

Benötigt Node.js 20 oder neuer.

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run check    # Typprüfung
npm run build    # Produktions-Build nach dist/ (eine HTML-Datei + Service Worker, Manifest, Icons)
npm test         # Build und Browser-Tests (Playwright)
npm run icons    # App-Icons neu erzeugen
```

Zum Testen auf dem iPad im selben WLAN: `npm run dev -- --host` und die angezeigte Netzwerk-Adresse öffnen.

## Veröffentlichen mit Cloudflare

Das Projekt läuft als Cloudflare Worker mit statischen Dateien. Die Einstellungen stehen in `wrangler.jsonc`
(Ausgabeverzeichnis `dist`). Build-Befehl im Dashboard: `npm run build`. Bei jedem Push baut Cloudflare neu;
geöffnete Apps bekommen danach den Hinweis „Neue Version“.

## Weitere Sprachen

Alle Texte liegen in `src/lib/i18n/de.ts`. Für eine neue Sprache:

1. `de.ts` kopieren (z. B. nach `en.ts`) und die Texte übersetzen.
2. In `src/lib/i18n/index.ts` unter `dictionaries` und `LOCALES` eintragen.

Sobald mehr als eine Sprache existiert, erscheint die Sprachauswahl in den Karteneinstellungen.
Fehlende Übersetzungen fallen automatisch auf Deutsch zurück.

## Projektstruktur

```
src/
  App.svelte            Oberfläche (Kopfzeile, Werkzeuge, Paletten, Ebenen, Generator)
  lib/map.ts            Datenmodell: Felder/Materialien, Wände, Türen, Lichter, Objekte, Ebenen
  lib/objects.ts        Objektbibliothek (per Code gezeichnet)
  lib/render.ts         Zeichnet die Karte (Editor und Export), Stile
  lib/generator.ts      Zufallsgenerator
  lib/MapCanvas.svelte  Zeichenfläche mit Maus-, Touch- und Stift-Steuerung
  lib/export.ts         PNG-, VTT- und Projekt-Export
  lib/offline.ts        Service Worker anmelden, Hinweis auf neue Version
  lib/i18n/             Übersetzungen
public/sw.js            Service Worker (Offline-Modus)
tests/                  Browser-Tests (Playwright)
```
