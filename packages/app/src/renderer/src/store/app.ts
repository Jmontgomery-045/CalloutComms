import { create } from 'zustand'

export type Profile = {
  id: string
  displayName: string
  status: string
  profilePicPath: string | null
  profilePicHash: string | null
}

export type Contact = {
  id: number
  user_id: string
  nickname: string
  display_name: string
  status: string
  profile_pic_path: string | null
  profile_pic_hash: string | null
  online: boolean
}

export type Message = {
  id: number
  direction: 'sent' | 'received'
  content: string
  type: 'text' | 'file'
  timestamp: number
  read: number
  reaction: string | null
}

export type IncomingRequest = {
  fromId: string
  fromDisplayName: string
  fromPublicKey: string
  message: string
}

// ── 1-to-1 call ───────────────────────────────────────────────────────────────

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active'

export type CallState = {
  status: CallStatus
  contactId: string | null
  muted: boolean
  startTime: number | null
  remoteStream: MediaStream | null
}

// ── Group call ────────────────────────────────────────────────────────────────

export type GroupParticipant = {
  userId: string
  nickname: string
  joinOrder: number  // epoch ms — determines host succession order
}

export type GroupCallState = {
  active: boolean
  groupId: string | null
  hostId: string | null
  participants: GroupParticipant[]
  muted: boolean
  /** Non-null while we have a pending incoming invite to show */
  pendingInvite: {
    groupId: string
    hostId: string
    hostNickname: string
    currentCount: number
  } | null
}

// ── Store ─────────────────────────────────────────────────────────────────────

type AppState = {
  profiles: Profile[]
  activeProfile: Profile | null
  contacts: Contact[]
  selectedContactId: string | null
  messages: Record<string, Message[]>
  incomingRequests: IncomingRequest[]
  call: CallState
  groupCall: GroupCallState

  setProfiles(profiles: Profile[]): void
  setActiveProfile(profile: Profile | null): void
  addProfile(profile: Profile): void
  setContacts(contacts: Contact[]): void
  setContactOnline(userId: string, online: boolean): void
  selectContact(userId: string | null): void
  setMessages(contactUserId: string, messages: Message[]): void
  appendMessage(contactUserId: string, message: Message): void
  pushIncomingRequest(req: IncomingRequest): void
  dismissIncomingRequest(): void
  setCallState(partial: Partial<CallState>): void
  resetCall(): void
  setGroupCall(state: GroupCallState): void
  updateGroupParticipants(participants: GroupParticipant[]): void
  resetGroupCall(): void
}

const IDLE_CALL: CallState = {
  status: 'idle', contactId: null, muted: false, startTime: null, remoteStream: null,
}

const IDLE_GROUP: GroupCallState = {
  active: false, groupId: null, hostId: null, participants: [], muted: false, pendingInvite: null,
}

export const useAppStore = create<AppState>((set) => ({
  profiles: [],
  activeProfile: null,
  contacts: [],
  selectedContactId: null,
  messages: {},
  incomingRequests: [],
  call: IDLE_CALL,
  groupCall: IDLE_GROUP,

  setProfiles: (profiles) => set({ profiles }),
  setActiveProfile: (activeProfile) => set({ activeProfile }),
  addProfile: (profile) =>
    set((s) => ({ profiles: [...s.profiles, profile], activeProfile: profile })),

  setContacts: (rawContacts) =>
    set((s) => ({
      contacts: rawContacts.map((c) => ({
        ...c,
        online: s.contacts.find((x) => x.user_id === c.user_id)?.online ?? false,
      })),
    })),

  setContactOnline: (userId, online) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.user_id === userId ? { ...c, online } : c)),
    })),

  selectContact: (selectedContactId) => set({ selectedContactId }),

  setMessages: (contactUserId, messages) =>
    set((s) => ({ messages: { ...s.messages, [contactUserId]: messages } })),

  appendMessage: (contactUserId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [contactUserId]: [...(s.messages[contactUserId] ?? []), message],
      },
    })),

  pushIncomingRequest: (req) =>
    set((s) => ({ incomingRequests: [...s.incomingRequests, req] })),
  dismissIncomingRequest: () =>
    set((s) => ({ incomingRequests: s.incomingRequests.slice(1) })),

  setCallState: (partial) => set((s) => ({ call: { ...s.call, ...partial } })),
  resetCall: () => set({ call: IDLE_CALL }),

  setGroupCall: (groupCall) => set({ groupCall }),
  updateGroupParticipants: (participants) =>
    set((s) => ({ groupCall: { ...s.groupCall, participants } })),
  resetGroupCall: () => set({ groupCall: IDLE_GROUP }),
}))
