// Synthesised notification/call sounds via Web Audio API.
// Kept in code rather than shipping audio assets so the bundle stays lean.

let ctx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

type Beep = { freq: number; start: number; dur: number; gain?: number }

function schedule(beeps: Beep[], type: OscillatorType = 'sine'): () => void {
  const ac = getCtx()
  const t0 = ac.currentTime
  const nodes: { osc: OscillatorNode; gain: GainNode }[] = []
  for (const b of beeps) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.value = b.freq
    const peak = b.gain ?? 0.15
    // Short attack/release to avoid clicks
    gain.gain.setValueAtTime(0, t0 + b.start)
    gain.gain.linearRampToValueAtTime(peak, t0 + b.start + 0.01)
    gain.gain.setValueAtTime(peak, t0 + b.start + b.dur - 0.02)
    gain.gain.linearRampToValueAtTime(0, t0 + b.start + b.dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(t0 + b.start)
    osc.stop(t0 + b.start + b.dur + 0.02)
    nodes.push({ osc, gain })
  }
  return () => {
    const now = ac.currentTime
    for (const { osc, gain } of nodes) {
      try { gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(0, now) } catch {}
      try { osc.stop(now) } catch {}
    }
  }
}

// ── Message received: short two-note up-chirp ────────────────────────────────
export function playMessageReceive(): void {
  schedule(
    [
      { freq: 880,  start: 0,    dur: 0.08, gain: 0.12 },
      { freq: 1320, start: 0.09, dur: 0.12, gain: 0.12 },
    ],
    'sine',
  )
}

// ── Outgoing ringback: one soft tone, long gap, repeat ──────────────────────
let outgoingTimer: ReturnType<typeof setTimeout> | null = null
let outgoingStop: (() => void) | null = null

export function startOutgoingRing(): void {
  if (outgoingTimer || outgoingStop) return
  const tick = () => {
    outgoingStop = schedule(
      [{ freq: 440, start: 0, dur: 1.0, gain: 0.08 }],
      'sine',
    )
    outgoingTimer = setTimeout(tick, 3000) // 1s tone + 2s silence
  }
  tick()
}

export function stopOutgoingRing(): void {
  if (outgoingTimer) { clearTimeout(outgoingTimer); outgoingTimer = null }
  if (outgoingStop) { outgoingStop(); outgoingStop = null }
}

// ── Incoming ring: two-burst pattern, loop ──────────────────────────────────
let incomingTimer: ReturnType<typeof setTimeout> | null = null
let incomingStop: (() => void) | null = null

export function startIncomingRing(): void {
  if (incomingTimer || incomingStop) return
  const tick = () => {
    incomingStop = schedule(
      [
        { freq: 880, start: 0.0,  dur: 0.35, gain: 0.14 },
        { freq: 660, start: 0.45, dur: 0.35, gain: 0.14 },
      ],
      'sine',
    )
    incomingTimer = setTimeout(tick, 2200) // 0.8s pattern + ~1.4s silence
  }
  tick()
}

export function stopIncomingRing(): void {
  if (incomingTimer) { clearTimeout(incomingTimer); incomingTimer = null }
  if (incomingStop) { incomingStop(); incomingStop = null }
}

export function stopAllRings(): void {
  stopOutgoingRing()
  stopIncomingRing()
}
