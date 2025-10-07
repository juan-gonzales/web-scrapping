import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import { chromium, Browser } from "playwright";
import {
  AppConfig,
  loginMel1,
  loginMel2,
  LoginResult,
  Credentials,
  MelAppKey,
} from "./lib/playwrightLogin";
import { LoginSuccess } from "./lib/playwrightLogin";

let mainWindow: BrowserWindow | null = null;
let browserInstance: Browser | null = null;
let appConfig: AppConfig | null = null;
let pendingCaptchaResolvers: Map<MelAppKey, (text: string) => void> = new Map();
let loginStates: Record<MelAppKey, boolean> = {
  mel1: false,
  mel2: false,
};

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
  mainWindow.maximize();
  const htmlPath = resolveRendererHtml();
  await mainWindow.loadFile(htmlPath);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function resolvePreloadPath(): string {
  const distPreload = path.join(__dirname, "preload.js");
  if (fs.existsSync(distPreload)) {
    return distPreload;
  }
  const srcPreload = path.join(__dirname, "preload.ts");
  if (fs.existsSync(srcPreload)) {
    return srcPreload;
  }
  return path.join(__dirname, "..", "src", "preload.ts");
}

function resolveRendererHtml(): string {
  const distHtml = path.join(__dirname, "renderer", "index.html");
  if (fs.existsSync(distHtml)) {
    return distHtml;
  }
  const srcHtml = path.join(__dirname, "..", "src", "renderer", "index.html");
  if (fs.existsSync(srcHtml)) {
    return srcHtml;
  }
  return path.join(__dirname, "..", "src", "renderer", "index.html");
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
    : path.join(__dirname, "config", "app.json");

  const fallbackPath = path.join(
    __dirname,
    "..",
    "src",
    "config",
    "app.example.json"
  );

  const finalPath = fs.existsSync(configPath) ? configPath : fallbackPath;
  const content = fs.readFileSync(finalPath, "utf-8");
  appConfig = JSON.parse(content) as AppConfig;
  if (!appConfig.evidenceDir) {
    appConfig.evidenceDir = path.join(app.getPath("userData"), "evidence");
  }
  return appConfig;
}

function sendLog(appKey: MelAppKey, message: string) {
  mainWindow?.webContents.send("auth:log", { app: appKey, message });
}

function sendStatus(appKey: MelAppKey, result: LoginResult) {
  // Crear una copia limpia SIN page ni context
  const cleanResult = result.ok
    ? {
        ok: result.ok,
        title: result.title,
        url: result.url,
        anchors: result.anchors,
        screenshotPath: result.screenshotPath,
        screenshotThumb: result.screenshotThumb,
        // NO incluir page ni context
      }
    : {
        ok: result.ok,
        code: result.code,
        message: result.message,
      };

  mainWindow?.webContents.send("auth:status", {
    app: appKey,
    ...cleanResult, // Solo datos serializables
  });

  if (!result.ok) {
    mainWindow?.webContents.send("auth:error", {
      app: appKey,
      code: result.code,
      message: result.message,
    });
  }
}

