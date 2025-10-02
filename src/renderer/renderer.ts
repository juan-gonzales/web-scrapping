type MelAppKey = 'mel1' | 'mel2';

type StatusPayload = {
  app: MelAppKey;
  ok: boolean;
  title?: string;
  url?: string;
  anchors?: string[];
  screenshotDataUrl?: string;
  screenshotThumb?: string;
  screenshotPath?: string;
  message?: string;
};

type CaptchaPayload = {
  app: MelAppKey;
  image: string;
};

type LogPayload = {
  app: MelAppKey;
  message: string;
};

type AppState = {
  awaitingCaptcha: boolean;
  screenshotPath?: string;
  anchors: string[];
};

const appStates: Record<MelAppKey, AppState> = {
  mel1: { awaitingCaptcha: false, anchors: [] },
  mel2: { awaitingCaptcha: false, anchors: [] },
};

const modalRefs = {
  mel1: {
    modal: document.getElementById('mel1Modal') as HTMLDivElement,
    form: document.getElementById('mel1Form') as HTMLFormElement,
    captchaSection: document.getElementById('mel1Captcha') as HTMLDivElement,
    captchaImage: document.querySelector('#mel1Captcha .captcha-image') as HTMLImageElement,
    error: document.getElementById('mel1Error') as HTMLParagraphElement,
    submitButton: (document.querySelector('#mel1Form button[type="submit"]') as HTMLButtonElement),
  },
  mel2: {
    modal: document.getElementById('mel2Modal') as HTMLDivElement,
    form: document.getElementById('mel2Form') as HTMLFormElement,
    captchaSection: document.getElementById('mel2Captcha') as HTMLDivElement,
    captchaImage: document.querySelector('#mel2Captcha .captcha-image') as HTMLImageElement,
    error: document.getElementById('mel2Error') as HTMLParagraphElement,
    submitButton: (document.querySelector('#mel2Form button[type="submit"]') as HTMLButtonElement),
  },
};

const statusCards = {
  mel1: document.querySelector('.status-card[data-app="mel1"]') as HTMLElement,
  mel2: document.querySelector('.status-card[data-app="mel2"]') as HTMLElement,
};

const logsContainer = document.getElementById('logs') as HTMLDivElement;

function toggleModal(app: MelAppKey, show: boolean) {
  const modal = modalRefs[app].modal;
  if (show) {
    modal.classList.add('active');
    const userInput = modalRefs[app].form.querySelector('input[name="user"]') as HTMLInputElement | null;
    if (userInput) {
      userInput.focus();
    }
  } else {
    modal.classList.remove('active');
  }
}

function resetCaptcha(app: MelAppKey) {
  const state = appStates[app];
  state.awaitingCaptcha = false;
  const { captchaSection, captchaImage, submitButton } = modalRefs[app];
  captchaSection.classList.remove('active');
  captchaImage.src = '';
  const captchaInput = captchaSection.querySelector('input[name="captchaText"]') as HTMLInputElement;
  if (captchaInput) {
    captchaInput.value = '';
  }
  submitButton.textContent = 'Entrar';
}

