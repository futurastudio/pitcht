# Electron IPC Documentation

> Last Updated: 2025-01-05
> Living documentation for Electron main process and IPC communication

---

## Overview

Pitcht uses Electron to provide desktop app capabilities:
- Video recording and local file storage
- Python service lifecycle management
- Native file system access
- No save dialogs (auto-save recordings)

**Architecture**:
```
Renderer (React) <-> Preload (IPC Bridge) <-> Main (Electron)
```

---

## Files

```
electron/
├── main.ts          # Main process (Node.js environment)
└── preload.js       # IPC bridge (sandboxed context)
```

---

## Main Process (main.ts)

### App Lifecycle

#### App Initialization
```typescript
app.whenReady().then(() => {
  createWindow()
  startPythonService()
})
```

**Order**:
1. Create browser window
2. Load Next.js dev server (dev) or production build
3. Start Python emotion detection service
4. Register IPC handlers

#### App Quit
```typescript
app.on('quit', () => {
  stopPythonService()
})
```

**Cleanup**:
- Kill Python service process
- Close all browser windows
- Clean up temp files

---

### Window Management

#### createWindow()
```typescript
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // Security
      nodeIntegration: false        // Security
    }
  })

  // Load app
  if (isDev) {
    win.loadURL('http://localhost:3000')
  } else {
    win.loadFile('out/index.html')
  }
}
```

**Security**:
- Context isolation ON (renderer can't access Node.js directly)
- Node integration OFF (no direct require() in renderer)
- Preload script provides controlled IPC bridge

---

### IPC Handlers

All IPC handlers use `ipcMain.handle()` for async request/response pattern.

#### save-video
**Purpose**: Save video recording to disk (auto-save, no dialogs)

**Request**:
```typescript
window.electron.saveVideo(arrayBuffer: ArrayBuffer)
```

**Implementation**:
```typescript
ipcMain.handle('save-video', async (event, arrayBuffer) => {
  const recordingsDir = getRecordingsDirectory()
  const fileName = `recording-${Date.now()}.webm`
  const filePath = path.join(recordingsDir, fileName)

  await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer))

  return {
    success: true,
    filePath: filePath
  }
})
```

**Directory**: `~/Library/Application Support/Electron/recordings/`
**Format**: WebM (video + audio)
**Naming**: `recording-{timestamp}.webm`

**Error Handling**: Returns `{ success: false, error: string }` on failure

---

#### read-video
**Purpose**: Read video file from disk for playback in Analysis page

**Request**:
```typescript
window.electron.readVideo(filePath: string): Promise<ArrayBuffer>
```

**Implementation**:
```typescript
ipcMain.handle('read-video', async (event, filePath) => {
  const buffer = await fs.promises.readFile(filePath)
  return buffer.buffer
})
```

**Usage**:
1. Recording saves to disk with filePath
2. Analysis page requests video via filePath
3. Blob created from ArrayBuffer for video player

**Security**: File path validation should be added to prevent directory traversal attacks.

---

### Python Service Management

#### startPythonService()
```typescript
function startPythonService() {
  const pythonPath = '/usr/bin/python3'  // or from venv
  const scriptPath = path.join(__dirname, '../python-services/emotion_service.py')

  pythonProcess = spawn(pythonPath, [scriptPath])

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python service: ${data}`)
  })

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python service error: ${data}`)
  })

  pythonProcess.on('close', (code) => {
    console.log(`Python service exited with code ${code}`)
  })

  console.log('✅ Python emotion service started')
}
```

**Service Details**:
- **Port**: 5001
- **Endpoints**: /health, /analyze-video-path
- **Startup Time**: ~2-3 seconds (DeepFace model loading)

#### stopPythonService()
```typescript
function stopPythonService() {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
    console.log('✅ Python emotion service stopped')
  }
}
```

**Cleanup**: Called on app quit to prevent orphaned processes

---

### File System Helpers

#### getRecordingsDirectory()
```typescript
function getRecordingsDirectory(): string {
  const userDataPath = app.getPath('userData')
  const recordingsPath = path.join(userDataPath, 'recordings')

  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true })
  }

  return recordingsPath
}
```

**Paths by Platform**:
- macOS: `~/Library/Application Support/Electron/recordings/`
- Windows: `C:\Users\{user}\AppData\Roaming\Electron\recordings\`
- Linux: `~/.config/Electron/recordings/`

---

## Preload Script (preload.js)

### IPC Bridge

The preload script exposes controlled IPC methods to the renderer via `contextBridge`.

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  saveVideo: (arrayBuffer) => ipcRenderer.invoke('save-video', arrayBuffer),
  readVideo: (filePath) => ipcRenderer.invoke('read-video', filePath)
})
```

**Security**:
- Only specific methods exposed (not entire ipcRenderer)
- No direct Node.js access in renderer
- Context isolation prevents prototype pollution

---

## Renderer Usage (React/TypeScript)

### Type Definitions

