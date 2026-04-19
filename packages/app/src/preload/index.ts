import { contextBridge, ipcRenderer } from 'electron'

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
  blocked: number
  added_at: number
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

const api = {
  win: {
    minimize:        (): Promise<void>    => ipcRenderer.invoke('window:minimize'),
    maximize:        (): Promise<void>    => ipcRenderer.invoke('window:maximize'),
    close:           (): Promise<void>    => ipcRenderer.invoke('window:close'),
    isMaximized:     (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maximized', (_e, v: boolean) => cb(v))
    },
  },

  identity: {
    getProfiles: (): Promise<Profile[]> =>
      ipcRenderer.invoke('identity:get-profiles'),

    createProfile: (displayName: string): Promise<Profile> =>
      ipcRenderer.invoke('identity:create-profile', displayName),

    getPublicKey: (profileId: string): Promise<string> =>
      ipcRenderer.invoke('identity:get-public-key', profileId),

    updateProfile: (id: string, displayName: string, status: string): Promise<void> =>
      ipcRenderer.invoke('identity:update-profile', { id, displayName, status }),

    export: (profileId: string, password: string): Promise<{ success: boolean; path?: string }> =>
      ipcRenderer.invoke('identity:export', { profileId, password }),

    saveCroppedProfilePic: (profileId: string, dataUrl: string): Promise<{ filename: string; hash: string }> =>
      ipcRenderer.invoke('identity:save-cropped-profile-pic', { profileId, dataUrl }),

    removeProfilePic: (profileId: string): Promise<void> =>
      ipcRenderer.invoke('identity:remove-profile-pic', profileId),

    getProfilePicDataUrl: (filename: string): Promise<string | null> =>
      ipcRenderer.invoke('identity:get-profile-pic-data-url', filename),
  },

  contacts: {
    get: (profileId: string): Promise<Contact[]> =>
      ipcRenderer.invoke('contacts:get', profileId),

    add: (params: {
      profileId: string
      userId: string
      nickname: string
      displayName: string
      publicKey: string
    }): Promise<void> => ipcRenderer.invoke('contacts:add', params),

    updatePresence: (params: {
      profileId: string
      userId: string
      displayName: string
      status: string
    }): Promise<void> => ipcRenderer.invoke('contacts:update-presence', params),

    block: (profileId: string, userId: string): Promise<void> =>
      ipcRenderer.invoke('contacts:block', { profileId, userId }),

    saveProfilePic: (params: { profileId: string; userId: string; dataUrl: string }): Promise<{ filename: string; hash: string }> =>
      ipcRenderer.invoke('contacts:save-profile-pic', params),

    removeProfilePic: (params: { profileId: string; userId: string }): Promise<void> =>
      ipcRenderer.invoke('contacts:remove-profile-pic', params),
  },

  messages: {
    get: (profileId: string, contactUserId: string): Promise<Message[]> =>
      ipcRenderer.invoke('messages:get', { profileId, contactUserId }),

    save: (params: {
      profileId: string
      contactUserId: string
      direction: 'sent' | 'received'
      content: string
      type: 'text' | 'file'
      timestamp: number
    }): Promise<{ id: number }> => ipcRenderer.invoke('messages:save', params),

    markRead: (profileId: string, contactUserId: string): Promise<void> =>
      ipcRenderer.invoke('messages:mark-read', { profileId, contactUserId }),

    setReaction: (messageId: number, reaction: string | null): Promise<void> =>
      ipcRenderer.invoke('messages:set-reaction', { messageId, reaction }),
  },
}

const updater = {
  onReady: (cb: () => void) => ipcRenderer.on('update:ready', cb),
  install:  (): Promise<void> => ipcRenderer.invoke('update:install'),
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('updater', updater)

export type Api = typeof api