function sendCaptcha(appKey: MelAppKey, imageBuffer: Buffer) {
  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString(
    "base64"
  )}`;
  mainWindow?.webContents.send("auth:captchaRequired", {
    app: appKey,
    image: imageDataUrl,
  });
}

async function handleLogin(appKey: MelAppKey, credentials: Credentials) {
  const config = loadConfig();
  const melConfig = config[appKey];
  if (!melConfig) {
    dialog.showErrorBox(
      "Configuración faltante",
      `No se encontró configuración para ${appKey}`
    );
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
    evidenceDir: path.resolve(
      config.evidenceDir || path.join(app.getPath("userData"), "evidence")
    ),
    genericCaptchaSelectors: config.genericCaptchaSelectors,
    onLog,
    requestCaptcha,
  };

  const result =
    appKey === "mel1"
      ? await loginMel1(baseOptions)
      : await loginMel2(baseOptions);
  sendStatus(appKey, result);

  if (result.ok) {
    sendLog(appKey, "Proceso finalizado con éxito.");
    loginStates[appKey] = true;
    // 🎯 AQUÍ VA TU LÓGICA ADICIONAL
    await handlePostLoginActions(appKey, result, browser);

    // Verificar si ambos sistemas están autenticados
    if (loginStates.mel1 && loginStates.mel2) {
      sendLog(
        "mel1",
        "Ambos sistemas autenticados. Ejecutando acciones finales..."
      );
      await handleBothSystemsAuthenticated(browser);
    }
  } else {
    sendLog(appKey, `Proceso finalizado con error: ${result.message}`);
    loginStates[appKey] = false;
  }
}

// Nueva función para manejar acciones post-login individuales
async function handlePostLoginActions(
  appKey: MelAppKey,
  result: LoginSuccess,
  browser: Browser
) {
  try {
    const page = result.page;
    sendLog(
      appKey,
      `${appKey.toUpperCase()} - Login completado. Página actual: ${page.url()}`
    );

    if (appKey === "mel1") {
      // 🎯 MEL1: Solo guardar la página y esperar
      sendLog(
        appKey,
        "MEL1 autenticado - Esperando MEL2 para comenzar procesamiento..."
      );

      // Guardar referencia global para MEL1
      (global as any).mel1Page = page;
      (global as any).mel1Context = result.context;

      // NO cerrar recursos, mantener sesión viva
      return;
    } else if (appKey === "mel2") {
      // 🎯 MEL2: Iniciar procesamiento cuando esté listo
      sendLog(
        appKey,
        "MEL2 autenticado - Iniciando procesamiento de códigos..."
      );

      const mel1Page = (global as any).mel1Page;
      const mel1Context = (global as any).mel1Context;

      if (!mel1Page) {
        sendLog(
          appKey,
          "❌ MEL1 no está disponible. Asegúrate de autenticar MEL1 primero."
        );
        return;
      }

      // Guardar referencia para MEL2
      (global as any).mel2Page = page;
      (global as any).mel2Context = result.context;

      // PROCESAR TODOS LOS CÓDIGOS EN AMBOS SISTEMAS
      await procesarCodigosEnAmbosApps();

      // Cerrar ambas sesiones al final
      await cerrarTodasLasSesiones();
    }
  } catch (error) {
    sendLog(
      appKey,
      `Error en acciones post-login: ${(error as Error).message}`
    );
  }
}

// Nueva función para procesar códigos en ambas apps
async function procesarCodigosEnAmbosApps() {
  const codigosAlumnos = [
    // "U20309614",
    "U20309615",
    // "U21323069",
    // "U21323071",
    // "U21323073",
    // "U21323075",
    // "U21323077",
    // "U21323079",
    // "U21323081",
    // "U25317788",
    // "U25317789",
  ];

  sendLog(
    "mel1",
    `🚀 Procesando ${codigosAlumnos.length} códigos en MEL1 y MEL2 secuencialmente...`
  );

  const resultadosFinales: any[] = [];

  for (let i = 0; i < codigosAlumnos.length; i++) {
    const codigo = codigosAlumnos[i];

    sendLog(
      "mel1",
      `\n=== CÓDIGO ${i + 1}/${codigosAlumnos.length}: ${codigo} ===`
    );

    const resultadoCodigo = {
      codigo,
      mel1: { error: {}, data: {} },
      mel2: { error: {}, data: {} },
    };

    // 1️⃣ PROCESAR EN MEL1 (usando página de MEL1)
    try {
      sendLog("mel1", `📋 Procesando ${codigo} en MEL1...`);
      const mel1Page = (global as any).mel1Page;
      resultadoCodigo.mel1.data = await procesarCodigoEnMel1(
        mel1Page,
        codigo,
        i
      );
      sendLog(
        "mel1",
        `✅ ${codigo} completado en MEL1: ${JSON.stringify(
          resultadoCodigo.mel1.data
        )}`
      );
    } catch (mel1Error) {
      resultadoCodigo.mel1.error = (mel1Error as Error).message;
      sendLog(
        "mel1",
        `❌ Error en MEL1 para ${codigo}: ${resultadoCodigo.mel1.error}`
      );
    }

    // 2️⃣ PROCESAR EN MEL2 (usando página de MEL2)
    try {
      sendLog("mel2", `📋 Procesando ${codigo} en MEL2...`);
      const mel2Page = (global as any).mel2Page;
      resultadoCodigo.mel2.data = await procesarCodigoEnMel2(
        mel2Page,
        codigo,
        i
      );
      sendLog(
        "mel2",
        `✅ ${codigo} completado en MEL2:${JSON.stringify(
          resultadoCodigo.mel2.data
        )}`
      );
    } catch (mel2Error) {
      resultadoCodigo.mel2.error = (mel2Error as Error).message;
      sendLog(
        "mel2",
        `❌ Error en MEL2 para ${codigo}: ${resultadoCodigo.mel2.error}`
      );
    }

    resultadosFinales.push(resultadoCodigo);

    // Pausa entre códigos
    if (i < codigosAlumnos.length - 1) {
      sendLog("mel1", "⏸️ Pausa antes del siguiente código...");
      await (global as any).mel1Page.waitForTimeout(2000);
    }
  }

  // 📄 GUARDAR RESULTADOS FINALES
  const resumenPath = path.join(
    path.resolve("evidence"),
    `resumen-completo-ambos-sistemas-${Date.now()}.json`
  );
  // 🔍 GENERAR ANÁLISIS COMPARATIVO
  const analisisTotal = generarAnalisisComparativo(resultadosFinales);

  // Guardar resultados completos con análisis
  const resultadosCompletos = {
    timestamp: new Date().toISOString(),
    totalCodigos: resultadosFinales.length,
    analisisComparativo: analisisTotal,
    resultadosDetallados: resultadosFinales,
  };

  fs.writeFileSync(resumenPath, JSON.stringify(resultadosCompletos, null, 2));
  sendLog("mel1", `📄 Resumen completo con análisis guardado: ${resumenPath}`);

  sendLog("mel1", `   📊 Códigos procesados: ${analisisTotal.length}`);
  for (const analisis of analisisTotal) {
    sendLog(
      "mel1",
      `Hay coincidencias exactas en modales: ${
        analisis.coincidencias.validaciones ? "Sí" : "No"
      }`
    );
  }
}

function generarAnalisisComparativo(resultados: any[]) {
  const analisis = [];

  for (const resultado of resultados) {
    const { codigo, mel1, mel2 } = resultado;

    const analisisCodigo = {
      codigo,
      sonIguales: false,
      coincidencias: {
        validaciones: false,
        modales: false,
        cargaHabil: false,
        consultaClases: false,
      },
      diferencias: {},
    };

    // Extraer datos de ambos sistemas
    const alertMel1 = mel1.error?.alert || {};
    console.log("🚀 ~ generarAnalisisComparativo ~ alertMel1:", alertMel1);
    const alertMel2 = mel2.error?.alert || {};
    console.log("🚀 ~ generarAnalisisComparativo ~ alertMel2:", alertMel2);
    const cursosMel1 = mel1.data?.cursos || [];
    console.log("🚀 ~ generarAnalisisComparativo ~ cursosMel1:", cursosMel1);
    const cursosMel2 = mel2.data?.cursos || [];
    console.log("🚀 ~ generarAnalisisComparativo ~ cursosMel2:", cursosMel2);
    const modalesMel1 = mel1.data?.modales || [];
    console.log("🚀 ~ generarAnalisisComparativo ~ modalesMel1:", modalesMel1);
    const modalesMel2 = mel2.data?.modales || [];
    console.log("🚀 ~ generarAnalisisComparativo ~ modalesMel2:", modalesMel2);

    // Validar alerts
    if (alertMel1.alertDetectado === alertMel2.alertDetectado) {
      analisisCodigo.coincidencias.validaciones = true;
      //TODO Comparar mensajes si ambos tienen alert
    }

    // Validar modales
    if (modalesMel1.length === modalesMel2.length) {
      if (
        modalesMel1
          .sort()
          .every((item: any, index: any) => item === modalesMel2.sort()[index])
      ) {
        analisisCodigo.coincidencias.modales = true;
      } else {
        analisisCodigo.coincidencias.modales = true;
      }
    } else {
      analisisCodigo.coincidencias.modales = false;
    }

    // COMPARAR CANTIDAD DE CURSOS
    if (cursosMel1.length === cursosMel2.length) {
      for (const curso of cursosMel1) {
        const cursoEnMel2 = cursosMel2.find(
          (c: any) => c.codigo.toUpperCase() === curso.codigo.toUpperCase()
        );
        if (!cursoEnMel2) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (curso.nombre.toUpperCase() !== cursoEnMel2.nombre.toUpperCase()) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (
          parseFloat(curso.horasSemanales) !==
          parseFloat(cursoEnMel2.horasSemanales)
        ) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (parseFloat(curso.creditos) !== parseFloat(cursoEnMel2.creditos)) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (parseFloat(curso.ciclo) !== parseFloat(cursoEnMel2.ciclo)) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (
          curso.nroInscripcion.match(/(\d+)/)?.[1] ||
          "0" !== cursoEnMel2.nroInscripcion.match(/(\d+)/)?.[1] ||
          "0"
        ) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (curso.tipo.toUpperCase() !== cursoEnMel2.tipo.toUpperCase()) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (
          (curso.seccion === "--" ? "" : curso.seccion.toUpperCase()) !==
          (cursoEnMel2.seccion === "--"
            ? ""
            : cursoEnMel2.seccion.toUpperCase())
        ) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
        if (curso.estadoBtn !== cursoEnMel2.estadoBtn) {
          analisisCodigo.coincidencias.cargaHabil = false;
          break;
        }
      }
      analisisCodigo.coincidencias.cargaHabil = true;
    } else {
      analisisCodigo.coincidencias.cargaHabil = false;
    }

    // 3️⃣ COMPARAR CURSOS UNO POR UNO
    // const cursosComparados = compararCursos(cursosMel1, cursosMel2);

    analisis.push(analisisCodigo);
  }

  return analisis;
}

// 🔍 FUNCIÓN AUXILIAR PARA COMPARAR CURSOS
function compararCursos(cursosMel1: any[], cursosMel2: any[]) {
  const resultado = {
    coincidencias: [] as string[],
    diferenciasMenures: [] as string[],
    diferenciasCriticas: [] as string[],
  };

  // Crear mapas por código de curso para comparación eficiente
  const mapamel1 = new Map();
  const mapamel2 = new Map();

  cursosMel1.forEach((curso) => mapamel1.set(curso.codigo, curso));
  cursosMel2.forEach((curso) => mapamel2.set(curso.codigo, curso));

  // Obtener todos los códigos únicos
  const todosLosCodigos = new Set([
    ...cursosMel1.map((c) => c.codigo),
    ...cursosMel2.map((c) => c.codigo),
  ]);

  for (const codigo of todosLosCodigos) {
    const cursoMel1 = mapamel1.get(codigo);
    const cursoMel2 = mapamel2.get(codigo);

    // Verificar existencia en ambos sistemas
    if (!cursoMel1 && cursoMel2) {
      resultado.diferenciasCriticas.push(`Curso ${codigo} solo existe en MEL2`);
      continue;
    }
    if (cursoMel1 && !cursoMel2) {
      resultado.diferenciasCriticas.push(`Curso ${codigo} solo existe en MEL1`);
      continue;
    }

    // Comparar propiedades del curso
    if (cursoMel1 && cursoMel2) {
      // Normalizar nombres para comparación (case-insensitive y sin espacios extra)
      const nombreMel1 = cursoMel1.nombre?.toLowerCase().trim() || "";
      const nombreMel2 = cursoMel2.nombre?.toLowerCase().trim() || "";

      if (nombreMel1 === nombreMel2) {
        resultado.coincidencias.push(`${codigo}: Nombre idéntico`);
      } else {
        // Verificar similitud (90% o más)
        const similitud = calcularSimilitudTexto(nombreMel1, nombreMel2);
        if (similitud >= 0.9) {
          resultado.diferenciasMenures.push(
            `${codigo}: Nombres similares (${Math.round(
              similitud * 100
            )}%) - "${cursoMel1.nombre}" vs "${cursoMel2.nombre}"`
          );
        } else {
          resultado.diferenciasCriticas.push(
            `${codigo}: Nombres diferentes - "${cursoMel1.nombre}" vs "${cursoMel2.nombre}"`
          );
        }
      }

      // Comparar créditos
      if (cursoMel1.creditos === cursoMel2.creditos) {
        resultado.coincidencias.push(
          `${codigo}: Créditos idénticos (${cursoMel1.creditos})`
        );
      } else {
        resultado.diferenciasMenures.push(
          `${codigo}: Créditos diferentes - MEL1: ${cursoMel1.creditos}, MEL2: ${cursoMel2.creditos}`
        );
      }

      // Comparar disponibilidad de botones
      const mel1Disponible = cursoMel1.estadoBtn === true;
      const mel2Disponible = cursoMel2.botonEstado === "Habilitado";

      if (mel1Disponible === mel2Disponible) {
        const estado = mel1Disponible ? "disponible" : "no disponible";
        resultado.coincidencias.push(
          `${codigo}: Estado botón ${estado} en ambos`
        );
      } else {
        const estadoMel1 = mel1Disponible ? "disponible" : "no disponible";
        const estadoMel2 = mel2Disponible ? "disponible" : "no disponible";
        resultado.diferenciasCriticas.push(
          `${codigo}: Estado botón - MEL1: ${estadoMel1}, MEL2: ${estadoMel2}`
        );
      }

      // Comparar información adicional (nroInscripcion vs historial de desaprobación)
      const infoMel1 = cursoMel1.nroInscripcion || "";
      const infoMel2 = cursoMel2.nroInscripcion || "";

      if (infoMel2.includes("vez desaprobado") && infoMel1 !== "") {
        resultado.diferenciasMenures.push(
          `${codigo}: MEL2 muestra historial desaprobación ("${infoMel2}"), MEL1 muestra "${infoMel1}"`
        );
      } else if (infoMel1 === infoMel2) {
        resultado.coincidencias.push(
          `${codigo}: Información adicional idéntica`
        );
      }
    }
  }

  return resultado;
}

// 🔍 FUNCIÓN AUXILIAR PARA CALCULAR SIMILITUD DE TEXTO
function calcularSimilitudTexto(texto1: string, texto2: string): number {
  if (texto1 === texto2) return 1.0;

  const len1 = texto1.length;
  const len2 = texto2.length;

  if (len1 === 0 || len2 === 0) return 0.0;

  // Algoritmo de distancia de Levenshtein simplificado
  const matriz: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matriz[i] = [];
    matriz[i][0] = i;
  }

  for (let j = 0; j <= len2; j++) {
    matriz[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const costo = texto1[i - 1] === texto2[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1, // eliminación
        matriz[i][j - 1] + 1, // inserción
        matriz[i - 1][j - 1] + costo // sustitución
      );
    }
  }

  const distancia = matriz[len1][len2];
  const longitudMaxima = Math.max(len1, len2);

  return 1 - distancia / longitudMaxima;
}

// Función para procesar código en MEL1 (usando la lógica existente)
async function procesarCodigoEnMel1(page: any, codigo: string, index: number) {
  const codigoInput = "#txtCodigoAlumnoSimulacion";
  await page.waitForSelector(codigoInput, { timeout: 20000 });
  await page.fill(codigoInput, "");
  await page.fill(codigoInput, codigo);

  let alertDetectado = false;
  let mensajeAlert = "";
  let screenshot = "";
  let cursos: any[] = [];
  let modales: string[] = [];

  const btnSimular = "#btnSimular";
  await page.waitForSelector(btnSimular, { timeout: 20000 });

  // Preparar listeners en carrera (misma página y posible popup)
  const dialogSamePagePromise = page
    .waitForEvent("dialog", { timeout: 8000 })
    .catch(() => null);
  const popupPromise = page
    .context()
    .waitForEvent("page", { timeout: 8000 })
    .catch(() => null);

  // Click que dispara la validación/alert
  await page.click(btnSimular);

  // Resolver qué pasó: alert en misma página o en popup
  let dlg = await dialogSamePagePromise;
  const popupPage = await popupPromise;
  if (!dlg && popupPage) {
    // Si se abrió una nueva pestaña, intenta capturar su alert
    dlg = await popupPage
      .waitForEvent("dialog", { timeout: 2000 })
      .catch(() => null);
  }

  if (dlg) {
    alertDetectado = true;
    mensajeAlert = dlg.message();

    // ⚠️ Primero ACEPTA el alert (no se puede hacer screenshot con el diálogo abierto)
    await dlg.accept().catch(() => {});

    // Pequeña espera para estabilizar el DOM y luego screenshot de evidencia
    await page.waitForTimeout(200);

    const alertScreenshot = path.join(
      path.resolve("evidence"),
      `mel1-${codigo}-alert-evidencia-${Date.now()}.png`
    );
    try {
      await page.screenshot({ path: alertScreenshot, fullPage: true });
      screenshot = alertScreenshot;
    } catch {
      // Si fallara por navegación, intenta una segunda vez sin fullPage
      try {
        await page.screenshot({ path: alertScreenshot });
        screenshot = alertScreenshot;
      } catch {}
    }

    sendLog(
      "mel1",
      `🚨 Alert MEL1 ${codigo}: ${mensajeAlert.substring(0, 120)}...`
    );
  } else {
    // No hubo alert nativo: continuar con el flujo de matrícula
    await page.waitForTimeout(3000);

    const matriculaResult = await procesarMatriculaMel1(page, codigo);
    cursos = matriculaResult.cursos;
    modales = matriculaResult.modales;

    // Cerrar sesión para volver al inicio
    await page
      .goto(`https://melvisor.utp.edu.pe/seguridad/FinalizarSimulacion`)
      .catch(() => {});
    await page.waitForTimeout(3000);
  }

  return {
    alert: { alertDetectado, mensajeAlert },
    modales,
    cursos,
  };
}

