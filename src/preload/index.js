import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  prepare: (payload) => ipcRenderer.invoke('prepare-login', payload),
  openSite: (token) => ipcRenderer.invoke('open-site', token)
});
