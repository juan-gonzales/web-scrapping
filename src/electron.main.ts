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

    sendLog(appKey, `Página actual: ${page.url()}`);

    if (appKey === "mel1") {
      sendLog(appKey, "Ejecutando acciones post-login para MEL1...");

      // 🎯 ARRAY DE CÓDIGOS A PROCESAR
      const codigosAlumnos = [
        "U20309615",
        "U21323069",
        "U21323071",
        "U21323073",
        "U21323075",
        "U21323077",
        "U21323079",
        "U21323081",
        "U25317788",
        "U25317789",
      ]; // Agregar más códigos aquí
      sendLog(
        appKey,
        `Procesando ${
          codigosAlumnos.length
        } códigos de alumnos: ${codigosAlumnos.join(", ")}`
      );

      // 📊 RESULTADOS POR CÓDIGO
      const resultadosPorCodigo: Array<{
        codigo: string;
        alertDetectado: boolean;
        mensajeAlert?: string;
        screenshot?: string;
        error?: string;
      }> = [];

      // 🔄 ITERAR POR CADA CÓDIGO
      for (let i = 0; i < codigosAlumnos.length; i++) {
        const codigo = codigosAlumnos[i];
        sendLog(
          appKey,
          `\n--- Procesando código ${i + 1}/${
            codigosAlumnos.length
          }: ${codigo} ---`
        );

        try {
          // 1️⃣ LLENAR EL INPUT DE CÓDIGO
          const codigoInput = "#txtCodigoAlumnoSimulacion";
          sendLog(appKey, "Esperando input de código de alumno...");
          await page.waitForSelector(codigoInput, { timeout: 20000 });

          // Limpiar input antes de llenar
          await page.fill(codigoInput, "");
          await page.fill(codigoInput, codigo);
          sendLog(appKey, `Código de alumno ingresado: ${codigo}`);

          // 2️⃣ CONFIGURAR LISTENER PARA ESTE CÓDIGO
          sendLog(appKey, "🔍 Configurando listener para alert...");

          let alertDetectado = false;
          let mensajeAlert = "";

          const dialogHandler = async (dialog: any) => {
            const message = dialog.message();
            const type = dialog.type();
            alertDetectado = true;
            mensajeAlert = message;

            sendLog(
              appKey,
              `🚨 ${type.toUpperCase()} detectado para ${codigo}: "${message}"`
            );

            // Verificar tipo de mensaje
            if (
              message.includes("Su turno de matrícula asignado ya caducó") ||
              message.includes("matrícula") ||
              message.includes("caducó") ||
              message.includes("Ocurrió un error") ||
              message.includes("Verifique sus datos") ||
              message.includes("recargue la página")
            ) {
              sendLog(
                appKey,
                `📋 ${codigo}: Alert de error/matrícula detectado`
              );
            } else {
              sendLog(appKey, `📋 ${codigo}: Alert de otro tipo detectado`);
            }

            // Capturar evidencia con el código en el nombre
            try {
              const alertScreenshot = path.join(
                path.resolve("evidence"),
                `${appKey}-${codigo}-alert-${Date.now()}.png`
              );
              await page.screenshot({ path: alertScreenshot, fullPage: true });
              sendLog(
                appKey,
                `📸 Evidencia para ${codigo}: ${alertScreenshot}`
              );

              // Guardar screenshot en resultados
              resultadosPorCodigo[i] = resultadosPorCodigo[i] || {
                codigo,
                alertDetectado: false,
              };
              resultadosPorCodigo[i].screenshot = alertScreenshot;
            } catch (screenshotError) {
              sendLog(
                appKey,
                `❌ Error capturando screenshot para ${codigo}: ${screenshotError}`
              );
            }

            // 🎯 ESPERAR UN POCO ANTES DE CERRAR
            await page.waitForTimeout(1000);

            // ✅ CERRAR EL ALERT
            await dialog.accept();
            sendLog(
              appKey,
              `✅ Alert cerrado para ${codigo}: "${message.substring(
                0,
                50
              )}..."`
            );
          };
          // Registrar el listener
          page.on("dialog", dialogHandler);

          // 3️⃣ HACER CLICK EN EL BOTÓN SIMULAR
          const btnSimular = "#btnSimular";
          sendLog(appKey, "Esperando botón Simular...");
          await page.waitForSelector(btnSimular, { timeout: 20000 });

          const isEnabled = await page.isEnabled(btnSimular);
          const isVisible = await page.isVisible(btnSimular);

          sendLog(
            appKey,
            `Botón Simular - Visible: ${isVisible}, Habilitado: ${isEnabled}`
          );

          if (isVisible && isEnabled) {
            sendLog(appKey, `Haciendo click en Simular para ${codigo}...`);

            // 🎯 HACER CLICK Y ESPERAR RESPUESTA
            try {
              await Promise.race([
                page.click(btnSimular),
                page
                  .waitForEvent("dialog", { timeout: 10000 })
                  .then(() => {
                    sendLog(appKey, `🎯 Dialog capturado para ${codigo}`);
                  })
                  .catch(() => {
                    sendLog(
                      appKey,
                      `⏰ Timeout esperando dialog para ${codigo}`
                    );
                  }),
              ]);

              sendLog(appKey, `Click ejecutado para ${codigo}`);

              // Esperar procesamiento
              await page.waitForTimeout(3000);

              sendLog(
                appKey,
                `Estado alert ${codigo}: ${
                  alertDetectado ? "DETECTADO" : "NO DETECTADO"
                }`
              );

              // Guardar resultado
              resultadosPorCodigo[i] = {
                codigo,
                alertDetectado,
                mensajeAlert: mensajeAlert || undefined,
                screenshot: resultadosPorCodigo[i]?.screenshot,
              };

              // 🎯 Si no se detectó alert, capturar info adicional
              if (!alertDetectado) {
                sendLog(
                  appKey,
                  `🔍 Sin alert para ${codigo}, verificando página...`
                );

                const debugScreenshot = path.join(
                  path.resolve("evidence"),
                  `${appKey}-${codigo}-no-alert-${Date.now()}.png`
                );
                await page.screenshot({
                  path: debugScreenshot,
                  fullPage: true,
                });
                resultadosPorCodigo[i].screenshot = debugScreenshot;
                sendLog(appKey, `📸 Debug para ${codigo}: ${debugScreenshot}`);

                // 🆕 NUEVA FUNCIONALIDAD: Si no hay alert, verificar si llegamos a /matricula/index
                await page.waitForTimeout(5000);
                const currentUrl = page.url();
                sendLog(appKey, `URL actual para ${codigo}: ${currentUrl}`);

                if (currentUrl.includes("/matricula/index")) {
                  sendLog(
                    appKey,
                    `✅ ${codigo} llegó a página de matrícula - procesando modales y cursos...`
                  );

                  // Manejar modales y extraer cursos
                  await handleMatriculaPage(
                    appKey,
                    page,
                    codigo,
                    i,
                    resultadosPorCodigo
                  );
                } else {
                  sendLog(
                    appKey,
                    `⚠️ ${codigo} no llegó a página de matrícula`
                  );
                }
              }
            } catch (clickError) {
              const errorMsg = (clickError as Error).message;
              sendLog(appKey, `❌ Error con ${codigo}: ${errorMsg}`);
              resultadosPorCodigo[i] = {
                codigo,
                alertDetectado: false,
                error: errorMsg,
              };
            }
          } else {
            sendLog(appKey, `Botón Simular no disponible para ${codigo}`);
            resultadosPorCodigo[i] = {
              codigo,
              alertDetectado: false,
              error: "Botón no disponible",
            };
          }

          // Remover listener después de cada código
          page.off("dialog", dialogHandler);

          // Pausa entre códigos
          if (i < codigosAlumnos.length - 1) {
            sendLog(appKey, `Pausa antes del siguiente código...`);
            await page.waitForTimeout(2000);
          }
        } catch (codigoError) {
          const errorMsg = (codigoError as Error).message;
          sendLog(appKey, `❌ Error procesando ${codigo}: ${errorMsg}`);
          resultadosPorCodigo[i] = {
            codigo,
            alertDetectado: false,
            error: errorMsg,
          };
        }
      }

      // 📊 RESUMEN FINAL
      sendLog(appKey, "\n=== RESUMEN DE RESULTADOS ===");
      resultadosPorCodigo.forEach((resultado, index) => {
        const status = resultado.alertDetectado
          ? "🚨 ALERT"
          : resultado.error
          ? "❌ ERROR"
          : "✅ OK";
        sendLog(appKey, `${index + 1}. ${resultado.codigo}: ${status}`);
        if (resultado.mensajeAlert) {
          sendLog(
            appKey,
            `   Mensaje: "${resultado.mensajeAlert.substring(0, 80)}..."`
          );
        }
        if (resultado.error) {
          sendLog(appKey, `   Error: ${resultado.error}`);
        }
        if (resultado.screenshot) {
          sendLog(
            appKey,
            `   Screenshot: ${path.basename(resultado.screenshot)}`
          );
        }
      });

      // 📄 GUARDAR RESUMEN EN JSON
      const resumenPath = path.join(
        path.resolve("evidence"),
        `${appKey}-resumen-${Date.now()}.json`
      );
      fs.writeFileSync(
        resumenPath,
        JSON.stringify(resultadosPorCodigo, null, 2)
      );
      sendLog(appKey, `📄 Resumen guardado: ${resumenPath}`);

      sendLog(appKey, "Acciones post-login MEL1 completadas.");
    } else if (appKey === "mel2") {
      sendLog(appKey, "Ejecutando acciones post-login para MEL2...");
      sendLog(appKey, "Acciones post-login MEL2 completadas.");
    }

    // Capturar evidencia final
    const postActionScreenshot = path.join(
      path.resolve("evidence"),
      `${appKey}-final-${Date.now()}.png`
    );
    await page.screenshot({ path: postActionScreenshot, fullPage: true });
    sendLog(appKey, `Evidencia final: ${postActionScreenshot}`);

    // Cerrar recursos
    await page.close();
    await result.context.close();
  } catch (error) {
    sendLog(
      appKey,
      `Error en acciones post-login: ${(error as Error).message}`
    );
    if (result.page && !result.page.isClosed()) {
      await result.page.close();
    }
    if (result.context) {
      await result.context.close();
    }
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
      await page.waitForSelector('#myModalInit1', { timeout: 5000 });
      sendLog(appKey, `📋 Modal Tips detectado para ${codigo}`);
    
      // Click directo en el botón Cerrar del modal específico
      await page.click('#myModalInit1 button.btn.btn-danger[data-dismiss="modal"]');
      sendLog(appKey, `✅ Modal Tips cerrado para ${codigo}`);
      modalesDetectados.push("Modal de Tips");
      
    } catch (modalError) {
      sendLog(appKey, `⚠️ Modal Tips no encontrado para ${codigo}: ${modalError}`);
    }

    // // Modal 2: Empezar
    try {
      sendLog(appKey, `🔍 Buscando modal Tutorial para ${codigo}...`);
      
      // Esperar el botón Omitir específico
      await page.waitForSelector('a.introjs-skipbutton', { timeout: 5000 });
      sendLog(appKey, `📋 Modal Tutorial detectado para ${codigo}`);
      
      // Capturar screenshot del modal
      const modalScreenshot = path.join(
        path.resolve("evidence"),
        `${appKey}-${codigo}-modal-tutorial-${Date.now()}.png`
      );
      await page.screenshot({ path: modalScreenshot, fullPage: true });
      sendLog(appKey, `📸 Modal Tutorial: ${modalScreenshot}`);
      
      // Click directo en el botón Omitir
      await page.click('a.introjs-skipbutton');
      sendLog(appKey, `✅ Modal Tutorial cerrado (Omitir) para ${codigo}`);
      modalesDetectados.push("Modal Tutorial");
      
    } catch (tutorialError) {
      sendLog(appKey, `⚠️ Modal Tutorial no encontrado para ${codigo}: ${tutorialError}`);
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
          const dataCurso = await btnAgregar.getAttribute('data-curso');
          const primerCurso = cursos[0]; // El primer curso de la lista extraída
          
          sendLog(appKey, `📝 Haciendo click en "Agregar" para curso: ${primerCurso.codigo} - ${primerCurso.nombre} (data-curso: ${dataCurso})`);
          
          // Capturar screenshot antes del click
          const preClickScreenshot = path.join(
            path.resolve("evidence"),
            `${appKey}-${codigo}-pre-agregar-${Date.now()}.png`
          );
          await page.screenshot({ path: preClickScreenshot, fullPage: true });
          sendLog(appKey, `📸 Pre-click: ${preClickScreenshot}`);
          
          // Hacer click en el botón
          await btnAgregar.click();
          sendLog(appKey, `✅ Click realizado en botón "Agregar" para ${codigo}`);
          
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
        sendLog(appKey, `❌ Error haciendo click en "Agregar" para ${codigo}: ${agregarError}`);
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
