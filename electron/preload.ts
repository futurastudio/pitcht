import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    saveVideo: (buffer: ArrayBuffer) => ipcRenderer.invoke('save-video', buffer),
});