// Función para procesar código en MEL2 (usando página separada)
async function procesarCodigoEnMel2(page: any, codigo: string, index: number) {
  try {
    // 1️⃣ NAVEGAR A LA PÁGINA PRINCIPAL DE MEL2 (si es necesario)
    let currentUrl = page.url();
    sendLog("mel2", `📍 URL actual MEL2: ${currentUrl}`);

    // 2️⃣ BUSCAR INPUT DE CÓDIGO EN MEL2

    // 3️⃣ LLENAR CÓDIGO
    await page.fill('input[placeholder="Ingresa el código del alumno"]', "");
    await page.fill(
      'input[placeholder="Ingresa el código del alumno"]',
      codigo
    );
    sendLog("mel2", `📝 Código ${codigo} ingresado en MEL2`);

    // 4️⃣ BUSCAR BOTÓN DE ENVÍO
    await page.click('button:has-text("Simular")');
    sendLog("mel2", `✅ Click en botón Simular realizado para ${codigo}`);

    // 5️⃣ ESPERAR RESPUESTA Y DETECTAR ERROR POR URL
    await page.waitForTimeout(5000);

    // 🚨 VERIFICAR SI LA URL INDICA ERROR
    currentUrl = page.url();
    sendLog("mel2", `📍 URL después de simular: ${currentUrl}`);

    if (currentUrl === "https://mel2.utpxpedition.com/error") {
      sendLog("mel2", `🚨 ERROR DETECTADO - Página de error para ${codigo}`);

      // 📋 EXTRAER TEXTOS DEL DIV DE ERROR
      const errorInfo = await page.evaluate(() => {
        // Buscar el div de error específico
        const errorDiv = document.querySelector(
          "div.mt-10.flex.h-\\[100\\%\\].max-h-\\[600px\\]"
        );

        if (errorDiv) {
          // Extraer todos los textos relevantes
          const titulo =
            errorDiv.querySelector("h2")?.textContent?.trim() || "";
          const mensaje =
            errorDiv.querySelector("p")?.textContent?.trim() || "";
          const imagenAlt =
            errorDiv.querySelector("img")?.getAttribute("alt") || "";
          const imagenSrc =
            errorDiv.querySelector("img")?.getAttribute("src") || "";

          // Obtener todo el texto del div como backup
          const textoCompleto = errorDiv.textContent?.trim() || "";

          return {
            titulo,
            mensaje,
            imagenAlt,
            imagenSrc,
            textoCompleto,
          };
        }

        // Si no encuentra el div específico, extraer cualquier texto visible
        const bodyText = document.body.textContent?.trim() || "";

        return {
          titulo: "Error no estructurado",
          mensaje: bodyText.substring(0, 200) + "...",
          imagenAlt: "",
          imagenSrc: "",
          textoCompleto: bodyText,
        };
      });

      // 📊 MOSTRAR INFORMACIÓN DEL ERROR
      sendLog("mel2", `   📋 Título: ${errorInfo.titulo}`);
      sendLog("mel2", `   💬 Mensaje: ${errorInfo.mensaje}`);
      sendLog(
        "mel2",
        `   🖼️ Imagen: ${errorInfo.imagenAlt} (${errorInfo.imagenSrc})`
      );

      // 📸 CAPTURAR SCREENSHOT DEL ERROR
      const errorScreenshot = path.join(
        path.resolve("evidence"),
        `mel2-${codigo}-ERROR-${Date.now()}.png`
      );
      await page.screenshot({ path: errorScreenshot, fullPage: true });
      sendLog("mel2", `📸 Screenshot de error: ${errorScreenshot}`);

      // 🔄 INTENTAR VOLVER AL INICIO
      try {
        sendLog(
          "mel2",
          `🔄 Intentando volver al inicio desde página de error...`
        );

        // Navegar de vuelta a la página principal
        await page.goto("https://mel2.utpxpedition.com/", {
          waitUntil: "networkidle",
          timeout: 10000,
        });

        sendLog(
          "mel2",
          `✅ Navegación de vuelta al inicio exitosa para ${codigo}`
        );
        await page.waitForTimeout(3000);
      } catch (navegacionError) {
        sendLog(
          "mel2",
          `❌ Error navegando de vuelta al inicio: ${navegacionError}`
        );
      }

      // 🎯 RETORNAR RESULTADO DE ERROR (NO CONTINUAR)
      return {
        alert: { alertDetectado: true, mensajeAlert: errorInfo.mensaje },
        modales: [],
        cursos: [],
      };
      // return {
      //   error: true,
      //   tipoError: "Página de error del sistema",
      //   url: currentUrl,
      //   errorInfo: errorInfo,
      //   screenshot: errorScreenshot,
      //   datos: {
      //     cursos: [],
      //     totalCursos: 0,
      //     cursosHabilitados: 0,
      //     cursosDeshabilitados: 0,
      //   },
      // };
    }

    // ✅ SI NO HAY ERROR, CONTINUAR NORMALMENTE
    sendLog(
      "mel2",
      `✅ URL válida para ${codigo} - continuando procesamiento...`
    );

    const resultScreenshot = path.join(
      path.resolve("evidence"),
      `mel2-${codigo}-result-${Date.now()}.png`
    );
    await page.screenshot({ path: resultScreenshot, fullPage: true });

    // 6️⃣ PROCESAR MATRÍCULA EN MEL2 (solo si no hay error)
    const matriculaResult = await procesarMatriculaMel2(page, codigo);

    // sendLog(
    //   "mel2",
    //   `📊 Datos extraídos de MEL2 para ${codigo}: ${JSON.stringify(
    //     matriculaResult
    //   )}`
    // );
    return {
      alert: { alertDetectado: false, mensajeAlert: "" },
      modales: matriculaResult.modales,
      cursos: matriculaResult.cursos,
    };
    // return {
    //   screenshot: resultScreenshot,
    //   datos: matriculaResult,
    //   url: currentUrl,
    // };
  } catch (error) {
    throw error;
  }
}

