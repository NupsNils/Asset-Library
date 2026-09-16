import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { Settings } from '@shared/types'
import { useStore, type Modal as ModalState } from '../store'

// ---------------------------------------------------------------------------
// Generischer Modal-Rahmen
// ---------------------------------------------------------------------------
function Modal({ title, children, onClose, width }: { title: string; children: ReactNode; onClose: () => void; width?: number }): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-label={title}>
        <div className="modal-title">
          {title}
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function ModalHost(): JSX.Element | null {
  const modal = useStore((s) => s.modal)
  const close = (): void => useStore.getState().openModal(null)
  if (!modal) return null
  switch (modal.type) {
    case 'settings':
      return <SettingsModal onClose={close} />
    case 'project':
      return <ProjectModal id={modal.id} onClose={close} />
    case 'move':
      return <MoveModal paths={modal.paths} onClose={close} />
    case 'confirm':
      return <ConfirmModal modal={modal} onClose={close} />
    case 'help':
      return <HelpModal onClose={close} />
  }
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------
function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const config = useStore((s) => s.config)
  const saveSettings = useStore((s) => s.saveSettings)
  const showToast = useStore((s) => s.showToast)
  const [exts, setExts] = useState(config?.settings.extensions.join(', ') ?? '')
  const [size, setSize] = useState(String(config?.settings.thumbnailSize ?? 256))

  const save = async (): Promise<void> => {
    const s: Settings = {
      extensions: exts.split(/[,\s]+/),
      thumbnailSize: Number(size),
      alwaysOnTop: config?.settings.alwaysOnTop ?? false
    }
    await saveSettings(s)
    onClose()
  }
  const clearCache = async (): Promise<void> => {
    await window.api.clearThumbCache()
    useStore.setState({ thumbs: {} })
    showToast('Thumbnail cache cleared')
  }
  return (
    <Modal title="Settings" onClose={onClose}>
      <label className="field">
        <span>File types (comma-separated)</span>
        <input value={exts} onChange={(e) => setExts(e.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>Thumbnail size (px)</span>
        <input type="number" min={64} max={1024} step={32} value={size} onChange={(e) => setSize(e.target.value)} />
      </label>
      <div className="row">
        <button onClick={() => void clearCache()}>Clear thumbnail cache</button>
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Projekt anlegen / bearbeiten
// ---------------------------------------------------------------------------
function ProjectModal({ id, onClose }: { id: string | null; onClose: () => void }): JSX.Element {
  const config = useStore((s) => s.config)
  const applyConfig = useStore((s) => s.applyConfig)
  const refresh = useStore((s) => s.refresh)
  const openModal = useStore((s) => s.openModal)
  const project = config?.projects.find((p) => p.id === id) ?? null
  const [name, setName] = useState(project?.name ?? '')
  const [projectId, setProjectId] = useState<string | null>(id)
  const current = config?.projects.find((p) => p.id === projectId) ?? null

  const ensureProject = async (): Promise<string | null> => {
    if (projectId) return projectId
    if (!name.trim()) return null
    const c = await window.api.createProject(name)
    applyConfig(c)
    setProjectId(c.activeProjectId)
    await refresh()
    return c.activeProjectId
  }
  const addPath = async (): Promise<void> => {
    const pid = await ensureProject()
    if (!pid) return
    applyConfig(await window.api.addLibraryPath(pid))
    await refresh()
  }
  const removePath = async (p: string): Promise<void> => {
    if (!projectId) return
    applyConfig(await window.api.removeLibraryPath(projectId, p))
    await refresh()
  }
  const save = async (): Promise<void> => {
    const pid = await ensureProject()
    if (pid && name.trim() && name !== current?.name) applyConfig(await window.api.renameProject(pid, name))
    onClose()
  }
  const remove = (): void => {
    if (!projectId) return
    openModal({
      type: 'confirm',
      title: 'Delete project',
      message: `Remove project "${current?.name}" from the library? No files will be deleted.`,
      onConfirm: () => {
        void window.api.deleteProject(projectId).then(async (c) => {
          applyConfig(c)
          await refresh()
        })
      }
    })
  }

  return (
    <Modal title={projectId ? 'Edit project' : 'New project'} onClose={onClose} width={520}>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miners Fun" autoFocus />
      </label>
      <div className="field">
        <span>Library folders (subfolders become categories)</span>
        <ul className="path-list">
          {current?.libraryPaths.map((p) => (
            <li key={p}>
              <span className="path" title={p}>
                {p}
              </span>
              <button className="icon-btn" title="Remove" onClick={() => void removePath(p)}>
                ✕
              </button>
            </li>
          ))}
          {!current?.libraryPaths.length && <li className="muted">No folders yet</li>}
        </ul>
        <button onClick={() => void addPath()} disabled={!projectId && !name.trim()}>
          Add folder…
        </button>
      </div>
      <div className="row">
        {projectId && (
          <button className="danger" onClick={remove}>
            Delete project
          </button>
        )}
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => void save()} disabled={!name.trim()}>
          Done
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Verschieben nach Kategorie
// ---------------------------------------------------------------------------
function MoveModal({ paths, onClose }: { paths: string[]; onClose: () => void }): JSX.Element {
  const categories = useStore((s) => s.categories)
  const refresh = useStore((s) => s.refresh)
  const reportResult = useStore((s) => s.reportResult)
  const move = async (dir: string): Promise<void> => {
    onClose()
    reportResult(await window.api.moveFiles(paths, dir), 'moved')
    await refresh()
  }
  return (
    <Modal title={`Move ${paths.length} file(s) to…`} onClose={onClose}>
      <ul className="pick-list">
        {categories.map((c) => (
          <li key={c.id}>
            <button onClick={() => void move(c.dirPath)}>{c.label}</button>
          </li>
        ))}
      </ul>
      <p className="muted">Tip: Alt + dragging a tile onto a category header also moves it.</p>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Bestätigung
// ---------------------------------------------------------------------------
function ConfirmModal({ modal, onClose }: { modal: Extract<ModalState, { type: 'confirm' }>; onClose: () => void }): JSX.Element {
  return (
    <Modal title={modal.title} onClose={onClose}>
      <p>{modal.message}</p>
      <div className="row">
        <span className="spacer" />
        <button onClick={onClose} autoFocus>
          Cancel
        </button>
        <button
          className="danger"
          onClick={() => {
            onClose()
            modal.onConfirm()
          }}
        >
          OK
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Hilfe
// ---------------------------------------------------------------------------
function HelpModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Modal title="Help" onClose={onClose} width={520}>
      <table className="help">
        <tbody>
          <tr><td>Drag</td><td>Copy the file to Explorer / Unity (native drag &amp; drop)</td></tr>
          <tr><td>Alt + drag</td><td>Move to another category</td></tr>
          <tr><td>Drop from Explorer</td><td>Copy into the category (Shift = move)</td></tr>
          <tr><td>Double-click</td><td>Open in the default application</td></tr>
          <tr><td>Right-click</td><td>Context menu (Open, Explorer, Rename, Move, Recycle Bin)</td></tr>
          <tr><td>Ctrl / Shift + click</td><td>Multi-select</td></tr>
          <tr><td>F2</td><td>Rename</td></tr>
          <tr><td>Delete</td><td>Move to the Recycle Bin</td></tr>
          <tr><td>F5</td><td>Rescan</td></tr>
          <tr><td>Esc</td><td>Clear selection</td></tr>
          <tr><td>Pin (header)</td><td>Keep the window above Unity / Blender</td></tr>
        </tbody>
      </table>
    </Modal>
  )
}
