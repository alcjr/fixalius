(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  if (menuButton && nav) {
    const labelOpen  = menuButton.dataset.labelOpen  || '';
    const labelClose = menuButton.dataset.labelClose || '';
    const isMobile   = () => window.matchMedia('(max-width: 760px)').matches;
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

  document.querySelectorAll('form[data-ok]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = form.querySelector('.form-notice');
      if (message) {
        message.textContent = form.dataset.ok || '';
        window.setTimeout(() => {
          if (message.textContent === (form.dataset.ok || '')) {
            message.textContent = '';
          }
        }, 6000);
      }
      form.reset();
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
    /* ---------- Volver arriba ---------- */
  document.querySelectorAll('[data-scroll-top]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Limpia el hash de la URL sin provocar un salto
      if (history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });
  });

  /* ---------- Carrusel de casos de éxito (bucle infinito + autoplay) ---------- */
  const casesTrack = document.querySelector('[data-cases-track]');
  if (casesTrack) {
    const zone      = casesTrack.closest('.cases') || casesTrack;
    const prevBtn   = document.querySelector('[data-cases-prev]');
    const nextBtn   = document.querySelector('[data-cases-next]');
    const toggleBtn = document.querySelector('[data-cases-toggle]');
    const originals = [...casesTrack.querySelectorAll('.case-card')];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const INTERVAL = 4500;

    const loop = originals.length > 1;
    let setWidth   = 0;
    let timer      = null;
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

    // Salto instantáneo (sin animación ni snap) para cerrar el bucle sin que se note.
    const jump = (delta, done) => {
      casesTrack.style.scrollSnapType = 'none';
      casesTrack.style.scrollBehavior = 'auto';
      casesTrack.scrollLeft += delta;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        casesTrack.style.scrollSnapType = '';
        casesTrack.style.scrollBehavior = '';
        if (done) done();
      }));
    };

    const normalize = () => {
      if (loop && casesTrack.scrollLeft >= setWidth - 1) jump(-setWidth);
    };

    const go = (dir) => {
      const move = () => casesTrack.scrollBy({ left: dir * step(), behavior: 'smooth' });
      if (loop && dir < 0 && casesTrack.scrollLeft < 1) jump(setWidth, move);
      else move();
    };

    const shouldPlay = () =>
      loop && !userPaused && !hovering && visible && !document.hidden && !reduceMotion.matches;

    const sync = () => {
      clearInterval(timer);
      timer = shouldPlay() ? setInterval(() => go(1), INTERVAL) : null;
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
    if (prevBtn) prevBtn.addEventListener('click', () => { go(-1); sync(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { go(1);  sync(); });
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      paintToggle();
      sync();
    });

    casesTrack.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1);  sync(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); sync(); }
    });

    // Cierra el bucle cuando el scroll se detiene
    let idle;
    casesTrack.addEventListener('scroll', () => {
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
      touchTimer = setTimeout(() => { hovering = false; sync(); }, INTERVAL);
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
      }, 200);
    });

    build();
    paintToggle();
    sync();
  }
})();
