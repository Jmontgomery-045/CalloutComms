import { useEffect, useRef, useState } from 'react'

const CROP_SIZE = 300 // px — diameter of the visible circle

type Props = {
  src: string
  onSave(dataUrl: string): void
  onCancel(): void
}

export default function AvatarCropModal({ src, onSave, onCancel }: Props) {
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const imgRef  = useRef<HTMLImageElement>(null)
  const cropRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ sx: 0, sy: 0, ox: 0, oy: 0 })

  // Keep refs in sync so the wheel handler doesn't go stale
  const scaleRef = useRef(scale)
  const nsRef    = useRef(naturalSize)
  scaleRef.current = scale
  nsRef.current    = naturalSize

  function minScaleFor(w: number, h: number) {
    return w && h ? CROP_SIZE / Math.min(w, h) : 1
  }

  function clamp(ox: number, oy: number, s: number, w: number, h: number) {
    const dw = w * s, dh = h * s
    const mx = Math.max(0, (dw - CROP_SIZE) / 2)
    const my = Math.max(0, (dh - CROP_SIZE) / 2)
    return { x: Math.max(-mx, Math.min(mx, ox)), y: Math.max(-my, Math.min(my, oy)) }
  }

  // Non-passive wheel listener (React's onWheel is passive and can't preventDefault)
  useEffect(() => {
    const el = cropRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const ns = nsRef.current
      const ms = minScaleFor(ns.w, ns.h)
      const next = Math.max(ms, Math.min(ms * 4, scaleRef.current - e.deltaY * 0.002))
      setScale(next)
      setOffset((prev) => clamp(prev.x, prev.y, next, ns.w, ns.h))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const w = img.naturalWidth, h = img.naturalHeight
    setNaturalSize({ w, h })
    const s = minScaleFor(w, h)
    setScale(s)
    setOffset({ x: 0, y: 0 })
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    const { sx, sy, ox, oy } = dragRef.current
    const raw = { x: ox + e.clientX - sx, y: oy + e.clientY - sy }
    setOffset(clamp(raw.x, raw.y, scale, naturalSize.w, naturalSize.h))
  }

  function onMouseUp() { setDragging(false) }

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const s = Number(e.target.value)
    setScale(s)
    setOffset((prev) => clamp(prev.x, prev.y, s, naturalSize.w, naturalSize.h))
  }

  function handleSave() {
    const OUT = 256
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2)
    ctx.clip()

    const img = imgRef.current!
    const ratio = OUT / CROP_SIZE
    const dw = naturalSize.w * scale * ratio
    const dh = naturalSize.h * scale * ratio
    const dx = OUT / 2 + offset.x * ratio - dw / 2
    const dy = OUT / 2 + offset.y * ratio - dh / 2
    ctx.drawImage(img, dx, dy, dw, dh)

    onSave(canvas.toDataURL('image/png'))
  }

  const ms   = minScaleFor(naturalSize.w, naturalSize.h)
  const dispW = naturalSize.w * scale
  const dispH = naturalSize.h * scale

  return (
    <div style={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Position photo</h2>
        <p style={styles.hint}>Drag to reposition · scroll or slider to zoom</p>

        {/* Crop circle */}
        <div
          ref={cropRef}
          style={{ ...styles.crop, cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img
            ref={imgRef}
            src={src}
            onLoad={handleLoad}
            draggable={false}
            style={{
              position: 'absolute',
              width: dispW,
              height: dispH,
              left: `calc(50% + ${offset.x}px - ${dispW / 2}px)`,
              top:  `calc(50% + ${offset.y}px - ${dispH / 2}px)`,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        </div>

        {/* Zoom slider */}
        <div style={styles.zoomRow}>
          <span style={styles.zoomLabel}>Zoom</span>
          <input
            type="range"
            min={ms}
            max={ms * 4}
            step={0.001}
            value={scale}
            onChange={handleSlider}
            style={styles.slider}
          />
        </div>

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={styles.saveBtn} onClick={handleSave}>Save photo</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  modal: {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '28px 32px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
    width: 400,
  },
  title: { fontSize: 18, fontWeight: 700, alignSelf: 'flex-start' },
  hint:  { fontSize: 13, color: 'var(--text-muted)', alignSelf: 'flex-start', marginTop: -14 },
  crop: {
    width: CROP_SIZE, height: CROP_SIZE,
    borderRadius: '50%',
    overflow: 'hidden',
    position: 'relative',
    background: 'var(--bg-tertiary)',
    flexShrink: 0,
    boxShadow: '0 0 0 2px var(--accent-light)',
  },
  zoomRow: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
  },
  zoomLabel: { fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },
  slider: { flex: 1, accentColor: 'var(--accent-light)' },
  actions: { display: 'flex', gap: 10, alignSelf: 'flex-end' },
  cancelBtn: {
    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
    borderRadius: 8, padding: '8px 18px', fontWeight: 500,
  },
  saveBtn: {
    background: 'var(--accent)', color: '#fff',
    borderRadius: 8, padding: '8px 18px', fontWeight: 600,
  },
}