// Función auxiliar para manejar matrícula en MEL1 (simplificada)
async function procesarMatriculaMel1(page: any, codigo: string) {
  sendLog("mel1", `🔍 Procesando matrícula para ${codigo}... en ${page.url()}`);
  await page.waitForTimeout(10000);
  const modales: string[] = [];
  let cursos: any[] = [];

  // Manejar modales
  try {
    await page.waitForSelector("#myModalInit1", { timeout: 3000 });
    await page.click(
      '#myModalInit1 button.btn.btn-danger[data-dismiss="modal"]'
    );
    modales.push("Modal Comunicado");
  } catch {}

  try {
    await page.waitForSelector("a.introjs-skipbutton", { timeout: 3000 });
    await page.click("a.introjs-skipbutton");
    modales.push("Modal Guia");
  } catch {}

  // Extraer cursos

  cursos = await page.evaluate(() => {
    const cursosArray: any[] = [];
    const filas = document.querySelectorAll("#tableCursos tbody tr");

    filas.forEach((fila: any) => {
      const celdas = fila.querySelectorAll("td");
      if (celdas.length >= 7) {
        const cursoCompleto = celdas[0]?.textContent?.trim() || "";
        const match = cursoCompleto.match(/^([A-Z0-9]+)\s*-\s*(.+)$/);

        if (match) {
          const btnAgregar = fila.querySelector(
            'a.loadDetalleCurso.btn.btn-success[data-action="Agregar"]'
          );
          const estadoBtn = btnAgregar !== null;
          cursosArray.push({
            codigo: match[1].trim(),
            nombre: match[2].trim(),
            horasSemanales: celdas[1]?.textContent?.trim() || "",
            creditos: celdas[2]?.textContent?.trim() || "",
            ciclo: celdas[3]?.textContent?.trim() || "",
            nroInscripcion: celdas[4]?.textContent?.trim() || "",
            tipo: celdas[5]?.textContent?.trim() || "",
            seccion: celdas[6]?.textContent?.trim() || "",
            estadoBtn,
          });
        }
      }
    });

    return cursosArray;
  });

  // Hacer click en primer curso si existe
  if (cursos.length > 0) {
    try {
      await page.click('a.loadDetalleCurso[data-action="Agregar"]');
      sendLog("mel1", `✅ Primer curso agregado para ${codigo}`);
      await page.waitForTimeout(3000);
    } catch {}
  }

  return { modales, cursos };
}

