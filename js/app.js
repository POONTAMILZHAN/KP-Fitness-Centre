/* App Bootstrap
   ---------------- */
(async function () {
  // Guard — redirect if not signed in
  const session = Auth.requireSession();
  if (!session) return;

  // Open DB and seed defaults
  await DB.open();
  await Store.seedDefaults();

  // Start local auto-backup (every 2 min → IndexedDB snapshots store)
  Backup.startAutoBackup();

  // Initialize Google Drive sync if a client ID is configured or was saved
  if (GDrive.isConfigured()) {
    GDrive.init().then(() => {
      // Silent re-auth if user previously authorized (no popup unless consent expired)
      if (localStorage.getItem('skpfit_gdrive_authorized')) {
        GDrive.authorize('').then(() => GDrive.startAutoSync()).catch(() => {
          localStorage.removeItem('skpfit_gdrive_authorized');
        });
      }
    }).catch(console.error);
  }

  // Admin pill
  const name = session.name || session.username || 'Admin';
  U.$('#admin-name').textContent = name;
  U.$('#admin-role').textContent = session.role || 'Owner';
  U.$('#header-name').textContent = name;
  U.$('#admin-avatar').textContent = U.initials(name);
  U.$('#header-avatar').textContent = U.initials(name);

  // Date chip
  const now = new Date();
  U.$('#current-date').textContent = now.toLocaleDateString(APP_CONFIG.locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  // Logout
  const confirmLogout = async () => {
    const yes = await U.confirm('Are you sure you want to sign out?', 'Sign Out');
    if (yes) Auth.logout();
  };
  U.$('#logout-btn').addEventListener('click', confirmLogout);
  U.$('#profile-chip').addEventListener('click', confirmLogout);

  // Build sidebar nav
  const navItems = [
    { key: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { key: '/members', label: 'Members', icon: 'users' },
    { key: '/plans', label: 'Membership Plans', icon: 'plans' },
    { key: '/fees', label: 'Fee Collection', icon: 'cash' },
    { key: '/dues', label: 'Due Payments', icon: 'alert' },
    { key: '/history', label: 'Payment History', icon: 'history' },
    { key: '/attendance', label: 'Attendance', icon: 'attendance' },
    { key: '/expenses', label: 'Expenses', icon: 'expense' },
    { key: '/reports', label: 'Reports', icon: 'report' },
    { key: '/backup', label: 'Backup & Restore', icon: 'backup' },
    { key: '/settings', label: 'Settings', icon: 'settings' }
  ];
  const navRoot = U.$('#sidebar-nav');
  navRoot.appendChild(U.el('div', { class: 'nav-section-title', text: 'Main Menu' }));
  navItems.forEach(it => {
    const item = U.el('div', { class: 'nav-item', 'data-route': it.key, onclick: () => Router.go(it.key) }, [
      U.el('span', { class: 'ico', html: U.icon(it.icon) }),
      U.el('span', { text: it.label })
    ]);
    navRoot.appendChild(item);
  });

  // Mobile drawer
  const sb = U.$('#sidebar');
  const bd = U.$('#drawer-backdrop');
  U.$('#mobile-menu-btn').addEventListener('click', () => { sb.classList.add('open'); bd.classList.add('show'); });
  bd.addEventListener('click', () => { sb.classList.remove('open'); bd.classList.remove('show'); });

  // Notifications - show expiring
  const metrics = await Store.dashboardMetrics();
  const totalAlerts = metrics.expiringSoon + metrics.duesList.length;
  if (totalAlerts > 0) {
    const chip = U.$('#notification-count');
    chip.textContent = totalAlerts > 99 ? '99+' : totalAlerts;
    chip.classList.remove('hidden');
  }
  U.$('#notification-btn').addEventListener('click', async () => {
    const m = await Store.dashboardMetrics();
    const expiring = (await DB.all('members')).filter(x => {
      if (!x.expiryDate) return false;
      const d = U.diffDays(new Date(), x.expiryDate);
      return d >= 0 && d <= 7;
    }).sort((a,b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));
    const body = U.el('div');
    if (expiring.length === 0 && m.duesList.length === 0) {
      body.innerHTML = `<div class="empty-state" style="padding: 20px;"><div class="ico">✓</div><h3>All Clear</h3><p>No pending dues or expiring memberships.</p></div>`;
    } else {
      if (m.duesList.length) {
        body.appendChild(U.el('div', { class: 'section-title', style: { marginBottom: '12px' } }, [U.el('h2', { text: 'Pending Dues', style: { fontSize: '16px' } })]));
        m.duesList.slice(0, 5).forEach(d => {
          body.appendChild(U.el('div', { class: 'expiry-item' }, [
            U.el('div', { class: 'avatar sm', text: U.initials(d.member.name) }),
            U.el('div', { class: 'mid' }, [
              U.el('div', { class: 'name', text: d.member.name }),
              U.el('div', { class: 'info', text: `Balance ${U.money(d.balance)}` })
            ]),
            U.el('span', { class: 'days ' + (d.daysOverdue > 7 ? 'danger' : 'warn'), text: d.daysOverdue > 0 ? `${d.daysOverdue}d overdue` : 'due' })
          ]));
        });
      }
      if (expiring.length) {
        body.appendChild(U.el('div', { class: 'divider' }));
        body.appendChild(U.el('div', { class: 'section-title', style: { marginBottom: '12px' } }, [U.el('h2', { text: 'Expiring Soon', style: { fontSize: '16px' } })]));
        expiring.slice(0, 5).forEach(mem => {
          const d = U.diffDays(new Date(), mem.expiryDate);
          body.appendChild(U.el('div', { class: 'expiry-item' }, [
            U.el('div', { class: 'avatar sm', text: U.initials(mem.name) }),
            U.el('div', { class: 'mid' }, [
              U.el('div', { class: 'name', text: mem.name }),
              U.el('div', { class: 'info', text: `Expires ${U.formatDate(mem.expiryDate)}` })
            ]),
            U.el('span', { class: 'days warn', text: `${d}d left` })
          ]));
        });
      }
    }
    U.modal({ title: 'Notifications', body, size: 'sm' });
  });

  // Register routes
  Router.add('/dashboard', { title: 'Dashboard', breadcrumb: 'Home / Dashboard', render: Pages.dashboard });
  Router.add('/members', { title: 'Members', breadcrumb: 'Home / Members', render: Pages.members });
  Router.add('/plans', { title: 'Membership Plans', breadcrumb: 'Home / Plans', render: Pages.plans });
  Router.add('/fees', { title: 'Fee Collection', breadcrumb: 'Home / Fee Collection', render: Pages.fees });
  Router.add('/dues', { title: 'Due Payments', breadcrumb: 'Home / Due Payments', render: Pages.dues });
  Router.add('/history', { title: 'Payment History', breadcrumb: 'Home / History', render: Pages.history });
  Router.add('/attendance', { title: 'Attendance', breadcrumb: 'Home / Attendance', render: Pages.attendance });
  Router.add('/expenses', { title: 'Expenses', breadcrumb: 'Home / Expenses', render: Pages.expenses });
  Router.add('/reports', { title: 'Reports', breadcrumb: 'Home / Reports', render: Pages.reports });
  Router.add('/backup', { title: 'Backup & Restore', breadcrumb: 'Home / Backup', render: Pages.backup });
  Router.add('/settings', { title: 'Settings', breadcrumb: 'Home / Settings', render: Pages.settings });

  Router.init(U.$('#main-outlet'));
  Router.resolve();

  // Hide loader
  const loader = U.$('#app-loader');
  loader.classList.add('gone');
  setTimeout(() => loader.remove(), 500);
})();
