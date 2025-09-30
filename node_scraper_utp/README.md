# Servicio de scraping MEL1/MEL2

## Requisitos
- Node.js 20+
- PostgreSQL 13+
- `npx playwright install`

## Instalación
1. Clona este repositorio.
2. Ingresa al directorio `node_scraper_utp/`.
3. Ejecuta `npm install` para instalar las dependencias.

## Configuración
1. Copia el archivo `.env.example` a `.env`.
2. Completa los valores de conexión a base de datos, URLs, credenciales y parámetros de Keycloak.
3. Ejecuta las migraciones con `npm run migrate:up`.

## Ejecución
Inicia el servidor HTTP con:

```bash
npm start
```

## Uso del scraper por CSV
Para crear un evento y disparar el scraping por lotes, envía un archivo CSV (una columna con códigos de alumno) mediante multipart/form-data en el campo `csv_file`:

```bash
curl -X POST \
  -F "csv_file=@/ruta/alumnos.csv" \
  http://localhost:8000/api/csv/
```

La respuesta incluirá el identificador del evento y el resumen por sistema y estado.

## Monitoreo de resultados
- `GET /api/events/` → lista eventos registrados.
- `GET /api/students/?web_scraper_event_id=<id>` → lista registros de alumnos filtrados por evento.
- `GET /api/courses/?web_scraper_event_id=<id>` → lista cursos asociados a un evento (se puede combinar con `student_code`).

## Exportar comparación de cursos
Para generar el archivo Excel de comparación MEL1 vs MEL2:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"web_scraper_event_id": 1}' \
  http://localhost:8000/api/course-comparison/export_report --output reporte.xlsx
```

## Notas de scraping
- El modo headless se controla mediante `SCRAPER_HEADLESS` en `.env`.
- Los selectores están centralizados en `src/scrapers/selectors/`.
- Aumenta los tiempos de espera usando `REQUEST_TIMEOUT_MS` si ocurre un timeout.
- Las credenciales y endpoints se configuran exclusivamente en el archivo `.env`.

## Paridad funcional
Las rutas disponibles, estados (`Procesando`, `Exitoso`, `Fallido`), claves JSON (`MEL1`, `MEL2`) y las columnas del Excel mantienen exactamente los nombres y el comportamiento descritos en la especificación original.
