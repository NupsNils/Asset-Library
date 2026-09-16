import { useEffect, useRef, useState } from 'react'

/** true, sobald das Element (fast) im Viewport ist – für lazy Thumbnails. */
export function useInView<T extends HTMLElement>(rootMargin = '300px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          obs.disconnect()
        }
      },
      { rootMargin }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [inView, rootMargin])
  return [ref, inView]
}