async function procesarMatriculaMel2(page: any, codigo: string) {
  await page.waitForTimeout(5000);
  const modales: string[] = [];
  sendLog("mel2", `🔍 Procesando matrícula MEL2 para ${codigo}...`);

  // 1️⃣ CERRAR MODAL "ENTENDIDO"
  try {
    sendLog("mel2", `🔍 Buscando modal "Entendido" para ${codigo}...`);

    await page.waitForSelector(
      'dialog[data-open="true"] header button[aria-label="Close modal"]',
      {
        timeout: 8000,
        state: "visible",
      }
    );
    await page.click(
      'dialog[data-open="true"] header button[aria-label="Close modal"]'
    );
    sendLog("mel2", `✅ Modal cerrado con botón X para ${codigo}`);
    modales.push("Modal Comunicado");
  } catch (modalError) {
    sendLog(
      "mel2",
      `⚠️ Modal "Entendido" no encontrado para ${codigo}: ${modalError}`
    );
  }

  // 2️⃣ HACER CLICK EN BOTÓN "OMITIR"
  try {
    sendLog("mel2", `🔍 Buscando botón "Omitir" para ${codigo}...`);

    await page.waitForSelector(
      'footer[data-testid="modal-footer"] button:has-text("Omitir")',
      {
        timeout: 5000,
        state: "visible",
      }
    );
    await page.click(
      'footer[data-testid="modal-footer"] button:has-text("Omitir")'
    );
    sendLog("mel2", `✅ Botón "Omitir" clickeado para ${codigo}`);
    modales.push("Modal Guia");
    await page.waitForTimeout(2000); // Pausa después de omitir
  } catch (omitirError) {
    sendLog(
      "mel2",
      `⚠️ Botón "Omitir" no encontrado para ${codigo}: ${omitirError}`
    );
  }

  // 3️⃣ EXTRAER CURSOS DE MEL2
  const cursosExtraidos = await page.evaluate(() => {
    const cursosArray: any[] = [];
    const filas = document.querySelectorAll(
      'tbody[data-testid="table-content"] tr'
    );

    filas.forEach((fila: any, index: number) => {
      try {
        const celdas = fila.querySelectorAll("td");

        if (celdas.length >= 7) {
          // Primera columna: contiene código y nombre del curso
          const primeraCelda = celdas[0];
          const cursoDiv = primeraCelda.querySelector("div.w-80");
          const cursoCompleto = cursoDiv?.textContent?.trim() || "";

          // Extraer mensaje de alerta si existe (ej: "1 vez desaprobado")
          const alertSpan = primeraCelda.querySelector(
            'span[data-testid="alert-message"] p'
          );
          const alertMessage = alertSpan?.textContent?.trim() || "";

          // Otras columnas
          const horasSemanales = celdas[1]?.textContent?.trim() || "";
          const creditos = celdas[2]?.textContent?.trim() || "";
          const ciclo = celdas[3]?.textContent?.trim() || "";
          const tipo = celdas[4]?.textContent?.trim() || "";
          const seccion = celdas[5]?.textContent?.trim() || "";

          // Verificar si el botón "Agregar" está habilitado
          const btnAgregar = celdas[6]?.querySelector("button");
          const estadoBtn = !btnAgregar?.hasAttribute("disabled"); // true si NO está deshabilitado
          const botonEstado = estadoBtn ? "Habilitado" : "Deshabilitado";

          // Extraer código y nombre del formato "CÓDIGO - NOMBRE"
          const match = cursoCompleto.match(/^([A-Z0-9]+)\s*-\s*(.+)$/);

          if (match && cursoCompleto) {
            const codigo = match[1].trim();
            const nombre = match[2].trim();

            cursosArray.push({
              codigo,
              nombre,
              horasSemanales,
              creditos,
              ciclo,
              nroInscripcion: alertMessage,
              tipo,
              seccion,
              estadoBtn,
              botonEstado,
            });
          }
        }
      } catch (error) {
        console.log(`Error procesando fila ${index + 1}:`, error);
      }
    });

    return cursosArray;
  });

  sendLog(
    "mel2",
    `📚 ${cursosExtraidos.length} cursos encontrados en MEL2 para ${codigo}`
  );

  // 4️⃣ HACER CLICK EN EL PRIMER BOTÓN "AGREGAR" DISPONIBLE
  if (cursosExtraidos.length > 0) {
    try {
      sendLog(
        "mel2",
        `🎯 Buscando primer botón "Agregar" habilitado para ${codigo}...`
      );

      // Buscar el primer botón Agregar que NO esté deshabilitado
      await page.waitForSelector(
        'tbody[data-testid="table-content"] tr button:not([disabled])',
        {
          timeout: 5000,
          state: "visible",
        }
      );

      // Obtener información del primer curso habilitado
      const primerCursoHabilitado = cursosExtraidos.find(
        (c: any) => c.botonEstado === "Habilitado"
      );

      if (primerCursoHabilitado) {
        sendLog(
          "mel2",
          `📝 Haciendo click en "Agregar" para: ${primerCursoHabilitado.codigo} - ${primerCursoHabilitado.nombre}`
        );

        // Capturar screenshot antes del click
        const preClickScreenshot = path.join(
          path.resolve("evidence"),
          `mel2-${codigo}-pre-agregar-${Date.now()}.png`
        );
        await page.screenshot({ path: preClickScreenshot, fullPage: true });
        sendLog("mel2", `📸 Pre-click: ${preClickScreenshot}`);

        // Hacer click en el primer botón habilitado
        await page.click(
          'tbody[data-testid="table-content"] tr button:not([disabled])'
        );
        sendLog("mel2", `✅ Click realizado en botón "Agregar" para ${codigo}`);

        // Esperar respuesta del servidor
        await page.waitForTimeout(6000);

        // Capturar screenshot después del click
        const postClickScreenshot = path.join(
          path.resolve("evidence"),
          `mel2-${codigo}-post-agregar-${Date.now()}.png`
        );
        await page.screenshot({ path: postClickScreenshot, fullPage: true });
        sendLog("mel2", `📸 Post-click: ${postClickScreenshot}`);

        await page.waitForSelector(
          'dialog[data-open="true"] header button[aria-label="Close modal"]'
        );
        await page.click(
          'dialog[data-open="true"] header button[aria-label="Close modal"]'
        );
        try {
          sendLog(
            "mel2",
            `🔄 Buscando botón "Cambiar alumno" para ${codigo}...`
          );

          await page.waitForSelector('button:has-text("Cambiar alumno")', {
            timeout: 1000,
            state: "visible",
          });

          await page.click('button:has-text("Cambiar alumno")');
          sendLog(
            "mel2",
            `✅ Botón "Cambiar alumno" clickeado - reiniciando flujo para siguiente código`
          );

          // Esperar a que la página se reinicie
          await page.waitForTimeout(3000);
        } catch (cambiarError) {
          sendLog(
            "mel2",
            `⚠️ Botón "Cambiar alumno" no encontrado para ${codigo}: ${cambiarError}`
          );
        }
      } else {
        sendLog(
          "mel2",
          `⚠️ No hay cursos habilitados para agregar en ${codigo}`
        );
      }
    } catch (agregarError) {
      sendLog(
        "mel2",
        `❌ Error haciendo click en "Agregar" para ${codigo}: ${agregarError}`
      );
    }
  } else {
    sendLog("mel2", `⚠️ No hay cursos disponibles para agregar en ${codigo}`);
  }
  return { modales, cursos: cursosExtraidos };
  // return {
  //   modalCerrado: true,
  //   datos: {
  //     cursos: cursosExtraidos,
  //     totalCursos: cursosExtraidos.length,
  //     cursosHabilitados: cursosExtraidos.filter(
  //       (c: any) => c.botonEstado === "Habilitado"
  //     ).length,
  //     cursosDeshabilitados: cursosExtraidos.filter(
  //       (c: any) => c.botonEstado === "Deshabilitado"
  //     ).length,
  //   },
  // };
}

