import { MEL2_SELECTORS } from './selectors/mel2.selectors.js';

const timeout = process.env.REQUEST_TIMEOUT_MS
  ? Number(process.env.REQUEST_TIMEOUT_MS)
  : 30000;

export const performKeycloakLogin = async (page) => {
  const username = process.env.KEYCLOAK_USERNAME;
  const password = process.env.KEYCLOAK_PASSWORD;

  if (!username || !password) {
    throw new Error('Credenciales de Keycloak no configuradas');
  }

  await page.waitForSelector(MEL2_SELECTORS.keycloak.usernameInput, { timeout });
  await page.fill(MEL2_SELECTORS.keycloak.usernameInput, username);
  await page.fill(MEL2_SELECTORS.keycloak.passwordInput, password);
  await page.click(MEL2_SELECTORS.keycloak.loginButton);
  await page.waitForSelector(MEL2_SELECTORS.studentCodeInput, { timeout });
};
