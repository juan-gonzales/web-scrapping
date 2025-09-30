import { chromium } from 'playwright';
import { MEL1_SELECTORS } from './selectors/mel1.selectors.js';

const headless = process.env.SCRAPER_HEADLESS !== 'false';
const timeout = process.env.REQUEST_TIMEOUT_MS
  ? Number(process.env.REQUEST_TIMEOUT_MS)
  : 30000;

const safeTrim = (value) => (typeof value === 'string' ? value.trim() : value);

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const extractCourses = async (page) => {
  try {
    const rows = page.locator(MEL1_SELECTORS.coursesTableRows);
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
        course_code: await getText(MEL1_SELECTORS.courseColumns.code),
        course: await getText(MEL1_SELECTORS.courseColumns.name),
        weekly_hours: await getText(MEL1_SELECTORS.courseColumns.weeklyHours),
        credits: await getText(MEL1_SELECTORS.courseColumns.credits),
        cycle: await getText(MEL1_SELECTORS.courseColumns.cycle),
        enrollment: Number(await getText(MEL1_SELECTORS.courseColumns.enrollment)) || 0,
        course_type: await getText(MEL1_SELECTORS.courseColumns.type),
        section: await getText(MEL1_SELECTORS.courseColumns.section),
        extra_buttons: await getText(MEL1_SELECTORS.courseColumns.extraButtons),
        available_sections: null
      });
    }
    const sectionsLocator = page.locator(MEL1_SELECTORS.availableSectionsJson);
    if ((await sectionsLocator.count()) > 0) {
      const jsonText = await sectionsLocator.first().textContent();
      const parsed = safeJsonParse(jsonText);
      if (parsed) {
        courses.forEach((course) => {
          course.available_sections = parsed;
        });
      }
    }
    return courses;
  } catch (error) {
    console.warn('No fue posible extraer cursos MEL1', error.message);
    return [];
  }
};

const extractSchedule = async (page) => {
  try {
    const locator = page.locator(MEL1_SELECTORS.scheduleContainer);
    if ((await locator.count()) === 0) return null;
    const content = await locator.first().textContent();
    const parsed = safeJsonParse(content);
    if (parsed && typeof parsed === 'object') {
      return { content_information: parsed, weekly_timetable: parsed };
    }
    return { content_information: content, weekly_timetable: null };
  } catch (error) {
    console.warn('No fue posible extraer horario MEL1', error.message);
    return null;
  }
};

export const runMel1Scraper = async ({ studentCode }) => {
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

    await page.goto(process.env.MEL1_BASE_URL, { timeout });

    if (process.env.MEL1_USERNAME && process.env.MEL1_PASSWORD) {
      if (MEL1_SELECTORS.usernameInput && MEL1_SELECTORS.passwordInput) {
        await page.fill(MEL1_SELECTORS.usernameInput, process.env.MEL1_USERNAME);
        await page.fill(MEL1_SELECTORS.passwordInput, process.env.MEL1_PASSWORD);
        await page.click(MEL1_SELECTORS.loginButton);
      }
    }

    if (MEL1_SELECTORS.studentCodeInput) {
      await page.waitForSelector(MEL1_SELECTORS.studentCodeInput, { timeout });
      await page.fill(MEL1_SELECTORS.studentCodeInput, studentCode);
    }
    if (MEL1_SELECTORS.simulateButton) {
      await page.click(MEL1_SELECTORS.simulateButton);
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
