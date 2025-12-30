import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

let mainWindow: BrowserWindow | null;
let emotionServiceProcess: ChildProcess | null = null;

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
                            "connect-src 'self' https://*.supabase.co https://api.anthropic.com https://api.openai.com https://api.stripe.com https://cdn.jsdelivr.net http://localhost:5001 wss://*.supabase.co",
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

// Start Python emotion service
async function startEmotionService() {
    try {
        const isDev = process.env.NODE_ENV === 'development';
        const basePath = isDev ? process.cwd() : path.join(process.resourcesPath, 'app');

        // Determine Python path based on platform
        const pythonPath = process.platform === 'win32'
            ? path.join(basePath, 'python-services', 'venv', 'Scripts', 'python.exe')
            : path.join(basePath, 'python-services', 'venv', 'bin', 'python3');

        const scriptPath = path.join(basePath, 'python-services', 'emotion_service.py');

        try {
            if (process.stdout.writable) {
                console.log('Starting emotion service...');
                console.log('Python path:', pythonPath);
                console.log('Script path:', scriptPath);
            }
        } catch (e) {
            // Ignore EPIPE errors
        }

        emotionServiceProcess = spawn(pythonPath, [scriptPath]);

        emotionServiceProcess.stdout?.on('data', (data) => {
            try {
                if (process.stdout.writable) {
                    console.log(`[Emotion Service]: ${data}`);
                }
            } catch (e) {
                // Ignore EPIPE errors - stdout may be closed
            }
        });

        emotionServiceProcess.stderr?.on('data', (data) => {
            try {
                if (process.stderr.writable) {
                    console.error(`[Emotion Service Error]: ${data}`);
                }
            } catch (e) {
                // Ignore EPIPE errors - stderr may be closed
            }
        });

        emotionServiceProcess.on('error', (error) => {
            try {
                if (process.stderr.writable) {
                    console.error('[Emotion Service] Failed to start:', error);
                }
            } catch (e) {
                // Ignore EPIPE errors
            }
            emotionServiceProcess = null;
        });

        emotionServiceProcess.on('exit', (code) => {
            try {
                if (process.stdout.writable) {
                    console.log(`[Emotion Service] Exited with code ${code}`);
                }
            } catch (e) {
                // Ignore EPIPE errors
            }
            emotionServiceProcess = null;
        });

        // Wait a bit for service to start
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
            if (process.stdout.writable) {
                console.log('Emotion service startup complete');
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
    } catch (error) {
        try {
            if (process.stderr.writable) {
                console.error('Failed to start emotion service:', error);
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
        // Continue anyway - app should work without emotion analysis
    }
}

app.whenReady().then(async () => {
    // Start emotion service first (non-blocking)
    startEmotionService().catch((err) => {
        try {
            if (process.stderr.writable) {
                console.warn('Emotion service failed to start, continuing without it:', err);
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
    });

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

// Cleanup: Kill emotion service when app quits
app.on('before-quit', () => {
    if (emotionServiceProcess) {
        try {
            if (process.stdout.writable) {
                console.log('Stopping emotion service...');
            }
        } catch (e) {
            // Ignore EPIPE errors
        }
        emotionServiceProcess.kill();
        emotionServiceProcess = null;
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
