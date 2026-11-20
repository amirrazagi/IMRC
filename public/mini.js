(() => {
  'use strict';
  const telegram = window.Telegram && window.Telegram.WebApp;
  const initData = telegram && telegram.initData;
  const $ = id => document.getElementById(id);
  const buttons = [...document.querySelectorAll('.action')];
  let authenticated = false, busy = false, configText = '', configName = 'IMRC.conf';
  function notify(text, canClose = false) { $('message-text').textContent = text; $('message').hidden = false; $('close-app').hidden = !canClose; }
  function number(value) { return Number(value || 0).toLocaleString('fa-IR'); }
  function date(value) { return value ? new Date(value).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }) : '—'; }
  function setBusy(value) { busy = value; buttons.forEach(b => { b.disabled = value || !authenticated; }); }
  async function request(action, data = {}, binary = false) {
    const response = await fetch('/api/mini', { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, action, ...data }) });
    if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.message || err.error || 'network'); }
    return binary ? response.blob() : response.json();
  }
  function errorMessage(error) {
    const messages = { banned: 'دسترسی این حساب مسدود است. برای پیگیری با پشتیبانی تماس بگیر.', auth: 'ورود تلگرام معتبر نیست یا منقضی شده. مینی‌اپ را از ربات دوباره باز کن.', rate: 'درخواست‌ها زیاد شده؛ کمی صبر کن و دوباره تلاش کن.', delivery: 'پیام به چت ربات نرسید. مطمئن شو ربات را مسدود نکرده‌ای.', not_available: 'این فایل برای دانلود در دسترس نیست؛ ارسال مجدد به ربات را امتحان کن.', network: 'ارتباط برقرار نشد. اتصال اینترنت را بررسی کن.' };
    return messages[error.message] || error.message || messages.network;
  }
  function element(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
  function empty(container, text) { container.replaceChildren(element('div', text, 'empty-state')); }
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(screen => { const active = screen.id === id; screen.hidden = !active; screen.classList.toggle('active', active); });
    document.querySelectorAll('.nav-item').forEach(item => { const active = item.dataset.tab === id || (['orders','history','locations','troubleshoot','compare','notices','reminder'].includes(id) && item.dataset.tab === 'account') || (['support','generator'].includes(id) && item.dataset.tab === 'home'); item.classList.toggle('active', active); if (active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current'); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (authenticated) {
      if (id === 'notices') loadNotices();
      if (id === 'reminder') loadReminder();
      if (id === 'locations') loadLocations();
      if (id === 'orders') loadOrders();
      if (id === 'history') loadHistory();
      if (id === 'support') loadTickets();
      if (id === 'generator') { loadOptions(); loadProfiles(); }
    }
  }
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.tab)));
  document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
  $('close-app').addEventListener('click', () => { if (telegram) telegram.close(); });
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (!authenticated || busy) return;
    setBusy(true);
    try { await request(button.dataset.action); notify('آماده‌ست! ادامه این بخش در چت ربات برایت ارسال شد.', true); if (telegram?.HapticFeedback) telegram.HapticFeedback.notificationOccurred('success'); }
    catch (error) { notify(errorMessage(error)); } finally { setBusy(false); }
  }));
  function download(blob, name) { const url = URL.createObjectURL(blob); const link = element('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  async function loadLocations() {
    const box = $('locations-content'); empty(box, 'در حال دریافت وضعیت...');
    try { const data = await request('locations'); box.replaceChildren(); if (!data.locations.length) return empty(box, 'هنوز وضعیتی توسط ادمین ثبت نشده است.');
      const labels = { ok: 'فعال', degraded: 'کند یا در حال بررسی', down: 'قطع' };
      data.locations.forEach(loc => { const card = element('article', null, 'detail-card'); card.append(element('h2', loc.name), element('span', labels[loc.level] || 'نامشخص', 'status-pill')); if (loc.note) card.append(element('p', loc.note)); card.append(element('p', 'ثبت دستی: ' + date(loc.updated))); box.append(card); });
    } catch (error) { empty(box, errorMessage(error)); }
  }
  async function loadNotices() { const box=$('notices-content'); empty(box,'در حال دریافت اعلان‌ها...'); try { const data=await request('notifications'); box.replaceChildren(); if (!data.notices.length) return empty(box,'هنوز اعلان جدیدی ثبت نشده است.'); data.notices.forEach(n => { const card=element('article',null,'detail-card'); card.append(element('p',n.text),element('p',date(n.ts))); box.append(card); }); } catch(e) { empty(box,errorMessage(e)); } }
  async function loadReminder() { try { const [data,prefs]=await Promise.all([request('reminder_get'),request('notification_preferences_get')]); $('reminder-days').value=data.days; $('notify-ticket').checked=prefs.ticket; $('notify-order').checked=prefs.orders; } catch(e) { notify(errorMessage(e)); } }
  $('reminder-form').addEventListener('submit', async e => { e.preventDefault(); if (!authenticated) return notify('مینی‌اپ را از تلگرام باز کن.'); const days=Number($('reminder-days').value); try { await request('notification_preferences_save',{ticket:$('notify-ticket').checked,orders:$('notify-order').checked}); await request('reminder_save',{days}); notify(days ? `یادآوری ${number(days)} روز پیش از انقضا تنظیم شد.` : 'یادآوری انقضا غیرفعال شد.'); } catch(err) { notify(errorMessage(err)); } });
  async function loadOrders() {
    const box = $('orders-content'); empty(box, 'در حال دریافت سفارش‌ها...');
    try {
      const data = await request('orders'); box.replaceChildren();
      if (!data.orders.length) return empty(box, 'هنوز سفارشی ثبت نشده است.');
      const statuses = { pending: 'در انتظار بررسی پرداخت', approved: 'پرداخت تأیید شده · آماده تحویل', delivered: 'تحویل داده شده', rejected: 'رسید رد شده', sending: 'در حال ثبت' };
      data.orders.forEach(order => {
        const card = element('article', null, 'detail-card');
        card.append(element('h2', `${order.product_name} · #${number(order.id)}`), element('span', statuses[order.status] || 'در حال بررسی', 'status-pill'));
        const detail = order.product === 'unlimited' ? `نامحدود · ${number(order.users)} کاربر` : `${number(order.volume)} گیگابایت`;
        card.append(element('p', `${detail} · ${number(order.days)} روز · ${number(order.amount)} تومان`), element('p', `تاریخ سفارش: ${date(order.created)}`));
        const timeline = element('div', null, 'line'); timeline.append(element('p', `🕓 ثبت سفارش: ${date(order.created)}`));
        if (order.decided) timeline.append(element('p', `${order.status === 'rejected' ? '❌ رسید رد شد' : '✅ پرداخت بررسی شد'}: ${date(order.decided)}`));
        else if (order.payment_method === 'wallet') timeline.append(element('p', `✅ پرداخت با کیف پول: ${date(order.created)}`));
        if (order.delivered_at) timeline.append(element('p', `📦 تحویل: ${date(order.delivered_at)}`));
        else if (order.status === 'delivered') timeline.append(element('p', '📦 تحویل شده · تاریخ ثبت نشده'));
        card.append(timeline);
        const invoice = element('button', 'دانلود صورت‌حساب متنی ↓'); invoice.type='button'; invoice.addEventListener('click', () => {
          const invoiceText = [`صورت‌حساب سفارش #${order.id}`, `سرویس: ${order.product_name}`, `جزئیات: ${detail}`, `مدت: ${order.days} روز`, `مبلغ: ${order.amount} تومان`, `روش پرداخت: ${order.payment_method === 'wallet' ? 'کیف پول' : 'رسید کارت‌به‌کارت (وضعیت تأیید در بخش وضعیت)' }`, `وضعیت: ${statuses[order.status] || 'در حال بررسی'}`, `تاریخ ثبت: ${date(order.created)}`, 'این صورت‌حساب صرفاً اطلاعات سفارش ثبت‌شده است.'].join('\n');
          download(new Blob([invoiceText], {type:'text/plain;charset=utf-8'}), `imrc-order-${order.id}.txt`);
        }); card.append(invoice);
        const imageButton = element('button', 'دانلود کارت عمومی سرویس ↓'); imageButton.type = 'button'; imageButton.addEventListener('click', () => {
          const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630; const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#10162a'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#8ce2c5'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'right'; ctx.fillText('IMRC | کارت عمومی سرویس', 1120, 110);
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 58px sans-serif'; ctx.fillText(order.product_name, 1120, 235); ctx.font = '42px sans-serif'; ctx.fillText(`${detail} · ${number(order.days)} روز`, 1120, 325); ctx.fillText(statuses[order.status] || 'در حال بررسی', 1120, 400);
          ctx.fillStyle = '#aab5ca'; ctx.font = '30px sans-serif'; ctx.fillText('بدون فایل، اطلاعات اتصال یا مشخصات حساب', 1120, 540);
          canvas.toBlob(blob => { if (blob) download(blob, `imrc-service-${order.id}.png`); else notify('ساخت تصویر ناموفق بود.'); }, 'image/png');
        }); card.append(imageButton);
        if (order.files.length) {
          const files = element('div', null, 'line'); files.append(element('p', 'فایل‌ها و پیام‌های تحویلی'));
          order.files.forEach(file => {
            files.append(element('p', file.file_name || (file.kind === 'text' ? 'پیام متنی' : 'فایل قدیمی · ارسال مجدد به ربات')));
            if (file.downloadable) { const b = element('button', 'دانلود فایل ↓'); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { const blob = await request('delivery_file', { order_id: order.id, message_id: file.source_message }, true); download(blob, file.file_name || 'file'); } catch (e) { notify(errorMessage(e)); } finally { b.disabled = false; } }); files.append(b); }
            const resend = element('button', 'ارسال به چت ↗'); resend.type = 'button'; resend.addEventListener('click', async () => { resend.disabled = true; try { await request('delivery_resend', { order_id: order.id, message_id: file.source_message }); notify('فایل یا پیام به چت ربات ارسال شد.', true); } catch (e) { notify(errorMessage(e)); } finally { resend.disabled = false; } }); files.append(resend);
          }); card.append(files);
        } else card.append(element('p', 'هنوز فایلی برای این سفارش ثبت نشده است.', 'line'));
        box.append(card);
      });
    } catch (error) { empty(box, errorMessage(error)); }
  }
  async function loadHistory() {
    const box = $('history-content'); empty(box, 'در حال دریافت تراکنش‌ها...');
    try { const data = await request('wallet_history'); box.replaceChildren();
      const balance = element('article', null, 'detail-card'); balance.append(element('h2', `موجودی: ${number(data.balance)} تومان`)); box.append(balance);
      if (!data.transactions.length) { box.append(element('div', 'هنوز تراکنشی ثبت نشده است.', 'empty-state')); return; }
      data.transactions.forEach(tx => { const card = element('article', null, 'detail-card'); card.append(element('h2', `${tx.delta >= 0 ? '+' : '−'}${number(Math.abs(tx.delta))} تومان`), element('p', tx.reason || 'تراکنش'), element('p', date(tx.ts))); box.append(card); });
    } catch (error) { empty(box, errorMessage(error)); }
  }
  async function loadTickets() {
    const box = $('ticket-content'); empty(box, 'در حال دریافت پیام‌ها...');
    try { const data = await request('tickets'); box.replaceChildren(); if (!data.messages.length) return empty(box, 'هنوز تیکتی نداری؛ از اینجا پیامت را بفرست.');
      data.messages.forEach(msg => { const div = element('div', null, 'ticket-msg' + (msg.sender === 'admin' ? ' admin' : '')); div.append(element('small', `${msg.sender === 'admin' ? 'پشتیبانی' : 'شما'} · تیکت #${number(msg.ticket_id)} · ${date(msg.ts)} · ${{general:'عمومی',payment:'پرداخت',connection:'اتصال',delivery:'تحویل'}[msg.category] || 'عمومی'}`), document.createTextNode(msg.text)); box.append(div); }); box.scrollTop = box.scrollHeight;
    } catch (error) { empty(box, errorMessage(error)); }
  }
  $('support-refresh').addEventListener('click', () => { if (authenticated) loadTickets(); });
  $('support-form').addEventListener('submit', async e => { e.preventDefault(); if (!authenticated) return notify('مینی‌اپ را از تلگرام باز کن.'); const submit = e.submitter; submit.disabled = true; try { const result = await request('ticket_send', { text: $('support-text').value, category: $('support-category').value }); $('support-text').value = ''; await loadTickets(); notify(result.notified ? 'پیامت ثبت شد.' : 'پیامت ثبت شد اما اعلان برای ادمین نرسید؛ پشتیبانی می‌تواند آن را در پنل ببیند.'); } catch (error) { notify(errorMessage(error)); } finally { submit.disabled = false; } });
  function options(select, values) { select.replaceChildren(); values.forEach(v => { const o = element('option', v.label); o.value = v.value; o.disabled = !!v.locked; select.append(o); }); }
  async function loadOptions() {
    try { const data = await request('config_options');
      options($('cfg-region'), data.countries.map(c => ({ value: c.code, label: `${c.flag} ${c.name}${c.locked ? ' 🔒 اشتراکی' : ''}`, locked: c.locked })));
      options($('cfg-mode'), Object.entries(data.modes).map(([value,label]) => ({ value,label })));
      options($('cfg-role'), Object.entries(data.roles).map(([value,label]) => ({ value,label })));
      options($('cfg-dns'), data.dns.map(d => ({ value: d.value, label: d.label + (d.locked ? ' 🔒 اشتراکی' : ''), locked: d.locked })));
      options($('cfg-mtu'), data.mtu.map(value => ({ value, label: value || 'بدون MTU' })));
      $('cfg-custom-mtu').disabled = !data.unlock; $('cfg-custom-mtu').placeholder = data.unlock ? 'مثلاً 1300' : 'نیازمند اشتراک';
    } catch (error) { notify(errorMessage(error)); }
  }
  function configFields() { return { region: $('cfg-region').value, mode: $('cfg-mode').value, role: $('cfg-role').value, dns: $('cfg-dns').value, mtu: $('cfg-custom-mtu').value || $('cfg-mtu').value, name: $('cfg-name').value }; }
  $('preset-save').addEventListener('click', async () => { if (!authenticated) return notify('مینی‌اپ را از تلگرام باز کن.'); try { await request('config_preset_save', { config: configFields() }); notify('تنظیمات دلخواه ذخیره شد؛ فایل و کلید خصوصی ذخیره نمی‌شوند.'); } catch(e) { notify(errorMessage(e)); } });
  $('preset-load').addEventListener('click', async () => { if (!authenticated) return notify('مینی‌اپ را از تلگرام باز کن.'); try { const data = await request('config_preset_get'); if (!data.config) return notify('هنوز تنظیماتی ذخیره نشده است.'); const c = data.config; $('cfg-region').value = c.region; $('cfg-mode').value = c.mode; $('cfg-role').value = c.role; $('cfg-dns').value = c.dns; $('cfg-name').value = c.name || ''; const preset = [...$('cfg-mtu').options].some(o => o.value === c.mtu); $('cfg-mtu').value = preset ? c.mtu : ''; $('cfg-custom-mtu').value = preset ? '' : c.mtu; notify('تنظیمات بارگذاری شد. محدودیت اشتراک هنگام ساخت دوباره بررسی می‌شود.'); } catch(e) { notify(errorMessage(e)); } });
  const help = { connect: '۱. اینترنت معمولی خود را بررسی کن.\n۲. ساعت دستگاه را روی حالت خودکار بگذار.\n۳. فایل را دوباره وارد و شبکه دیگری را امتحان کن.\n۴. اگر حل نشد به پشتیبانی پیام بده.', slow: '۱. یک شبکه دیگر را امتحان کن.\n۲. برنامه‌های مصرف‌کننده اینترنت را ببند.\n۳. نتیجه ممکن است با زمان و شبکه تغییر کند؛ برای بررسی دقیق به پشتیبانی پیام بده.', file: '۱. مطمئن شو فایل با پسوند .conf ذخیره شده.\n۲. برنامه سازگار را به‌روز کن.\n۳. فایل را مستقیم وارد کن و از تغییر محتوای آن بپرهیز.', payment: '۱. وضعیت سفارش را در سرویس‌های من بررسی کن.\n۲. شماره سفارش و رسید را برای پشتیبانی بفرست.\n۳. اطلاعات محرمانه کارت را ارسال نکن.' };
  document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => { $('help-answer').textContent = help[button.dataset.help] || ''; $('help-answer').style.whiteSpace = 'pre-line'; $('help-answer').hidden = false; }));
  let gameProfiles = [];
  async function loadProfiles() { try { const data = await request('game_profiles'); gameProfiles = data.profiles; options($('profile-select'), gameProfiles.map(p => ({ value: p.name, label: p.name }))); } catch(e) { notify(errorMessage(e)); } }
  $('profile-save').addEventListener('click', async () => { if (!authenticated) return notify('مینی‌اپ را از تلگرام باز کن.'); try { await request('game_profile_save', { name: $('profile-name-input').value, config: configFields() }); await loadProfiles(); notify('پروفایل بازی ذخیره شد؛ کلید خصوصی در آن نیست.'); } catch(e) { notify(errorMessage(e)); } });
  $('profile-load').addEventListener('click', () => { const profile = gameProfiles.find(p => p.name === $('profile-select').value); if (!profile) return notify('پروفایلی انتخاب نشده است.'); const c=profile.config; $('cfg-region').value=c.region; $('cfg-mode').value=c.mode; $('cfg-role').value=c.role; $('cfg-dns').value=c.dns; $('cfg-name').value=c.name || ''; const predefined=[...$('cfg-mtu').options].some(o => o.value === c.mtu); $('cfg-mtu').value=predefined?c.mtu:''; $('cfg-custom-mtu').value=predefined?'':c.mtu; notify('پروفایل بارگذاری شد؛ محدودیت اشتراک هنگام ساخت بررسی می‌شود.'); });
  $('profile-delete').addEventListener('click', async () => { const name=$('profile-select').value; if (!name || !confirm('این پروفایل حذف شود؟')) return; try { await request('game_profile_delete', { name }); await loadProfiles(); notify('پروفایل حذف شد.'); } catch(e) { notify(errorMessage(e)); } });
  $('compare-form').addEventListener('submit', e => { e.preventDefault(); const before=Number($('before-ping').value), after=Number($('after-ping').value); if (!(before>=1 && before<=9999 && after>=1 && after<=9999)) return; const difference=before-after; $('compare-result').textContent = difference > 0 ? `پینگ واردشده بعد از اتصال ${number(difference)} میلی‌ثانیه کمتر است.` : difference < 0 ? `پینگ واردشده بعد از اتصال ${number(-difference)} میلی‌ثانیه بیشتر است.` : 'دو مقدار واردشده برابرند.'; $('compare-result').textContent += ' نتیجه به شبکه، زمان و مقصد تست وابسته است.'; $('compare-result').hidden=false; });
  $('config-form').addEventListener('submit', async e => { e.preventDefault(); if (!authenticated) return notify('مینی‌اپ را از تلگرام باز کن.'); const submit = e.submitter; submit.disabled = true;
    try { const data = await request('config_create', { config: configFields() }); configText = data.config; configName = (data.name || 'IMRC').replace(/[^a-zA-Z0-9_-]/g, '') + '.conf'; $('config-output').value = configText; $('config-result').hidden = false; $('config-result').scrollIntoView({ behavior: 'smooth' }); $('quota').textContent = number(data.remaining) + ' / ' + number(data.limit); }
    catch (error) { notify(errorMessage(error)); } finally { submit.disabled = false; }
  });
  $('config-download').addEventListener('click', () => { if (configText) download(new Blob([configText], { type: 'text/plain;charset=utf-8' }), configName); });
  if (telegram) { telegram.ready(); telegram.expand(); }
  setBusy(false);
  if (!initData) { notify('برای استفاده، مینی‌اپ را از دکمه «مینی‌اپ IMRC» داخل ربات تلگرام باز کن.'); return; }
  request('summary').then(data => {
    $('profile-name').textContent = data.name; $('profile-user').textContent = data.username ? '@' + data.username : 'حساب تلگرام'; $('balance').textContent = number(data.balance);
    $('subscription').textContent = data.sub ? 'فعال ✦' : 'غیرفعال'; $('subscription-date').textContent = data.sub_until ? 'تا ' + date(data.sub_until) : 'اشتراک فعال نداری';
    $('quota').textContent = number(data.remaining) + ' / ' + number(data.limit); $('home-title').textContent = 'سلام ' + data.name + ' ✳'; authenticated = true; setBusy(false);
  }).catch(error => notify(errorMessage(error)));
})();
