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
})();