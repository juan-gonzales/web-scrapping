# 🎓 MEL Comparator - Sistema de Análisis Comparativo Automatizado

Aplicación de escritorio desarrollada en **Electron + Playwright** para automatizar el análisis comparativo entre dos sistemas de matrícula universitaria (MEL1 y MEL2), proporcionando un análisis detallado de diferencias y coincidencias en tiempo real.

## 📋 ¿Qué hace esta aplicación?

### 🎯 Funcionalidad Principal
- **Autenticación Paralela**: Se conecta simultáneamente a MEL1 (Sistema Clásico) y MEL2 (Sistema Moderno)
- **Procesamiento Secuencial**: Por cada código de estudiante, extrae datos de ambos sistemas
- **Análisis Comparativo**: Genera reportes detallados comparando:
  - Cursos disponibles
  - Créditos y horas académicas
  - Estados de matrícula
  - Modales y validaciones del sistema
  - Diferencias críticas y coincidencias

### 🔄 Flujo de Trabajo
1. **Fase 1**: Autenticación MEL1 → Espera
2. **Fase 2**: Autenticación MEL2 → Inicia procesamiento
3. **Fase 3**: Por cada estudiante:
   - Procesa datos en MEL1
   - Procesa datos en MEL2
   - Genera análisis comparativo
4. **Fase 4**: Exporta reporte final con análisis completo

## 🚀 Instalación

### 📦 Requisitos Previos

#### Para **macOS**:
```bash
# Instalar Homebrew (si no está instalado)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar Node.js
brew install node

# Verificar instalación
node --version  # Debe ser 18+
npm --version
```

#### Para **Windows**:
```powershell
# Opción 1: Descargar desde https://nodejs.org/ (LTS Version)
# Opción 2: Usar Chocolatey
choco install nodejs

# Opción 3: Usar winget
winget install OpenJS.NodeJS

# Verificar instalación
node --version  # Debe ser 18+
npm --version
```

#### Para **Linux (Ubuntu/Debian)**:
```bash
# Actualizar repositorios
sudo apt update

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalación
node --version  # Debe ser 18+
npm --version
```

#### Para **Linux (CentOS/RHEL/Fedora)**:
```bash
# Para Fedora
sudo dnf install npm nodejs

# Para CentOS/RHEL
sudo yum install npm nodejs

# Verificar instalación
node --version
npm --version
```

### 🔧 Instalación del Proyecto

```bash
# 1. Clonar el repositorio
git clone <repository-url>
cd web-scrapping

# 2. Instalar dependencias del proyecto
npm install

# 3. Instalar Playwright y navegadores
npx playwright install

# 4. Instalar específicamente Chromium
npx playwright install chromium

# 5. Configurar el archivo de configuración
cp src/config/app.example.json src/config/app.json

# 6. Compilar el proyecto
npm run build
```

### ⚙️ Configuración

Edita `src/config/app.json` para personalizar:

```json
{
  "evidenceDir": "./evidence",
  "mel1": {
    "loginUrl": "https://melvisor.utp.edu.pe",
    "selectors": {
      "user": "#UserName",
      "pass": "#Password",
      "captchaImage": "#imgCaptcha",
      "captchaInput": "#Captcha",
      "submit": "button[type=submit]",
      "anchorsAfterLogin": ["#txtCodigoAlumnoSimulacion"]
    }
  },
  "mel2": {
    "loginUrl": "http://mel2.utpxpedition.com",
    "selectors": {
      "user": "#studentCode",
      "pass": "#password",
      "submit": "#kc-login",
      "anchorsAfterLogin": ["input[placeholder*='código del alumno']"]
    }
  }
}
```

## 🏃‍♂️ Ejecución

### Desarrollo (Hot Reload)
```bash
npm run dev
```

### Producción
```bash
npm run build
npm start
```

### Modo Debug
```bash
# Con logs detallados
DEBUG=* npm start

# Solo logs de Playwright
DEBUG=pw:* npm start
```

## 🛠️ Solución de Problemas

### Error: "Chromium not found"
```bash
# Reinstalar Playwright
npm uninstall playwright
npm install playwright
npx playwright install chromium
```

### Error: "Permission denied" (Linux/macOS)
```bash
# Dar permisos de ejecución
chmod +x node_modules/.bin/*
sudo chmod +x /usr/local/bin/node
```

### Error: "CAPTCHA no se muestra"
- Verificar selectores en `src/config/app.json`
- Comprobar que las URLs sean correctas
- Revisar logs en la consola de desarrollo

