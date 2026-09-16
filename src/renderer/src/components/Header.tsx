import { useEffect, useRef, useState, type JSX } from 'react'
import { useStore } from '../store'

export function Header(): JSX.Element {
  const config = useStore((s) => s.config)
  const applyConfig = useStore((s) => s.applyConfig)
  const refresh = useStore((s) => s.refresh)
  const openModal = useStore((s) => s.openModal)
  const loading = useStore((s) => s.loading)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const active = config?.projects.find((p) => p.id === config.activeProjectId) ?? null

  const choose = async (id: string): Promise<void> => {
    setOpen(false)
    if (id === config?.activeProjectId) return
    applyConfig(await window.api.setActiveProject(id))
    useStore.getState().select([])
    await refresh()
  }

  return (
    <div className="header">
      <div className="project-menu" ref={menuRef}>
        <button className="project-btn" onClick={() => setOpen((o) => !o)} title="Switch project">
          <span className="project-name">{active?.name ?? 'No project'}</span>
          <span className="chevron">▽</span>
        </button>
        {open && (
          <div className="dropdown">
            {config?.projects.map((p) => (
              <button
                key={p.id}
                className={['dropdown-item', p.id === active?.id ? 'active' : ''].join(' ')}
                onClick={() => void choose(p.id)}
              >
                {p.name}
                <span className="muted">{p.libraryPaths.length} folder(s)</span>
              </button>
            ))}
            {config?.projects.length ? <div className="dropdown-sep" /> : null}
            {active && (
              <button
                className="dropdown-item"
                onClick={() => {
                  setOpen(false)
                  openModal({ type: 'project', id: active.id })
                }}
              >
                Edit project…
              </button>
            )}
            <button
              className="dropdown-item"
              onClick={() => {
                setOpen(false)
                openModal({ type: 'project', id: null })
              }}
            >
              New project…
            </button>
          </div>
        )}
      </div>
      <div className="header-spacer">{loading && <span className="muted">Scanning…</span>}</div>
      <button
        className={['icon-btn', 'big', config?.settings.alwaysOnTop ? 'active' : ''].join(' ')}
        title={config?.settings.alwaysOnTop ? 'Always on top: on' : 'Always on top: off'}
        onClick={() => void window.api.setAlwaysOnTop(!config?.settings.alwaysOnTop).then(applyConfig)}
      >
        <PinIcon />
      </button>
      <button className="icon-btn big" title="Rescan (F5)" onClick={() => void refresh()}>
        <RefreshIcon />
      </button>
      <button className="icon-btn big" title="Settings" onClick={() => openModal({ type: 'settings' })}>
        <GearIcon />
      </button>
      <button className="icon-btn big" title="Help" onClick={() => openModal({ type: 'help' })}>
        <span className="help-icon">?</span>
      </button>
    </div>
  )
}

function GearIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

function PinIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
      <path d="M12 14v7" />
    </svg>
  )
}

function RefreshIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}
