(() => {
  // Evita enlazar los eventos dos veces si el script llega por base.html y por la plantilla hija
  if (window.__fixaliusInit) return;
  window.__fixaliusInit = true;

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  if (menuButton && nav) {
    const labelOpen  = menuButton.dataset.labelOpen  || '';
    const labelClose = menuButton.dataset.labelClose || '';
    // Debe coincidir con el @media del menú desplegable en fixalius.css
    const isMobile   = () => window.matchMedia('(max-width: 1080px)').matches;
    const isOpen     = () => nav.classList.contains('nav-open');

    const setOpen = (open) => {
      nav.classList.toggle('nav-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      const label = open ? labelClose : labelOpen;
      if (label) menuButton.setAttribute('aria-label', label);
    };

    const closeMenu = ({ returnFocus = false } = {}) => {
      if (!isOpen()) return;
      setOpen(false);
      if (returnFocus) menuButton.focus();
    };

    menuButton.addEventListener('click', () => setOpen(!isOpen()));

    nav.querySelectorAll('a').forEach((link) =>
      link.addEventListener('click', () => closeMenu())
    );

    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu({ returnFocus: true });
        return;
      }

      if (e.key !== 'Tab' || !isMobile()) return;

      const focusables = [...nav.querySelectorAll(focusableSelector)]
        .filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !nav.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !nav.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!isOpen()) return;
      if (nav.contains(e.target) || menuButton.contains(e.target)) return;
      closeMenu();
    });

    window.addEventListener('resize', () => {
      if (!isMobile()) closeMenu();
    });
  }

  /* ---------- Newsletter: alta real contra el servidor (doble opt-in) ---------- */
  document.querySelectorAll('form[data-newsletter]').forEach((form) => {
    const notice = form.querySelector('.form-notice');
    const button = form.querySelector('button[type="submit"]');

    const say = (text, isError = false) => {
      if (!notice) return;
      notice.textContent = text || '';
      notice.classList.toggle('is-error', isError);
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      if (button) button.disabled = true;
      say(form.dataset.sending);

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),   // incluye csrfmiddlewaretoken y el honeypot
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.ok) {
          say(data.message);          // "Revisa tu correo para confirmar..." (sin temporizador)
          form.reset();
        } else {
          say(data.message || form.dataset.error, true);
        }
      } catch (_) {
        say(form.dataset.error, true);
      } finally {
        if (button) button.disabled = false;
      }
    });
  });

  /* ---------- Modales legales (Privacidad / Aviso legal) ---------- */
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-modal-open]');
    if (trigger) {
      e.preventDefault();
      const dlg = document.getElementById(trigger.dataset.modalOpen);
      if (!dlg) return;
      if (typeof dlg.showModal === 'function') {
        dlg.showModal();
      } else {
        dlg.setAttribute('open', '');
      }
      return;
    }

    if (e.target.matches('dialog.modal') || e.target.closest('.modal-close')) {
      const dlg = e.target.closest('dialog.modal');
      if (dlg) {
        if (typeof dlg.close === 'function') { dlg.close(); }
        else { dlg.removeAttribute('open'); }
      }
    }
  });
  /* ---------- Navegación interna: el único scroll es el de <main> ---------- */
  const scroller = document.querySelector('main');
  const reduceMotionNav = window.matchMedia('(prefers-reduced-motion: reduce)');

  const goToHash = (hash, { smooth = true, push = true } = {}) => {
    if (!scroller) return false;
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch (_) { /* hash mal codificado */ }
    const target = id ? document.getElementById(id) : scroller;
    if (!target || (target !== scroller && !scroller.contains(target))) return false;

    const top = target === scroller
      ? 0
      : scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top, behavior: smooth && !reduceMotionNav.matches ? 'smooth' : 'auto' });

    if (push && history.replaceState) {
      const clean = window.location.pathname + window.location.search;
      history.replaceState(null, '', target === scroller ? clean : hash);
    }

    // Accesibilidad: el foco sigue al destino, sin que el navegador mueva nada
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    return true;
  };

  // Enlaces internos (menú, "Hablemos", "Volver arriba", skip-link...)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (hash.length < 2) return;
    if (goToHash(hash)) e.preventDefault();
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash) goToHash(window.location.hash, { push: false });
  });
  if (window.location.hash) {
    requestAnimationFrame(() => goToHash(window.location.hash, { smooth: false, push: false }));
  }

  // Red de seguridad: si algo llegase a desplazar la ventana, se devuelve a su sitio
  window.addEventListener('scroll', () => {
    const se = document.scrollingElement;
    if (se && (se.scrollTop || se.scrollLeft)) se.scrollTo(0, 0);
  }, { passive: true });

  /* ---------- Carrusel de casos de éxito (bucle infinito, movimiento continuo) ---------- */
  const casesTrack = document.querySelector('[data-cases-track]');
  if (casesTrack) {
    const zone      = casesTrack.closest('.cases') || casesTrack;
    const prevBtn   = document.querySelector('[data-cases-prev]');
    const nextBtn   = document.querySelector('[data-cases-next]');
    const toggleBtn = document.querySelector('[data-cases-toggle]');
    const originals = [...casesTrack.querySelectorAll('.case-card')];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SPEED  = 45;     // píxeles por segundo
    const RESUME = 3000;   // ms tras soltar el dedo antes de reanudar

    const loop = originals.length > 1;
    let setWidth   = 0;
    let raf        = 0;
    let last       = 0;
    let pos        = 0;
    let userPaused = false;   // pausa pedida con el botón
    let hovering   = false;   // ratón, foco o dedo dentro del carrusel
    let visible    = true;    // la sección está en pantalla

    const gapPx = () => parseFloat(getComputedStyle(casesTrack).columnGap) || 0;
    const step  = () => originals[0].getBoundingClientRect().width + gapPx();

    // Clona las cards (decorativas, fuera del foco y del árbol de accesibilidad)
    // las veces necesarias para que el bucle no deje huecos.
    const build = () => {
      casesTrack.querySelectorAll('[data-clone]').forEach((c) => c.remove());
      if (!loop) return;
      setWidth = step() * originals.length;
      let guard = 0;
      while (casesTrack.scrollWidth < setWidth + casesTrack.clientWidth + step() && guard++ < 6) {
        originals.forEach((card) => {
          const clone = card.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          clone.setAttribute('inert', '');
          clone.dataset.clone = '1';
          casesTrack.appendChild(clone);
        });
      }
    };

    // Movimiento continuo: se acumula la posición con el tiempo real entre frames
    // y, al llegar al final del primer juego de cards, se vuelve al inicio sin salto.
    const tick = (ts) => {
      if (!last) last = ts;
      const dt = Math.min(ts - last, 64);
      last = ts;
      pos += SPEED * dt / 1000;
      if (pos >= setWidth) pos -= setWidth;
      casesTrack.scrollLeft = pos;
      raf = requestAnimationFrame(tick);
    };

    const shouldPlay = () =>
      loop && !userPaused && !hovering && visible && !document.hidden && !reduceMotion.matches;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (shouldPlay()) {
        pos = casesTrack.scrollLeft;   // retoma desde donde esté
        raf = requestAnimationFrame(tick);
      }
    };

    // Flechas: un paso de una card con animación; el bucle se cierra por ambos lados.
    const go = (dir) => {
      if (loop && dir < 0 && casesTrack.scrollLeft < step()) casesTrack.scrollLeft += setWidth;
      casesTrack.scrollBy({ left: dir * step(), behavior: 'smooth' });
    };

    const normalize = () => {
      if (loop && casesTrack.scrollLeft >= setWidth) casesTrack.scrollLeft -= setWidth;
    };

    const paintToggle = () => {
      if (!toggleBtn) return;
      toggleBtn.hidden = !loop || reduceMotion.matches;
      toggleBtn.setAttribute('aria-label',
        (userPaused ? toggleBtn.dataset.labelPlay : toggleBtn.dataset.labelPause) || '');
      toggleBtn.textContent = userPaused ? '▶' : '❚❚';
    };

    // Controles
    if (!loop) {
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
    }
    if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => go(1));
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      paintToggle();
      sync();
    });

    casesTrack.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    // Cierra el bucle cuando el scroll manual se detiene
    let idle;
    casesTrack.addEventListener('scroll', () => {
      if (raf) return;               // durante el autoplay ya lo gestiona tick()
      clearTimeout(idle);
      idle = setTimeout(normalize, 160);
    }, { passive: true });

    // Pausa mientras el usuario interactúa
    zone.addEventListener('pointerenter', () => { hovering = true;  sync(); });
    zone.addEventListener('pointerleave', () => { hovering = false; sync(); });
    zone.addEventListener('focusin',      () => { hovering = true;  sync(); });
    zone.addEventListener('focusout',     () => { hovering = false; sync(); });
    let touchTimer;
    zone.addEventListener('touchstart', () => {
      clearTimeout(touchTimer);
      hovering = true;
      sync();
    }, { passive: true });
    zone.addEventListener('touchend', () => {
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => { hovering = false; sync(); }, RESUME);
    }, { passive: true });

    // Pausa si la sección no se ve o la pestaña está en segundo plano
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
      }, { threshold: 0.2 }).observe(zone);
    }
    document.addEventListener('visibilitychange', sync);
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', () => { paintToggle(); sync(); });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        casesTrack.scrollLeft = 0;
        sync();
      }, 200);
    });

    build();
    paintToggle();
    sync();
  }

  /* ---------- Logotipo del hero: composición / descomposición ---------- */
  const logoEl = document.querySelector('[data-logo-compose]');
  if (logoEl && logoEl.animate) {
    const reduceLogo = window.matchMedia('(prefers-reduced-motion: reduce)');
    const logoToggle = document.querySelector('[data-logo-toggle]');
    const T = 10000, D = 1000, HOLD = 6200;   // ciclo, duración de cada fase y tiempo con el logo formado (ms)
    const PAUSE_AT = 3200;                    // instante con el logotipo formado y las órbitas atenuadas

    // Piezas del logotipo (letras, hojas, anillo).
    // data-s = retardo de entrada; data-e = retardo de salida (si falta, el mismo que data-s).
    const pieceAnims = reduceLogo.matches ? [] : [...logoEl.querySelectorAll('.p')].map((el) => {
      const s = +el.dataset.s, from = el.dataset.from;
      const e = el.dataset.e !== undefined ? +el.dataset.e : s;
      return el.animate([
        { transform: from,   opacity: 0, offset: 0,                   easing: 'linear' },
        { transform: from,   opacity: 0, offset: s / T,               easing: 'cubic-bezier(.2,.9,.3,1.12)' },
        { transform: 'none', opacity: 1, offset: (s + D) / T,         easing: 'linear' },
        { transform: 'none', opacity: 1, offset: (HOLD + e) / T,      easing: 'cubic-bezier(.6,0,.9,.4)' },
        { transform: from,   opacity: 0, offset: (HOLD + e + D) / T,  easing: 'linear' },
        { transform: from,   opacity: 0, offset: 1 },
      ], { duration: T, iterations: Infinity });
    });

    // Órbitas: a pleno cuando el logotipo no está (hueco entre ciclos), atenuadas mientras está formado.
    // Cada anillo se desfasa 260 ms respecto al anterior para que aparezcan en cascada, no de golpe.
    const LOW = 0.5;   // opacidad de los anillos con el logotipo formado (el resplandor central se apaga del todo)
    const orbitEls = reduceLogo.matches ? [] : [...logoEl.parentElement.querySelectorAll('.orbit-core, .orbit')];
    const orbitAnims = orbitEls.map((el, i) => {
      const a = i * 260;
      const low = el.classList.contains('orbit-core') ? 0 : LOW;
      return el.animate([
        { opacity: 1,   scale: 1,    offset: 0,                         easing: 'ease-in-out' },  // el logo empieza a formarse
        { opacity: low, scale: 1.05, offset: (2600 + a) / T,            easing: 'linear' },       // logo formado
        { opacity: low, scale: 1.05, offset: (HOLD - 300 + a) / T,      easing: 'ease-in-out' },  // el logo está a punto de romperse
        { opacity: 1,   scale: 1,    offset: (HOLD + 2300 + a) / T,     easing: 'linear' },       // aparecen mientras el logo se disipa
        { opacity: 1,   scale: 1,    offset: 1 },                                                   // se mantienen durante el hueco
      ], { duration: T, iterations: Infinity });
    });

    const logoAnims = pieceAnims.concat(orbitAnims);

    if (logoToggle) logoToggle.hidden = logoAnims.length === 0;
    if (logoAnims.length) {
      let logoPaused = false, logoVisible = true;
      const logoSync = () => {
        const run = !logoPaused && logoVisible && !document.hidden;
        logoAnims.forEach((a) => (run ? a.play() : a.pause()));
      };
      if (logoToggle) logoToggle.addEventListener('click', () => {
        logoPaused = !logoPaused;
        logoEl.closest('.hero')?.classList.toggle('is-paused', logoPaused);
        if (logoPaused) logoAnims.forEach((a) => { a.currentTime = PAUSE_AT; });   // se queda con el logo formado
        logoToggle.textContent = logoPaused ? '▶' : '❚❚';
        logoToggle.setAttribute('aria-label',
          (logoPaused ? logoToggle.dataset.labelPlay : logoToggle.dataset.labelPause) || '');
        logoSync();
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { logoVisible = entry.isIntersecting; logoSync(); },
          { threshold: 0.1 }).observe(logoEl);
      }
      document.addEventListener('visibilitychange', logoSync);
    }
  }
})();
