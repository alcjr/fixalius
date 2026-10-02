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
})();