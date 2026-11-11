// Deutsche Texte. Diese Datei ist die Referenz: Jede weitere Sprache
// übersetzt dieselben Schlüssel (fehlende fallen auf Deutsch zurück).
const de = {
  'app.title': 'Gewölbentisch',
  'app.tagline': 'Battlemap-Editor',
  'map.defaultName': 'Neue Karte',
  'map.name': 'Kartenname',

  'action.new': 'Neu',
  'action.open': 'Öffnen',
  'action.save': 'Speichern',
  'action.undo': 'Rückgängig',
  'action.redo': 'Wiederholen',
  'action.fit': 'Einpassen',
  'action.settings': 'Karte',
  'action.exportPng': 'PNG',
  'action.exportVtt': 'VTT',
  'action.exportPng.title': 'Als PNG-Bild exportieren',
  'action.exportVtt.title': 'Als Universal VTT (.dd2vtt) exportieren, z. B. für Encounter+ oder Foundry',

  'tool.hand': 'Verschieben',
  'tool.room': 'Raum',
  'tool.brush': 'Pinsel',
  'tool.eraser': 'Radierer',
  'tool.door': 'Tür',
  'tool.light': 'Licht',

  'hint.hand': 'Ziehen verschiebt die Ansicht. Mausrad oder zwei Finger zoomen.',
  'hint.room': 'Ziehen, um einen rechteckigen Raum anzulegen.',
  'hint.room.erase': 'Ziehen, um einen rechteckigen Bereich zu entfernen.',
  'hint.brush': 'Über Felder ziehen, um Gänge zu malen. Rechte Maustaste radiert.',
  'hint.eraser': 'Über Felder ziehen, um sie zu entfernen.',
  'hint.door': 'Auf einen Durchgang (Kante zwischen zwei Bodenfeldern) tippen, um eine Tür zu setzen oder zu entfernen.',
  'hint.light': 'Auf ein Feld tippen, um eine Lichtquelle zu setzen oder zu entfernen.',

  'mode.add': 'Hinzufügen',
  'mode.remove': 'Entfernen',

  'settings.title': 'Karteneinstellungen',
  'settings.width': 'Breite (Felder)',
  'settings.height': 'Höhe (Felder)',
  'settings.apply': 'Größe übernehmen',
  'settings.grid': 'Raster anzeigen',
  'settings.language': 'Sprache',
  'settings.close': 'Schließen',

  'confirm.new': 'Die aktuelle Karte verwerfen und eine neue anlegen?',
  'error.open': 'Die Datei konnte nicht gelesen werden. Ist es eine Gewölbentisch-Projektdatei?',
  'error.export': 'Der Export ist fehlgeschlagen.',
} as const;

export default de;
