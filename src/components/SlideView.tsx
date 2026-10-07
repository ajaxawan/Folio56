import { memo, useEffect, useRef, useState } from 'react'
import { DECK_CSS, H, W, renderSlide, type DeckTheme, type Meta, type Slide } from '../lib/deckRender'
import { useImageUrl } from '../lib/blobs'

// The slide styles go into the page once.
if (typeof document !== 'undefined' && !document.getElementById('deck-css')) {
  const st = document.createElement('style'); st.id = 'deck-css'; st.textContent = DECK_CSS; document.head.appendChild(st)
}

/** A slide drawn at 1280×720 and scaled to fit its box (thumbnails, the editor canvas, Present mode). */
export const SlideView = memo(function SlideView({ slide, theme, meta, fit = 'width', className = '' }: {
  slide: Slide; theme: DeckTheme; meta: Meta; fit?: 'width' | 'contain'; className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const img = useImageUrl(slide.image ?? null)
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setScale(fit === 'contain' ? Math.min(width / W, height / H) : width / W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])
  const html = renderSlide(slide, theme, meta, img)
  return (
    <div ref={box} className={`relative overflow-hidden ${fit === 'width' ? 'aspect-video w-full' : 'h-full w-full'} ${className}`}>
      {scale > 0 && (
        <div aria-hidden className="absolute" style={fit === 'contain'
          ? { width: W, height: H, left: '50%', top: '50%', transform: `translate(-50%, -50%) scale(${scale})` }
          : { width: W, height: H, left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }}
          dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
})
