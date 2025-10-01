import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { chromium, Browser } from 'playwright';
import {
  AppConfig,
  loginMel1,
  loginMel2,
  LoginResult,
  Credentials,
  MelAppKey,
} from './lib/playwrightLogin';

let mainWindow: BrowserWindow | null = null;
let browserInstance: Browser | null = null;
let appConfig: AppConfig | null = null;
let pendingCaptchaResolvers: Map<MelAppKey, (text: string) => void> = new Map();

async function createWindow() {
  const preloadPath = resolvePreloadPath();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  const htmlPath = resolveRendererHtml();
  await mainWindow.loadFile(htmlPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function resolvePreloadPath(): string {
  const distPreload = path.join(__dirname, 'preload.js');
  if (fs.existsSync(distPreload)) {
    return distPreload;
  }
  const srcPreload = path.join(__dirname, 'preload.ts');
  if (fs.existsSync(srcPreload)) {
    return srcPreload;
  }
  return path.join(__dirname, '..', 'src', 'preload.ts');
}

function resolveRendererHtml(): string {
  const distHtml = path.join(__dirname, 'renderer', 'index.html');
  if (fs.existsSync(distHtml)) {
    return distHtml;
  }
  const srcHtml = path.join(__dirname, 'renderer', 'index.html');
  if (fs.existsSync(srcHtml)) {
    return srcHtml;
  }
  return path.join(__dirname, '..', 'src', 'renderer', 'index.html');
}

async function ensureBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: false });
  }
  return browserInstance;
}

function loadConfig(): AppConfig {
  if (appConfig) {
    return appConfig;
  }
  const configPath = process.env.APP_CONFIG_PATH
    ? path.resolve(process.env.APP_CONFIG_PATH)
    : path.join(__dirname, 'config', 'app.json');

  const fallbackPath = path.join(__dirname, '..', 'src', 'config', 'app.example.json');

  const finalPath = fs.existsSync(configPath) ? configPath : fallbackPath;
  const content = fs.readFileSync(finalPath, 'utf-8');
  appConfig = JSON.parse(content) as AppConfig;
  if (!appConfig.evidenceDir) {
    appConfig.evidenceDir = path.join(app.getPath('userData'), 'evidence');
  }
  return appConfig;
}

function sendLog(appKey: MelAppKey, message: string) {
  mainWindow?.webContents.send('auth:log', { app: appKey, message });
}

function sendStatus(appKey: MelAppKey, result: LoginResult) {
  mainWindow?.webContents.send('auth:status', {
    app: appKey,
    ...result,
  });
  if (!result.ok) {
    mainWindow?.webContents.send('auth:error', {
      app: appKey,
      code: result.code,
      message: result.message,
    });
  }
}

function sendCaptcha(appKey: MelAppKey, imageBuffer: Buffer) {
  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  mainWindow?.webContents.send('auth:captchaRequired', {
    app: appKey,
    image: imageDataUrl,
  });
}

async function handleLogin(appKey: MelAppKey, credentials: Credentials) {
  const config = loadConfig();
  const melConfig = config[appKey];
  if (!melConfig) {
    dialog.showErrorBox('Configuración faltante', `No se encontró configuración para ${appKey}`);
    return;
  }

  const browser = await ensureBrowser();

  const requestCaptcha = (image: Buffer) => {
    return new Promise<string>((resolve) => {
      pendingCaptchaResolvers.set(appKey, resolve);
      sendCaptcha(appKey, image);
    });
  };

  const onLog = (message: string) => sendLog(appKey, message);

  const baseOptions = {
    browser,
    config: melConfig,
    credentials,
    evidenceDir: path.resolve(config.evidenceDir || path.join(app.getPath('userData'), 'evidence')),
    genericCaptchaSelectors: config.genericCaptchaSelectors,
    onLog,
    requestCaptcha,
  };

  const result = appKey === 'mel1' ? await loginMel1(baseOptions) : await loginMel2(baseOptions);
  sendStatus(appKey, result);

  if (result.ok) {
    sendLog(appKey, 'Proceso finalizado con éxito.');
  } else {
    sendLog(appKey, `Proceso finalizado con error: ${result.message}`);
  }
}

app.whenReady().then(async () => {
  loadConfig();
  await createWindow();

  ipcMain.on('mel1:login:start', (_event, payload: Credentials) => {
    sendLog('mel1', 'Inicio de autenticación MEL 1.');
    handleLogin('mel1', payload).catch((error) => {
      sendLog('mel1', `Error inesperado: ${(error as Error).message}`);
    });
  });

  ipcMain.on('mel2:login:start', (_event, payload: Credentials) => {
    sendLog('mel2', 'Inicio de autenticación MEL 2.');
    handleLogin('mel2', payload).catch((error) => {
      sendLog('mel2', `Error inesperado: ${(error as Error).message}`);
    });
  });

  ipcMain.on('mel1:captcha:submit', (_event, payload: { captchaText: string }) => {
    const iterator = pendingCaptchaResolvers.entries().next();
    if (!iterator.done) {
      const [appKey, resolver] = iterator.value;
      resolver(payload.captchaText);
      pendingCaptchaResolvers.delete(appKey);
      sendLog(appKey, 'Texto de CAPTCHA recibido.');
    }
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await browserInstance?.close();
    app.quit();
  }
});
