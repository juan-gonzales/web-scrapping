import { parse } from 'csv-parse/sync';
import { createEvent } from './events.service.js';
import {
  ensureProcessingRecord,
  finalizeStudentScrape
} from './students.service.js';
import { runMel1Scraper } from '../scrapers/mel1.scraper.js';
import { runMel2Scraper } from '../scrapers/mel2.scraper.js';

const emptyResults = () => ({
  Procesando: [],
  Exitoso: [],
  Fallido: []
});

const normalizeSummary = () => ({
  MEL1: emptyResults(),
  MEL2: emptyResults()
});

const parseCsvCodes = (buffer) => {
  const records = parse(buffer, {
    bom: true,
    trim: true,
    skip_empty_lines: true
  });
  const codes = [];
  for (const record of records) {
    if (Array.isArray(record)) {
      const value = record[0]?.toString().trim();
      if (value) {
        codes.push(value);
      }
    } else if (record) {
      codes.push(record.toString().trim());
    }
  }
  return codes;
};

const ensureResultObject = (result) => ({
  status: result?.status || 'Fallido',
  extraInformation: result?.extraInformation ?? {
    error: { message: 'Resultado desconocido' }
  },
  courses: result?.courses ?? [],
  schedules: result?.schedules ?? []
});

export const processCsvOrchestration = async (csvBuffer) => {
  const studentCodes = parseCsvCodes(csvBuffer);
  if (!studentCodes.length) {
    throw new Error('El CSV no contiene códigos de alumno válidos');
  }

  const event = await createEvent();
  const summary = normalizeSummary();

  for (const studentCode of studentCodes) {
    await Promise.all([
      ensureProcessingRecord({
        analyzed_system: 'MEL1',
        student_code: studentCode,
        web_scraper_event_id: event.id
      }),
      ensureProcessingRecord({
        analyzed_system: 'MEL2',
        student_code: studentCode,
        web_scraper_event_id: event.id
      })
    ]);

    summary.MEL1.Procesando.push(studentCode);
    summary.MEL2.Procesando.push(studentCode);

    const [mel1Outcome, mel2Outcome] = await Promise.all([
      runMel1Scraper({ studentCode, eventId: event.id }).catch((error) => ({
        status: 'Fallido',
        extraInformation: {
          error: { message: error.message, stack: error.stack }
        }
      })),
      runMel2Scraper({ studentCode, eventId: event.id }).catch((error) => ({
        status: 'Fallido',
        extraInformation: {
          error: { message: error.message, stack: error.stack }
        }
      }))
    ]);

    const mel1Result = ensureResultObject(mel1Outcome);
    const mel2Result = ensureResultObject(mel2Outcome);

    summary.MEL1.Procesando = summary.MEL1.Procesando.filter(
      (code) => code !== studentCode
    );
    summary.MEL2.Procesando = summary.MEL2.Procesando.filter(
      (code) => code !== studentCode
    );

    try {
      await finalizeStudentScrape({
        analyzed_system: 'MEL1',
        student_code: studentCode,
        web_scraper_event_id: event.id,
        status: mel1Result.status,
        extra_information: mel1Result.extraInformation,
        courses: mel1Result.courses,
        schedules: mel1Result.schedules
      });
      summary.MEL1[mel1Result.status].push(studentCode);
    } catch (error) {
      console.error('Error finalizando MEL1', error);
      summary.MEL1.Fallido.push(studentCode);
    }

    try {
      await finalizeStudentScrape({
        analyzed_system: 'MEL2',
        student_code: studentCode,
        web_scraper_event_id: event.id,
        status: mel2Result.status,
        extra_information: mel2Result.extraInformation,
        courses: mel2Result.courses,
        schedules: mel2Result.schedules
      });
      summary.MEL2[mel2Result.status].push(studentCode);
    } catch (error) {
      console.error('Error finalizando MEL2', error);
      summary.MEL2.Fallido.push(studentCode);
    }
  }

  return {
    event_id: event.id,
    results: summary
  };
};
