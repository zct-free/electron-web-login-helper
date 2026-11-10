import { ipcRenderer } from 'electron';

let payload = null;
try {
  payload = ipcRenderer.sendSync('site-storage-payload');
} catch (error) {
  payload = null;
}

if (payload && (!payload.origin || location.origin === payload.origin)) {
  const write = (storage, entries) => {
    Object.keys(entries || {}).forEach((key) => {
      try {
        storage.setItem(key, entries[key]);
      } catch (error) {
        // 忽略写入失败的条目
      }
    });
  };

  try {
    // 在页面自身脚本执行前写入，页面加载完即为已登录状态
    write(window.localStorage, payload.localStorage);
    write(window.sessionStorage, payload.sessionStorage);
  } catch (error) {
    // 存储被禁用时忽略
  }
}
