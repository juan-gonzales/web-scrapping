import { chromium } from 'playwright';
import { MEL2_SELECTORS } from './selectors/mel2.selectors.js';
import { performKeycloakLogin } from './keycloak.client.js';

const headless = process.env.SCRAPER_HEADLESS !== 'false';
const timeout = process.env.REQUEST_TIMEOUT_MS
  ? Number(process.env.REQUEST_TIMEOUT_MS)
  : 30000;

const safeTrim = (value) => (typeof value === 'string' ? value.trim() : value);

const extractCourses = async (page) => {
  try {
    const rows = page.locator(MEL2_SELECTORS.coursesTableRows);
    const count = await rows.count();
    const courses = [];
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const getText = async (selector) => {
        const locator = row.locator(selector);
        if (await locator.count()) {
          const text = await locator.first().textContent();
          return safeTrim(text) || null;
        }
        return null;
      };
      courses.push({
        course_code: await getText(MEL2_SELECTORS.courseColumns.code),
        course: await getText(MEL2_SELECTORS.courseColumns.name),
        weekly_hours: await getText(MEL2_SELECTORS.courseColumns.weeklyHours),
        credits: await getText(MEL2_SELECTORS.courseColumns.credits),
        cycle: await getText(MEL2_SELECTORS.courseColumns.cycle),
        enrollment: Number(await getText(MEL2_SELECTORS.courseColumns.enrollment)) || 0,
        course_type: await getText(MEL2_SELECTORS.courseColumns.type),
        section: await getText(MEL2_SELECTORS.courseColumns.section),
        extra_buttons: await getText(MEL2_SELECTORS.courseColumns.extraButtons),
        available_sections: null
      });
    }
    return courses;
  } catch (error) {
    console.warn('No fue posible extraer cursos MEL2', error.message);
    return [];
  }
};

const extractSchedule = async (page) => {
  try {
    if (!MEL2_SELECTORS.scheduleContainer) return null;
    const locator = page.locator(MEL2_SELECTORS.scheduleContainer);
    if ((await locator.count()) === 0) return null;
    const text = await locator.first().textContent();
    return { content_information: text, weekly_timetable: null };
  } catch (error) {
    console.warn('No fue posible extraer horario MEL2', error.message);
    return null;
  }
};

export const runMel2Scraper = async ({ studentCode }) => {
  const extraInformation = {
    login_validation: { status: 'Pendiente' },
    messages: []
  };

  let browser;
  let context;
  let page;

  try {
    browser = await chromium.launch({ headless });
    context = await browser.newContext();
    page = await context.newPage();

    await page.goto(process.env.MEL2_BASE_URL, { timeout });
    await performKeycloakLogin(page);

    if (MEL2_SELECTORS.studentCodeInput) {
      await page.fill(MEL2_SELECTORS.studentCodeInput, studentCode);
    }
    if (MEL2_SELECTORS.simulateButton) {
      await page.click(MEL2_SELECTORS.simulateButton);
    }

    extraInformation.login_validation.status = 'Exitoso';

    const courses = await extractCourses(page);
    const schedule = await extractSchedule(page);

    return {
      status: 'Exitoso',
      extraInformation,
      courses,
      schedules: schedule ? [schedule] : []
    };
  } catch (error) {
    extraInformation.login_validation.status = 'Fallido';
    extraInformation.error = { message: error.message };
    return {
      status: 'Fallido',
      extraInformation,
      courses: [],
      schedules: []
    };
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
};
