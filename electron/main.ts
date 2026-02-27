import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';

let mainWindow: BrowserWindow | null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Set Content Security Policy for Electron renderer
    // In development, use relaxed CSP for React HMR
    // In production, use strict CSP for security
    const isDev = process.env.NODE_ENV === 'development';

    if (!isDev) {
        // Only apply strict CSP in production
        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        [
                            "default-src 'self'",
                            // Scripts: Allow self and inline (Next.js requires it)
                            // unsafe-eval and wasm-unsafe-eval are required for MediaPipe WebAssembly
                            "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net blob:",
                            // Styles: Allow self and inline (Tailwind)
                            "style-src 'self' 'unsafe-inline'",
                            // Images: Allow from self, data URIs, and Supabase
                            "img-src 'self' data: blob: https://*.supabase.co",
                            // Fonts: Allow from self and data URIs
                            "font-src 'self' data:",
                            // API connections
                            "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://api.stripe.com https://cdn.jsdelivr.net wss://*.supabase.co",
                            // Media: Allow blob URLs for video recording
                            "media-src 'self' blob: https://*.supabase.co",
                            // Workers: Allow blob URLs
                            "worker-src 'self' blob:",
                            // Frames: Allow Stripe
                            "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
                            // Block plugins
                            "object-src 'none'",
                        ].join('; ')
                    ]
                }
            });
        });
    }

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../out/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

app.whenReady().then(async () => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


// Helper function to get app data directory
const getRecordingsDirectory = async () => {
    const userDataPath = app.getPath('userData');
    const recordingsPath = path.join(userDataPath, 'recordings');

    // Ensure directory exists
    try {
        await fs.access(recordingsPath);
    } catch {
        await fs.mkdir(recordingsPath, { recursive: true });
    }

    return recordingsPath;
};

// IPC Handlers
ipcMain.handle('save-video', async (_event, arrayBuffer) => {
    try {
        const buffer = Buffer.from(arrayBuffer);
        const recordingsDir = await getRecordingsDirectory();

        // Auto-generate unique filename with timestamp
        const filename = `recording-${Date.now()}.webm`;
        const filePath = path.join(recordingsDir, filename);

        // Save silently without user prompt
        await fs.writeFile(filePath, buffer);

        try {
            if (process.stdout.writable) {
                console.log('Video saved to:', filePath);
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
        return { success: true, filePath };
    } catch (error) {
        try {
            if (process.stderr.writable) {
                console.error('Failed to save video:', error);
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
        return { success: false, error: String(error) };
    }
});

// Read video for playback on analysis page
ipcMain.handle('read-video', async (_event, videoPath) => {
    try {
        const buffer = await fs.readFile(videoPath);
        const base64 = buffer.toString('base64');
        const dataUrl = `data:video/webm;base64,${base64}`;

        return { success: true, data: dataUrl };
    } catch (error) {
        try {
            if (process.stderr.writable) {
                console.error('Failed to read video:', error);
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
        return { success: false, error: String(error) };
    }
});
