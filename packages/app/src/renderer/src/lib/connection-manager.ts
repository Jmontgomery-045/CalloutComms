import { useAppStore, type IncomingRequest, type GroupParticipant } from '../store/app'

const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true
const log = DEV
  ? (scope: string, ...args: unknown[]) => console.log(`[callout:${scope}]`, ...args)
  : () => {}

const SIGNAL_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SIGNAL_URL ?? 'ws://localhost:8080'

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // { urls: 'turn:your-server.com', username: '', credential: '' },
  ],
}

// ── Message types ─────────────────────────────────────────────────────────────

type RelayPayload =
  | { type: 'contact-request'; displayName: string; publicKey: string; message: string }
  | { type: 'contact-request-accepted'; displayName: string; publicKey: string }
  | { type: 'sdp-offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'sdp-answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }

type DataChannelMessage =
  // Messaging
  | { type: 'profile'; displayName: string; status: string; profilePicDataUrl?: string | null }
  | { type: 'chat'; content: string; timestamp: number }
  // 1-to-1 call
  | { type: 'call-invite' }
  | { type: 'call-accepted' }
  | { type: 'call-rejected' }
  | { type: 'call-ended' }
  | { type: 'call-sdp-offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'call-sdp-answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'call-ice'; candidate: RTCIceCandidateInit }
  // Group call
  | { type: 'group-invite'; groupId: string; hostNickname: string; currentCount: number }
  | { type: 'group-accepted'; joinOrder: number }
  | { type: 'group-declined' }
  | { type: 'group-sdp-offer'; groupId: string; sdp: RTCSessionDescriptionInit; participants: GroupParticipant[] }
  | { type: 'group-sdp-answer'; groupId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'group-ice'; groupId: string; candidate: RTCIceCandidateInit }
  | { type: 'group-participant-joined'; groupId: string; participant: GroupParticipant }
  | { type: 'group-participant-left'; groupId: string; userId: string }
  | { type: 'group-host-takeover'; groupId: string; newHostId: string; participants: GroupParticipant[] }
  | { type: 'group-kick'; groupId: string }
  | { type: 'group-ended'; groupId: string }
  | { type: 'profile-request' }

// ── ConnectionManager ─────────────────────────────────────────────────────────

export class ConnectionManager {
  // Messaging layer
  private peers = new Map<string, RTCPeerConnection>()
  private channels = new Map<string, RTCDataChannel>()

  // 1-to-1 call layer
  private callPeers = new Map<string, RTCPeerConnection>()
  private localStreams = new Map<string, MediaStream>()
  private pendingOffers = new Map<string, RTCSessionDescriptionInit>()

  // Group call layer
  private groupId: string | null = null
  private groupPeers = new Map<string, RTCPeerConnection>()
  private groupLocalStream: MediaStream | null = null
  private groupAudioCtx: AudioContext | null = null
  private groupMixDest: MediaStreamAudioDestinationNode | null = null
  private groupAudioSources = new Map<string, MediaStreamAudioSourceNode>()
  private groupJoinOrders = new Map<string, number>()

  // Signalling
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private publicKeyHex: string | null = null

  readonly profileId: string
  readonly userId: string
  private displayName: string
  private status: string

