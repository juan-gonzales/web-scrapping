import ExcelJS from 'exceljs';
import { dbQuery } from '../db/db.js';

const comparisonQuery = `
WITH mel1 AS (
  SELECT
    s.student_code,
    s.web_scraper_event_id,
    s.created_at,
    s.extra_information -> 'login_validation' ->> 'status' AS login_status,
    c.course_code,
    c.course,
    c.weekly_hours,
    c.credits,
    c.course_type,
    c.section,
    c.enrollment
  FROM student_info_web_scrapper s
  LEFT JOIN courses c ON c.student_info_id = s.id
  WHERE s.analyzed_system = 'MEL1' AND s.web_scraper_event_id = $1
),
mel2 AS (
  SELECT
    s.student_code,
    s.web_scraper_event_id,
    s.created_at,
    s.extra_information -> 'login_validation' ->> 'status' AS login_status,
    c.course_code,
    c.course,
    c.weekly_hours,
    c.credits,
    c.course_type,
    c.section,
    c.enrollment
  FROM student_info_web_scrapper s
  LEFT JOIN courses c ON c.student_info_id = s.id
  WHERE s.analyzed_system = 'MEL2' AND s.web_scraper_event_id = $1
)
SELECT
  COALESCE(mel1.student_code, mel2.student_code) AS student_code,
  COALESCE(mel1.web_scraper_event_id, mel2.web_scraper_event_id) AS web_scraper_event_id,
  COALESCE(mel1.created_at, mel2.created_at) AS created_at,
  mel1.login_status AS mel1_login_status,
  mel1.course_code AS mel1_course_code,
  mel1.course AS mel1_course,
  mel1.weekly_hours AS mel1_weekly_hours,
  mel1.credits AS mel1_credits,
  mel1.course_type AS mel1_course_type,
  mel1.section AS mel1_section,
  mel1.enrollment AS mel1_enrollment,
  mel2.login_status AS mel2_login_status,
  mel2.course_code AS mel2_course_code,
  mel2.course AS mel2_course,
  mel2.weekly_hours AS mel2_weekly_hours,
  mel2.credits AS mel2_credits,
  mel2.course_type AS mel2_course_type,
  mel2.section AS mel2_section,
  mel2.enrollment AS mel2_enrollment
FROM mel1
FULL OUTER JOIN mel2
  ON mel1.student_code = mel2.student_code
 AND COALESCE(mel1.course_code, mel1.course) = COALESCE(mel2.course_code, mel2.course)
ORDER BY student_code ASC, mel1_course ASC NULLS LAST, mel2_course ASC NULLS LAST;
`;

const worksheetColumns = [
  { header: 'CodUtp', key: 'student_code', width: 15 },
  { header: 'ID evento', key: 'web_scraper_event_id', width: 12 },
  { header: 'Comparacion', key: 'comparison', width: 20 },
  { header: 'Fecha y hora', key: 'created_at', width: 20 },
  { header: 'MEL1 Validacion Ingreso (Login)', key: 'mel1_login_status', width: 30 },
  { header: 'MEL 1 Codigo Curso', key: 'mel1_course_code', width: 20 },
  { header: 'MEL1 Curso', key: 'mel1_course', width: 40 },
  { header: 'MEL1 Horas Semanales', key: 'mel1_weekly_hours', width: 20 },
  { header: 'MEL1 Creditos', key: 'mel1_credits', width: 15 },
  { header: 'MEL1 Tipo', key: 'mel1_course_type', width: 20 },
  { header: 'MEL1 Clase Matriculadas', key: 'mel1_section', width: 25 },
  { header: 'MEL1 Clase desaprobados', key: 'mel1_enrollment', width: 25 },
  { header: 'MEL2 Validacion Ingreso (Login)', key: 'mel2_login_status', width: 30 },
  { header: 'MEL 2 Codigo Curso', key: 'mel2_course_code', width: 20 },
  { header: 'MEL2 Curso', key: 'mel2_course', width: 40 },
  { header: 'MEL2 Horas Semanales', key: 'mel2_weekly_hours', width: 20 },
  { header: 'MEL2 Creditos', key: 'mel2_credits', width: 15 },
  { header: 'MEL2 Tipo', key: 'mel2_course_type', width: 20 },
  { header: 'MEL2 Clase Matriculadas', key: 'mel2_section', width: 25 },
  { header: 'MEL2 Clase desaprobados', key: 'mel2_enrollment', width: 25 }
];

export const generateComparisonReport = async (web_scraper_event_id) => {
  const { rows } = await dbQuery(comparisonQuery, [web_scraper_event_id]);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Comparacion');
  worksheet.columns = worksheetColumns;

  rows.forEach((row) => {
    worksheet.addRow({
      student_code: row.student_code,
      web_scraper_event_id: row.web_scraper_event_id,
      comparison: '',
      created_at: row.created_at ? new Date(row.created_at) : null,
      mel1_login_status: row.mel1_login_status || '',
      mel1_course_code: row.mel1_course_code || '',
      mel1_course: row.mel1_course || '',
      mel1_weekly_hours: row.mel1_weekly_hours || '',
      mel1_credits: row.mel1_credits || '',
      mel1_course_type: row.mel1_course_type || '',
      mel1_section: row.mel1_section || '',
      mel1_enrollment: row.mel1_enrollment ?? '',
      mel2_login_status: row.mel2_login_status || '',
      mel2_course_code: row.mel2_course_code || '',
      mel2_course: row.mel2_course || '',
      mel2_weekly_hours: row.mel2_weekly_hours || '',
      mel2_credits: row.mel2_credits || '',
      mel2_course_type: row.mel2_course_type || '',
      mel2_section: row.mel2_section || '',
      mel2_enrollment: row.mel2_enrollment ?? ''
    });
  });

  return workbook.xlsx.writeBuffer();
};
