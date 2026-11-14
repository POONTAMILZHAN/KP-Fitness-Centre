/* Reports page */
window.Pages = window.Pages || {};

Pages.reports = async function (outlet) {
  const payments = await DB.all('payments');
  const expenses = await DB.all('expenses');
  const members = await DB.all('members');

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const monthRevenue = payments.filter(p => p.paymentDate >= monthStart).reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthExpense = expenses.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.amount || 0), 0);
  const yearRevenue = payments.filter(p => p.paymentDate >= yearStart).reduce((s, p) => s + Number(p.amount || 0), 0);
  const yearExpense = expenses.filter(e => e.date >= yearStart).reduce((s, e) => s + Number(e.amount || 0), 0);

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Reports &amp; Analytics</h1>
        <div class="sub">Business intelligence for ${APP_CONFIG.gymName}</div>
      </div>
    </div>

    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="metric-card"><div class="metric-icon">${U.icon('cash')}</div><div class="metric-label">Revenue (Month)</div><div class="metric-value gold">${U.money(monthRevenue)}</div><div class="metric-sub">Total collected this month</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('expense')}</div><div class="metric-label">Expenses (Month)</div><div class="metric-value" style="color: var(--danger);">${U.money(monthExpense)}</div><div class="metric-sub">Operational costs</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('report')}</div><div class="metric-label">Net Profit (Month)</div><div class="metric-value" style="color: ${monthRevenue - monthExpense >= 0 ? 'var(--success)' : 'var(--danger)'};">${U.money(monthRevenue - monthExpense)}</div><div class="metric-sub">Revenue − expenses</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('calendar')}</div><div class="metric-label">Net Profit (Year)</div><div class="metric-value" style="color: ${yearRevenue - yearExpense >= 0 ? 'var(--success)' : 'var(--danger)'};">${U.money(yearRevenue - yearExpense)}</div><div class="metric-sub">Year-to-date</div></div>
    </div>

    <div class="grid-2" style="margin-bottom: 24px;">
      <div class="card chart-card card-glow">
        <div class="card-head"><div><h3>Revenue vs Expenses</h3><div class="subtitle">Last 6 months comparison</div></div></div>
        <div class="chart-wrap"><canvas id="rev-exp-chart"></canvas></div>
      </div>
      <div class="card chart-card card-glow">
        <div class="card-head"><div><h3>Member Growth</h3><div class="subtitle">Registrations by month</div></div></div>
        <div class="chart-wrap"><canvas id="growth-chart"></canvas></div>
      </div>
      <div class="card chart-card card-glow">
        <div class="card-head"><div><h3>Expense Categories</h3><div class="subtitle">Distribution this year</div></div></div>
        <div class="chart-wrap"><canvas id="exp-pie"></canvas></div>
      </div>
      <div class="card chart-card card-glow">
        <div class="card-head"><div><h3>Plan Distribution</h3><div class="subtitle">Members by membership plan</div></div></div>
        <div class="chart-wrap"><canvas id="plan-pie"></canvas></div>
      </div>
    </div>

    <div class="section-title"><div><h2>Available Reports</h2><p>Export detailed data</p></div></div>
    <div class="report-tiles">
      ${reportTile('cash', 'Daily Collection', 'View today\'s payments', 'daily')}
      ${reportTile('report', 'Monthly Revenue', 'Monthly P&L breakdown', 'monthly')}
      ${reportTile('alert', 'Pending Payments', 'All outstanding dues', 'pending')}
      ${reportTile('users', 'Member Registration', 'Recent member sign-ups', 'members')}
      ${reportTile('calendar', 'Membership Expiry', 'Expiring soon or expired', 'expiry')}
      ${reportTile('expense', 'Expense Analysis', 'Expenses by category', 'expenses')}
      ${reportTile('report', 'Profit &amp; Loss', 'Full P&L statement', 'pl')}
      ${reportTile('attendance', 'Attendance Log', 'All check-ins', 'attendance')}
    </div>
  `;

  renderRevExpChart(payments, expenses);
  renderGrowthChart(members);
  renderExpCategoryChart(expenses);
  renderPlanDistribution(members, await DB.all('plans'));

  outlet.querySelectorAll('[data-report]').forEach(tile => tile.addEventListener('click', () => openReport(tile.dataset.report)));
};

function reportTile(icon, title, desc, id) {
  return `<div class="report-tile" data-report="${id}"><div class="ico">${U.icon(icon)}</div><div class="text"><div class="t">${title}</div><div class="d">${desc}</div></div></div>`;
}

function renderRevExpChart(payments, expenses) {
  const ctx = document.getElementById('rev-exp-chart');
  if (!ctx) return;
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString(APP_CONFIG.locale, { month: 'short' }), month: d.getMonth(), year: d.getFullYear() });
  }
  const revenue = months.map(m => payments.filter(p => { if (!p.paymentDate) return false; const d = new Date(p.paymentDate); return d.getMonth() === m.month && d.getFullYear() === m.year; }).reduce((s, p) => s + Number(p.amount || 0), 0));
  const exp = months.map(m => expenses.filter(e => { if (!e.date) return false; const d = new Date(e.date); return d.getMonth() === m.month && d.getFullYear() === m.year; }).reduce((s, e) => s + Number(e.amount || 0), 0));

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Revenue', data: revenue, backgroundColor: 'rgba(212, 175, 55, 0.85)', borderRadius: 6, maxBarThickness: 32 },
        { label: 'Expenses', data: exp, backgroundColor: 'rgba(239, 83, 80, 0.75)', borderRadius: 6, maxBarThickness: 32 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#A7A7A7' } },
        tooltip: { backgroundColor: '#0D0D0D', borderColor: '#D4AF37', borderWidth: 1, titleColor: '#F5D76E', bodyColor: '#fff', callbacks: { label: c => c.dataset.label + '  ' + APP_CONFIG.currency + c.parsed.y.toLocaleString(APP_CONFIG.locale) } }
      },
      scales: {
        x: { ticks: { color: '#A7A7A7' }, grid: { display: false } },
        y: { ticks: { color: '#A7A7A7', callback: v => APP_CONFIG.currency + v.toLocaleString(APP_CONFIG.locale) }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}

function renderGrowthChart(members) {
  const ctx = document.getElementById('growth-chart');
  if (!ctx) return;
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString(APP_CONFIG.locale, { month: 'short' }), month: d.getMonth(), year: d.getFullYear() });
  }
  const counts = months.map(m => members.filter(x => {
    if (!x.joiningDate) return false;
    const d = new Date(x.joiningDate);
    return d.getMonth() === m.month && d.getFullYear() === m.year;
  }).length);

  new Chart(ctx, {
    type: 'line',
    data: { labels: months.map(m => m.label), datasets: [{
      label: 'New Members',
      data: counts,
      borderColor: '#F5D76E',
      backgroundColor: 'rgba(212, 175, 55, 0.15)',
      borderWidth: 3,
      fill: true,
      tension: 0.4,
      pointRadius: 5,
      pointBackgroundColor: '#D4AF37'
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0D0D0D', borderColor: '#D4AF37', borderWidth: 1, titleColor: '#F5D76E', bodyColor: '#fff' } },
      scales: {
        x: { ticks: { color: '#A7A7A7' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#A7A7A7', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}

function renderExpCategoryChart(expenses) {
  const ctx = document.getElementById('exp-pie');
  if (!ctx) return;
  const agg = {};
  expenses.forEach(e => { agg[e.category || 'Other'] = (agg[e.category || 'Other'] || 0) + Number(e.amount || 0); });
  const labels = Object.keys(agg);
  const values = Object.values(agg);
  if (labels.length === 0) { ctx.parentElement.innerHTML = `<div class="empty-state" style="padding: 20px;"><div class="ico">${U.icon('expense')}</div><p>No expense data yet.</p></div>`; return; }
  const palette = ['#D4AF37', '#F5D76E', '#9C7623', '#B8860B', '#DAA520', '#CD853F', '#8B7355', '#704214'];
  new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette, borderColor: '#0D0D0D', borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { color: '#A7A7A7', boxWidth: 12, padding: 12 } },
        tooltip: { backgroundColor: '#0D0D0D', borderColor: '#D4AF37', borderWidth: 1, titleColor: '#F5D76E', bodyColor: '#fff', callbacks: { label: c => c.label + ':  ' + APP_CONFIG.currency + c.parsed.toLocaleString(APP_CONFIG.locale) } }
      }
    }
  });
}

function renderPlanDistribution(members, plans) {
  const ctx = document.getElementById('plan-pie');
  if (!ctx) return;
  const agg = {};
  members.forEach(m => { const plan = plans.find(p => p.id === m.planId); const name = plan?.name || 'No Plan'; agg[name] = (agg[name] || 0) + 1; });
  const labels = Object.keys(agg);
  const values = Object.values(agg);
  if (labels.length === 0) { ctx.parentElement.innerHTML = `<div class="empty-state" style="padding: 20px;"><div class="ico">${U.icon('plans')}</div><p>No members yet.</p></div>`; return; }
  const palette = ['#D4AF37', '#F5D76E', '#9C7623', '#B8860B', '#DAA520', '#CD853F'];
  new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: palette, borderColor: '#0D0D0D', borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { color: '#A7A7A7', boxWidth: 12, padding: 12 } },
        tooltip: { backgroundColor: '#0D0D0D', borderColor: '#D4AF37', borderWidth: 1, titleColor: '#F5D76E', bodyColor: '#fff' }
      }
    }
  });
}

async function openReport(id) {
  const body = U.el('div');
  body.innerHTML = '<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner spinner-lg"></div></div>';
  const m = U.modal({ title: titleFor(id), size: 'lg', body });
  const content = await buildReport(id);
  body.innerHTML = '';
  body.appendChild(content);
}

function titleFor(id) {
  return {
    daily: 'Daily Collection Report',
    monthly: 'Monthly Revenue Report',
    pending: 'Pending Payments Report',
    members: 'Member Registration Report',
    expiry: 'Membership Expiry Report',
    expenses: 'Expense Analysis',
    pl: 'Profit & Loss Statement',
    attendance: 'Attendance Log'
  }[id] || 'Report';
}

async function buildReport(id) {
  const wrap = U.el('div');
  const payments = await DB.all('payments');
  const members = await DB.all('members');
  const expenses = await DB.all('expenses');
  const attendance = await DB.all('attendance');
  const plans = await DB.all('plans');
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  if (id === 'daily') {
    const today = U.today();
    const today_pay = payments.filter(p => p.paymentDate === today);
    const total = today_pay.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).reduce((s, p) => s + Number(p.amount || 0), 0);
    wrap.innerHTML = `<div style="margin-bottom: 16px;">Date: <strong>${U.formatDate(today)}</strong> · Total collected: <strong style="color: var(--gold);">${U.money(total)}</strong> · Transactions: <strong>${today_pay.length}</strong></div>`;
    wrap.appendChild(buildTable(['Receipt', 'Member', 'Method', 'Amount'], today_pay.map(p => [p.receiptNo, memberMap[p.memberId]?.name, p.paymentMethod, U.money(p.amount)])));
  }
  else if (id === 'monthly') {
    const data = await Store.monthlyRevenue(12);
    const total = data.reduce((s, d) => s + d.value, 0);
    wrap.innerHTML = `<div style="margin-bottom: 16px;">Last 12 months total: <strong style="color: var(--gold);">${U.money(total)}</strong></div>`;
    wrap.appendChild(buildTable(['Month', 'Revenue'], data.map(d => [d.label, U.money(d.value)])));
  }
  else if (id === 'pending') {
    const dues = await Store.dueList();
    const total = dues.reduce((s, d) => s + d.balance, 0);
    wrap.innerHTML = `<div style="margin-bottom: 16px;">Total pending: <strong style="color: var(--danger);">${U.money(total)}</strong> · Members: <strong>${dues.length}</strong></div>`;
    wrap.appendChild(buildTable(['Member', 'Phone', 'Balance', 'Due Date', 'Days Overdue'], dues.map(d => [d.member.name, d.member.phone, U.money(d.balance), U.formatDate(d.dueDate), d.daysOverdue])));
  }
  else if (id === 'members') {
    const sorted = members.sort((a, b) => (b.joiningDate || '').localeCompare(a.joiningDate || ''));
    wrap.innerHTML = `<div style="margin-bottom: 16px;">Total members: <strong>${members.length}</strong></div>`;
    wrap.appendChild(buildTable(['Code', 'Name', 'Phone', 'Plan', 'Joined', 'Expiry', 'Status'],
      sorted.map(m => [m.memberCode, m.name, m.phone, plans.find(p => p.id === m.planId)?.name || '', U.formatDate(m.joiningDate), U.formatDate(m.expiryDate), U.memberStatus(m)])));
  }
  else if (id === 'expiry') {
    const expiring = members.filter(m => m.expiryDate).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    wrap.appendChild(buildTable(['Name', 'Phone', 'Expiry Date', 'Status', 'Days'],
      expiring.map(m => {
        const diff = U.diffDays(new Date(), m.expiryDate);
        return [m.name, m.phone, U.formatDate(m.expiryDate), U.memberStatus(m), diff >= 0 ? diff + ' left' : Math.abs(diff) + ' overdue'];
      })));
  }
  else if (id === 'expenses') {
    const agg = {};
    expenses.forEach(e => { agg[e.category || 'Other'] = (agg[e.category || 'Other'] || 0) + Number(e.amount || 0); });
    const total = Object.values(agg).reduce((a, b) => a + b, 0);
    wrap.innerHTML = `<div style="margin-bottom: 16px;">Total expenses: <strong style="color: var(--danger);">${U.money(total)}</strong></div>`;
    wrap.appendChild(buildTable(['Category', 'Total', 'Share'], Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, U.money(v), total > 0 ? ((v/total)*100).toFixed(1) + '%' : '0%'])));
  }
  else if (id === 'pl') {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString(APP_CONFIG.locale, { month: 'short', year: '2-digit' }), month: d.getMonth(), year: d.getFullYear() });
    }
    const rows = months.map(m => {
      const rev = payments.filter(p => { if (!p.paymentDate) return false; const dt = new Date(p.paymentDate); return dt.getMonth() === m.month && dt.getFullYear() === m.year; }).reduce((s, p) => s + Number(p.amount || 0), 0);
      const exp = expenses.filter(e => { if (!e.date) return false; const dt = new Date(e.date); return dt.getMonth() === m.month && dt.getFullYear() === m.year; }).reduce((s, e) => s + Number(e.amount || 0), 0);
      const net = rev - exp;
      return [m.label, U.money(rev), U.money(exp), `<span style="color: ${net >= 0 ? 'var(--success)' : 'var(--danger)'};">${U.money(net)}</span>`];
    });
    wrap.appendChild(buildTable(['Month', 'Revenue', 'Expenses', 'Net'], rows, true));
  }
  else if (id === 'attendance') {
    const sorted = attendance.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 200);
    wrap.innerHTML = `<div style="margin-bottom: 16px;">Showing most recent ${Math.min(200, sorted.length)} of ${attendance.length}.</div>`;
    wrap.appendChild(buildTable(['Date', 'Time', 'Member'], sorted.map(a => [U.formatDate(a.date), a.time, memberMap[a.memberId]?.name || 'Unknown'])));
  }
  return wrap;
}

function buildTable(headers, rows, allowHTML = false) {
  const wrap = U.el('div', { class: 'table-scroll' });
  const t = document.createElement('table');
  t.className = 'data-table';
  t.innerHTML = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length === 0 ? `<tr><td colspan="${headers.length}" class="table-empty">No data available.</td></tr>` :
      rows.map(r => `<tr>${r.map(c => `<td>${allowHTML ? c : U.escape(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  wrap.appendChild(t);
  return wrap;
}
