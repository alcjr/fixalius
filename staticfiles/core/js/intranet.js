/* =========================================================================
   Intranet Fixalius
   -------------------------------------------------------------------------
   Se carga en el <head> SIN defer: el estado inicial del sidebar se aplica
   antes del primer pintado (evita el parpadeo). Lo que necesita el DOM
   espera a DOMContentLoaded.

   Bloques independientes (un fallo o una página sin el elemento
   correspondiente no afecta a los demás):
     0. Tema claro/oscuro (se aplica antes del primer pintado)
     1. Sidebar
     2. Reloj de la cabecera
     3. Modales legales (Privacidad / Aviso legal)
     4. Avisos de Django (cierre manual y automático)
   ========================================================================= */
(function () {
  'use strict';

  var root = document.documentElement;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ---------------------------------------------------------------------
     0. Tema claro/oscuro
     Clave única 'fingest_theme' (la misma que usaba core.js), así la
     preferencia se mantiene entre páginas antiguas y nuevas.
     API: FixaliusTheme.get() / set('dark'|'light') / toggle()
     --------------------------------------------------------------------- */
  var THEME_KEY = 'fingest_theme';

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function setTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignorar */ }
    try { window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme } })); }
    catch (e) { /* IE */ }
    return theme;
  }
  window.FixaliusTheme = {
    get: currentTheme,
    set: setTheme,
    toggle: function () { return setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
  };

  try {
    if (localStorage.getItem(THEME_KEY) === 'dark') root.setAttribute('data-theme', 'dark');
  } catch (e) { /* ignorar */ }

  /* ---------------------------------------------------------------------
     1. Sidebar
     El estado efectivo vive en <html data-sidebar="expanded|collapsed">;
     el CSS deriva de ahí anchos y márgenes (ver intranet.css).
     --------------------------------------------------------------------- */
  var STORAGE_KEY = 'fixalius_sidebar_collapsed';
  var mobileMq = window.matchMedia('(max-width: 760px)');

  function readStored() {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch (e) { return false; }
  }
  function writeStored(value) {
    try { localStorage.setItem(STORAGE_KEY, String(value)); }
    catch (e) { /* almacenamiento no disponible: se ignora */ }
  }

  var desktopCollapsed = readStored();  // preferencia persistente (escritorio)
  var mobileOpen = false;               // estado temporal (móvil)

  function renderSidebar() {
    var collapsed = mobileMq.matches ? !mobileOpen : desktopCollapsed;
    root.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');

    var btn = document.getElementById('sidebarToggleBtn');
    if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
  }

  // Estado inicial inmediato, sin animar la transición de la primera carga
  root.classList.add('no-anim');
  renderSidebar();

  function initSidebar() {
    var sidebar = document.getElementById('appSidebar');
    var btn = document.getElementById('sidebarToggleBtn');

    if (sidebar && btn) {
      btn.addEventListener('click', function () {
        if (mobileMq.matches) {
          mobileOpen = !mobileOpen;
        } else {
          desktopCollapsed = !desktopCollapsed;
          writeStored(desktopCollapsed);
        }
        renderSidebar();
      });

      // Móvil: cerrar al navegar
      sidebar.addEventListener('click', function (e) {
        if (mobileMq.matches && mobileOpen && e.target.closest('.nav-link')) {
          mobileOpen = false;
          renderSidebar();
        }
      });

      // Móvil: cerrar al pulsar fuera del menú (incluye el fondo oscuro)
      document.addEventListener('click', function (e) {
        if (mobileMq.matches && mobileOpen && !sidebar.contains(e.target)) {
          mobileOpen = false;
          renderSidebar();
        }
      });

      // Móvil: cerrar con Escape y devolver el foco al botón
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileMq.matches && mobileOpen) {
          mobileOpen = false;
          renderSidebar();
          btn.focus();
        }
      });
    }

    renderSidebar();  // sincroniza aria-expanded ahora que existe el botón

    // Activar las transiciones una vez pintado el estado inicial
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.remove('no-anim'); });
    });
  }

  // Rotación / redimensionado: al cambiar de móvil a escritorio (o al revés)
  // se descarta el estado temporal del menú móvil.
  var onBreakpointChange = function () { mobileOpen = false; renderSidebar(); };
  if (mobileMq.addEventListener) mobileMq.addEventListener('change', onBreakpointChange);
  else mobileMq.addListener(onBreakpointChange);  // Safari antiguo

  // Sincronizar la preferencia entre pestañas abiertas
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      desktopCollapsed = e.newValue === 'true';
      renderSidebar();
    }
  });

  onReady(initSidebar);

  /* ---------------------------------------------------------------------
     2. Reloj de la cabecera
     --------------------------------------------------------------------- */
  function initClock() {
    var el = document.getElementById('intranetClock');
    if (!el) return;

    var lang = document.documentElement.lang || 'es';
    // Opciones explícitas: dd/mm/aaaa hh:mm, parecido al SHORT_DATETIME_FORMAT
    // con el que el servidor pinta el valor inicial (sin salto visual).
    var options = {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    };

    function tick() {
      var now = new Date();
      try {
        el.textContent = now.toLocaleString(lang, options);
      } catch (_) {
        el.textContent = now.toLocaleString();
      }
      el.setAttribute('datetime', now.toISOString());
    }

    // Se refresca justo al cambiar de minuto (no se muestran segundos)
    function scheduleNext() {
      var wait = 60000 - (Date.now() % 60000) + 50;
      setTimeout(function () { tick(); scheduleNext(); }, wait);
    }

    tick();
    scheduleNext();
  }

  onReady(initClock);

  /* ---------------------------------------------------------------------
     3. Modales legales (Privacidad / Aviso legal)
     Delegación de eventos en document: funciona aunque la página no tenga
     reloj ni sidebar (p. ej. pantallas sin autenticar).
     --------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-modal-open]');
    if (trigger) {
      e.preventDefault();
      var target = document.getElementById(trigger.dataset.modalOpen);
      if (!target) return;
      if (typeof target.showModal === 'function') target.showModal();
      else target.setAttribute('open', '');
      return;
    }

    // Clic en el fondo del <dialog> o en un botón de cierre
    if (e.target.matches('dialog.modal') || e.target.closest('.modal-close')) {
      var dlg = e.target.closest('dialog.modal');
      if (!dlg) return;
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
  });

  /* ---------------------------------------------------------------------
     4. Avisos de Django (.intranet-messages)
     --------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-dismiss-message]');
    if (btn) {
      var box = btn.closest('.intranet-message');
      if (box) box.remove();
    }
  });

  onReady(function () {
    var items = document.querySelectorAll('.intranet-message:not(.intranet-message--error)');
    Array.prototype.forEach.call(items, function (box) {
      setTimeout(function () { if (box.parentNode) box.remove(); }, 6000);
    });
  });
})();