### Error: "Authentication failed"
- Verificar credenciales
- Comprobar conectividad a internet
- Revisar si los sitios web están disponibles

## 📊 Estructura del Proyecto

```
├── src/
│   ├── electron.main.ts          # Proceso principal Electron
│   ├── preload.ts               # Script de preload seguro
│   ├── config/
│   │   ├── app.json            # Configuración principal
│   │   └── app.example.json    # Plantilla de configuración
│   ├── lib/
│   │   └── playwrightLogin.ts  # Lógica de autenticación
│   └── renderer/
│       ├── index.html          # Interfaz de usuario
│       └── renderer.ts         # Lógica del frontend
├── evidence/                    # Capturas y reportes generados
├── scripts/
│   └── dev.ts                  # Script de desarrollo
└── dist/                       # Archivos compilados
```

## 📈 Reportes Generados

### 📄 Archivo JSON de Resultados
```json
{
  "timestamp": "2025-01-06T23:35:37.850Z",
  "totalCodigos": 10,
  "analisisComparativo": [
    {
      "codigo": "U20309615",
      "sonIguales": false,
      "coincidencias": {
        "validaciones": true,
        "modales": true,
        "cargaHabil": true,
        "consultaClases": false
      },
      "diferencias": {...}
    }
  ],
  "resultadosDetallados": [...]
}
```

### 📸 Evidencias Visuales
- Screenshots de cada paso del proceso
- Capturas de errores y alertas
- Evidencias de modales procesados
- Screenshots comparativos entre sistemas

## 🔧 TODOs Pendientes

### 🎯 Funcionalidades Prioritarias
- [ ] **Exportador Excel**: Generar reportes en formato `.xlsx` con análisis detallado
- [ ] **Dashboard de Métricas**: Gráficos de coincidencias vs diferencias
- [ ] **Notificaciones Push**: Alertas cuando se detecten diferencias críticas
- [ ] **Modo Headless**: Opción para ejecutar sin interfaz gráfica
- [ ] **Scheduler**: Programación automática de análisis

### 🚀 Mejoras de UX/UI
- [ ] **Progress Bar Detallado**: Mostrar progreso por estudiante
- [ ] **Filtros Avanzados**: Filtrar logs por tipo de evento
- [ ] **Tema Oscuro**: Implementar modo oscuro
- [ ] **Zoom de Screenshots**: Visor de imágenes mejorado
- [ ] **Exportación de Logs**: Guardar logs en archivo

### 🔒 Seguridad y Performance
- [ ] **Encriptación de Credenciales**: Almacenamiento seguro temporal
- [ ] **Rate Limiting**: Control de velocidad de requests
- [ ] **Retry Logic**: Reintentos automáticos en fallos
- [ ] **Memory Management**: Optimización de uso de memoria
- [ ] **Error Recovery**: Recuperación automática de errores

### 🧪 Testing y Calidad
- [ ] **Unit Tests**: Tests para funciones críticas
- [ ] **Integration Tests**: Tests end-to-end
- [ ] **Code Coverage**: Cobertura mínima del 80%
- [ ] **Performance Tests**: Benchmarks de velocidad
- [ ] **Accessibility**: Cumplimiento WCAG 2.1

### 📊 Analytics y Reporting
- [ ] **Métricas de Sistema**: Tiempo de procesamiento por código
- [ ] **Análisis de Tendencias**: Patrones en las diferencias encontradas
- [ ] **Alertas Inteligentes**: ML para detectar anomalías
- [ ] **Reportes Automatizados**: Envío automático de reportes
- [ ] **API REST**: Exposición de datos para integración externa

### 🌐 Integración y Deployment
- [ ] **Docker Support**: Containerización de la aplicación
- [ ] **CI/CD Pipeline**: Automatización de builds y tests
- [ ] **Auto-updater**: Actualizaciones automáticas
- [ ] **Instalador Cross-platform**: Paquetes para Windows/Mac/Linux
- [ ] **Cloud Deployment**: Versión web de la aplicación

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo LICENSE para más detalles.

## 🆘 Soporte

- **Issues**: [GitHub Issues](https://github.com/tu-repo/issues)
- **Documentación**: [Wiki del Proyecto](https://github.com/tu-repo/wiki)
- **Email**: tu-email@ejemplo.com

---

**⚡ Desarrollado para automatizar análisis comparativos universitarios**