// Función para cerrar todas las sesiones
async function cerrarTodasLasSesiones() {
  try {
    const mel1Page = (global as any).mel1Page;
    const mel1Context = (global as any).mel1Context;
    const mel2Page = (global as any).mel2Page;
    const mel2Context = (global as any).mel2Context;

    if (mel1Page && !mel1Page.isClosed()) await mel1Page.close();
    if (mel1Context) await mel1Context.close();
    if (mel2Page && !mel2Page.isClosed()) await mel2Page.close();
    if (mel2Context) await mel2Context.close();

    sendLog("mel1", "✅ Todas las sesiones cerradas correctamente");
  } catch (closeError) {
    sendLog("mel1", `⚠️ Error cerrando sesiones: ${closeError}`);
  }
}

async function handleMatriculaPage(
  appKey: MelAppKey,
  page: any,
  codigo: string,
  index: number,
  resultadosPorCodigo: any[]
) {
  try {
    await page.waitForTimeout(8000);
    const modalesDetectados: string[] = [];
    const cursosEncontrados: any[] = [];

    // 1️⃣ DETECTAR Y CERRAR MODALES
    sendLog(appKey, `🔍 Buscando modales para ${codigo}...`);

    // Modal 1: Tips/Recomendaciones
    try {
      sendLog(appKey, `🔍 Buscando modal Tips para ${codigo}...`);

      // Esperar el modal específico con ID myModalInit1
      await page.waitForSelector("#myModalInit1", { timeout: 5000 });
      sendLog(appKey, `📋 Modal Tips detectado para ${codigo}`);

      // Click directo en el botón Cerrar del modal específico
      await page.click(
        '#myModalInit1 button.btn.btn-danger[data-dismiss="modal"]'
      );
      sendLog(appKey, `✅ Modal Tips cerrado para ${codigo}`);
      modalesDetectados.push("Modal de Tips");
    } catch (modalError) {
      sendLog(
        appKey,
        `⚠️ Modal Tips no encontrado para ${codigo}: ${modalError}`
      );
    }

    // // Modal 2: Empezar
    try {
      sendLog(appKey, `🔍 Buscando modal Tutorial para ${codigo}...`);

      // Esperar el botón Omitir específico
      await page.waitForSelector("a.introjs-skipbutton", { timeout: 5000 });
      sendLog(appKey, `📋 Modal Tutorial detectado para ${codigo}`);

      // Capturar screenshot del modal
      const modalScreenshot = path.join(
        path.resolve("evidence"),
        `${appKey}-${codigo}-modal-tutorial-${Date.now()}.png`
      );
      await page.screenshot({ path: modalScreenshot, fullPage: true });
      sendLog(appKey, `📸 Modal Tutorial: ${modalScreenshot}`);

      // Click directo en el botón Omitir
      await page.click("a.introjs-skipbutton");
      sendLog(appKey, `✅ Modal Tutorial cerrado (Omitir) para ${codigo}`);
      modalesDetectados.push("Modal Tutorial");
    } catch (tutorialError) {
      sendLog(
        appKey,
        `⚠️ Modal Tutorial no encontrado para ${codigo}: ${tutorialError}`
      );
    }

    // 2️⃣ EXTRAER CURSOS
    await page.waitForTimeout(5000);
    sendLog(appKey, `📚 Extrayendo cursos para ${codigo}...`);

    const cursos = await page.evaluate(() => {
      const cursosArray: any[] = [];

      // Buscar específicamente la tabla de cursos
      const tablaCursos = document.querySelector("#tableCursos tbody");

      if (tablaCursos) {
        const filas = tablaCursos.querySelectorAll("tr");

        filas.forEach((fila, index) => {
          try {
            const celdas = fila.querySelectorAll("td");

            if (celdas.length >= 7) {
              // Debe tener al menos 7 columnas según la estructura
              // Primera columna contiene: "CÓDIGO - NOMBRE DEL CURSO"
              const cursoCompleto = celdas[0]?.textContent?.trim() || "";
              const horasSemanales = celdas[1]?.textContent?.trim() || "";
              const creditos = celdas[2]?.textContent?.trim() || "";
              const ciclo = celdas[3]?.textContent?.trim() || "";
              const nroInsc = celdas[4]?.textContent?.trim() || "";
              const tipo = celdas[5]?.textContent?.trim() || "";
              const seccion = celdas[6]?.textContent?.trim() || "";

              // Extraer código y nombre del formato "CÓDIGO - NOMBRE"
              const match = cursoCompleto.match(/^([A-Z0-9]+)\s*-\s*(.+)$/);

              if (match) {
                const codigo = match[1].trim();
                const nombre = match[2].trim();

                // Buscar el botón de agregar para obtener data-curso
                const btnAgregar = fila.querySelector(
                  "a.loadDetalleCurso[data-curso]"
                );
                const dataCurso = btnAgregar?.getAttribute("data-curso") || "";

                cursosArray.push({
                  codigo,
                  nombre,
                  horasSemanales,
                  creditos,
                  ciclo,
                  nroInscriptos: nroInsc,
                  tipo,
                  seccion,
                  dataCurso, // ID interno del curso
                  cursoCompleto, // Texto original completo
                });
              }
            }
          } catch (error) {
            console.log(`Error procesando fila ${index + 1}:`, error);
          }
        });
      } else {
        console.log("No se encontró la tabla #tableCursos tbody");

        // Fallback: buscar cualquier tabla con estructura similar
        const todasLasFilas = document.querySelectorAll("table tr");

        todasLasFilas.forEach((fila, index) => {
          const celdas = fila.querySelectorAll("td");
          if (celdas.length >= 2) {
            const contenido = celdas[0]?.textContent?.trim() || "";
            if (contenido.includes(" - ") && contenido.match(/^[A-Z0-9]/)) {
              console.log(`Posible curso en fila ${index}: ${contenido}`);
            }
          }
        });
      }

      return cursosArray;
    });

    sendLog(appKey, `📚 ${cursos.length} cursos encontrados para ${codigo}`);

    if (cursos.length > 0) {
      cursos.forEach((curso: any, idx: number) => {
        sendLog(
          appKey,
          `  ${idx + 1}. ${curso.codigo} - ${curso.nombre} (${
            curso.creditos
          } créditos, ${curso.tipo})`
        );
      });
    } else {
      sendLog(
        appKey,
        `⚠️ No se encontraron cursos para ${codigo} - verificando estructura de página...`
      );

      // Debug: capturar qué hay en la página
      const debugInfo = await page.evaluate(() => {
        const tablas = document.querySelectorAll("table");
        const info = {
          totalTablas: tablas.length,
          tablaCursos: !!document.querySelector("#tableCursos"),
          tbody: !!document.querySelector("#tableCursos tbody"),
          filas: document.querySelectorAll("#tableCursos tbody tr").length,
          primeraFila:
            document
              .querySelector("#tableCursos tbody tr td")
              ?.textContent?.trim() || "No encontrada",
        };
        return info;
      });

      sendLog(appKey, `🔍 Debug info: ${JSON.stringify(debugInfo)}`);
    }

    // 3️⃣ HACER CLICK EN EL PRIMER BOTÓN "AGREGAR"
    if (cursos.length > 0) {
      try {
        sendLog(appKey, `🎯 Buscando primer botón "Agregar" para ${codigo}...`);

        // Buscar el primer botón Agregar disponible
        const btnAgregar = await page.waitForSelector(
          'a.loadDetalleCurso.btn.btn-success[data-action="Agregar"]',
          { timeout: 5000 }
        );

        if (btnAgregar) {
          // Obtener información del curso antes de hacer click
          const dataCurso = await btnAgregar.getAttribute("data-curso");
          const primerCurso = cursos[0]; // El primer curso de la lista extraída

          sendLog(
            appKey,
            `📝 Haciendo click en "Agregar" para curso: ${primerCurso.codigo} - ${primerCurso.nombre} (data-curso: ${dataCurso})`
          );

          // Capturar screenshot antes del click
          const preClickScreenshot = path.join(
            path.resolve("evidence"),
            `${appKey}-${codigo}-pre-agregar-${Date.now()}.png`
          );
          await page.screenshot({ path: preClickScreenshot, fullPage: true });
          sendLog(appKey, `📸 Pre-click: ${preClickScreenshot}`);

          // Hacer click en el botón
          await btnAgregar.click();
          sendLog(
            appKey,
            `✅ Click realizado en botón "Agregar" para ${codigo}`
          );

          // Esperar un momento para que se procese
          await page.waitForTimeout(3000);

          // Capturar screenshot después del click
          const postClickScreenshot = path.join(
            path.resolve("evidence"),
            `${appKey}-${codigo}-post-agregar-${Date.now()}.png`
          );
          await page.screenshot({ path: postClickScreenshot, fullPage: true });
          sendLog(appKey, `📸 Post-click: ${postClickScreenshot}`);
        } else {
          sendLog(appKey, `⚠️ No se encontró botón "Agregar" para ${codigo}`);
        }
      } catch (agregarError) {
        sendLog(
          appKey,
          `❌ Error haciendo click en "Agregar" para ${codigo}: ${agregarError}`
        );
      }
    } else {
      sendLog(appKey, `⚠️ No hay cursos disponibles para agregar en ${codigo}`);
    }

    // 4️⃣ CAPTURAR SCREENSHOT FINAL (reemplazar la línea existente)
    const finalScreenshot = path.join(
      path.resolve("evidence"),
      `${appKey}-${codigo}-matricula-final-${Date.now()}.png`
    );
    await page.screenshot({ path: finalScreenshot, fullPage: true });

    // 4️⃣ CERRAR SESIÓN PARA REINICIAR EL FLUJO
    sendLog(appKey, `🚪 Finalizando simulación para ${codigo}...`);

    try {
      // Obtener la URL base de la página actual
      const currentUrl = page.url();
      const baseUrl = currentUrl.split("/matricula")[0]; // Obtener la base
      const finalizarUrl = `${baseUrl}/seguridad/FinalizarSimulacion`;

      sendLog(appKey, `🔄 Navegando a: ${finalizarUrl}`);
      await page.goto(finalizarUrl);
    } catch (error) {
      sendLog(appKey, `❌ Error: ${error}`);
    }

    // 5️⃣ ACTUALIZAR RESULTADO
    if (resultadosPorCodigo[index]) {
      resultadosPorCodigo[index].modalesDetectados = modalesDetectados;
      resultadosPorCodigo[index].cursosEncontrados = cursos;
      resultadosPorCodigo[index].matriculaScreenshot = finalScreenshot;
    }

    sendLog(
      appKey,
      `✅ Procesamiento completo para ${codigo} - sesión finalizada`
    );

    // Pausa adicional entre códigos para asegurar que la página se resetee
    await page.waitForTimeout(3000);
  } catch (error) {
    sendLog(appKey, `❌ Error procesando matrícula para ${codigo}: ${error}`);
  }
}

