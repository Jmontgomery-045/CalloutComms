import { app, BrowserWindow, shell, nativeImage, ipcMain, protocol } from 'electron'
import { join, normalize } from 'path'
import { autoUpdater } from 'electron-updater'
import sodium from 'libsodium-wrappers'
import { initDb } from './db'
import { registerIpcHandlers } from './ipc'

function createWindow(): BrowserWindow {
  const icon = nativeImage.createFromPath(join(__dirname, '../../assets/icon.ico'))
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f14',
    icon,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // Notify renderer when maximise state changes
  win.on('maximize',   () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Window control IPC
  ipcMain.handle('window:minimize',     () => win.minimize())
  ipcMain.handle('window:maximize',     () => win.isMaximized() ? win.unmaximize() : win.maximize())
  ipcMain.handle('window:close',        () => win.close())
  ipcMain.handle('window:is-maximized', () => win.isMaximized())

  return win
}

function initAutoUpdater(win: BrowserWindow): void {
  // Don't check for updates in dev
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update:ready')
  })

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })
}

app.whenReady().then(async () => {
  // Serve local profile-pics from userData without exposing arbitrary file paths
  protocol.registerFileProtocol('callout-file', (request, callback) => {
    const filename = decodeURIComponent(request.url.replace('callout-file://', ''))
    const filePath = normalize(join(app.getPath('userData'), 'profile-pics', filename))
    callback({ path: filePath })
  })

  await sodium.ready
  await initDb()
  registerIpcHandlers()
  const win = createWindow()
  initAutoUpdater(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
