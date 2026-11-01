// Local documentation interactions. No API, account data or backend integration.
(() => {
  'use strict';
  const root = document.documentElement;
  const byId = id => document.getElementById(id);
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const reduceToggle = byId('reduce-motion');
  const reduced = () => motionPreference.matches || reduceToggle.checked;
  const css = name => getComputedStyle(root).getPropertyValue(name).trim();
  const duration = name => parseFloat(css(name)) || 0;
  const activeAnimations = new Map();

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

  const theme = byId('theme');
  theme.value = root.dataset.theme || 'system';
  theme.addEventListener('change', () => {
    if (theme.value === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme.value;
    try { localStorage.setItem('yeti-design-theme', theme.value); } catch (_) {}
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
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      byId(tab.getAttribute('aria-controls')).hidden = !active;
    });
    if (focus) selected.focus();
    reveal(byId(selected.getAttribute('aria-controls')), '--dur-base', 'none');
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); selectTab(tabs[next], true);
    });
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
  document.querySelector('[data-open-dialog]').addEventListener('click', () => {
    closeHelp(); closeNotice(); dialog.showModal(); reveal(dialog, '--dur-panel', 'scale(.98)');
  });
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
      byId('form-result').textContent = formSnapshot() === savedValue ? 'Готово. Пример сохранения завершён локально.' : 'Пример завершён. Настройки изменены после нажатия; сохраните их снова.';
    }, 650);
  });
  form.addEventListener('reset', () => {
    resetPending(); touched = false;
    channel.removeAttribute('aria-invalid'); byId('channel-error').hidden = true; byId('form-result').textContent = '';
  });

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
    const time = reduced() ? 100 : Math.min(400, Number(motionDuration.value));
    const frames = reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];
    const animation = element.animate(frames, { duration: time, easing: css('--ease-out') });
    activeAnimations.set(element, animation);
    animation.finished.then(() => { if (activeAnimations.get(element) === animation) activeAnimations.delete(element); }).catch(() => {});
  });
  describeMotion();
})();
