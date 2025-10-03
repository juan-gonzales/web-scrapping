import fs from "fs";
import path from "path";
import { Browser, Page } from "playwright";

export type MelAppKey = "mel1" | "mel2";

export interface TimeoutConfig {
  goto: number;
  anchors: number;
}

export interface MelSelectors {
  user: string;
  pass: string;
  captchaImage?: string;
  captchaInput?: string;
  submit: string;
  anchorsAfterLogin: string[];
}

export interface MelConfig {
  loginUrl: string;
  selectors: MelSelectors;
  urlPatternAfterLogin?: string;
  titleAfterLogin?: string;
  timeoutsMs: TimeoutConfig;
}

export interface AppConfig {
  mel1: MelConfig;
  mel2: MelConfig;
  evidenceDir: string;
  genericCaptchaSelectors?: string[];
}

export interface Credentials {
  user: string;
  pass: string;
}

export interface LoginSuccess {
  ok: true;
  title: string;
  url: string;
  anchors: string[];
  screenshotPath: string;
  screenshotThumb: string;
  page: Page;
  context: any;
}

export interface LoginFailure {
  ok: false;
  code: string;
  message: string;
}

export type LoginResult = LoginSuccess | LoginFailure;

export interface LoginOptions {
  browser: Browser;
  config: MelConfig;
  credentials: Credentials;
  evidenceDir: string;
  genericCaptchaSelectors?: string[];
  onLog?: (message: string) => void;
  requestCaptcha?: (image: Buffer) => Promise<string>;
}

export async function loginMel1(options: LoginOptions): Promise<LoginResult> {
  return loginWithConfig({ ...options, appKey: "mel1" });
}

export async function loginMel2(options: LoginOptions): Promise<LoginResult> {
  return loginWithConfig({ ...options, appKey: "mel2" });
}

interface InternalOptions extends LoginOptions {
  appKey: MelAppKey;
}

async function loginWithConfig(options: InternalOptions): Promise<LoginResult> {
  const {
    browser,
    config,
    credentials,
    evidenceDir,
    genericCaptchaSelectors,
    onLog,
    requestCaptcha,
    appKey,
  } = options;
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  const selectors = config.selectors;

  const log = (msg: string) => {
    if (onLog) {
      onLog(msg);
    }
  };

  try {
    log(`Navegando a ${config.loginUrl}`);
    await page.goto(config.loginUrl, {
      timeout: config.timeoutsMs.goto,
      waitUntil: "domcontentloaded",
    });

    await fillInput(page, selectors.user, credentials.user, "usuario", log);
    await fillInput(page, selectors.pass, credentials.pass, "contraseña", log);

    const captchaHandle = await detectCaptcha(
      page,
      selectors.captchaImage,
      genericCaptchaSelectors
    );

    if (captchaHandle) {
      if (!selectors.captchaInput) {
        return {
          ok: false,
          code: "CAPTCHA_INPUT_MISSING",
          message:
            "Se detectó CAPTCHA pero no hay selector configurado para el input.",
        };
      }

      log("CAPTCHA detectado, esperando texto ingresado por el usuario.");
      const captchaBuffer = await captchaHandle.screenshot();
      const captchaText = requestCaptcha
        ? await requestCaptcha(captchaBuffer)
        : undefined;

      if (!captchaText) {
        return {
          ok: false,
          code: "CAPTCHA_TEXT_MISSING",
          message: "No se proporcionó texto del CAPTCHA.",
        };
      }

      await fillInput(
        page,
        selectors.captchaInput,
        captchaText,
        "captcha",
        log,
        true
      );
    }

    log("Enviando formulario de login.");

    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => undefined),
      page.click(selectors.submit),
    ]);

    await waitForPostLogin(page, config, log);

    const anchorsFound = await collectAnchors(
      page,
      selectors.anchorsAfterLogin,
      config.timeoutsMs.anchors,
      log
    );
    if (anchorsFound.length === 0) {
      return {
        ok: false,
        code: "ANCHORS_NOT_FOUND",
        message:
          "No se encontraron los selectores ancla configurados después del login.",
      };
    }

    if (config.urlPatternAfterLogin) {
      const currentUrl = page.url();
      if (!new RegExp(config.urlPatternAfterLogin).test(currentUrl)) {
        return {
          ok: false,
          code: "URL_PATTERN_MISMATCH",
          message: `La URL actual (${currentUrl}) no coincide con el patrón esperado (${config.urlPatternAfterLogin}).`,
        };
      }
    }

    if (config.titleAfterLogin) {
      const pageTitle = await page.title();
      if (pageTitle.trim() !== config.titleAfterLogin.trim()) {
        return {
          ok: false,
          code: "TITLE_MISMATCH",
          message: `El título de la página (${pageTitle}) no coincide con el esperado (${config.titleAfterLogin}).`,
        };
      }
    }

    ensureDir(evidenceDir);
    const screenshotPath = path.join(
      evidenceDir,
      `${appKey}-screenshot-${Date.now()}.png`
    );
    log("Capturando evidencia.");
    const screenshotBuffer = await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    const title = await page.title();
    const url = page.url();

    log("Login completado correctamente.");

    return {
      ok: true,
      title,
      url,
      anchors: anchorsFound,
      screenshotPath,
      screenshotThumb: `data:image/png;base64,${screenshotBuffer.toString(
        "base64"
      )}`,
      page,
      context,
    };
  } catch (error) {
    log(`Error durante el login: ${(error as Error).message}`);
    await page.close();
    await context.close();
    return {
      ok: false,
      code: "LOGIN_ERROR",
      message: (error as Error).message,
    };
  }
}

async function fillInput(
  page: Page,
  selector: string,
  value: string,
  label: string,
  log: (msg: string) => void,
  clear = false
) {
  if (!selector) {
    throw new Error(`Selector de ${label} no configurado.`);
  }
  log(`Completando campo ${label} (${selector}).`);
  await page.waitForSelector(selector, { state: "visible", timeout: 20000 });
  if (clear) {
    await page.fill(selector, "");
  }
  await page.fill(selector, value);
}

async function detectCaptcha(
  page: Page,
  captchaSelector?: string,
  genericSelectors?: string[]
) {
  if (captchaSelector) {
    const handle = await page.$(captchaSelector);
    if (handle) {
      return handle;
    }
  }

  if (genericSelectors && genericSelectors.length > 0) {
    for (const selector of genericSelectors) {
      const handle = await page.$(selector);
      if (handle) {
        return handle;
      }
    }
  }

  return null;
}

async function waitForPostLogin(
  page: Page,
  config: MelConfig,
  log: (msg: string) => void
) {
  log("Esperando navegación post login.");
  try {
    await page.waitForNavigation({
      timeout: config.timeoutsMs.goto,
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    log("No se detectó navegación explícita, continuando con validaciones.");
  }
}

async function collectAnchors(
  page: Page,
  anchors: string[],
  totalTimeout: number,
  log: (msg: string) => void
) {
  const anchorsFound: string[] = [];
  const timeoutPerAnchor =
    anchors.length > 0
      ? Math.max(2000, Math.floor(totalTimeout / anchors.length))
      : totalTimeout;
  await page.waitForTimeout(1000);
  for (const anchor of anchors) {
    try {
      const element = await page.waitForSelector(anchor, {
        timeout: timeoutPerAnchor,
        state: "attached",
      });
      if (element) {
        anchorsFound.push(anchor);
        log(`Ancla encontrada: ${anchor}`);
      }
    } catch {
      log(`Ancla no encontrada durante el tiempo esperado: ${anchor}`);
    }
  }
  return anchorsFound;
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
