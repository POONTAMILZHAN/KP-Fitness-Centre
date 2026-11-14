/* Utility helpers — formatting, DOM, toasts, modals
   -------------------------------------------------- */
(function () {
  const U = {};

  // ---------- Formatting ----------
  U.money = (n) => {
    const v = Number(n || 0);
    return APP_CONFIG.currency + v.toLocaleString(APP_CONFIG.locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  U.money2 = (n) => {
    const v = Number(n || 0);
    return APP_CONFIG.currency + v.toLocaleString(APP_CONFIG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  U.num = (n) => Number(n || 0).toLocaleString(APP_CONFIG.locale);

  U.toDate = (v) => (v instanceof Date ? v : new Date(v));
  U.formatDate = (v, opts) => {
    if (!v) return '-';
    const d = U.toDate(v);
    if (isNaN(d.getTime())) return '-';
    const o = opts || { day: '2-digit', month: 'short', year: 'numeric' };
    return d.toLocaleDateString(APP_CONFIG.locale, o);
  };
  U.formatDateTime = (v) => {
    if (!v) return '-';
    const d = U.toDate(v);
    return d.toLocaleString(APP_CONFIG.locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  U.toInputDate = (v) => {
    const d = v ? U.toDate(v) : new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
  };
  U.today = () => U.toInputDate(new Date());
  U.addMonths = (date, months) => {
    const d = U.toDate(date);
    const target = new Date(d);
    target.setMonth(target.getMonth() + Number(months || 0));
    return target;
  };
  U.diffDays = (a, b) => {
    const da = U.toDate(a);
    const db = U.toDate(b);
    return Math.floor((db.setHours(0,0,0,0) - da.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
  };
  U.greet = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };
  U.initials = (name) => (name || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  // ---------- DOM ----------
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.el = (tag, attrs = {}, kids = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach(c => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };
  U.escape = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Toasts ----------
  let toastStack;
  function ensureToastStack() {
    if (!toastStack) {
      toastStack = document.getElementById('toast-stack');
      if (!toastStack) {
        toastStack = document.createElement('div');
        toastStack.id = 'toast-stack';
        document.body.appendChild(toastStack);
      }
    }
    return toastStack;
  }
  const ICONS = { success: '✓', error: '✕', warning: '!', info: 'ⓘ' };
  U.toast = (msg, type = 'info', timeout = 3500) => {
    const stack = ensureToastStack();
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `<div class="toast-icon">${ICONS[type] || 'ⓘ'}</div><div class="toast-body">${U.escape(msg)}</div>`;
    stack.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 200ms'; setTimeout(() => t.remove(), 200); }, timeout);
  };

  // ---------- Modal manager ----------
  U.modal = (options) => {
    const {
      title = '',
      body = '',
      size = '',
      actions = [],
      onOpen = null,
      dismissable = true
    } = options;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal ' + (size || '');
    backdrop.appendChild(modal);

    const close = () => { backdrop.style.opacity = '0'; backdrop.style.transition = 'opacity 180ms'; setTimeout(() => backdrop.remove(), 200); };

    const head = document.createElement('div');
    head.className = 'modal-head';
    head.innerHTML = `<h3>${U.escape(title)}</h3>${dismissable ? '<button class="close-btn" aria-label="Close">×</button>' : ''}`;
    if (dismissable) head.querySelector('.close-btn').addEventListener('click', close);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else bodyEl.appendChild(body);

    modal.appendChild(head);
    modal.appendChild(bodyEl);

    if (actions.length) {
      const foot = document.createElement('div');
      foot.className = 'modal-footer';
      actions.forEach(a => {
        const b = document.createElement('button');
        b.className = 'btn ' + (a.variant ? 'btn-' + a.variant : 'btn-secondary');
        b.textContent = a.label;
        b.addEventListener('click', () => {
          const result = a.onClick && a.onClick({ close, modal });
          if (result && typeof result.then === 'function') { b.disabled = true; result.then(() => b.disabled = false); }
          if (a.closeAfter !== false && (a.variant !== 'primary' || a.closeAfter === true)) close();
        });
        foot.appendChild(b);
      });
      modal.appendChild(foot);
    }

    document.body.appendChild(backdrop);
    if (dismissable) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    if (onOpen) onOpen({ modal, bodyEl, close });
    return { close, modal, bodyEl };
  };

  U.confirm = (message, title = 'Confirm') => {
    return new Promise((resolve) => {
      let answered = false;
      U.modal({
        title,
        size: 'sm',
        body: `<p style="color: var(--text-secondary); font-size: 14px; line-height: 1.6;">${U.escape(message)}</p>`,
        actions: [
          { label: 'Cancel', variant: 'secondary', onClick: () => { answered = true; resolve(false); } },
          { label: 'Confirm', variant: 'primary', closeAfter: true, onClick: () => { answered = true; resolve(true); } }
        ]
      });
      setTimeout(() => { if (!answered) { /* backdrop closed */ } }, 0);
    });
  };

  // ---------- Debounce ----------
  U.debounce = (fn, wait = 250) => {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
  };

  // ---------- Status helpers ----------
  U.memberStatus = (member) => {
    if (!member || !member.expiryDate) return 'Expired';
    const diff = U.diffDays(new Date(), member.expiryDate);
    if (diff < 0) return 'Expired';
    if (diff <= 7) return 'Upcoming';
    return 'Active';
  };
  U.paymentStatus = (totalFee, paidAmount) => {
    const bal = Number(totalFee || 0) - Number(paidAmount || 0);
    if (bal <= 0) return 'Paid';
    if (Number(paidAmount || 0) > 0) return 'Partial';
    return 'Pending';
  };
  U.badge = (status) => {
    const cls = STATUS_COLORS[status] || 'grey';
    return `<span class="badge ${cls}">${status}</span>`;
  };

  // ---------- Export helpers ----------
  U.downloadFile = (filename, content, type = 'application/json') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  };

  U.csvEscape = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  U.toCSV = (rows, headers) => {
    const head = headers.map(h => h.label).join(',');
    const body = rows.map(r => headers.map(h => U.csvEscape(typeof h.get === 'function' ? h.get(r) : r[h.key])).join(',')).join('\n');
    return head + '\n' + body;
  };

  // ---------- Page size paging ----------
  U.paginate = (items, page, size) => {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const p = Math.min(Math.max(1, page), pages);
    const start = (p - 1) * size;
    return { page: p, pages, total, items: items.slice(start, start + size) };
  };

  // ---------- SVG Icons ----------
  U.icon = (name) => {
    const icons = {
      dashboard: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
      users: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      plans: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 9h20"/><path d="M8 3v6"/></svg>',
      cash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>',
      alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      history: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 3 12 8 12"/><path d="M3.05 12a9 9 0 1 0 2.95-6.5L3 7"/><line x1="12" y1="7" x2="12" y2="12"/><line x1="12" y1="12" x2="15" y2="14"/></svg>',
      attendance: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      expense: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
      report: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
      backup: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      settings: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      logout: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
      plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
      trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
      eye: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      print: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
      search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      bell: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
      menu: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      user: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      phone: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
      map: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
    };
    return icons[name] || '';
  };

  window.U = U;
})();
