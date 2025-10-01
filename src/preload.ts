import { contextBridge, ipcRenderer } from 'electron';

type StatusCallback = (payload: any) => void;
type CaptchaCallback = (payload: any) => void;
type LogCallback = (payload: any) => void;

const electronAPI = {
  startMel1Login: (credentials: { user: string; pass: string }) => {
    ipcRenderer.send('mel1:login:start', credentials);
  },
  submitMel1CaptchaText: (payload: { captchaText: string }) => {
    ipcRenderer.send('mel1:captcha:submit', payload);
  },
  startMel2Login: (credentials: { user: string; pass: string }) => {
    ipcRenderer.send('mel2:login:start', credentials);
  },
  onLoginStatus: (callback: StatusCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('auth:status', listener);
    return () => ipcRenderer.removeListener('auth:status', listener);
  },
  onCaptchaRequired: (callback: CaptchaCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('auth:captchaRequired', listener);
    return () => ipcRenderer.removeListener('auth:captchaRequired', listener);
  },
  onLog: (callback: LogCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('auth:log', listener);
    return () => ipcRenderer.removeListener('auth:log', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
