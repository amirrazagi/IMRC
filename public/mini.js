(() => {
  'use strict';
  const telegram = window.Telegram && window.Telegram.WebApp;
  const initData = telegram && telegram.initData;
  const message = document.getElementById('message');
  const messageText = document.getElementById('message-text');
  const closeApp = document.getElementById('close-app');
  const buttons = [...document.querySelectorAll('.action')];
  let authenticated = false;
  function notify(text, canClose = false) {
    messageText.textContent = text;
    message.hidden = false;
    closeApp.hidden = !canClose;
  }
  function number(value) { return Number(value || 0).toLocaleString('fa-IR'); }
  function setBusy(busy) { buttons.forEach(button => { button.disabled = busy || !authenticated; }); }
  async function api(action) {
    const response = await fetch('/api/mini', {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, action }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'network');
    return data;
  }
  function errorMessage(error) {
    if (error.message === 'banned') return 'دسترسی این حساب مسدود است. برای پیگیری با پشتیبانی تماس بگیر.';
    if (error.message === 'auth') return 'ورود تلگرام معتبر نیست یا منقضی شده. مینی‌اپ را از ربات دوباره باز کن.';
    if (error.message === 'rate') return 'درخواست‌ها زیاد شده؛ کمی صبر کن و دوباره تلاش کن.';
    if (error.message === 'delivery') return 'پیام به چت ربات نرسید. مطمئن شو ربات را مسدود نکرده‌ای و دوباره تلاش کن.';
    return 'ارتباط برقرار نشد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.';
  }
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item === button);
        if (item === button) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
      });
      document.querySelectorAll('.screen').forEach(screen => {
        const selected = screen.id === button.dataset.tab;
        screen.hidden = !selected;
        screen.classList.toggle('active', selected);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  closeApp.addEventListener('click', () => { if (telegram) telegram.close(); });
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (!authenticated) return;
    setBusy(true);
    try {
      await api(button.dataset.action);
      notify('آماده‌ست! ادامه این بخش در چت ربات برایت ارسال شد.', true);
      if (telegram && telegram.HapticFeedback) telegram.HapticFeedback.notificationOccurred('success');
    } catch (error) { notify(errorMessage(error)); }
    finally { setBusy(false); }
  }));
  if (telegram) { telegram.ready(); telegram.expand(); }
  setBusy(false);
  if (!initData) {
    notify('برای استفاده، مینی‌اپ را از دکمه «مینی‌اپ IMRC» داخل ربات تلگرام باز کن.');
    return;
  }
  api('summary').then(data => {
    document.getElementById('profile-name').textContent = data.name;
    document.getElementById('profile-user').textContent = data.username ? '@' + data.username : 'حساب تلگرام';
    document.getElementById('balance').textContent = number(data.balance);
    document.getElementById('subscription').textContent = data.sub ? 'فعال ✦' : 'غیرفعال';
    document.getElementById('subscription-date').textContent = data.sub_until ? 'تا ' + new Date(data.sub_until).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }) : 'اشتراک فعال نداری';
    document.getElementById('quota').textContent = number(data.remaining) + ' / ' + number(data.limit);
    document.getElementById('home-title').textContent = 'سلام ' + data.name + ' ✳';
    authenticated = true;
    setBusy(false);
  }).catch(error => notify(errorMessage(error)));
})();