```typescript
// Add to window object
declare global {
  interface Window {
    electron?: {
      saveVideo: (arrayBuffer: ArrayBuffer) => Promise<{
        success: boolean,
        filePath?: string,
        error?: string
      }>,
      readVideo: (filePath: string) => Promise<ArrayBuffer>
    }
  }
}
```

### Save Recording Example

```typescript
// interview/page.tsx
if (window.electron) {
  const blob = await stopRecording()
  const arrayBuffer = await blob.arrayBuffer()

  const result = await window.electron.saveVideo(arrayBuffer)

  if (result.success) {
    console.log('Video saved to:', result.filePath)
    // Store filePath in database for later playback
  } else {
    console.error('Failed to save video:', result.error)
  }
}
```

### Read Recording Example

```typescript
// analysis/page.tsx
if (window.electron) {
  const arrayBuffer = await window.electron.readVideo(recording.videoPath)
  const blob = new Blob([arrayBuffer], { type: 'video/webm' })
  const url = URL.createObjectURL(blob)

  setVideoSrc(url)
}
```

---

## Development vs Production

### Development
```typescript
const isDev = !app.isPackaged

if (isDev) {
  win.loadURL('http://localhost:3000')  // Next.js dev server
}
```

### Production
```typescript
if (!isDev) {
  win.loadFile('out/index.html')  // Static build
}
```

**Build Process**:
1. `npm run build` - Build Next.js static export
2. `npm run electron-build` - Package Electron app
3. Output: `dist/Pitcht.app` (macOS) or `dist/Pitcht.exe` (Windows)

---

## Security Considerations

### Current Security
✅ Context isolation enabled
✅ Node integration disabled
✅ Preload script with controlled API surface

### Improvements Needed
⚠️ File path validation (prevent directory traversal)
⚠️ Content Security Policy (CSP) for renderer
⚠️ Code signing for distribution
⚠️ Auto-update mechanism

---

## Error Handling

### IPC Handler Errors
```typescript
ipcMain.handle('save-video', async (event, arrayBuffer) => {
  try {
    // Save logic
    return { success: true, filePath }
  } catch (error) {
    console.error('Save video error:', error)
    return { success: false, error: error.message }
  }
})
```

### Renderer Error Handling
```typescript
if (!window.electron) {
  console.warn('Electron API not available (browser mode)')
  // Fallback to browser-based recording
}
```

---

## Python Service Integration

### Health Check
```typescript
// emotionAnalyzer.ts
const response = await fetch('http://localhost:5001/health')
if (!response.ok) {
  console.warn('Python service not available')
}
```

### Graceful Degradation
```typescript
const serviceHealthy = await checkEmotionService()

if (serviceHealthy) {
  emotionData = await analyzeVideoPath(videoPath)
} else {
  console.log('Continuing without emotion analysis')
  emotionData = null
}
```

**UX Impact**: App works without Python service, just missing emotion metrics

---

## Performance Optimization

### Video Encoding
- Use WebM format (efficient, web-native)
- Audio-only for transcription (~2MB/min)
- Video+audio for playback (~12MB/min)

### File I/O
- Async file operations (don't block main thread)
- Stream large files if needed
- Clean up old recordings periodically

### Process Management
- Monitor Python service health
- Restart service if crashes
- Kill zombie processes on quit

---

## Testing

### Manual Testing
```bash
# Dev mode
npm run electron-dev

# Production build
npm run build
npm run electron-build
open dist/Pitcht.app
```

### IPC Testing
```typescript
// Renderer console
await window.electron.saveVideo(new ArrayBuffer(100))
// Should return { success: true, filePath: "..." }

await window.electron.readVideo('/path/to/video.webm')
// Should return ArrayBuffer
```

---

## Packaging & Distribution

### Build Commands
```bash
# macOS
npm run electron-build

# Windows
npm run electron-build:win

# Linux
npm run electron-build:linux
```

### Configuration (package.json)
```json
"build": {
  "appId": "com.pitcht.app",
  "productName": "Pitcht",
  "files": [
    "out/**/*",
    "electron/**/*",
    "python-services/**/*"
  ],
  "mac": {
    "target": "dmg",
    "icon": "public/icon.icns"
  }
}
```

### Code Signing (Production)
```bash
# macOS
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=password
npm run electron-build
```

---

## Troubleshooting

### Common Issues

**1. Electron API not available**
```
window.electron is undefined
```
**Solution**: Check preload script is loading, context isolation is enabled

**2. Python service not starting**
```
Python service exited with code 1
```
**Solution**: Check Python dependencies installed, correct Python path

**3. Videos not saving**
```
ENOENT: no such file or directory
```
**Solution**: Run `getRecordingsDirectory()` to create directory

**4. IPC timeout**
```
Error: IPC timeout
```
**Solution**: Increase timeout, check main process isn't blocked

---

## Changelog

### 2025-01-05
- Added documentation for Python service lifecycle
- Clarified security model (context isolation + preload)
- Added troubleshooting section

### Previous Changes
- See commit history for full changelog
