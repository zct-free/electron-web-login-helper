import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'path';

import { normalizeUrl, normalizeSameSite, normalizeExpiration, parseCookieText, parseStorageText } from './login-parser.js';

/** webContents.id -> 待注入的 storage 数据 */
const storagePayloads = new Map();

let mainWindow = null;
let preparedLogin = null;
let tokenSeq = 0;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function prepareLogin(payload) {
  const targetUrl = normalizeUrl(payload && payload.url);
  const origin = new URL(targetUrl).origin;

  const cookies = parseCookieText(payload.cookie);
  const localStorage = parseStorageText(payload.local, 'localStorage');
  const sessionStorage = parseStorageText(payload.session, 'sessionStorage');

  tokenSeq += 1;
  preparedLogin = { token: tokenSeq, targetUrl, origin, cookies, localStorage, sessionStorage };

  return {
    token: preparedLogin.token,
    url: targetUrl,
    host: new URL(targetUrl).host,
    cookieCount: cookies.length,
    localCount: Object.keys(localStorage).length,
    sessionCount: Object.keys(sessionStorage).length
  };
}

async function writeCookies(targetSession, cookies, origin) {
  let written = 0;

  for (const cookie of cookies) {
    const details = { name: cookie.name, value: cookie.value };

    if (cookie.domain) {
      details.domain = cookie.domain;
      details.path = cookie.path || '/';
    } else {
      details.url = origin;
      if (cookie.path) details.path = cookie.path;
    }

    if (cookie.secure) details.secure = true;
    if (cookie.httpOnly) details.httpOnly = true;

    const sameSite = normalizeSameSite(cookie.sameSite);
    if (sameSite !== 'unspecified') details.sameSite = sameSite;

    const expirationDate = normalizeExpiration(cookie.expirationDate);
    if (expirationDate) details.expirationDate = expirationDate;

    try {
      await targetSession.cookies.set(details);
      written += 1;
    } catch (error) {
      // 单条 cookie 非法（例如 secure 与 http 冲突）时跳过，继续写入其余 cookie
    }
  }

  if (cookies.length && written === 0) {
    throw new Error('cookie 写入失败，请检查 cookie 的域名是否与目标网址一致');
  }

  return written;
}

async function openSite(token) {
  if (!preparedLogin || preparedLogin.token !== token) {
    throw new Error('登录信息已失效，请重新点击「打开网页」');
  }

  // 每次使用独立的内存会话，避免上次的登录态干扰本次注入
  const siteSession = session.fromPartition(`login-${Date.now()}`);
  const written = await writeCookies(siteSession, preparedLogin.cookies, preparedLogin.origin);

  const siteWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: preparedLogin.host,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/site.js'),
      session: siteSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const contentsId = siteWindow.webContents.id;
  storagePayloads.set(contentsId, {
    origin: preparedLogin.origin,
    localStorage: preparedLogin.localStorage,
    sessionStorage: preparedLogin.sessionStorage
  });

  siteWindow.on('closed', () => {
    storagePayloads.delete(contentsId);
  });

  siteWindow.loadURL(preparedLogin.targetUrl);

  return {
    host: preparedLogin.host,
    cookieCount: written,
    localCount: Object.keys(preparedLogin.localStorage).length,
    sessionCount: Object.keys(preparedLogin.sessionStorage).length
  };
}

ipcMain.on('site-storage-payload', (event) => {
  event.returnValue = storagePayloads.get(event.sender.id) || null;
});

ipcMain.handle('prepare-login', (event, payload) => {
  try {
    return { ok: true, data: prepareLogin(payload) };
  } catch (error) {
    return { ok: false, error: (error && error.message) || String(error) };
  }
});

ipcMain.handle('open-site', async (event, token) => {
  try {
    return { ok: true, data: await openSite(token) };
  } catch (error) {
    return { ok: false, error: (error && error.message) || String(error) };
  }
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
