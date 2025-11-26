import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    const isDev = process.env.NODE_ENV === 'development';
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

app.whenReady().then(() => {
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

// IPC Handlers
ipcMain.handle('save-video', async (event, arrayBuffer) => {
    try {
        const buffer = Buffer.from(arrayBuffer);
        const { filePath } = await dialog.showSaveDialog({
            title: 'Save Interview Recording',
            defaultPath: `interview-${Date.now()}.webm`,
            filters: [{ name: 'WebM Video', extensions: ['webm'] }],
        });

        if (filePath) {
            await fs.writeFile(filePath, buffer);
            return { success: true, filePath };
        }
        return { success: false, error: 'Cancelled' };
    } catch (error) {
        console.error('Failed to save video:', error);
        return { success: false, error: String(error) };
    }
});
