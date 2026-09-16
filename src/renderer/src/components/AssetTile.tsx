import { useEffect, useRef, useState, type DragEvent, type JSX, type KeyboardEvent, type MouseEvent } from 'react'
import type { AssetFile } from '@shared/types'
import { thumbKey, useStore } from '../store'
import { useInView } from '../useInView'

export const INTERNAL_DRAG_TYPE = 'application/x-asset-library-paths'

interface Props {
  file: AssetFile
  selected: boolean
  onClick: (e: MouseEvent, file: AssetFile) => void
  onContextMenu: (e: MouseEvent, file: AssetFile) => void
}

export function AssetTile({ file, selected, onClick, onContextMenu }: Props): JSX.Element {
  const thumb = useStore((s) => s.thumbs[thumbKey(file)])
  const requestThumb = useStore((s) => s.requestThumb)
  const renaming = useStore((s) => s.renaming === file.path)
  const [ref, inView] = useInView<HTMLDivElement>()

  useEffect(() => {
    if (inView && !thumb) requestThumb(file)
  }, [inView, thumb, file, requestThumb])

  const onDragStart = (e: DragEvent): void => {
    const sel = useStore.getState().selected
    const paths = selected && sel.length > 1 ? sel : [file.path]
    if (e.altKey) {
      // Alt+Drag = internes Verschieben in eine andere Kategorie (HTML5-Drag bleibt aktiv)
      e.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(paths))
      e.dataTransfer.effectAllowed = 'move'
      return
    }
    // Normales Drag = natives OS-Drag (Explorer/Unity), Electron übernimmt
    e.preventDefault()
    window.api.startDrag(paths, thumb?.url ?? null)
  }

  const cls = ['tile', selected ? 'selected' : '', thumb?.url ? '' : 'no-thumb'].join(' ')
  return (
    <div
      ref={ref}
      className={cls}
      draggable={!renaming}
      title={`${file.name}\n${formatSize(file.size)}`}
      onClick={(e) => onClick(e, file)}
      onDoubleClick={() => void window.api.openFile(file.path)}
      onContextMenu={(e) => onContextMenu(e, file)}
      onDragStart={onDragStart}
      data-path={file.path}
    >
      <div className="tile-image">
        {thumb?.url ? (
          <img src={thumb.url} alt="" draggable={false} />
        ) : (
          <span className="tile-ext">{thumb ? file.ext.replace('.', '').toUpperCase() : '…'}</span>
        )}
      </div>
      {renaming ? <RenameInput file={file} /> : <div className="tile-name">{file.name}</div>}
    </div>
  )
}

function RenameInput({ file }: { file: AssetFile }): JSX.Element {
  const [value, setValue] = useState(file.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const setRenaming = useStore((s) => s.setRenaming)
  const showToast = useStore((s) => s.showToast)
  const refresh = useStore((s) => s.refresh)
  const done = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Nur den Namen ohne Extension markieren
    const dot = file.name.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : file.name.length)
  }, [file.name])

  const commit = async (): Promise<void> => {
    if (done.current) return
    done.current = true
    setRenaming(null)
    if (value.trim() && value !== file.name) {
      try {
        const newPath = await window.api.renameFile(file.path, value)
        useStore.getState().select([newPath])
        await refresh()
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err))
      }
    }
  }
  const cancel = (): void => {
    done.current = true
    setRenaming(null)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    if (e.key === 'Enter') void commit()
    if (e.key === 'Escape') cancel()
  }
  return (
    <input
      ref={inputRef}
      className="tile-rename"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => void commit()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  )
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
