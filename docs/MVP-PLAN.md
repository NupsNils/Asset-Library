# Asset Library – MVP-Umsetzungsplan (V0.1)

Stand: 2026-09-16 · Stack: **Electron + React + TypeScript** (electron-vite)

## Ziel
Ein Fenster, das für das aktive Projekt alle Assets aus den eingestellten Library-Ordnern
als einklappbare Kategorien mit Thumbnails zeigt. Dateien lassen sich per nativem Drag & Drop
in Explorer/Unity ziehen, umbenennen, verschieben, in den Papierkorb löschen, per Doppelklick
öffnen und per Drop in eine Kategorie importieren.

## Getroffene Entscheidungen
| Thema | Entscheidung |
|---|---|
| Stack | Electron 3x + React 19 + TS, Build via electron-vite |
| Kategorien | Rekursiv: jeder Ordner mit passenden Dateien = eine flache, einklappbare Kategorie, Label = `<LibraryOrdnername>/<relativer Pfad>` |
| 3D-Preview | Statisches Thumbnail (256 px, gecacht) via three.js in einem versteckten Worker-Fenster; `.blend` über das eingebettete Thumbnail der Datei |
| Bild-Preview | `nativeImage.createThumbnailFromPath` → nutzt die Windows-Shell (sieht aus wie im Explorer, PSD wenn Photoshop-Handler installiert) |
| Drag-Out | `webContents.startDrag({files, icon})` → echtes CF_HDROP, Explorer/Unity **kopieren** immer (Electron erlaubt nur Copy/Link) |
| Drag-In | Drop aus Explorer auf Kategorie → Kopie in den Ordner (`webUtils.getPathForFile`) |
| Löschen | `shell.trashItem` (Papierkorb) |
| Config | `%APPDATA%/asset-library/config.json`, Thumbnail-Cache in `%APPDATA%/asset-library/thumbs/` |
| Standard-Extensions | `.fbx .obj .glb .gltf .blend .png .jpg .jpeg .psd` (in Settings editierbar) |

## Architektur
```
src/
  main/            Electron-Main (Node)
    index.ts       App-Lifecycle, Fenster, Protokolle
    config.ts      Laden/Speichern der Config (Projekte, Settings, eingeklappte Kategorien)
    scanner.ts     Library-Pfade → Kategorien + Dateien
    watcher.ts     chokidar → debounced "library:changed"
    fileops.ts     rename / move / trash / open / import / reveal
    thumbnails.ts  Cache + Bild-Thumbs (nativeImage) + Dispatch an 3D-Worker + .blend-Parser
    blendThumb.ts  eingebettetes Thumbnail aus .blend lesen (TEST-Block, zstd)
    ipc.ts         alle ipcMain.handle-Registrierungen + Kontextmenü
  preload/
    index.ts       contextBridge → window.api (typisiert)
  renderer/        React-UI
    index.html / main.tsx / App.tsx
    store.ts       zustand-Store (Config, Kategorien, Thumb-URLs)
    components/    Header, ProjectMenu, CategorySection, AssetTile, SettingsModal, ProjectModal
    thumb.html / thumbWorker.ts   three.js-Renderer für fbx/obj/glb (verstecktes Fenster)
  shared/
    types.ts       gemeinsame Typen (Project, Settings, Category, AssetFile, Api)
```

### Datenmodell
```ts
Project   { id, name, libraryPaths: string[] }
Settings  { extensions: string[], thumbnailSize: number }
Config    { projects, activeProjectId, settings, collapsed: Record<categoryId, boolean> }
AssetFile { path, name, ext, size, mtimeMs }
Category  { id, label, dirPath, libraryPath, files: AssetFile[] }
```

### Thumbnail-Pipeline
1. Renderer fragt `api.getThumbnail(file)` → Main bildet Cache-Key `sha1(path|mtime|size)`.
2. Cache-Hit → `thumb://<key>.png` (eigenes Protokoll, liest aus dem Cache-Ordner).
3. Cache-Miss: Bilder → `nativeImage.createThumbnailFromPath`; fbx/obj/glb/gltf → Job an das versteckte
   Worker-Fenster (three.js, graues Material, 3-Punkt-Licht, Kamera auf Bounding-Box); `.blend` → eingebettetes
   Thumbnail; sonst Typ-Icon.
4. Ergebnis als PNG in den Cache, URL zurück; Fehler → Typ-Icon.

## Arbeitspakete V0.1 (in dieser Reihenfolge) – Stand 2026-09-16: **alle umgesetzt**
1. **Scaffold** – package.json, electron-vite, tsconfigs, leeres Fenster, npm install
2. **Config + Projekte** – Laden/Speichern, Projekt anlegen/umbenennen/löschen, Library-Pfade per Ordner-Dialog
3. **Scanner + UI-Grundgerüst** – Kategorien einklappbar (Zustand persistiert), Tiles-Grid, Dateiname
4. **Thumbnails Bilder** – Protokoll + nativeImage + Cache
5. **Drag-Out** – startDrag mit Thumbnail als Drag-Icon, Multi-Select per Strg/Shift
6. **Dateiverwaltung** – natives Kontextmenü: Öffnen, Im Explorer zeigen, Umbenennen (inline), Verschieben nach…, Löschen (Papierkorb); Doppelklick öffnen
7. **Watcher** – Auto-Refresh bei Änderungen in den Library-Ordnern
8. **Drag-In** – Drop aus Explorer auf Kategorie-Header/-Fläche → Import; Tile auf anderen Kategorie-Header → Verschieben
9. **3D-Thumbnails** – Worker-Fenster mit three.js (fbx/obj/glb), `.blend`-Parser
10. **Settings** – Extensions, Thumbnail-Größe, Cache leeren
11. **Testdaten + Smoke-Test** – Beispiel-Library mit PNG/FBX/OBJ/GLB/BLEND (per Blender headless erzeugt), Start via `npm run dev`
12. **README + offene Fragen** – siehe `docs/OPEN-QUESTIONS.md`

## Ausblick V0.2+
- Live-3D-Viewer als Detailansicht (Klick aufs Tile)
- Suche/Filter über alle Kategorien, Tags/Favoriten
- Packaging als Installer/Portable (electron-builder), Autostart im Tray
- Mehrere Fenster / „Immer im Vordergrund“-Modus neben Unity
