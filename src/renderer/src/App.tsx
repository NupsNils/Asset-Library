import { useCallback, useEffect, useMemo, useRef, type JSX, type MouseEvent } from 'react'
import type { AssetFile } from '@shared/types'
import { orderedPaths, useStore } from './store'
import { Header } from './components/Header'
import { CategorySection } from './components/CategorySection'
import { ModalHost } from './components/Modals'

export default function App(): JSX.Element {
  const config = useStore((s) => s.config)
  const categories = useStore((s) => s.categories)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const toast = useStore((s) => s.toast)
  const openModal = useStore((s) => s.openModal)
  const anchor = useRef<string | null>(null)

  useEffect(() => {
    void useStore.getState().init()
  }, [])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  // ---- Aktionen ----------------------------------------------------------
  const trash = useCallback(
    (paths: string[]) => {
      if (!paths.length) return
      const names = paths.map((p) => p.split(/[\\/]/).pop()).slice(0, 5)
      openModal({
        type: 'confirm',
        title: 'In den Papierkorb',
        message:
          paths.length === 1
            ? `"${names[0]}" in den Papierkorb verschieben?`
            : `${paths.length} Dateien in den Papierkorb verschieben? (${names.join(', ')}${paths.length > 5 ? ', …' : ''})`,
        onConfirm: () => {
          void window.api.trashFiles(paths).then(async (r) => {
            useStore.getState().reportResult(r, 'gelöscht')
            await useStore.getState().refresh()
          })
        }
      })
    },
    [openModal]
  )

  useEffect(() => {
    return window.api.onFileMenuAction(({ action, paths }) => {
      switch (action) {
        case 'open':
          for (const p of paths) void window.api.openFile(p)
          break
        case 'reveal':
          void window.api.revealFile(paths[0])
          break
        case 'rename':
          useStore.getState().setRenaming(paths[0])
          break
        case 'move':
          openModal({ type: 'move', paths })
          break
        case 'trash':
          trash(paths)
          break
      }
    })
  }, [openModal, trash])

  // ---- Tastatur ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (s.modal || s.renaming) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      switch (e.key) {
        case 'Delete':
          trash(s.selected)
          break
        case 'F2':
          if (s.selected.length === 1) s.setRenaming(s.selected[0])
          break
        case 'F5':
          void s.refresh()
          break
        case 'Escape':
          s.select([])
          break
        case 'a':
          if (e.ctrlKey) {
            e.preventDefault()
            s.select(orderedPaths(s.categories))
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trash])

  // ---- Auswahl -----------------------------------------------------------
  const onTileClick = useCallback(
    (e: MouseEvent, file: AssetFile) => {
      e.stopPropagation()
      const s = useStore.getState()
      if (e.shiftKey && anchor.current) {
        const all = orderedPaths(s.categories)
        const a = all.indexOf(anchor.current)
        const b = all.indexOf(file.path)
        if (a >= 0 && b >= 0) {
          select(all.slice(Math.min(a, b), Math.max(a, b) + 1))
          return
        }
      }
      if (e.ctrlKey) {
        select(s.selected.includes(file.path) ? s.selected.filter((p) => p !== file.path) : [...s.selected, file.path])
      } else {
        select([file.path])
      }
      anchor.current = file.path
    },
    [select]
  )

  const onTileContextMenu = useCallback(
    (e: MouseEvent, file: AssetFile) => {
      e.preventDefault()
      e.stopPropagation()
      const s = useStore.getState()
      const paths = s.selected.includes(file.path) ? s.selected : [file.path]
      if (!s.selected.includes(file.path)) select([file.path])
      window.api.showFileMenu(paths)
    },
    [select]
  )

  // ---- Render ------------------------------------------------------------
  const active = config?.projects.find((p) => p.id === config.activeProjectId) ?? null

  return (
    <div className="app" onClick={() => select([])}>
      <Header />
      <main className="content">
        {!config ? null : !active ? (
          <Empty
            title="Kein Projekt ausgewählt"
            hint="Lege oben links ein Projekt an und füge Library-Ordner hinzu."
            action={{ label: 'Neues Projekt…', onClick: () => openModal({ type: 'project', id: null }) }}
          />
        ) : !active.libraryPaths.length ? (
          <Empty
            title={`"${active.name}" hat noch keine Library-Ordner`}
            hint="Jeder Unterordner mit Assets wird als Kategorie angezeigt."
            action={{ label: 'Ordner hinzufügen…', onClick: () => openModal({ type: 'project', id: active.id }) }}
          />
        ) : !categories.length ? (
          <Empty
            title="Keine Assets gefunden"
            hint={`Gesucht wird nach: ${config.settings.extensions.join(', ')}`}
            action={{ label: 'Dateitypen anpassen…', onClick: () => openModal({ type: 'settings' }) }}
          />
        ) : (
          categories.map((c) => (
            <CategorySection
              key={c.id}
              category={c}
              collapsed={!!config.collapsed[c.id]}
              selected={selectedSet}
              onTileClick={onTileClick}
              onTileContextMenu={onTileContextMenu}
            />
          ))
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
      <ModalHost />
    </div>
  )
}

function Empty({ title, hint, action }: { title: string; hint: string; action: { label: string; onClick: () => void } }): JSX.Element {
  return (
    <div className="empty" onClick={(e) => e.stopPropagation()}>
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      <button className="primary" onClick={action.onClick}>
        {action.label}
      </button>
    </div>
  )
}
