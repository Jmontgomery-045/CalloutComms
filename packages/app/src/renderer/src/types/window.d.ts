import type { Api } from '../../../preload'

declare global {
  interface Window {
    api: Api
    updater: {
      onReady(cb: () => void): void
      install(): Promise<void>
    }
  }
}

declare const __APP_VERSION__: string

export {}
