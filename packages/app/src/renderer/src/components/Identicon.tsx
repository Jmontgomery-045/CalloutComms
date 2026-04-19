import { useMemo } from 'react'

type Props = { userId: string; size?: number }

export default function Identicon({ userId, size = 36 }: Props) {
  const colors = useMemo(() => {
    // Curated palette — teal/green/blue/warm tones, no purples
    const PALETTE = [
      { bg: '#0d2e24', fg: '#00e5a0' }, // brand teal
      { bg: '#0d2a2e', fg: '#00d4e5' }, // cyan
      { bg: '#0d2035', fg: '#4da6ff' }, // blue
      { bg: '#1a2a0d', fg: '#7ed957' }, // green
      { bg: '#2e1f0d', fg: '#f5a623' }, // amber
      { bg: '#2e140d', fg: '#f07040' }, // coral
      { bg: '#0d2420', fg: '#00c9b1' }, // teal-green
      { bg: '#1a1f0d', fg: '#c8e040' }, // lime
    ]
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
    }
    return PALETTE[hash % PALETTE.length]
  }, [userId])

  const initials = userId.slice(0, 2).toUpperCase()

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors.bg,
        color: colors.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 700,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  )
}
