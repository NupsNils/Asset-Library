# Offene Fragen nach V0.1

Gesammelt während der Umsetzung am 2026-09-16. **Beantwortet am 2026-09-16:**
1 Kopieren passt · 2 Alt bleibt · 3 Ja · 4 Rückfrage bleibt · 5 Look ok · 6 EXE gebaut (`npm run dist`) ·
7 „Immer im Vordergrund“ eingebaut (📌 in der Kopfzeile). Noch offen: 5 (Texturen), 8–10, 12, 14.

## Verhalten

1. **Drag-Out = immer Kopieren.** Electron erlaubt beim nativen Drag nur Copy/Link, Explorer und
   Unity kopieren also immer. Für eine Library ist das eigentlich richtig – oder willst du eine
   Option „nach Drag-Out aus der Library entfernen“?
2. **Alt + Ziehen = intern verschieben.** Ein normales Ziehen geht nach draußen (OS-Drag); das eigene
   Fenster kann dabei kein Drop-Ziel sein (Electron-Einschränkung). Deshalb: Alt gedrückt halten →
   Tile lässt sich auf einen anderen Kategorie-Header ziehen. Passt Alt, oder lieber Shift/Strg?
3. **Kategorie-Label** = `<Name des Library-Ordners>/<Unterordner>`. Bei Library-Pfad
   `MinersFun/Blender` heißt die Wurzel also `Blender`, Unterordner `Blender/Items`. Gewollt so?
4. **Papierkorb mit Rückfrage.** Vor Entf/„In den Papierkorb“ kommt ein Bestätigungsdialog.
   Nervig? (Könnte per Setting abschaltbar sein – Papierkorb bleibt ja als Sicherheitsnetz.)
5. **Import per Drop aus Explorer**: Standard = kopieren, Shift = verschieben. Ordner werden beim
   Import übersprungen. Sollen Ordner rekursiv mit importiert werden?
6. **Ordner ohne passende Dateien** erscheinen nicht als Kategorie (auch nicht leer). OK?

## Thumbnails

7. **Blickwinkel der 3D-Thumbnails**: 3/4-Ansicht von vorne-rechts-oben, Modell automatisch
   eingepasst. Passt der Winkel, oder lieber flacher/frontaler? (Ausrichtung von Blender-5-FBX-
   Exporten ist geprüft: three.js wendet die -90°-X-Rotation korrekt an.)
8. **Clay-Look für FBX/OBJ** (einheitlich grau, keine Texturen), GLB mit eigenen Materialien.
   Sollen Texturen geladen werden, wenn sie neben der Datei liegen?
9. **PSD**: Windows hat ohne Photoshop keinen PSD-Thumbnail-Handler → dann nur „PSD“-Platzhalter.
   Falls das bei dir so ist: `ag-psd` einbauen (liest das eingebettete Composite)?
10. **Tile-Größe** ist fix 128 px. Einstellbar (Slider) gewünscht?

## App / Fenster

11. **„Immer im Vordergrund“**-Schalter, damit das Fenster neben Unity/Blender sichtbar bleibt?
12. Fenstergröße/-position beim nächsten Start wiederherstellen?
13. **Packaging**: `npm run dist` (electron-builder, Installer + Portable) ist vorbereitet, aber
    nicht getestet. Brauchst du eine EXE, oder reicht `npm run dev` erstmal?
14. Wie groß sind deine echten Libraries (Dateianzahl)? Der Watcher beobachtet alle Library-Ordner
    rekursiv – bei vielen tausend Dateien lohnt sich Feintuning.

## Von mir nicht testbar (bitte beim ersten Lauf prüfen)

- Drag-Out in **Unity** (Project-Fenster) und in den Explorer
- Rechtsklick-Kontextmenü, F2-Umbenennen, Alt-Drag, Drop aus dem Explorer
- Hot-Reload im `npm run dev`-Modus beim Bearbeiten der UI
