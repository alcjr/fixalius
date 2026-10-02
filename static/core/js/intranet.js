(function () {
  'use strict';

  const el = document.getElementById('intranetClock');
  if (!el) return;

  const lang = document.documentElement.lang || 'es';

  function tick() {
    const now = new Date();
    try {
      el.textContent = now.toLocaleString(lang, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch (_) {
      // Navegadores sin soporte de dateStyle/timeStyle
      el.textContent = now.toLocaleString();
    }
    el.setAttribute('datetime', now.toISOString());
  }

  tick();
  // Refrescar cada 30 s: suficiente para que no vaya desfasado,
  // sin generar trabajo innecesario.
  setInterval(tick, 30000);


  /* ---------- Modales legales (Privacidad / Aviso legal) ---------- */
(function () {
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-modal-open]');
    if (trigger) {
      e.preventDefault();
      var dlg = document.getElementById(trigger.dataset.modalOpen);
      if (!dlg) return;
      if (typeof dlg.showModal === 'function') {
        dlg.showModal();
      } else {
        dlg.setAttribute('open', '');
      }
      return;
    }

    if (e.target.matches('dialog.modal') || e.target.closest('.modal-close')) {
      var dlg = e.target.closest('dialog.modal');
      if (dlg) {
        if (typeof dlg.close === 'function') { dlg.close(); }
        else { dlg.removeAttribute('open'); }
      }
    }
  });
})();




})();