function appendLog(payload: LogPayload) {
  const time = new Date().toLocaleTimeString();
  logsContainer.textContent += `[${time}] (${payload.app.toUpperCase()}) ${payload.message}\n`;
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function updateStatusCard(payload: StatusPayload) {
  const card = statusCards[payload.app];
  const badge = card.querySelector('.badge') as HTMLElement;
  const titleEl = card.querySelector('.title') as HTMLElement;
  const urlEl = card.querySelector('.url') as HTMLElement;
  const thumbnail = card.querySelector('.thumbnail') as HTMLImageElement;
  const anchorsList = card.querySelector('.anchors-list') as HTMLUListElement;
  const viewButton = card.querySelector('.view-screenshot') as HTMLButtonElement;

  if (payload.ok) {
    badge.textContent = payload.app === 'mel1' ? 'MEL 1 autenticado' : 'MEL 2 autenticado';
    badge.classList.remove('red');
    badge.classList.add('green');
    titleEl.textContent = payload.title ?? '-';
    urlEl.textContent = payload.url ?? '-';
    const thumb = payload.screenshotThumb ?? payload.screenshotDataUrl;
    thumbnail.src = thumb ?? '';
    anchorsList.innerHTML = '';
    const anchors = payload.anchors ?? [];
    appStates[payload.app].anchors = anchors;
    anchors.forEach((anchor) => {
      const li = document.createElement('li');
      li.textContent = `✅ ${anchor}`;
      anchorsList.appendChild(li);
    });
    if (payload.screenshotPath) {
      appStates[payload.app].screenshotPath = payload.screenshotPath;
      viewButton.disabled = false;
    } else {
      viewButton.disabled = true;
    }
  } else {
    badge.textContent = 'Error';
    badge.classList.add('red');
    badge.classList.remove('green');
    if (payload.message) {
      const modalError = modalRefs[payload.app].error;
      modalError.textContent = payload.message;
    }
    thumbnail.src = '';
    anchorsList.innerHTML = '';
    appStates[payload.app].screenshotPath = undefined;
    viewButton.disabled = true;
  }
}

function handleFormSubmit(app: MelAppKey) {
  console.log("🚀 ~ handleFormSubmit ~ app:", app)
  
  const { form, submitButton, error, captchaSection } = modalRefs[app];
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    submitButton.disabled = true;

    const formData = new FormData(form);
    const user = (formData.get('user') as string) ?? '';
    const pass = (formData.get('pass') as string) ?? '';
    const captchaText = (formData.get('captchaText') as string) ?? '';

    if (appStates[app].awaitingCaptcha) {
      if (!captchaText.trim()) {
        error.textContent = 'Ingresa el texto del CAPTCHA.';
        submitButton.disabled = false;
        return;
      }
      window.electronAPI.submitMel1CaptchaText({ captchaText });
    } else {
      if (!user || !pass) {
        error.textContent = 'Completa usuario y contraseña.';
        submitButton.disabled = false;
        return;
      }
      if (app === 'mel1') {
        window.electronAPI.startMel1Login({ user, pass });
      } else {
        window.electronAPI.startMel2Login({ user, pass });
      }
    }

    if (!appStates[app].awaitingCaptcha) {
      captchaSection.classList.remove('active');
    }
  });
}

function bindViewButtons() {
  const buttons = document.querySelectorAll('.view-screenshot');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const app = (button.closest('.status-card')?.getAttribute('data-app') ?? 'mel1') as MelAppKey;
      const path = appStates[app].screenshotPath;
      if (path) {
        const normalized = path.replace(/\\/g, '/');
        const fileUrl = normalized.startsWith('file://') ? normalized : `file://${encodeURI(normalized)}`;
        window.open(fileUrl);
      }
    });
  });
}

window.electronAPI.onLoginStatus((payload: StatusPayload) => {
  const { app } = payload;
  const { submitButton } = modalRefs[app];
  submitButton.disabled = false;
  if (payload.ok) {
    updateStatusCard(payload);
    resetCaptcha(app);
    toggleModal(app, false);
    if (app === 'mel1') {
      toggleModal('mel2', true);
    }
  } else {
    resetCaptcha(app);
    updateStatusCard(payload);
  }
});

window.electronAPI.onCaptchaRequired((payload: CaptchaPayload) => {
  const { app } = payload;
  appStates[app].awaitingCaptcha = true;
  const { captchaSection, captchaImage, submitButton, error } = modalRefs[app];
  captchaSection.classList.add('active');
  captchaImage.src = payload.image;
  submitButton.textContent = 'Enviar CAPTCHA';
  submitButton.disabled = false;
  error.textContent = '';
  const captchaInput = captchaSection.querySelector('input[name="captchaText"]') as HTMLInputElement;
  if (captchaInput) {
    captchaInput.focus();
  }
});

window.electronAPI.onLog((payload: LogPayload) => {
  appendLog(payload);
});

handleFormSubmit('mel1');
handleFormSubmit('mel2');
bindViewButtons();

toggleModal('mel1', true);
