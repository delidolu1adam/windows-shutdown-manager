(function () {
  'use strict';

  // ---------------- Tauri bağlantısı ----------------
  // tauri.conf.json içinde "withGlobalTauri": true olduğu için
  // window.__TAURI__ global olarak erişilebilir (bundler/import gerekmez).
  const tauri = window.__TAURI__;
  const invoke = tauri ? tauri.core.invoke : null;
  const appWindow = tauri ? tauri.window.getCurrentWindow() : null;

  // ---------------- i18n ----------------
  const STR = {
    tr: {
      appTitle: 'Windows Kapatma Yöneticisi', currentTime: 'Şu anki saat', targetTime: 'Hedef saat',
      forceTitle: 'Uygulamaları kapatmaya zorla', forceSub: 'Eğer açık uygulamalar işlemi engellerse, kaydetmeden sonlandır.',
      shutdown: 'Kapat', restart: 'Yeniden Başlat', logoff: 'Oturumu Kapat',
      start: 'Başlat', cancel: 'İptal', edit: 'Düzenle',
      idleHint: 'Hedef saati ve işlemi seçin',
      editHint: "Yeni hedef saati gir ve tekrar Başlat'a bas",
      remainingLabel: 'Kalan süre', errorMsg: 'Lütfen geçerli bir saat gir',
      overlayCancel: 'İptal Et',
      overlaySubNormal: 'Kaydetmediğiniz çalışmaları şimdi kaydet.',
      overlaySubForce: 'Açık uygulamalar kaydetmeden sonlandırılacak.',
      actionLabel: { shutdown: 'Bilgisayar kapatılacak', restart: 'Bilgisayar yeniden başlatılacak', logoff: 'Oturum kapatılacak' },
      // "zorla" ifadesi cümle içine yerleştirilir, sonuna eklenmez.
      actionVerb: {
        shutdown: { normal: 'Bilgisayar kapatılıyor', forced: 'Bilgisayar zorla kapatılıyor' },
        restart: { normal: 'Bilgisayar yeniden başlatılıyor', forced: 'Bilgisayar zorla yeniden başlatılıyor' },
        logoff: { normal: 'Oturum kapatılıyor', forced: 'Oturum zorla kapatılıyor' },
      },
      actionError: 'Eylem gerçekleştirilemedi: ',
      closeConfirmTitle: 'Emin misiniz?',
      closeConfirmSub: 'Zamanlayıcı hâlâ çalışıyor. Uygulamayı kapatmak istediğinize emin misiniz?',
      closeConfirmCancel: 'Devam Et',
      closeConfirmOk: 'Kapat',
    },
    en: {
      appTitle: 'Windows Shutdown Manager', currentTime: 'Current time', targetTime: 'Target time',
      forceTitle: 'Force close applications', forceSub: 'If open applications interfere with the process, terminate it without saving.',
      shutdown: 'Shut Down', restart: 'Restart', logoff: 'Log off',
      start: 'Start', cancel: 'Cancel', edit: 'Edit',
      idleHint: 'Set the target time and action',
      editHint: 'Enter a new target time and press Start again',
      remainingLabel: 'Time remaining', errorMsg: 'Please enter a valid time',
      overlayCancel: 'Cancel',
      overlaySubNormal: 'Save any unsaved work now.',
      overlaySubForce: 'Open programs will be closed without saving.',
      actionLabel: { shutdown: 'The computer will shut down', restart: 'The computer will restart', logoff: 'The session will log off' },
      actionVerb: {
        shutdown: { normal: 'Shutting down the computer', forced: 'Forcibly shutting down the computer' },
        restart: { normal: 'Restarting the computer', forced: 'Forcibly restarting the computer' },
        logoff: { normal: 'Logging off', forced: 'Forcibly logging off' },
      },
      actionError: 'The action could not be completed: ',
      closeConfirmTitle: 'Are you sure?',
      closeConfirmSub: 'The timer is still running. Are you sure you want to close the app?',
      closeConfirmCancel: 'Continue',
      closeConfirmOk: 'Close',
    }
  };

  // Uygulamanın ilk kurulumda (hiç dil seçilmemişken) açılacağı dil.
  // Değiştirmek için sadece bu satırı 'tr' <-> 'en' yapmak yeterli.
  const DEFAULT_LANG = 'tr';
  // Kullanıcının seçtiği dil, webview'ın kalıcı localStorage'ında saklanır;
  // bu Tauri masaüstü uygulamalarında diske yazılır ve pencere/uygulama
  // kapansa bile korunur, bir sonraki açılışta otomatik uygulanır.
  const LANG_STORAGE_KEY = 'kapatma-zamanlayici.lang';

  let lang = DEFAULT_LANG;

  function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (STR[lang][key] !== undefined) el.textContent = STR[lang][key];
    });
    if (!state.running) {
      ringCenter.innerHTML = `<div class="ring-idle-hint">${STR[lang].idleHint}</div>`;
    } else {
      renderRingText();
    }
  }

  // Dili değiştirir, arayüzü (bayrak/kod/aktif menü öğesi/metinler) günceller
  // ve tercihi kalıcı olarak kaydeder. Hem başlangıç yüklemesinde hem de
  // kullanıcı menüden seçim yaptığında bu tek fonksiyon kullanılır.
  function setLanguage(newLang, persist) {
    lang = STR[newLang] ? newLang : DEFAULT_LANG;
    document.documentElement.lang = lang;
    langCurrentFlag.className = 'fi ' + (lang === 'tr' ? 'fi-tr' : 'fi-gb');
    langCurrentCode.textContent = lang.toUpperCase();
    langDropdown.querySelectorAll('.lang-item').forEach(i => {
      i.dataset.active = (i.dataset.lang === lang) ? 'true' : 'false';
    });
    applyLang();
    if (persist) {
      try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (err) { console.error('Dil tercihi kaydedilemedi:', err); }
    }
  }

  // ---------------- referanslar ----------------
  const app = document.getElementById('app');
  const minimizeBtn = document.getElementById('minimizeBtn');
  const closeBtn = document.getElementById('closeBtn');

  const langDropdown = document.getElementById('langDropdown');
  const langCurrentBtn = document.getElementById('langCurrentBtn');
  const langCurrentFlag = document.getElementById('langCurrentFlag');
  const langCurrentCode = document.getElementById('langCurrentCode');

  const ch = document.getElementById('ch'), cm = document.getElementById('cm'), cs = document.getElementById('cs');
  const hh = document.getElementById('hh'), mm = document.getElementById('mm'), ss = document.getElementById('ss');
  const ringFg = document.getElementById('ringFg');
  const ringCenter = document.getElementById('ringCenter');
  const actionSelect = document.getElementById('actionSelect');
  const errorMsg = document.getElementById('errorMsg');
  const forceToggle = document.getElementById('forceToggle');
  const startBtn = document.getElementById('startBtn');
  const idleActions = document.getElementById('idleActions');
  const runningActions = document.getElementById('runningActions');
  const editBtn = document.getElementById('editBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  const overlay = document.getElementById('overlay');
  const overlayIcon = document.getElementById('overlayIcon');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySub = document.getElementById('overlaySub');
  const overlayCount = document.getElementById('overlayCount');
  const overlayCancel = document.getElementById('overlayCancel');

  const closeConfirmOverlay = document.getElementById('closeConfirmOverlay');
  const closeConfirmCancel = document.getElementById('closeConfirmCancel');
  const closeConfirmOk = document.getElementById('closeConfirmOk');

  const RING_CIRC = 2 * Math.PI * 95;

  const ACTION_ICONS = {
    shutdown: '<path d="M12 2v8"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    restart: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    logoff: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
  };

  const state = { action: 'shutdown', running: false, targetTimestamp: null, totalMs: 0, tickHandle: null };
  let lastRemaining = 0;

  const pad = n => String(n).padStart(2, '0');

  // ---------------- pencere kontrolleri ----------------
  // NOT: appWindow.hide() / .show() / .close() / .destroy() Tauri v2'de izin
  // (permission) gerektiren komutlardır. Bu izinler
  // src-tauri/capabilities/default.json içinde "core:window:allow-hide",
  // "core:window:allow-show" ve "core:window:allow-destroy" olarak tanımlı
  // olmalıdır — tanımlı değilse çağrı sessizce (konsola hata yazarak)
  // başarısız olur ve arayüzde hiçbir şey değişmez.

  // "-" tuşu: görev çubuğuna küçültmek yerine sistem tepsisine gizler.
  // Pencere, tepsi ikonuna tıklanınca (main.rs) tekrar gösterilir.
  minimizeBtn.addEventListener('click', () => {
    if (!appWindow) return;
    appWindow.hide().catch(err => console.error('Pencere gizlenemedi (izin eksik olabilir):', err));
  });

  // X tuşu her zaman bir "kapatma isteği" gönderir; asıl karar tek
  // noktadan, aşağıdaki onCloseRequested içinde verilir. Orada isteği HER
  // ZAMAN durdurup (preventDefault) kendimiz karar veriyoruz: zamanlayıcı
  // çalışmıyorsa pencereyi anında biz kapatıyoruz (appWindow.destroy()),
  // çalışıyorsa onay katmanını gösteriyoruz. Böylece "pencere otomatik
  // kapanır" gibi örtük/garanti olmayan bir davranışa güvenmiyoruz.
  closeBtn.addEventListener('click', () => {
    if (!appWindow) return;
    appWindow.close().catch(err => console.error('Pencere kapatılamadı:', err));
  });

  function showCloseConfirm() { closeConfirmOverlay.classList.add('show'); }
  function hideCloseConfirm() { closeConfirmOverlay.classList.remove('show'); }

  closeConfirmCancel.addEventListener('click', hideCloseConfirm);
  closeConfirmOk.addEventListener('click', () => {
    hideCloseConfirm();
    if (appWindow) appWindow.destroy().catch(err => console.error('Pencere kapatılamadı:', err));
  });

  // Hem "X" tuşu hem de Alt+F4 / görev çubuğundan kapatma gibi native
  // istekler bu tek noktadan geçer. preventDefault() HER durumda çağrılır;
  // kapatma kararını (hemen kapat / onay göster) biz veririz.
  if (appWindow) {
    appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (state.running) {
        showCloseConfirm();
        return;
      }
      try {
        await appWindow.destroy();
      } catch (err) {
        console.error('Pencere kapatılamadı:', err);
      }
    });

  }

  // ---------------- dil seçici ----------------
  langCurrentBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.dataset.open = langDropdown.dataset.open === 'true' ? 'false' : 'true';
  });
  document.addEventListener('click', () => { langDropdown.dataset.open = 'false'; });

  langDropdown.querySelectorAll('.lang-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.dataset.open = 'false';
      setLanguage(item.dataset.lang, true);
    });
  });

  // Başlangıçta daha önce kaydedilmiş bir dil tercihi varsa onu, yoksa
  // DEFAULT_LANG'i uygula.
  let savedLang = null;
  try { savedLang = localStorage.getItem(LANG_STORAGE_KEY); } catch (err) { /* localStorage erişilemezse sessizce varsayılana düş */ }
  setLanguage(savedLang || DEFAULT_LANG, false);

  // ---------------- saat / hedef girişi ----------------
  function updateClock() {
    const now = new Date();
    ch.textContent = pad(now.getHours());
    cm.textContent = pad(now.getMinutes());
    cs.textContent = pad(now.getSeconds());
  }
  updateClock();
  setInterval(updateClock, 1000);

  [hh, mm, ss].forEach((inp, idx, arr) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/[^0-9]/g, '').slice(0, 2);
      if (inp.value.length === 2 && idx < arr.length - 1) {
        arr[idx + 1].focus();
        arr[idx + 1].select();
      }
    });
    inp.addEventListener('focus', () => inp.select());
  });

  actionSelect.addEventListener('click', (e) => {
    const opt = e.target.closest('.action-opt');
    if (!opt || state.running) return;
    state.action = opt.dataset.action;
    app.dataset.action = state.action;
    [...actionSelect.children].forEach(o => o.dataset.selected = (o === opt) ? 'true' : 'false');
  });

  function getTotalMs() {
    const H = parseInt(hh.value || '0', 10), M = parseInt(mm.value || '0', 10), S = parseInt(ss.value || '0', 10);
    if (H > 23 || M > 59 || S > 59) return -1;
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), H, M, S, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }

  // ---------------- zamanlayıcı akışı ----------------
  startBtn.addEventListener('click', () => {
    const totalMs = getTotalMs();
    if (!totalMs || totalMs <= 0) {
      errorMsg.classList.add('show');
      return;
    }
    errorMsg.classList.remove('show');
    state.totalMs = totalMs;
    state.targetTimestamp = Date.now() + totalMs;
    state.running = true;

    idleActions.classList.add('hide');
    runningActions.classList.add('show');

    tick();
    state.tickHandle = setInterval(tick, 250);
  });

  function stopRunning() {
    state.running = false;
    if (state.tickHandle) { clearInterval(state.tickHandle); state.tickHandle = null; }
    idleActions.classList.remove('hide');
    runningActions.classList.remove('show');
    ringFg.style.strokeDashoffset = RING_CIRC;
    ringCenter.innerHTML = `<div class="ring-idle-hint">${STR[lang].idleHint}</div>`;
  }

  cancelBtn.addEventListener('click', stopRunning);

  editBtn.addEventListener('click', () => {
    if (state.tickHandle) { clearInterval(state.tickHandle); state.tickHandle = null; }
    state.running = false;
    idleActions.classList.remove('hide');
    runningActions.classList.remove('show');

    const remaining = Math.max(0, state.targetTimestamp - Date.now());
    const target = new Date(Date.now() + remaining);
    hh.value = pad(target.getHours());
    mm.value = pad(target.getMinutes());
    ss.value = pad(target.getSeconds());

    ringCenter.innerHTML = `<div class="ring-idle-hint">${STR[lang].editHint}</div>`;
  });

  function renderRingText() {
    const totalSec = Math.round(lastRemaining / 1000);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    ringCenter.innerHTML = `
      <div class="ring-remaining-label">${STR[lang].remainingLabel}</div>
      <div class="ring-remaining">${pad(h)}:${pad(m)}:${pad(s)}</div>
      <div class="ring-action-label">${STR[lang].actionLabel[state.action]}</div>`;
  }

  function tick() {
    const remaining = Math.max(0, state.targetTimestamp - Date.now());
    lastRemaining = remaining;
    const frac = state.totalMs > 0 ? remaining / state.totalMs : 0;
    ringFg.style.strokeDashoffset = String(RING_CIRC * (1 - frac));
    renderRingText();

    if (remaining <= 0) {
      clearInterval(state.tickHandle);
      state.tickHandle = null;
      triggerAction();
    }
  }

  function triggerAction() {
    const force = forceToggle.checked;
    const verbText = STR[lang].actionVerb[state.action][force ? 'forced' : 'normal'];

    overlayIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ACTION_ICONS[state.action]}</svg>`;
    overlayTitle.textContent = verbText;
    overlaySub.textContent = force ? STR[lang].overlaySubForce : STR[lang].overlaySubNormal;
    overlayCancel.textContent = STR[lang].overlayCancel;
    overlay.classList.add('show');

    let grace = 10;
    overlayCount.textContent = grace;
    const graceHandle = setInterval(() => {
      grace -= 1;
      overlayCount.textContent = Math.max(grace, 0);
      if (grace <= 0) {
        clearInterval(graceHandle);
        overlay.classList.remove('show');
        stopRunning();
        executePowerAction(state.action, force);
      }
    }, 1000);

    overlayCancel.onclick = () => {
      clearInterval(graceHandle);
      overlay.classList.remove('show');
      stopRunning();
    };
  }

  // ---------------- gerçek sistem çağrısı (Rust tarafı) ----------------
  async function executePowerAction(action, force) {
    if (!invoke) {
      console.warn('Tauri API bulunamadı — tarayıcı önizlemesinde çalışıyor, gerçek sistem komutu tetiklenmedi.');
      return;
    }
    try {
      await invoke('run_power_action', { action, force });
    } catch (err) {
      alert(STR[lang].actionError + err);
    }
  }

})();
