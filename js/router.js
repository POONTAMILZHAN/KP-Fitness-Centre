/* Hash-based Router
   ---------------------- */
(function () {
  const Router = { routes: {}, current: null };
  let outlet = null;

  Router.init = (outletEl) => {
    outlet = outletEl;
    window.addEventListener('hashchange', Router.resolve);
  };

  Router.add = (path, { title, render, breadcrumb }) => {
    Router.routes[path] = { title, render, breadcrumb };
  };

  Router.go = (path) => {
    if (location.hash === '#' + path) Router.resolve();
    else location.hash = '#' + path;
  };

  Router.resolve = async () => {
    const hashRaw = location.hash.replace(/^#/, '') || '/dashboard';
    const [path] = hashRaw.split('?');
    const [base, ...rest] = path.split('/').filter(Boolean);
    const key = '/' + (base || 'dashboard');
    const params = rest; // additional segments (e.g. member id)
    const route = Router.routes[key];
    if (!route) {
      outlet.innerHTML = `<div class="empty-state"><div class="ico">⚠</div><h3>Page not found</h3><p>No module registered for "${U.escape(key)}".</p></div>`;
      return;
    }
    Router.current = key;
    document.title = (route.title || 'Dashboard') + ' — ' + APP_CONFIG.gymName;
    // Update header
    const titleEl = document.querySelector('.page-title h1');
    const pathEl = document.querySelector('.page-title .path');
    if (titleEl) titleEl.textContent = route.title || '';
    if (pathEl) pathEl.textContent = (route.breadcrumb || 'Home / ' + (route.title || ''));
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === key));
    // Render
    outlet.classList.remove('fade-in');
    outlet.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner spinner-lg"></div></div>';
    try {
      await route.render(outlet, params);
      outlet.classList.add('fade-in');
      // Close drawer on mobile after navigation
      const sb = document.querySelector('.sidebar');
      if (sb) sb.classList.remove('open');
      document.querySelector('.drawer-backdrop')?.classList.remove('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error(e);
      outlet.innerHTML = `<div class="empty-state"><div class="ico">⚠</div><h3>Something went wrong</h3><p>${U.escape(e.message || e)}</p></div>`;
    }
  };

  window.Router = Router;
})();
