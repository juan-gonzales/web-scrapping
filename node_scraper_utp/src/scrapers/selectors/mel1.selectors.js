export const MEL1_SELECTORS = {
  usernameInput: 'input[name="username"]',
  passwordInput: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
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
  availableSectionsJson: '#available-sections',
  scheduleContainer: '#schedule-container'
};
