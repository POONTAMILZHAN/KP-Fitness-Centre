/* Attendance page */
window.Pages = window.Pages || {};

let clockTimer;

Pages.attendance = async function (outlet) {
  if (clockTimer) clearInterval(clockTimer);

  const members = (await DB.all('members')).sort((a, b) => a.name.localeCompare(b.name));

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Attendance</h1>
        <div class="sub">Record and review member check-ins</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom: 24px;">
      <div class="checkin-card">
        <div class="date-label" id="date-label"></div>
        <div class="clock" id="clock">--:--:--</div>
        <div style="margin-top: 20px; display: flex; gap: 10px; align-items: center;">
          <input class="input" id="checkin-search" placeholder="Search member to check in..." style="flex: 1;">
          <button class="btn btn-primary" id="quick-checkin">${U.icon('attendance')} Check In</button>
        </div>
        <div id="search-dropdown" class="hidden" style="margin-top: 10px; background: var(--bg-card-2); border-radius: 10px; border: 1px solid var(--gold-border); max-height: 220px; overflow-y: auto; text-align: left;"></div>
      </div>
      <div class="card card-glow">
        <div class="card-head"><div><h3>Today at a Glance</h3><div class="subtitle">Live stats</div></div></div>
        <div class="info-row"><span class="label">Today's Check-ins</span><span class="value gold" id="today-count">0</span></div>
        <div class="info-row"><span class="label">This Week</span><span class="value" id="week-count">0</span></div>
        <div class="info-row"><span class="label">This Month</span><span class="value" id="month-count">0</span></div>
        <div class="info-row"><span class="label">Active Members</span><span class="value" id="active-members-count">0</span></div>
      </div>
    </div>

    <div class="card card-glow">
      <div class="card-head"><div><h3>Today's Check-ins</h3><div class="subtitle" id="today-sub">All check-ins for today</div></div></div>
      <div class="table-wrap" style="background: transparent; border: none;">
        <div class="table-scroll"><table class="data-table" id="today-table">
          <thead><tr><th>Time</th><th>Member</th><th>Plan</th><th>Status</th></tr></thead>
          <tbody></tbody>
        </table></div>
      </div>
    </div>
  `;

  // Clock
  const tick = () => {
    const now = new Date();
    U.$('#clock').textContent = now.toLocaleTimeString(APP_CONFIG.locale, { hour12: false });
    U.$('#date-label').textContent = now.toLocaleDateString(APP_CONFIG.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  tick();
  clockTimer = setInterval(tick, 1000);

  // Member search
  const search = U.$('#checkin-search');
  const dd = U.$('#search-dropdown');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { dd.classList.add('hidden'); return; }
    const matches = members.filter(m => (m.name + ' ' + m.phone + ' ' + m.memberCode).toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { dd.innerHTML = '<div style="padding: 14px; color: var(--text-muted); font-size: 13px;">No matches found.</div>'; dd.classList.remove('hidden'); return; }
    dd.innerHTML = matches.map(m => `<div data-id="${m.id}" style="padding: 12px 14px; display: flex; gap: 10px; align-items: center; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.04);">
      <div class="avatar sm">${m.photo ? `<img src="${m.photo}" alt="">` : U.initials(m.name)}</div>
      <div><div style="font-weight: 600;">${U.escape(m.name)}</div><div style="color: var(--text-muted); font-size: 11px;">${U.escape(m.memberCode)} · ${U.escape(m.phone || '')}</div></div>
    </div>`).join('');
    dd.classList.remove('hidden');
    dd.querySelectorAll('[data-id]').forEach(r => r.addEventListener('click', () => doCheckIn(r.dataset.id)));
  });
  U.$('#quick-checkin').addEventListener('click', () => {
    const first = dd.querySelector('[data-id]');
    if (first) doCheckIn(first.dataset.id);
    else U.toast('Search a member first.', 'warning');
  });

  async function doCheckIn(memberId) {
    const r = await Store.checkIn(memberId);
    if (r.duplicate) U.toast('Member already checked in today.', 'warning');
    else U.toast('Check-in recorded.', 'success');
    search.value = '';
    dd.classList.add('hidden');
    await refresh();
  }

  async function refresh() {
    const att = await DB.all('attendance');
    const today = U.today();
    const now = new Date();
    const weekAgo = U.toInputDate(new Date(now.getTime() - 7 * 86400000));
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-01`;
    const members = await DB.all('members');
    const plans = await DB.all('plans');
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
    const planMap = Object.fromEntries(plans.map(p => [p.id, p.name]));

    const todays = att.filter(a => a.date === today);
    U.$('#today-count').textContent = todays.length;
    U.$('#week-count').textContent = att.filter(a => a.date >= weekAgo).length;
    U.$('#month-count').textContent = att.filter(a => a.date >= monthStart).length;
    U.$('#active-members-count').textContent = members.filter(m => U.memberStatus(m) === 'Active').length;

    const tbody = U.$('#today-table tbody');
    if (todays.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-empty"><div class="ico">${U.icon('attendance')}</div>No check-ins yet today.</td></tr>`;
      return;
    }
    const sorted = todays.sort((a, b) => b.time.localeCompare(a.time));
    tbody.innerHTML = sorted.map(a => {
      const m = memberMap[a.memberId];
      return `<tr>
        <td style="font-family: var(--font-mono); color: var(--gold);">${a.time}</td>
        <td><div style="display:flex; gap: 10px; align-items: center;">
          <div class="avatar sm">${m?.photo ? `<img src="${m.photo}" alt="">` : U.initials(m?.name || '?')}</div>
          <div><div style="font-weight: 600;">${U.escape(m?.name || 'Unknown')}</div><div style="color: var(--text-muted); font-size: 11px;">${U.escape(m?.memberCode || '')}</div></div>
        </div></td>
        <td>${U.escape(planMap[m?.planId] || '—')}</td>
        <td>${U.badge(U.memberStatus(m))}</td>
      </tr>`;
    }).join('');
  }

  await refresh();
};
