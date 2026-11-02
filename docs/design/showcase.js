// Local documentation interactions. No API, account data or backend integration.
(() => {
  'use strict';
  const root = document.documentElement;
  document.addEventListener('pointerdown', () => { root.dataset.tabPointer = 'true'; }, true);
  document.addEventListener('keydown', () => { delete root.dataset.tabPointer; }, true);
  const byId = id => document.getElementById(id);
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const reduceToggle = byId('reduce-motion');
  const reduced = () => motionPreference.matches || reduceToggle.checked;
  const css = name => getComputedStyle(root).getPropertyValue(name).trim();
  const duration = name => parseFloat(css(name)) || 0;
  const activeAnimations = new Map();

  // Native min/max validate a number but do not constrain typed or pasted input.
  document.querySelectorAll('input[type="number"][min][max]').forEach(input => {
    const constrain = () => {
      if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
      const value = input.valueAsNumber;
      const bounded = Math.min(Number(input.max), Math.max(Number(input.min), value));
      if (bounded !== value) input.value = String(bounded);
    };
    // Registered before local form listeners so calculations see the bounded value.
    input.addEventListener('input', constrain);
    input.addEventListener('change', constrain);
  });

  function reveal(element, token = '--dur-base', transform = 'translateY(8px)') {
    activeAnimations.get(element)?.cancel();
    if (!element.animate) return;
    const frames = reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform }, { opacity: 1, transform: 'none' }];
    const animation = element.animate(frames, { duration: reduced() ? 100 : duration(token), easing: css('--ease-out') });
    activeAnimations.set(element, animation);
    animation.finished.then(() => {
      if (activeAnimations.get(element) === animation) activeAnimations.delete(element);
    }).catch(() => {});
  }

  const themeButtons = [...document.querySelectorAll('[data-theme-option]')];
  function updateThemeButtons() {
    const selected = root.dataset.theme || 'system';
    themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeOption === selected)));
  }
  themeButtons.forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.themeOption;
    if (value === 'system') delete root.dataset.theme;
    else root.dataset.theme = value;
    try { localStorage.setItem('yeti-design-theme', value); } catch (_) {}
    updateThemeButtons();
  }));
  updateThemeButtons();

  // Phone frame is documentation only; local links never create product routes.
  const phoneFrame = byId('phone-frame');
  const phoneScroll = byId('phone-scroll');
  const phonePanels = [...phoneFrame.querySelectorAll('.phone-panel')];
  const phonePositions = new Map();
  let phoneSection = 'overview';
  function showPhoneSection(name, focus = true) {
    if (!phonePanels.some(panel => panel.id === 'phone-' + name)) return;
    phonePositions.set(phoneSection, phoneScroll.scrollTop);
    phoneSection = name;
    phonePanels.forEach(panel => {
      const active = panel.id === 'phone-' + name;
      panel.dataset.active = String(active);
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      if (active && focus) panel.querySelector('h3').focus({ preventScroll: true });
    });
    phoneFrame.querySelectorAll('.phone-bottom-nav a').forEach(link => {
      if (link.dataset.phoneGo === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    phoneScroll.scrollTop = phonePositions.get(name) || 0;
  }
  phoneFrame.addEventListener('click', event => {
    const link = event.target.closest('[data-phone-go]');
    if (!link) return;
    event.preventDefault();
    showPhoneSection(link.dataset.phoneGo);
  });
  byId('phone-width').addEventListener('change', event => {
    phoneFrame.style.setProperty('--phone-width', event.target.value + 'px');
    byId('phone-size-note').textContent = event.target.value + ' CSS px. Если места меньше, образец сужается без масштабирования текста.';
  });
  function updatePhoneOrders() {
    const state = byId('phone-state').value;
    for (const name of ['sample', 'empty', 'error']) byId('phone-order-' + name).hidden = name !== state;
  }
  byId('phone-state').addEventListener('change', () => {
    updatePhoneOrders();
    phonePositions.set('orders', 0);
    showPhoneSection('orders', false);
    phoneScroll.scrollTop = 0;
  });
  byId('phone-retry').addEventListener('click', () => {
    byId('phone-state').value = 'sample';
    updatePhoneOrders();
    byId('phone-orders-heading').focus({ preventScroll: true });
    phoneScroll.scrollTop = 0;
  });

  const navigation = byId('navigation');
  const menuToggle = document.querySelector('.menu-toggle');
  function closeNavigation(returnFocus = false) {
    navigation.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) menuToggle.focus();
  }
  menuToggle.addEventListener('click', () => {
    const open = !navigation.classList.contains('is-open');
    navigation.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      reveal(navigation, '--dur-short', 'translateY(-4px)');
      navigation.querySelector('a[aria-current], a')?.focus();
    }
  });
  navigation.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    closeNavigation();
    document.querySelector(link.getAttribute('href'))?.querySelector('h1, h2')?.setAttribute('tabindex', '-1');
    document.querySelector(link.getAttribute('href'))?.querySelector('h1, h2')?.focus({ preventScroll: true });
  });
  document.addEventListener('pointerdown', event => {
    if (!navigation.contains(event.target) && !menuToggle.contains(event.target)) closeNavigation();
  });
  const wideScreen = matchMedia('(min-width: 1024px)');
  wideScreen.addEventListener('change', () => closeNavigation());
  const observer = new IntersectionObserver(entries => {
    if (root.hasAttribute('data-account')) return;
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;
    for (const link of navigation.querySelectorAll('a')) {
      if (link.hash === '#' + visible[0].target.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-12% 0px -60% 0px' });
  document.querySelectorAll('main > section').forEach(section => observer.observe(section));

  const notice = byId('notification');
  let noticeTimer;
  let noticeReturnFocus;
  function closeNotice() {
    clearTimeout(noticeTimer);
    const restoreFocus = notice.contains(document.activeElement);
    notice.hidden = true;
    if (restoreFocus && noticeReturnFocus?.isConnected) noticeReturnFocus.focus();
  }
  function startNoticeTimer() {
    clearTimeout(noticeTimer);
    if (byId('copy-fallback').hidden) noticeTimer = setTimeout(closeNotice, 5000);
  }
  function notify(text, manualCopy) {
    clearTimeout(noticeTimer);
    if (!notice.contains(document.activeElement)) noticeReturnFocus = document.activeElement;
    byId('notification-text').textContent = text;
    byId('notification-symbol').style.visibility = manualCopy ? 'hidden' : 'visible';
    byId('copy-fallback').hidden = !manualCopy;
    notice.hidden = false;
    reveal(notice);
    if (manualCopy) {
      byId('copy-value').value = manualCopy;
      byId('copy-value').focus();
      byId('copy-value').select();
    } else startNoticeTimer();
  }
  byId('close-notification').addEventListener('click', closeNotice);
  notice.addEventListener('pointerenter', () => clearTimeout(noticeTimer));
  notice.addEventListener('pointerleave', startNoticeTimer);
  notice.addEventListener('focusin', () => clearTimeout(noticeTimer));
  notice.addEventListener('focusout', event => { if (!notice.contains(event.relatedTarget)) startNoticeTimer(); });
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(value);
        notify('Скопировано: ' + value);
      } catch (_) { notify('Браузер не разрешил копирование. Можно скопировать текст вручную.', value); }
    });
  });
  document.querySelectorAll('[data-feedback]').forEach(button => {
    button.addEventListener('click', () => notify(button.dataset.feedback || 'Пример: действие выполнено. Данные не отправлялись.'));
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(selected, focus = false) {
    const groupTabs = [...selected.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    groupTabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = byId(tab.getAttribute('aria-controls'));
      panel.dataset.active = String(active);
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      panel.tabIndex = active ? 0 : -1;
    });
    if (focus) selected.focus();
    // CSS crossfade is interruptible; selection and accessibility update immediately.
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => { selectTab(tab); syncAccountTab(tab); });
    tab.addEventListener('keydown', event => {
      const groupTabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')].filter(item => !item.hidden);
      const index = groupTabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % groupTabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + groupTabs.length) % groupTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = groupTabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); selectTab(groupTabs[next], true); syncAccountTab(groupTabs[next]);
    });
  });

  // Fictional account demonstration. No authentication, payment or network requests.
  const account = byId('account-control');
  const accountTrigger = byId('account-trigger');
  const accountMenu = byId('account-menu');
  const accountSection = byId('account');
  const accountLinks = [...accountMenu.querySelectorAll('a')];
  const accountItems = [...accountMenu.querySelectorAll('a, button')];
  function closeAccountMenu(focus = false) {
    accountMenu.hidden = true;
    accountTrigger.setAttribute('aria-expanded', 'false');
    if (focus) accountTrigger.focus();
  }
  function openAccountMenu() {
    closeNavigation();
    accountMenu.hidden = false;
    accountTrigger.setAttribute('aria-expanded', 'true');
    reveal(accountMenu, '--dur-short', 'translateY(4px)');
  }
  accountTrigger.addEventListener('click', () => accountMenu.hidden ? openAccountMenu() : closeAccountMenu());
  byId('account-sign-out').addEventListener('click', () => {
    closeAccountMenu(true);
    notify('Пример выхода из аккаунта. Реальной сессии нет; тестовые настройки сохранены до обновления страницы.');
  });
  accountTrigger.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault(); openAccountMenu();
    accountItems[event.key === 'ArrowDown' ? 0 : accountItems.length - 1].focus();
  });
  account.addEventListener('focusout', event => { if (!account.contains(event.relatedTarget)) closeAccountMenu(); });
  accountMenu.addEventListener('keydown', event => {
    const index = accountItems.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % accountItems.length;
    if (event.key === 'ArrowUp') next = (index - 1 + accountItems.length) % accountItems.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = accountItems.length - 1;
    if (next !== undefined) { event.preventDefault(); accountItems[next].focus(); }
  });
  document.addEventListener('pointerdown', event => { if (!account.contains(event.target)) closeAccountMenu(); });
  menuToggle.addEventListener('click', () => closeAccountMenu());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !accountMenu.hidden) { closeAccountMenu(true); event.preventDefault(); }
  });
  function placeAccount() {
    closeAccountMenu();
    (wideScreen.matches ? document.querySelector('.account-slot') : document.querySelector('.topbar')).append(account);
  }
  wideScreen.addEventListener('change', placeAccount);
  placeAccount();
  function syncAccountTab(tab) {
    if (!tab.closest('.account-tabs')) return;
    history.replaceState(null, '', '#account-' + (tab.id === 'tab-payment' ? 'payment' : 'settings'));
    markAccountLocation();
  }
  function markAccountLocation() {
    accountLinks.forEach(link => {
      if (link.hash === location.hash) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  function showAccountLocation(focus = false) {
    const wasActive = root.hasAttribute('data-account');
    const active = ['#account-payment', '#account-settings'].includes(location.hash);
    root.toggleAttribute('data-account', active);
    accountSection.hidden = !active;
    if (active) {
      selectTab(byId(location.hash === '#account-settings' ? 'tab-settings' : 'tab-payment'));
      document.title = 'Мой аккаунт · Дизайн-система · YETI STREAM';
      navigation.querySelectorAll('[aria-current]').forEach(link => link.removeAttribute('aria-current'));
      if (focus) byId('account-heading').focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } else {
      document.title = 'Дизайн-система · YETI STREAM';
      if (wasActive) {
        const section = byId(location.hash.slice(1));
        const heading = section?.querySelector('h1, h2');
        section?.scrollIntoView();
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
    }
    markAccountLocation();
  }
  byId('account-heading').tabIndex = -1;
  accountLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    history.pushState(null, '', link.hash);
    closeAccountMenu(); closeNotice(); showAccountLocation(true);
  }));
  addEventListener('hashchange', () => showAccountLocation());
  addEventListener('popstate', () => showAccountLocation());
  showAccountLocation();

  const amount = byId('payment-amount');
  const rubles = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
  function updatePayment(showError = false) {
    const valid = amount.value !== '' && amount.validity.valid;
    byId('payment-credit').textContent = valid ? rubles(amount.valueAsNumber) : '—';
    byId('payment-total').textContent = valid ? rubles(amount.valueAsNumber) : '—';
    byId('payment-result-text').textContent = '';
    byId('payment-result').hidden = true;
    if (showError || amount.hasAttribute('aria-invalid')) {
      amount.setAttribute('aria-invalid', String(!valid));
      byId('payment-error').hidden = valid;
      byId('payment-error').textContent = valid ? '' : 'Введите целое число от 100 до 50 000 ₽.';
    }
    return valid;
  }
  amount.addEventListener('input', () => updatePayment());
  amount.addEventListener('blur', () => updatePayment(true));
  document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => {
    amount.value = button.dataset.amount; updatePayment(true);
  }));
  byId('payment-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!updatePayment(true)) { amount.focus(); return; }
    byId('payment-result').hidden = false;
    byId('payment-result-text').textContent = 'Пример расчёта готов: ' + rubles(amount.valueAsNumber) + '. Деньги не списаны, тестовый баланс не изменился.';
  });

  const settingsForm = byId('account-settings-form');
  const accountName = byId('account-name');
  const settingsControls = [accountName, byId('account-timezone'), byId('account-order-notices'), byId('account-payment-notices')];
  let savedSettings = settingsControls.map(control => control.type === 'checkbox' ? control.checked : control.value);
  function validateAccountName() {
    const valid = accountName.value.trim().length > 0 && accountName.value.length <= 60;
    accountName.setAttribute('aria-invalid', String(!valid));
    byId('account-name-error').hidden = valid;
    return valid;
  }
  accountName.addEventListener('blur', validateAccountName);
  accountName.addEventListener('input', () => { if (accountName.hasAttribute('aria-invalid')) validateAccountName(); });
  settingsForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!validateAccountName()) { accountName.focus(); return; }
    accountName.value = accountName.value.trim();
    savedSettings = settingsControls.map(control => control.type === 'checkbox' ? control.checked : control.value);
    document.querySelectorAll('[data-account-name]').forEach(label => { label.textContent = accountName.value; });
    byId('account-trigger').setAttribute('aria-label', 'Аккаунт ' + accountName.value + ': открыть меню');
    document.querySelector('.account-avatar').textContent = accountName.value.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    notify('Пример настроек сохранён до обновления страницы. Данные не отправлялись.');
  });
  byId('account-cancel').addEventListener('click', () => {
    settingsControls.forEach((control, index) => {
      if (control.type === 'checkbox') control.checked = savedSettings[index];
      else control.value = savedSettings[index];
    });
    accountName.removeAttribute('aria-invalid'); byId('account-name-error').hidden = true;
    notify('Изменения отменены. Восстановлены последние настройки примера.');
  });

  let openHelp = null;
  let hoverTimer;
  let leaveTimer;
  let pointerFocus = false;
  function closeHelp() {
    clearTimeout(hoverTimer); clearTimeout(leaveTimer);
    if (!openHelp) return;
    const { tooltip } = openHelp;
    activeAnimations.get(tooltip)?.cancel();
    if (tooltip.matches(':popover-open')) tooltip.hidePopover();
    openHelp = null;
  }
  function positionHelp() {
    if (!openHelp) return;
    const { button, tooltip } = openHelp;
    const rect = button.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = Math.max(16, Math.min(rect.left, innerWidth - width - 16)) + 'px';
    const below = rect.bottom + 8;
    tooltip.style.top = Math.max(16, below + height <= innerHeight - 16 ? below : rect.top - height - 8) + 'px';
  }
  function showHelp(button, pinned = false) {
    clearTimeout(hoverTimer); clearTimeout(leaveTimer);
    if (openHelp?.button === button) { openHelp.pinned ||= pinned; return; }
    closeHelp();
    const tooltip = byId(button.dataset.help);
    openHelp = { button, tooltip, pinned };
    tooltip.showPopover(); positionHelp(); reveal(tooltip, '--dur-fast', 'none');
  }
  function deferCloseHelp() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (!openHelp || openHelp.pinned) return;
      if (openHelp.button.matches(':hover') || openHelp.tooltip.matches(':hover') || document.activeElement === openHelp.button) return;
      closeHelp();
    }, 80);
  }
  document.querySelectorAll('[data-help]').forEach(button => {
    const tooltip = byId(button.dataset.help);
    button.addEventListener('pointerdown', () => { pointerFocus = true; });
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      clearTimeout(leaveTimer); clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showHelp(button), reduced() ? 0 : duration('--delay-help-hover'));
    });
    button.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); deferCloseHelp(); });
    button.addEventListener('focus', () => { if (!pointerFocus) showHelp(button); });
    button.addEventListener('blur', event => {
      pointerFocus = false;
      if (openHelp?.button === button && !tooltip.contains(event.relatedTarget)) closeHelp();
    });
    button.addEventListener('click', () => {
      pointerFocus = false;
      if (openHelp?.button === button && openHelp.pinned) closeHelp();
      else showHelp(button, true);
    });
    tooltip.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
    tooltip.addEventListener('pointerleave', deferCloseHelp);
  });
  document.addEventListener('pointerdown', event => {
    if (openHelp && !openHelp.button.contains(event.target) && !openHelp.tooltip.contains(event.target)) closeHelp();
  });
  addEventListener('resize', positionHelp);
  document.addEventListener('scroll', closeHelp, { passive: true, capture: true });

  const dialog = byId('example-dialog');
  document.querySelectorAll('[data-open-dialog]').forEach(button => button.addEventListener('click', () => {
    closeHelp(); closeNotice(); dialog.showModal(); reveal(dialog, '--dur-panel', 'scale(.98)');
  }));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => activeAnimations.get(dialog)?.cancel());
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (openHelp) { closeHelp(); event.preventDefault(); }
    if (navigation.classList.contains('is-open')) { closeNavigation(true); event.preventDefault(); }
    if (!notice.hidden && !dialog.open) closeNotice();
  });

  const form = byId('demo-form');
  const channel = byId('channel');
  let touched = false;
  let saveTimer;
  let operation = 0;
  function validateChannel() {
    let valid = false;
    try { const url = new URL(channel.value); valid = ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname); } catch (_) {}
    channel.setAttribute('aria-invalid', String(!valid));
    byId('channel-error').hidden = valid;
    byId('channel-error').textContent = valid ? '' : 'Укажите полную ссылку, начинающуюся с https:// или http://.';
    return valid;
  }
  channel.addEventListener('blur', () => { touched = true; validateChannel(); });
  channel.addEventListener('input', () => { if (touched) validateChannel(); });
  form.addEventListener('input', () => { byId('form-result').textContent = ''; });
  const formSnapshot = () => JSON.stringify([channel.value, byId('demo-name').value, byId('notify').checked]);
  function resetPending() {
    clearTimeout(saveTimer); operation++;
    byId('save-demo').disabled = false;
    byId('save-demo').textContent = 'Сохранить';
    form.removeAttribute('aria-busy');
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); touched = true;
    if (!validateChannel()) { channel.focus(); return; }
    resetPending();
    const currentOperation = operation;
    const savedValue = formSnapshot();
    byId('save-demo').disabled = true;
    byId('save-demo').textContent = 'Сохраняем…';
    form.setAttribute('aria-busy', 'true');
    byId('form-result').textContent = '';
    saveTimer = setTimeout(() => {
      if (operation !== currentOperation) return;
      resetPending();
      if (formSnapshot() === savedValue) notify('Готово. Пример сохранения завершён локально.');
      else byId('form-result').textContent = 'Пример завершён. Настройки изменены после нажатия; сохраните их снова.';
    }, 650);
  });
  form.addEventListener('reset', () => {
    resetPending(); touched = false;
    channel.removeAttribute('aria-invalid'); byId('channel-error').hidden = true; byId('form-result').textContent = '';
  });

  // Independent field gallery: native controls, local validation, no persistence.
  const fieldsForm = byId('fields-form');
  const fieldsSummary = byId('fields-errors');
  const note = byId('fields-note');
  const order = byId('fields-order');
  const quantity = byId('fields-duration');
  const radios = [...fieldsForm.querySelectorAll('[name="layout"]')];
  const visitedFields = new Set();
  let fieldsSubmitted = false;
  let fieldsErrorSignature = '';
  const fieldRules = [
    { id: 'fields-layout', controls: radios, message: () => radios.some(radio => radio.checked) ? '' : 'Выберите представление примера.' },
    { id: order.id, controls: [order], message: () => order.value ? '' : 'Выберите порядок записей.' },
    { id: note.id, controls: [note], message: () => note.value.length <= 240 ? '' : 'Сократите комментарий до 240 символов.' },
    { id: quantity.id, controls: [quantity], message: () => {
      if (quantity.validity.badInput) return 'Введите целое число минут от 1 до 60.';
      if (quantity.value === '') return 'Укажите длительность примера в минутах.';
      const value = quantity.valueAsNumber;
      return Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 60 ? '' : 'Введите целое число минут от 1 до 60.';
    } }
  ];
  function validateField(rule) {
    const message = rule.message();
    const error = byId(rule.id + '-error');
    error.textContent = message;
    error.hidden = !message;
    rule.controls.forEach(control => control.setAttribute('aria-invalid', String(Boolean(message))));
    return message;
  }
  function updateFieldsSummary() {
    const list = fieldsSummary.querySelector('ul');
    const invalid = fieldRules.filter(rule => rule.message());
    const signature = fieldsSubmitted ? JSON.stringify(invalid.map(rule => [rule.id, rule.message()])) : '';
    // Preserve focused links when blur/input has not changed the errors.
    if (signature === fieldsErrorSignature) return invalid;
    fieldsErrorSignature = signature;
    list.replaceChildren();
    if (fieldsSubmitted && invalid.length) {
      invalid.forEach(rule => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#' + rule.id;
        link.textContent = rule.message();
        link.addEventListener('click', event => { event.preventDefault(); byId(rule.id).focus(); });
        item.append(link); list.append(item);
      });
      fieldsSummary.hidden = false;
    } else fieldsSummary.hidden = true;
    return invalid;
  }
  function updateFieldDetails() {
    byId('fields-note-count').textContent = `${note.value.length} из 240 символов`;
    byId('fields-order-value').hidden = !order.value;
    byId('fields-order-value').textContent = order.value ? 'Выбрано: ' + order.selectedOptions[0].textContent : '';
  }
  fieldRules.forEach(rule => rule.controls.forEach(control => {
    control.addEventListener('blur', event => {
      if (radios.includes(control) && radios.includes(event.relatedTarget)) return;
      visitedFields.add(rule.id); validateField(rule); updateFieldsSummary();
    });
    const onEdit = () => {
      updateFieldDetails();
      if (visitedFields.has(rule.id) || fieldsSubmitted) validateField(rule);
      updateFieldsSummary();
    };
    control.addEventListener('input', onEdit);
    control.addEventListener('change', onEdit);
  }));
  fieldsForm.addEventListener('submit', event => {
    event.preventDefault(); fieldsSubmitted = true;
    fieldRules.forEach(rule => { visitedFields.add(rule.id); validateField(rule); });
    const invalid = updateFieldsSummary();
    if (invalid.length > 1) fieldsSummary.focus();
    else if (invalid.length) byId(invalid[0].id).focus();
    else notify('Поля заполнены верно. Проверено локально, данные не отправлялись.');
  });
  fieldsForm.addEventListener('reset', () => {
    fieldsSubmitted = false; fieldsErrorSignature = ''; visitedFields.clear(); fieldsSummary.hidden = true;
    fieldsSummary.querySelector('ul').replaceChildren();
    fieldRules.forEach(rule => {
      rule.controls.forEach(control => control.removeAttribute('aria-invalid'));
      byId(rule.id + '-error').hidden = true;
      byId(rule.id + '-error').textContent = '';
    });
    // Native reset applies default values after this event.
    setTimeout(updateFieldDetails, 0);
    closeNotice();
  });
  updateFieldDetails();

  const motionDuration = byId('motion-duration');
  function describeMotion() {
    root.dataset.reduced = String(reduced());
    byId('motion-description').textContent = reduced() ? 'Уменьшенное движение: только появление, 100 мс.' : `Появление: ${motionDuration.value} мс, смещение 8 px.`;
    for (const animation of activeAnimations.values()) animation.cancel();
    activeAnimations.clear();
  }
  reduceToggle.addEventListener('change', describeMotion);
  motionPreference.addEventListener('change', describeMotion);
  motionDuration.addEventListener('change', describeMotion);
  byId('play-motion').addEventListener('click', () => {
    const element = byId('motion-object');
    activeAnimations.get(element)?.cancel();
    const time = reduced() ? 100 : Math.min(duration('--dur-max'), Number(motionDuration.value));
    const frames = reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];
    const animation = element.animate(frames, { duration: time, easing: css('--ease-out') });
    activeAnimations.set(element, animation);
    animation.finished.then(() => { if (activeAnimations.get(element) === animation) activeAnimations.delete(element); }).catch(() => {});
  });
  describeMotion();

  // Authentication is a local state demonstration. Never send or persist credentials.
  const auth = byId('auth');
  const authForms = [...auth.querySelectorAll('[data-auth-form]')];
  const scenario = byId('auth-scenario');
  const demoProviderAccounts = new Set();
  let authTimer;
  let authPending;
  function authMessage(text, kind = 'neutral') {
    byId('auth-result-text').textContent = text;
    byId('auth-result').dataset.kind = kind;
    byId('auth-result').querySelector('use').setAttribute('href', kind === 'success' ? '#icon-check-circle' : '#icon-warning-circle');
    byId('auth-result').hidden = false;
  }
  function cancelAuth() {
    clearTimeout(authTimer);
    if (authPending) {
      authPending.labelElement.textContent = authPending.label;
      authPending.button.disabled = false;
      authPending.form?.removeAttribute('aria-busy');
    }
    authPending = null;
    byId('auth-cancel').hidden = true;
    auth.querySelectorAll('[data-auth-provider]').forEach(button => { button.disabled = false; });
  }
  function clearAuthFeedback() {
    cancelAuth();
    byId('auth-result').hidden = true;
    byId('auth-open-letter').hidden = true;
    byId('auth-confirm-email').hidden = true;
  }
  function authWait(button, form, finish) {
    closeHelp();
    cancelAuth();
    const outcome = scenario.value;
    const labelElement = button.querySelector('.auth-provider-label') || button;
    authPending = { button, labelElement, label: labelElement.textContent, form };
    labelElement.textContent = 'Проверяем…';
    button.disabled = true;
    form?.setAttribute('aria-busy', 'true');
    auth.querySelectorAll('[data-auth-provider]').forEach(item => { item.disabled = true; });
    byId('auth-cancel').hidden = false;
    authMessage('Демонстрация: ожидаем ответ…');
    authTimer = setTimeout(() => {
      cancelAuth();
      if (outcome === 'offline') {
        authMessage('Пример ошибки соединения. Данные остались в форме. Выберите успешный результат и повторите.', 'error');
        return;
      }
      finish(outcome);
    }, 650);
  }
  function validateAuthField(input) {
    let error = '';
    if (input.id === 'auth-register-name' && !input.value.trim()) error = 'Введите имя.';
    else if (!input.value) error = input.tagName === 'SELECT' ? 'Выберите часовой пояс.' : input.type === 'email' ? 'Укажите электронную почту.' : 'Введите пароль.';
    else if (['auth-register-confirm', 'auth-reset-confirm'].includes(input.id) && input.value !== byId(input.id.replace('-confirm', '-password')).value) error = 'Пароли не совпадают. Повторите пароль ещё раз.';
    else if (input.type === 'email' && input.validity.typeMismatch) error = 'Укажите адрес в формате name@example.com.';
    else if (input.autocomplete === 'new-password' && [...input.value].length < 15) error = 'В примере нужно не менее 15 символов. Можно использовать фразу с пробелами.';
    const message = byId(input.id + '-error');
    message.textContent = error;
    message.hidden = !error;
    input.setAttribute('aria-invalid', String(Boolean(error)));
    return error;
  }
  function updateAuthSummary(form, focus = false) {
    const invalid = [...form.querySelectorAll('input[aria-invalid="true"], select[aria-invalid="true"]')];
    const summary = form.querySelector('.error-summary');
    const signature = JSON.stringify(invalid.map(input => [input.id, byId(input.id + '-error').textContent]));
    const changed = summary.dataset.signature !== signature;
    summary.dataset.signature = signature;
    if (changed) summary.replaceChildren();
    summary.hidden = invalid.length < 2;
    if (invalid.length > 1 && changed) {
      const title = document.createElement('strong');
      title.textContent = 'Проверьте поля';
      const list = document.createElement('ul');
      invalid.forEach(input => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#' + input.id;
        link.textContent = byId(input.id + '-error').textContent;
        link.addEventListener('click', event => { event.preventDefault(); input.focus(); });
        item.append(link); list.append(item);
      });
      summary.append(title, list);
    }
    if (focus) (invalid.length > 1 ? summary : invalid[0])?.focus();
    return invalid.length === 0;
  }
  function showAuthTab(name) {
    clearAuthFeedback();
    const recovery = name === 'recover';
    byId('tab-auth-login').hidden = recovery;
    byId('tab-auth-register').hidden = recovery;
    byId('tab-auth-recover').hidden = !recovery;
    selectTab(byId('tab-auth-' + name), true);
  }
  function resetRecovery() {
    byId('auth-recovery-request').hidden = false;
    byId('auth-recovery-reset').hidden = true;
  }
  authForms.forEach(form => {
    form.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('blur', () => { validateAuthField(input); updateAuthSummary(form); });
      input.addEventListener('input', () => {
        clearAuthFeedback();
        if (['auth-register-password', 'auth-reset-password'].includes(input.id)) {
          const confirmation = byId(input.id.replace('-password', '-confirm'));
          if (confirmation.hasAttribute('aria-invalid')) validateAuthField(confirmation);
        }
        if (input.hasAttribute('aria-invalid')) validateAuthField(input);
        updateAuthSummary(form);
      });
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (authPending) return;
      clearAuthFeedback();
      form.querySelectorAll('input, select[required]').forEach(validateAuthField);
      if (!updateAuthSummary(form, true)) return;
      const mode = form.dataset.authForm;
      authWait(form.querySelector('[type="submit"]'), form, outcome => {
        if (mode === 'reset' && outcome === 'expired') {
          authMessage('Ссылка недействительна или уже использована. Вернитесь к запросу новой ссылки. Это пример.', 'error');
          resetRecovery(); byId('auth-recover-email').focus(); return;
        }
        if (outcome === 'error') {
          authMessage(mode === 'login' ? 'Не удалось войти. Проверьте почту и пароль или восстановите доступ. Это пример отказа.' : 'Не удалось завершить действие. Выберите успешный результат и повторите. Это пример отказа.', 'error');
          return;
        }
        if (mode === 'recover') {
          authMessage('Пример ответа: если для этого адреса доступно восстановление, придёт письмо со ссылкой. Проверьте входящие и спам. В витрине письмо не отправляется.');
          byId('auth-open-letter').hidden = false;
        } else if (mode === 'register') {
          authMessage('Пример ответа: проверьте почту для продолжения регистрации. Если аккаунт уже есть, попробуйте войти или восстановить пароль. Письмо не отправлено.');
          byId('auth-confirm-email').hidden = false;
        } else {
          const text = mode === 'login' ? 'Демонстрация: вход завершён. Реальная сессия не создана.' : 'Демонстрация: пароль изменён. Реальные данные не менялись; теперь можно вернуться ко входу.';
          form.querySelectorAll('input[autocomplete$="password"]').forEach(input => { input.value = ''; });
          authMessage(text, 'success');
          notify(text);
        }
      });
    });
  });
  auth.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = byId(button.dataset.passwordToggle);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.querySelector('use').setAttribute('href', visible ? '#icon-eye-slash' : '#icon-eye');
    button.setAttribute('aria-label', (visible ? 'Скрыть ' : 'Показать ') + (input.id.endsWith('-confirm') ? 'повтор пароля' : 'пароль'));
    button.setAttribute('aria-pressed', String(visible));
  }));
  auth.querySelectorAll('[data-auth-provider]').forEach(button => button.addEventListener('click', () => {
    if (authPending) return;
    clearAuthFeedback();
    authWait(button, null, outcome => {
      if (outcome === 'cancel') authMessage('Пример: вход через ' + button.dataset.authProvider + ' отменён. Попробуйте снова или выберите другой способ.');
      else if (outcome === 'error') authMessage('Пример: не удалось войти через ' + button.dataset.authProvider + '. Попробуйте снова или выберите другой способ.', 'error');
      else {
        const firstLogin = !demoProviderAccounts.has(button.dataset.authProvider);
        demoProviderAccounts.add(button.dataset.authProvider);
        const text = firstLogin
          ? 'Демонстрация: при первом входе через ' + button.dataset.authProvider + ' аккаунт создан автоматически. Реальный аккаунт и сессия не создавались.'
          : 'Демонстрация: повторный вход через ' + button.dataset.authProvider + ' в существующий аккаунт. Реальная сессия не создавалась.';
        authMessage(text, 'success'); notify(text);
      }
    });
  }));
  auth.querySelectorAll('[role="tab"]').forEach(tab => {
    tab.addEventListener('click', clearAuthFeedback);
    tab.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) clearAuthFeedback(); });
  });
  auth.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => {
    resetRecovery(); showAuthTab(button.dataset.authTab);
  }));
  scenario.addEventListener('change', clearAuthFeedback);
  byId('auth-cancel').addEventListener('click', () => { const button = authPending?.button; cancelAuth(); button?.focus(); authMessage('Демонстрационное ожидание отменено. Можно повторить действие.'); });
  byId('auth-open-letter').addEventListener('click', () => {
    clearAuthFeedback();
    if (scenario.value === 'expired') { byId('auth-recover-email').focus(); authMessage('Ссылка недействительна или уже использована. Запросите новую через «Отправить ссылку». Это пример.', 'error'); return; }
    byId('auth-recovery-request').hidden = true;
    byId('auth-recovery-reset').hidden = false;
    byId('auth-reset-heading').focus();
  });
  byId('auth-confirm-email').addEventListener('click', () => {
    clearAuthFeedback();
    byId('auth-register-form').querySelector('[type="submit"]').focus();
    if (scenario.value === 'expired') { authMessage('Ссылка подтверждения недействительна или уже использована. Повторите запрос регистрации. Это пример.', 'error'); return; }
    byId('auth-register-password').value = ''; byId('auth-register-confirm').value = '';
    const text = 'Демонстрация: адрес подтверждён. Реальный аккаунт не создан.';
    authMessage(text, 'success'); notify(text);
  });
  byId('auth-recovery-back').addEventListener('click', () => { resetRecovery(); showAuthTab('login'); });
  byId('auth-clear').addEventListener('click', () => {
    clearAuthFeedback(); resetRecovery(); demoProviderAccounts.clear();
    authForms.forEach(form => {
      form.reset(); form.querySelector('.error-summary').hidden = true;
      form.querySelectorAll('input, select').forEach(input => { input.removeAttribute('aria-invalid'); byId(input.id + '-error').hidden = true; });
    });
    auth.querySelectorAll('[data-password-toggle]').forEach(button => {
      byId(button.dataset.passwordToggle).type = 'password'; button.querySelector('use').setAttribute('href', '#icon-eye'); button.setAttribute('aria-label', button.dataset.passwordToggle.endsWith('-confirm') ? 'Показать повтор пароля' : 'Показать пароль'); button.setAttribute('aria-pressed', 'false');
    });
    auth.querySelectorAll('[data-auth-service]').forEach(control => { control.checked = true; authProviderAvailability[control.dataset.authService] = true; }); updateAuthProviders();
    byId('auth-timezone-unavailable').checked = false; updateAuthTimezone();
    scenario.value = 'ok'; showAuthTab('login');
  });
  // Public availability flags only. Production derives these from server configuration.
  const authProviderAvailability = { google: true, yandex: true, telegram: true, kick: true };
  const providerKeys = { 'Google': 'google', 'Яндекс ID': 'yandex', 'Telegram': 'telegram', 'Kick': 'kick' };
  function updateAuthProviders() {
    clearAuthFeedback(); closeHelp();
    auth.querySelectorAll('.auth-providers').forEach(group => {
      const buttons = [...group.querySelectorAll('[data-auth-provider]')];
      buttons.forEach(button => { button.hidden = authProviderAvailability[providerKeys[button.dataset.authProvider]] !== true; });
      const count = buttons.filter(button => !button.hidden).length;
      group.hidden = count === 0;
      group.style.setProperty('--auth-provider-columns', String(Math.min(4, Math.max(1, count))));
      group.nextElementSibling.hidden = count === 0;
    });
  }
  auth.querySelectorAll('[data-auth-service]').forEach(control => {
    control.checked = authProviderAvailability[control.dataset.authService] === true;
    control.addEventListener('change', () => { authProviderAvailability[control.dataset.authService] = control.checked; updateAuthProviders(); });
  });
  updateAuthProviders();
  const timezoneSelect = byId('auth-register-timezone');
  const timezoneDate = new Date();
  const timezoneCities = {
    UTC: 'Всемирное время', 'Europe/Moscow': 'Москва', 'Europe/Minsk': 'Минск',
    'Europe/Kiev': 'Киев', 'Europe/Kyiv': 'Киев', 'Europe/London': 'Лондон',
    'Europe/Berlin': 'Берлин', 'Europe/Paris': 'Париж', 'Europe/Istanbul': 'Стамбул',
    'Asia/Yekaterinburg': 'Екатеринбург', 'Asia/Novosibirsk': 'Новосибирск',
    'Asia/Krasnoyarsk': 'Красноярск', 'Asia/Irkutsk': 'Иркутск',
    'Asia/Yakutsk': 'Якутск', 'Asia/Vladivostok': 'Владивосток',
    'Asia/Kamchatka': 'Петропавловск-Камчатский', 'Europe/Kaliningrad': 'Калининград',
    'Europe/Samara': 'Самара', 'Asia/Almaty': 'Алматы', 'Asia/Tashkent': 'Ташкент',
    'Asia/Dubai': 'Дубай', 'Asia/Tbilisi': 'Тбилиси', 'Asia/Yerevan': 'Ереван',
    'Asia/Baku': 'Баку', 'Asia/Bishkek': 'Бишкек', 'Asia/Tokyo': 'Токио',
    'America/New_York': 'Нью-Йорк', 'America/Chicago': 'Чикаго',
    'America/Los_Angeles': 'Лос-Анджелес'
  };
  function timezoneLabel(zone) {
    try {
      const part = style => new Intl.DateTimeFormat('ru-RU', { timeZone: zone, timeZoneName: style })
        .formatToParts(timezoneDate).find(item => item.type === 'timeZoneName')?.value;
      const name = timezoneCities[zone] || part('longGeneric') || zone;
      const offset = (part('longOffset') || '').replace(/GMT|UTC/, 'UTC');
      return name + (offset ? ' · ' + offset : ' · смещение недоступно');
    } catch (_) {
      return (timezoneCities[zone] || zone) + ' · смещение недоступно';
    }
  }
  let detectedTimezone = '';
  try { detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}
  let timezones = ['UTC', 'Europe/Moscow', 'Europe/Minsk', 'Asia/Almaty', 'Asia/Tashkent', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];
  try { if (Intl.supportedValuesOf) timezones = ['UTC', ...Intl.supportedValuesOf('timeZone')]; } catch (_) {}
  if (detectedTimezone && !timezones.includes(detectedTimezone)) timezones.push(detectedTimezone);
  const timezoneOptions = [...new Set(timezones)].map(zone => ({ zone, label: timezoneLabel(zone) }));
  const labelCounts = new Map();
  timezoneOptions.forEach(({ label }) => labelCounts.set(label, (labelCounts.get(label) || 0) + 1));
  timezoneOptions.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  for (const { zone, label } of timezoneOptions) {
    const option = document.createElement('option');
    option.value = zone;
    option.textContent = label + (labelCounts.get(label) > 1 ? ' (' + zone + ')' : '');
    timezoneSelect.append(option);
  }
  function updateTimezoneSelection() {
    const selected = byId('auth-timezone-selected');
    selected.hidden = !timezoneSelect.value;
    selected.textContent = timezoneSelect.value ? 'Выбрано: ' + timezoneSelect.selectedOptions[0].textContent : '';
  }
  function updateAuthTimezone() {
    const manual = !detectedTimezone || byId('auth-timezone-unavailable').checked;
    byId('auth-timezone-field').hidden = !manual; timezoneSelect.required = manual;
    timezoneSelect.value = manual ? '' : detectedTimezone;
    timezoneSelect.removeAttribute('aria-invalid'); byId('auth-register-timezone-error').hidden = true;
    byId('auth-timezone-detected').textContent = manual ? 'Не удалось определить часовой пояс. Выберите его из списка.' : 'Часовой пояс: ' + timezoneLabel(detectedTimezone) + '. Определён автоматически.';
    updateTimezoneSelection();
  }
  timezoneSelect.addEventListener('change', updateTimezoneSelection);
  byId('auth-timezone-unavailable').addEventListener('change', () => { clearAuthFeedback(); updateAuthTimezone(); updateAuthSummary(byId('auth-register-form')); });
  updateAuthTimezone();
  addEventListener('hashchange', clearAuthFeedback);
  addEventListener('popstate', clearAuthFeedback);
  accountLinks.forEach(link => link.addEventListener('click', clearAuthFeedback));
})();
