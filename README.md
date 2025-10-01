# MEL Auth Desktop

Aplicación de escritorio en Electron + Playwright (Chromium modo headful) para automatizar la autenticación manual en MEL 1 y MEL 2 mostrando interacción de CAPTCHA asistida por el usuario.

## Requisitos
- Node.js 18+
- Chromium instalado automáticamente por Playwright (`npx playwright install` después de instalar dependencias)

## Instalación
```bash
npm install
npx playwright install chromium
```

## Desarrollo
Ejecuta compilación en modo observador y lanza Electron con soporte para TypeScript:
```bash
npm run dev
```

## Producción / Ejecución directa
Compila el proyecto y arráncalo con Electron:
```bash
npm run build
npm start
```

## Configuración
La aplicación carga `APP_CONFIG_PATH` si se proporciona. En su defecto utiliza `src/config/app.example.json`. Duplica ese archivo como `src/config/app.json` para personalizar selectores, URLs, patrones de verificación y carpeta de evidencias.

Las credenciales nunca se guardan en disco; solo viven en memoria durante la sesión.