// Nueva función para cuando ambos sistemas estén autenticados
async function handleBothSystemsAuthenticated(browser: Browser) {
  try {
    sendLog("mel1", "Iniciando proceso de comparación entre MEL1 y MEL2...");

    // Aquí puedes agregar lógica para:
    // 1. Comparar datos entre ambos sistemas
    // 2. Generar reportes
    // 3. Extraer información específica
    // 4. Etc.

    // Ejemplo: Notificar al renderer que todo está completo
    mainWindow?.webContents.send("auth:bothSystemsComplete", {
      message: "Ambos sistemas autenticados y procesados correctamente",
    });
  } catch (error) {
    sendLog("mel1", `Error en proceso final: ${(error as Error).message}`);
  }
}

app.whenReady().then(async () => {
  loadConfig();
  await createWindow();

  ipcMain.on("mel1:login:start", (_event, payload: Credentials) => {
    sendLog("mel1", "Inicio de autenticación MEL 1.");
    handleLogin("mel1", payload).catch((error) => {
      sendLog("mel1", `Error inesperado: ${(error as Error).message}`);
    });
  });

  ipcMain.on("mel2:login:start", (_event, payload: Credentials) => {
    sendLog("mel2", "Inicio de autenticación MEL 2.");
    handleLogin("mel2", payload).catch((error) => {
      sendLog("mel2", `Error inesperado: ${(error as Error).message}`);
    });
  });

  ipcMain.on(
    "mel1:captcha:submit",
    (_event, payload: { captchaText: string }) => {
      const iterator = pendingCaptchaResolvers.entries().next();
      if (!iterator.done) {
        const [appKey, resolver] = iterator.value;
        resolver(payload.captchaText);
        pendingCaptchaResolvers.delete(appKey);
        sendLog(appKey, "Texto de CAPTCHA recibido.");
      }
    }
  );

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    await browserInstance?.close();
    app.quit();
  }
});