  constructor(profileId: string, displayName: string, status: string) {
    this.profileId = profileId
    this.userId = profileId
    this.displayName = displayName
    this.status = status
    this.connectWs()
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────

  private connectWs() {
    log('ws', 'connecting to', SIGNAL_URL)
    this.ws = new WebSocket(SIGNAL_URL)
    this.ws.onopen = () => {
      log('ws', 'connected — registering as', this.userId)
      this.ws!.send(JSON.stringify({ type: 'register', userId: this.userId }))
    }
    this.ws.onmessage = (e: MessageEvent) => {
      let msg: { type: string; [k: string]: unknown }
      try { msg = JSON.parse(e.data as string) } catch { return }
      log('ws', '←', msg.type, msg)
      void this.handleSignal(msg)
    }
    this.ws.onclose = () => {
      log('ws', 'closed — scheduling reconnect')
      this.scheduleReconnect()
    }
    this.ws.onerror = () => { /* close fires after */ }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connectWs() }, 5000)
  }

  // ── Signal handling ────────────────────────────────────────────────────────

  private async handleSignal(msg: { type: string; [k: string]: unknown }) {
    const store = useAppStore.getState()
    switch (msg.type) {
      case 'registered':
        log('signal', 'registered — polling presence for', store.contacts.length, 'contacts')
        for (const c of store.contacts) this.wsRaw({ type: 'presence', targetId: c.user_id })
        break

      case 'presence': {
        const { targetId, online } = msg as { targetId: string; online: boolean }
        store.setContactOnline(targetId, online)
        log('signal', `presence: ${targetId} is ${online ? 'ONLINE' : 'offline'}`)
        if (online && this.userId < targetId) {
          log('signal', `initiating connection to ${targetId} (my id is smaller)`)
          await this.initiateConnection(targetId)
        } else if (online) {
          log('signal', `waiting for ${targetId} to initiate (their id is smaller)`)
        }
        break
      }

      case 'relay': {
        const { fromId, payload } = msg as { fromId: string; payload: RelayPayload }
        log('signal', `relay ← ${fromId}:`, payload.type)
        await this.handleRelay(fromId, payload)
        break
      }
    }
  }

  private async handleRelay(fromId: string, payload: RelayPayload) {
    const store = useAppStore.getState()
    switch (payload.type) {
      case 'contact-request': {
        const exists = store.contacts.some((c) => c.user_id === fromId)
        const queued = store.incomingRequests.some((r) => r.fromId === fromId)
        if (!exists && !queued) {
          store.pushIncomingRequest({
            fromId, fromDisplayName: payload.displayName,
            fromPublicKey: payload.publicKey, message: payload.message,
          })
        }
        break
      }
      case 'contact-request-accepted': {
        if (!store.contacts.some((c) => c.user_id === fromId)) {
          await window.api.contacts.add({
            profileId: this.profileId, userId: fromId,
            nickname: payload.displayName, displayName: payload.displayName,
            publicKey: payload.publicKey,
          })
          store.setContacts(await window.api.contacts.get(this.profileId))
        }
        this.wsRaw({ type: 'presence', targetId: fromId })
        break
      }
      case 'sdp-offer': await this.handleOffer(fromId, payload.sdp); break
      case 'sdp-answer': {
        const pc = this.peers.get(fromId)
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        break
      }
      case 'ice-candidate': {
        const pc = this.peers.get(fromId)
        if (pc) try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* stale */ }
        break
      }
    }
  }

  // ── Messaging peers ────────────────────────────────────────────────────────

  private async initiateConnection(targetId: string) {
    const existing = this.peers.get(targetId)
    if (existing) {
      const s = existing.connectionState
      if (s === 'new' || s === 'connecting' || s === 'connected') {
        log('rtc', `already have live peer for ${targetId} (${s}), skipping`)
        return
      }
      log('rtc', `replacing dead peer for ${targetId} (was ${s})`)
      existing.close()
      this.peers.delete(targetId)
      this.channels.delete(targetId)
    }
    log('rtc', `creating offer → ${targetId}`)
    const pc = this.createMsgPeer(targetId)
    const dc = pc.createDataChannel('chat', { ordered: true })
    this.setupDataChannel(targetId, dc)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.relay(targetId, { type: 'sdp-offer', sdp: offer })
    log('rtc', `offer sent → ${targetId}`)
  }

  private async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
    const existing = this.peers.get(fromId)
    if (existing) {
      const s = existing.connectionState
      if (s === 'new' || s === 'connecting' || s === 'connected') {
        log('rtc', `already have live peer for ${fromId} (${s}), ignoring offer`)
        return
      }
      log('rtc', `replacing dead peer for ${fromId} (was ${s})`)
      existing.close()
      this.peers.delete(fromId)
      this.channels.delete(fromId)
    }
    log('rtc', `received offer from ${fromId} — creating answer`)
    const pc = this.createMsgPeer(fromId)
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    this.relay(fromId, { type: 'sdp-answer', sdp: answer })
    log('rtc', `answer sent → ${fromId}`)
  }

  private createMsgPeer(targetId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_CONFIG)
    this.peers.set(targetId, pc)
    pc.onicecandidate = (e) => {
      if (e.candidate) this.relay(targetId, { type: 'ice-candidate', candidate: e.candidate.toJSON() })
    }
    pc.ondatachannel = (e) => this.setupDataChannel(targetId, e.channel)
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      log('rtc', `peer ${targetId} connection state → ${s}`)
      if (s === 'connected') {
        useAppStore.getState().setContactOnline(targetId, true)
      } else if (s === 'failed' || s === 'closed') {
        useAppStore.getState().setContactOnline(targetId, false)
        this.peers.delete(targetId); this.channels.delete(targetId)
        if (s === 'failed') {
          log('rtc', `peer ${targetId} failed — re-polling presence in 3s`)
          setTimeout(() => this.wsRaw({ type: 'presence', targetId }), 3000)
        }
      }
    }
    return pc
  }

  // Chunk reassembly buffers: targetId -> chunkId -> { chunks, total }
  private chunkBuffers = new Map<string, Map<string, { chunks: string[]; total: number }>>()

  private setupDataChannel(targetId: string, dc: RTCDataChannel) {
    dc.onopen = () => {
      log('dc', `channel open with ${targetId} — sending profile`)
      this.channels.set(targetId, dc)
      useAppStore.getState().setChannelOpen(targetId, true)
      this.dcSend(dc, { type: 'profile', displayName: this.displayName, status: this.status })
    }
    dc.onmessage = async (e: MessageEvent) => {
      let raw: { __chunk?: boolean; id?: string; i?: number; total?: number; data?: string }
      try { raw = JSON.parse(e.data as string) } catch { return }

      if (raw.__chunk) {
        // Reassemble chunked message
        if (!this.chunkBuffers.has(targetId)) this.chunkBuffers.set(targetId, new Map())
        const byId = this.chunkBuffers.get(targetId)!
        if (!byId.has(raw.id!)) byId.set(raw.id!, { chunks: [], total: raw.total! })
        const entry = byId.get(raw.id!)!
        entry.chunks[raw.i!] = raw.data!
        if (entry.chunks.filter(Boolean).length === entry.total) {
          byId.delete(raw.id!)
          let msg: DataChannelMessage
          try { msg = JSON.parse(entry.chunks.join('')) } catch { return }
          await this.handleDcMsg(targetId, msg)
        }
        return
      }

      let msg: DataChannelMessage
      try { msg = raw as unknown as DataChannelMessage } catch { return }
      await this.handleDcMsg(targetId, msg)
    }
    dc.onclose = () => {
      log('dc', `channel closed with ${targetId}`)
      this.channels.delete(targetId)
      this.chunkBuffers.delete(targetId)
      useAppStore.getState().setChannelOpen(targetId, false)
      useAppStore.getState().setContactOnline(targetId, false)
    }
  }

  private async handleDcMsg(fromId: string, msg: DataChannelMessage) {
    const store = useAppStore.getState()

    switch (msg.type) {

      // ── Messaging ───────────────────────────────────────────────────────────
      case 'profile': {
        await window.api.contacts.updatePresence({
          profileId: this.profileId, userId: fromId,
          displayName: msg.displayName, status: msg.status,
        })
        if (msg.profilePicDataUrl) {
          await window.api.contacts.saveProfilePic({
            profileId: this.profileId, userId: fromId, dataUrl: msg.profilePicDataUrl,
          })
        } else if (msg.profilePicDataUrl === null) {
          await window.api.contacts.removeProfilePic({ profileId: this.profileId, userId: fromId })
        }
        store.setContacts(await window.api.contacts.get(this.profileId))
        break
      }
      case 'chat': {
        const result = await window.api.messages.save({
          profileId: this.profileId, contactUserId: fromId,
          direction: 'received', content: msg.content, type: 'text', timestamp: msg.timestamp,
        })
        const isSelected = store.selectedContactId === fromId
        store.appendMessage(fromId, {
          id: result.id, direction: 'received', content: msg.content,
          type: 'text', timestamp: msg.timestamp,
          read: isSelected ? 1 : 0, reaction: null,
        })
        if (isSelected) {
          await window.api.messages.markRead(this.profileId, fromId)
        } else {
          store.incrementUnread(fromId)
        }
        break
      }

      // ── 1-to-1 call ─────────────────────────────────────────────────────────
      case 'call-invite':
        if (store.call.status === 'idle' && !store.groupCall.active) {
          store.setCallState({ status: 'ringing', contactId: fromId })
        }
        break
      case 'call-sdp-offer':
        this.pendingOffers.set(fromId, msg.sdp)
        break
      case 'call-sdp-answer': {
        const cp = this.callPeers.get(fromId)
        if (cp) await cp.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        break
      }
      case 'call-accepted':
        store.setCallState({ status: 'active', startTime: Date.now() })
        break
      case 'call-rejected': this.teardownCall(fromId); break
      case 'call-ended':    this.teardownCall(fromId); break
      case 'call-ice': {
        const cp = this.callPeers.get(fromId)
        if (cp) try { await cp.addIceCandidate(new RTCIceCandidate(msg.candidate)) } catch { /* stale */ }
        break
      }

      // ── Group call ──────────────────────────────────────────────────────────
      case 'group-invite': {
        if (store.call.status === 'idle' && !store.groupCall.active) {
          const contact = store.contacts.find((c) => c.user_id === fromId)
          store.setGroupCall({
            ...store.groupCall,
            pendingInvite: {
              groupId: msg.groupId,
              hostId: fromId,
              hostNickname: contact?.nickname ?? fromId.slice(0, 8),
              currentCount: msg.currentCount,
            },
          })
        }
        break
      }

      case 'group-accepted': {
        // A participant accepted our invite — we are the host
        if (this.groupId === null) break
        const contact = store.contacts.find((c) => c.user_id === fromId)
        const participant: GroupParticipant = {
          userId: fromId,
          nickname: contact?.nickname ?? fromId.slice(0, 8),
          joinOrder: msg.joinOrder,
        }
        this.groupJoinOrders.set(fromId, msg.joinOrder)
        await this.hostConnectToParticipant(fromId, participant)
        break
      }

      case 'group-declined': break  // nothing to do

      case 'group-sdp-offer': {
        // We are a participant receiving the host's offer
        if (msg.groupId !== store.groupCall.groupId) break
        await this.participantHandleOffer(fromId, msg.sdp, msg.participants)
        break
      }

      case 'group-sdp-answer': {
        // We are the host receiving a participant's answer
        const gp = this.groupPeers.get(fromId)
        if (gp) await gp.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        break
      }

      case 'group-ice': {
        if (msg.groupId !== store.groupCall.groupId) break
        const gp = this.groupPeers.get(fromId)
        if (gp) try { await gp.addIceCandidate(new RTCIceCandidate(msg.candidate)) } catch { /* stale */ }
        break
      }

      case 'group-participant-joined': {
        if (msg.groupId !== store.groupCall.groupId) break
        store.updateGroupParticipants([
          ...store.groupCall.participants.filter((p) => p.userId !== msg.participant.userId),
          msg.participant,
        ])
        break
      }

      case 'group-participant-left': {
        if (msg.groupId !== store.groupCall.groupId) break
        const remaining = store.groupCall.participants.filter((p) => p.userId !== msg.userId)

        // If the host left and we're next in join order, take over
        if (msg.userId === store.groupCall.hostId) {
          const sorted = [...remaining].sort((a, b) => a.joinOrder - b.joinOrder)
          if (sorted[0]?.userId === this.userId) {
            await this.becomeHost(msg.groupId, remaining)
            return
          }
        }
        store.updateGroupParticipants(remaining)
        this.groupPeers.get(msg.userId)?.close()
        this.groupPeers.delete(msg.userId)
        this.removeFromMix(msg.userId)
        break
      }

      case 'group-host-takeover': {
        if (msg.groupId !== store.groupCall.groupId) break
        store.setGroupCall({ ...store.groupCall, hostId: msg.newHostId, participants: msg.participants })
        // Re-connect to new host if we're not the host
        if (msg.newHostId !== this.userId) {
          for (const gp of this.groupPeers.values()) gp.close()
          this.groupPeers.clear()
          // New host will send us an offer shortly
        }
        break
      }

      case 'group-kick': {
        if (msg.groupId !== store.groupCall.groupId) break
        this.teardownGroupCall(false)
        break
      }

      case 'group-ended': {
        if (msg.groupId !== store.groupCall.groupId) break
        this.teardownGroupCall(false)
        break
      }

      case 'profile-request': {
        const dc = this.channels.get(fromId)
        if (!dc) break
        const profilePicDataUrl = store.activeProfile?.profilePicPath
          ? await window.api.identity.getProfilePicDataUrl(store.activeProfile.profilePicPath)
          : null
        this.dcSend(dc, { type: 'profile', displayName: this.displayName, status: this.status, profilePicDataUrl })
        break
      }
    }
  }

  // ── 1-to-1 call ────────────────────────────────────────────────────────────

  async initiateCall(targetId: string): Promise<void> {
    const store = useAppStore.getState()
    if (store.call.status !== 'idle' || store.groupCall.active) return

    const dc = this.channels.get(targetId)
    if (!dc || dc.readyState !== 'open') return

    let localStream: MediaStream
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }) }
    catch { return }

    const cp = this.createCallPeer(targetId, localStream)
    localStream.getTracks().forEach((t) => cp.addTrack(t, localStream))

    const offer = await cp.createOffer()
    await cp.setLocalDescription(offer)

    this.dcSend(dc, { type: 'call-invite' })
    this.dcSend(dc, { type: 'call-sdp-offer', sdp: offer })

    store.setCallState({ status: 'calling', contactId: targetId, muted: false, startTime: null, remoteStream: null })
  }

  async acceptCall(): Promise<void> {
    const store = useAppStore.getState()
    const { contactId } = store.call
    if (!contactId || store.call.status !== 'ringing') return

    const pendingOffer = this.pendingOffers.get(contactId)
    if (!pendingOffer) return

    let localStream: MediaStream
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }) }
    catch { this.rejectCall(); return }

    const cp = this.createCallPeer(contactId, localStream)
    localStream.getTracks().forEach((t) => cp.addTrack(t, localStream))

    await cp.setRemoteDescription(new RTCSessionDescription(pendingOffer))
    this.pendingOffers.delete(contactId)

    const answer = await cp.createAnswer()
    await cp.setLocalDescription(answer)

    const dc = this.channels.get(contactId)
    if (!dc || dc.readyState !== 'open') { this.teardownCall(contactId); return }

    this.dcSend(dc, { type: 'call-sdp-answer', sdp: answer })
    this.dcSend(dc, { type: 'call-accepted' })
    store.setCallState({ status: 'active', startTime: Date.now() })
  }

  rejectCall(): void {
    const { contactId } = useAppStore.getState().call
    if (!contactId) return
    const dc = this.channels.get(contactId)
    if (dc?.readyState === 'open') this.dcSend(dc, { type: 'call-rejected' })
    this.teardownCall(contactId)
  }

  endCall(): void {
    const { contactId } = useAppStore.getState().call
    if (!contactId) return
    const dc = this.channels.get(contactId)
    if (dc?.readyState === 'open') this.dcSend(dc, { type: 'call-ended' })
    this.teardownCall(contactId)
  }

  toggleMute(): void {
    const store = useAppStore.getState()
    const { contactId, muted } = store.call
    if (!contactId) return
    this.localStreams.get(contactId)?.getAudioTracks().forEach((t) => { t.enabled = muted })
    store.setCallState({ muted: !muted })
  }

  private createCallPeer(targetId: string, localStream: MediaStream): RTCPeerConnection {
    const cp = new RTCPeerConnection(ICE_CONFIG)
    this.callPeers.set(targetId, cp)
    this.localStreams.set(targetId, localStream)

    cp.onicecandidate = (e) => {
      if (!e.candidate) return
      const dc = this.channels.get(targetId)
      if (dc?.readyState === 'open') this.dcSend(dc, { type: 'call-ice', candidate: e.candidate.toJSON() })
    }
    cp.ontrack = (e) => {
      useAppStore.getState().setCallState({ remoteStream: e.streams[0] ?? new MediaStream([e.track]) })
    }
    cp.onconnectionstatechange = () => {
      const s = cp.connectionState
      if (s === 'disconnected' || s === 'failed' || s === 'closed') this.teardownCall(targetId)
    }
    return cp
  }

  private teardownCall(contactId: string) {
    const cp = this.callPeers.get(contactId)
    if (cp) { cp.close(); this.callPeers.delete(contactId) }
    const stream = this.localStreams.get(contactId)
    if (stream) { stream.getTracks().forEach((t) => t.stop()); this.localStreams.delete(contactId) }
    this.pendingOffers.delete(contactId)
    useAppStore.getState().resetCall()
  }

  // ── Group call — host side ─────────────────────────────────────────────────

  async startGroupCall(participantIds: string[]): Promise<void> {
    const store = useAppStore.getState()
    if (store.call.status !== 'idle' || store.groupCall.active) return
    if (participantIds.length === 0 || participantIds.length > 5) return

    let localStream: MediaStream
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }) }
    catch { return }

    const audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const mixDest = audioCtx.createMediaStreamDestination()

    // Host's own mic goes into the mix
    const hostSource = audioCtx.createMediaStreamSource(localStream)
    hostSource.connect(mixDest)
    this.groupAudioSources.set(this.userId, hostSource)

    this.groupLocalStream = localStream
    this.groupAudioCtx = audioCtx
    this.groupMixDest = mixDest

    const groupId = Math.random().toString(36).slice(2, 10)
    this.groupId = groupId

    const myJoinOrder = Date.now()
    this.groupJoinOrders.set(this.userId, myJoinOrder)

    store.setGroupCall({
      active: true,
      groupId,
      hostId: this.userId,
      participants: [{ userId: this.userId, nickname: store.activeProfile?.displayName ?? 'You', joinOrder: myJoinOrder }],
      muted: false,
      pendingInvite: null,
    })

    // Invite all selected participants
    for (const id of participantIds) {
      const dc = this.channels.get(id)
      if (dc?.readyState === 'open') {
        this.dcSend(dc, {
          type: 'group-invite',
          groupId,
          hostNickname: store.activeProfile?.displayName ?? 'Someone',
          currentCount: participantIds.length + 1,
        })
      }
    }
  }

  private async hostConnectToParticipant(participantId: string, newParticipant: GroupParticipant) {
    const store = useAppStore.getState()
    if (!this.groupId || !this.groupMixDest) return

    const pc = this.createGroupPeer(participantId)

    // Send mix output to this participant
    const mixTrack = this.groupMixDest.stream.getAudioTracks()[0]
    if (mixTrack) pc.addTrack(mixTrack, this.groupMixDest.stream)

    // When participant's stream arrives, add to mix
    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track])
      this.addToMix(participantId, remote)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const updatedParticipants = [
      ...store.groupCall.participants.filter((p) => p.userId !== newParticipant.userId),
      newParticipant,
    ]
    store.updateGroupParticipants(updatedParticipants)

    const dc = this.channels.get(participantId)
    if (!dc || dc.readyState !== 'open') { pc.close(); this.groupPeers.delete(participantId); return }

    this.dcSend(dc, {
      type: 'group-sdp-offer',
      groupId: this.groupId,
      sdp: offer,
      participants: updatedParticipants,
    })

    // Notify all other participants about the new joiner
    for (const p of store.groupCall.participants) {
      if (p.userId === this.userId || p.userId === participantId) continue
      const pdc = this.channels.get(p.userId)
      if (pdc?.readyState === 'open') {
        this.dcSend(pdc, { type: 'group-participant-joined', groupId: this.groupId, participant: newParticipant })
      }
    }
  }

  async kickParticipant(targetId: string): Promise<void> {
    const store = useAppStore.getState()
    if (store.groupCall.hostId !== this.userId) return

    const dc = this.channels.get(targetId)
    if (dc?.readyState === 'open') this.dcSend(dc, { type: 'group-kick', groupId: this.groupId! })

    this.removeParticipant(targetId)
  }

  async passHost(newHostId: string): Promise<void> {
    const store = useAppStore.getState()
    if (store.groupCall.hostId !== this.userId || !this.groupId) return

    const updatedParticipants = store.groupCall.participants
    for (const p of updatedParticipants) {
      if (p.userId === this.userId) continue
      const dc = this.channels.get(p.userId)
      if (dc?.readyState === 'open') {
        this.dcSend(dc, {
          type: 'group-host-takeover',
          groupId: this.groupId,
          newHostId,
          participants: updatedParticipants,
        })
      }
    }
    store.setGroupCall({ ...store.groupCall, hostId: newHostId })
    // Stop mixing; the new host will set up their own AudioContext
    this.teardownGroupAudio()
  }

  // ── Group call — participant side ──────────────────────────────────────────

  async acceptGroupInvite(): Promise<void> {
    const store = useAppStore.getState()
    const invite = store.groupCall.pendingInvite
    if (!invite) return

    let localStream: MediaStream
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }) }
    catch { this.declineGroupInvite(); return }

    this.groupLocalStream = localStream
    this.groupId = invite.groupId

    const joinOrder = Date.now()
    this.groupJoinOrders.set(this.userId, joinOrder)

    store.setGroupCall({
      active: true,
      groupId: invite.groupId,
      hostId: invite.hostId,
      participants: [],  // host will send us the full list in the SDP offer
      muted: false,
      pendingInvite: null,
    })

    const dc = this.channels.get(invite.hostId)
    if (!dc || dc.readyState !== 'open') { this.teardownGroupCall(false); return }

    this.dcSend(dc, { type: 'group-accepted', joinOrder })
  }

  declineGroupInvite(): void {
    const store = useAppStore.getState()
    const invite = store.groupCall.pendingInvite
    if (!invite) return

    const dc = this.channels.get(invite.hostId)
    if (dc?.readyState === 'open') this.dcSend(dc, { type: 'group-declined' })

    store.setGroupCall({ ...store.groupCall, pendingInvite: null })
  }

  private async participantHandleOffer(
    hostId: string,
    sdp: RTCSessionDescriptionInit,
    participants: GroupParticipant[]
  ) {
    const store = useAppStore.getState()
    if (!this.groupLocalStream) return

    const pc = this.createGroupPeer(hostId)

    // Add local mic track
    this.groupLocalStream.getTracks().forEach((t) => pc.addTrack(t, this.groupLocalStream!))

    // When host's mixed stream arrives, expose it for playback
    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track])
      store.setGroupCall({ ...store.groupCall, participants })
      // Store remote stream on a well-known key so GroupCallPanel can find it
      ;(this as unknown as Record<string, unknown>).__groupRemoteStream = remote
      window.dispatchEvent(new CustomEvent('group-remote-stream', { detail: remote }))
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    const dc = this.channels.get(hostId)
    if (!dc || dc.readyState !== 'open') { this.teardownGroupCall(false); return }

    this.dcSend(dc, { type: 'group-sdp-answer', groupId: this.groupId!, sdp: answer })
    store.updateGroupParticipants(participants)
  }

  // ── Group call — shared ────────────────────────────────────────────────────

  leaveGroupCall(): void {
    const store = useAppStore.getState()
    const { groupId, participants, hostId } = store.groupCall
    if (!groupId) return

    // Notify all others
    for (const p of participants) {
      if (p.userId === this.userId) continue
      const dc = this.channels.get(p.userId)
      if (dc?.readyState === 'open') {
        this.dcSend(dc, { type: 'group-participant-left', groupId, userId: this.userId })
      }
    }

    // If we are the host, end the call for everyone
    if (hostId === this.userId) {
      for (const p of participants) {
        if (p.userId === this.userId) continue
        const dc = this.channels.get(p.userId)
        if (dc?.readyState === 'open') this.dcSend(dc, { type: 'group-ended', groupId })
      }
    }

    this.teardownGroupCall(true)
  }

  toggleGroupMute(): void {
    const store = useAppStore.getState()
    const { muted } = store.groupCall
    this.groupLocalStream?.getAudioTracks().forEach((t) => { t.enabled = muted })
    store.setGroupCall({ ...store.groupCall, muted: !muted })
  }

  private async becomeHost(groupId: string, participants: GroupParticipant[]) {
    const store = useAppStore.getState()

    // Set up audio mixing
    const audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const mixDest = audioCtx.createMediaStreamDestination()
    this.groupAudioCtx = audioCtx
    this.groupMixDest = mixDest

    // Add our own mic to mix
    if (this.groupLocalStream) {
      const src = audioCtx.createMediaStreamSource(this.groupLocalStream)
      src.connect(mixDest)
      this.groupAudioSources.set(this.userId, src)
    }

    store.setGroupCall({ ...store.groupCall, hostId: this.userId, participants })

    // Notify remaining participants
    for (const p of participants) {
      if (p.userId === this.userId) continue
      const dc = this.channels.get(p.userId)
      if (dc?.readyState === 'open') {
        this.dcSend(dc, { type: 'group-host-takeover', groupId, newHostId: this.userId, participants })
      }
    }

    // Re-connect to each participant
    for (const p of participants) {
      if (p.userId === this.userId) continue
      await this.hostConnectToParticipant(p.userId, p)
    }
  }

  private createGroupPeer(targetId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_CONFIG)
    this.groupPeers.set(targetId, pc)

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const dc = this.channels.get(targetId)
      if (dc?.readyState === 'open') {
        this.dcSend(dc, { type: 'group-ice', groupId: this.groupId!, candidate: e.candidate.toJSON() })
      }
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        this.removeParticipant(targetId)
      }
    }

    return pc
  }

  private removeParticipant(userId: string) {
    const store = useAppStore.getState()
    const { groupCall } = store
    if (!groupCall.active) return

    const remaining = groupCall.participants.filter((p) => p.userId !== userId)

    // Notify remaining participants
    for (const p of remaining) {
      if (p.userId === this.userId) continue
      const dc = this.channels.get(p.userId)
      if (dc?.readyState === 'open') {
        this.dcSend(dc, { type: 'group-participant-left', groupId: groupCall.groupId!, userId })
      }
    }

    store.updateGroupParticipants(remaining)
    this.groupPeers.get(userId)?.close()
    this.groupPeers.delete(userId)
    this.removeFromMix(userId)
  }

  private addToMix(userId: string, stream: MediaStream) {
    if (!this.groupAudioCtx || !this.groupMixDest) return
    const src = this.groupAudioCtx.createMediaStreamSource(stream)
    src.connect(this.groupMixDest)
    this.groupAudioSources.set(userId, src)
  }

  private removeFromMix(userId: string) {
    const src = this.groupAudioSources.get(userId)
    if (src) { src.disconnect(); this.groupAudioSources.delete(userId) }
  }

  private teardownGroupAudio() {
    this.groupAudioSources.forEach((s) => s.disconnect())
    this.groupAudioSources.clear()
    this.groupAudioCtx?.close()
    this.groupAudioCtx = null
    this.groupMixDest = null
  }

  private teardownGroupCall(notify: boolean) {
    if (notify) this.leaveGroupCall()  // skipped internally when called from leaveGroupCall
    this.groupPeers.forEach((pc) => pc.close())
    this.groupPeers.clear()
    this.teardownGroupAudio()
    this.groupLocalStream?.getTracks().forEach((t) => t.stop())
    this.groupLocalStream = null
    this.groupId = null
    this.groupJoinOrders.clear()
    useAppStore.getState().resetGroupCall()
  }

  // ── Messaging public API ───────────────────────────────────────────────────

  sendMessage(targetId: string, content: string): boolean {
    const dc = this.channels.get(targetId)
    if (!dc || dc.readyState !== 'open') return false
    this.dcSend(dc, { type: 'chat', content, timestamp: Date.now() })
    return true
  }

  async sendContactRequest(targetId: string, message: string): Promise<void> {
    const publicKey = await this.getPublicKeyHex()
    this.relay(targetId, { type: 'contact-request', displayName: this.displayName, publicKey, message })
  }

  async acceptRequest(req: IncomingRequest, nickname: string): Promise<void> {
    const store = useAppStore.getState()
    await window.api.contacts.add({
      profileId: this.profileId, userId: req.fromId,
      nickname: nickname.trim() || req.fromDisplayName,
      displayName: req.fromDisplayName, publicKey: req.fromPublicKey,
    })
    store.setContacts(await window.api.contacts.get(this.profileId))
    store.dismissIncomingRequest()
    const publicKey = await this.getPublicKeyHex()
    this.relay(req.fromId, { type: 'contact-request-accepted', displayName: this.displayName, publicKey })
    this.wsRaw({ type: 'presence', targetId: req.fromId })
  }

  ignoreRequest(): void { useAppStore.getState().dismissIncomingRequest() }

  async blockRequest(req: IncomingRequest): Promise<void> {
    useAppStore.getState().dismissIncomingRequest()
    await window.api.contacts.block(this.profileId, req.fromId)
  }

  updateProfile(displayName: string, status: string): void {
    this.displayName = displayName
    this.status = status
  }

  refreshContact(userId: string): void {
    const dc = this.channels.get(userId)
    if (dc?.readyState === 'open') {
      // Channel is open — ask them to re-send their profile
      this.dcSend(dc, { type: 'profile-request' })
    } else {
      // No open channel — re-check presence; if online this triggers reconnection
      // which will auto-exchange profiles when the channel opens
      this.wsRaw({ type: 'presence', targetId: userId })
    }
  }

  async broadcastProfile(displayName: string, status: string, profilePicPath: string | null): Promise<void> {
    this.displayName = displayName
    this.status = status
    const profilePicDataUrl = profilePicPath
      ? await window.api.identity.getProfilePicDataUrl(profilePicPath)
      : null
    const msg: DataChannelMessage = {
      type: 'profile', displayName, status, profilePicDataUrl,
    }
    for (const dc of this.channels.values()) {
      this.dcSend(dc, msg)
    }
  }

  destroy(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws?.close()
    this.peers.forEach((pc) => pc.close())
    this.callPeers.forEach((pc) => pc.close())
    this.localStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    this.teardownGroupAudio()
    this.groupPeers.forEach((pc) => pc.close())
    this.groupLocalStream?.getTracks().forEach((t) => t.stop())
    this.chunkBuffers.clear()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private relay(targetId: string, payload: RelayPayload) {
    log('signal', `relay → ${targetId}:`, payload.type)
    this.wsRaw({ type: 'relay', targetId, payload })
  }

  private wsRaw(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private dcSend(dc: RTCDataChannel, msg: DataChannelMessage) {
    if (dc.readyState !== 'open') return
    const json = JSON.stringify(msg)
    const CHUNK = 64 * 1024 // 64 KB — safe for all browsers
    if (json.length <= CHUNK) {
      dc.send(json)
      return
    }
    // Split into chunks with a simple framing protocol
    const id = Math.random().toString(36).slice(2, 8)
    const total = Math.ceil(json.length / CHUNK)
    for (let i = 0; i < total; i++) {
      dc.send(JSON.stringify({
        __chunk: true, id, i, total,
        data: json.slice(i * CHUNK, (i + 1) * CHUNK),
      }))
    }
  }

  private async getPublicKeyHex(): Promise<string> {
    if (!this.publicKeyHex) {
      this.publicKeyHex = await window.api.identity.getPublicKey(this.profileId)
    }
    return this.publicKeyHex
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let instance: ConnectionManager | null = null

export function initConnectionManager(profile: {
  id: string; displayName: string; status: string
}): ConnectionManager {
  instance?.destroy()
  instance = new ConnectionManager(profile.id, profile.displayName, profile.status)
  return instance
}

export function getConnectionManager(): ConnectionManager | null { return instance }
