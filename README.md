# Gewölbentisch

Ein Battlemap-Editor im Browser für Dungeons, Gebäude, Tempel und mehr.
Läuft auf PC und iPad und exportiert Karten als PNG und als Universal VTT (`.dd2vtt`),
z. B. für Encounter+ oder Foundry VTT.

## Funktionen (Version 0.1)

| Werkzeug | Taste | Bedienung |
|---|---|---|
| Verschieben | `1` | Ansicht ziehen (alternativ: Leertaste halten oder mittlere Maustaste) |
| Raum | `2` | Rechteck ziehen. Modus *Hinzufügen/Entfernen* unten in der Statusleiste (`X`) |
| Pinsel | `3` | Gänge frei malen. Rechte Maustaste radiert |
| Radierer | `4` | Felder entfernen |
| Tür | `5` | Auf einen Durchgang tippen (Kante zwischen zwei Bodenfeldern) |
| Licht | `6` | Lichtquelle auf ein Feld setzen oder entfernen |

- Wände entstehen automatisch an den Rändern der Bodenflächen.
- Zoomen mit Mausrad, Trackpad oder zwei Fingern. `F` passt die Karte ein, `G` schaltet das Raster um.
- Rückgängig/Wiederholen: `Strg/⌘ + Z`, `Strg/⌘ + Y` (bzw. `Strg/⌘ + Shift + Z`).
- Speichern/Öffnen als Projektdatei (`.gewoelbe.json`), `Strg/⌘ + S` / `Strg/⌘ + O`.
- Die aktuelle Karte wird automatisch im Browser zwischengespeichert.

### Export

- **PNG:** 70 Pixel pro Feld (bei sehr großen Karten automatisch weniger, damit es auch auf dem iPad klappt).
- **VTT (`.dd2vtt`):** Universal VTT 0.3 mit Kartenbild, Raster, Wänden (Sichtlinien), Türen (Portale) und Lichtern.

## Entwicklung

Benötigt Node.js 20 oder neuer.

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run check    # Typprüfung
npm run build    # Produktions-Build nach dist/
```

Zum Testen auf dem iPad im selben WLAN: `npm run dev -- --host` und die angezeigte Netzwerk-Adresse öffnen.

## Veröffentlichen mit Cloudflare Pages

1. Im Cloudflare-Dashboard **Workers & Pages → Erstellen → Pages → Mit Git verbinden** wählen.
2. Das GitHub-Repository auswählen.
3. Build-Einstellungen:
   - Framework-Voreinstellung: *Keine* (oder *Svelte*)
   - Build-Befehl: `npm run build`
   - Ausgabeverzeichnis: `dist`
4. Speichern und bereitstellen. Danach baut Cloudflare bei jedem Push automatisch neu.
   Andere Branches bekommen eigene Vorschau-URLs.

## Weitere Sprachen

Alle Texte liegen in `src/lib/i18n/de.ts`. Für eine neue Sprache:

1. `de.ts` kopieren (z. B. nach `en.ts`) und die Texte übersetzen.
2. In `src/lib/i18n/index.ts` unter `dictionaries` und `LOCALES` eintragen.

Sobald mehr als eine Sprache existiert, erscheint die Sprachauswahl in den Karteneinstellungen.
Fehlende Übersetzungen fallen automatisch auf Deutsch zurück.

## Projektstruktur

```
src/
  App.svelte            Oberfläche (Kopfzeile, Werkzeuge, Einstellungen)
  lib/map.ts            Datenmodell: Felder, Wände, Türen, Lichter
  lib/render.ts         Zeichnet die Karte (Editor und Export)
  lib/MapCanvas.svelte  Zeichenfläche mit Maus-, Touch- und Stift-Steuerung
  lib/export.ts         PNG-, VTT- und Projekt-Export
  lib/i18n/             Übersetzungen
```
