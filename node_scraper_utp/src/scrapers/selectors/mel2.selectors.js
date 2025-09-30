export const MEL2_SELECTORS = {
  keycloak: {
    usernameInput: '#username',
    passwordInput: '#password',
    loginButton: '#kc-login'
  },
  studentCodeInput: '#student-code',
  simulateButton: '#simulate-student',
  coursesTableRows: '#courses-table tbody tr',
  courseColumns: {
    code: '[data-column="code"]',
    name: '[data-column="name"]',
    weeklyHours: '[data-column="weekly_hours"]',
    credits: '[data-column="credits"]',
    cycle: '[data-column="cycle"]',
    enrollment: '[data-column="enrollment"]',
    type: '[data-column="type"]',
    section: '[data-column="section"]',
    extraButtons: '[data-column="extra_buttons"]'
  },
  scheduleContainer: '#schedule-container'
};
