import { useState, type DragEvent, type JSX, type MouseEvent } from 'react'
import type { AssetFile, Category } from '@shared/types'
import { useStore } from '../store'
import { AssetTile, INTERNAL_DRAG_TYPE } from './AssetTile'

interface Props {
  category: Category
  collapsed: boolean
  selected: Set<string>
  onTileClick: (e: MouseEvent, file: AssetFile) => void
  onTileContextMenu: (e: MouseEvent, file: AssetFile) => void
}

export function CategorySection({ category, collapsed, selected, onTileClick, onTileContextMenu }: Props): JSX.Element {
  const toggleCollapsed = useStore((s) => s.toggleCollapsed)
  const refresh = useStore((s) => s.refresh)
  const reportResult = useStore((s) => s.reportResult)
  const [dragOver, setDragOver] = useState(false)

  const accepts = (e: DragEvent): boolean => {
    const t = e.dataTransfer.types
    return t.includes('Files') || t.includes(INTERNAL_DRAG_TYPE)
  }
  const onDragOver = (e: DragEvent): void => {
    if (!accepts(e)) return
    e.preventDefault()
    const internal = e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)
    e.dataTransfer.dropEffect = internal || e.shiftKey ? 'move' : 'copy'
    if (!dragOver) setDragOver(true)
  }
  const onDragLeave = (e: DragEvent): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragOver(false)
  }
  const onDrop = async (e: DragEvent): Promise<void> => {
    if (!accepts(e)) return
    e.preventDefault()
    setDragOver(false)
    const internal = e.dataTransfer.getData(INTERNAL_DRAG_TYPE)
    if (internal) {
      const paths = JSON.parse(internal) as string[]
      reportResult(await window.api.moveFiles(paths, category.dirPath), 'moved')
    } else {
      const paths = window.api.getPathsForFiles(Array.from(e.dataTransfer.files))
      if (!paths.length) return
      // Shift beim Drop = verschieben statt kopieren (wie im Explorer)
      const mode = e.shiftKey ? 'move' : 'copy'
      reportResult(await window.api.importFiles(paths, category.dirPath, mode), mode === 'move' ? 'moved' : 'imported')
    }
    await refresh()
  }

  return (
    <section
      className={['category', collapsed ? 'collapsed' : '', dragOver ? 'drag-over' : ''].join(' ')}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      <header className="category-header" onClick={() => toggleCollapsed(category.id)} title={category.dirPath}>
        <span className="category-label">{category.label}</span>
        <span className="category-count">{category.files.length}</span>
        <button
          className="icon-btn"
          title="Open folder in Explorer"
          onClick={(e) => {
            e.stopPropagation()
            void window.api.openCategoryFolder(category.dirPath)
          }}
        >
          <FolderIcon />
        </button>
        <span className="chevron">{collapsed ? '▽' : '△'}</span>
      </header>
      {!collapsed && (
        <div className="tiles">
          {category.files.map((f) => (
            <AssetTile
              key={f.path}
              file={f}
              selected={selected.has(f.path)}
              onClick={onTileClick}
              onContextMenu={onTileContextMenu}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function FolderIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.2l1.5 1.5H13A1.5 1.5 0 0 1 14.5 4.5v8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5V3zm1.5 3v6.5h10V6H3z" />
    </svg>
  )
}
