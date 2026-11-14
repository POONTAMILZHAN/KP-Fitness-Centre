/* Dashboard Page */
window.Pages = window.Pages || {};

Pages.dashboard = async function (outlet) {
  const session = Auth.session();
  const now = new Date();
  const metrics = await Store.dashboardMetrics();
  const revenue = await Store.monthlyRevenue(6);
  const attendanceTrend = await Store.dailyAttendance(7);

  outlet.innerHTML = `
    <div class="welcome-banner">
      <div class="text">
        <div class="eyebrow">${U.greet()}, Welcome Back</div>
        <h1>${U.escape(session.name)}, <span class="gold">your gym is running strong.</span></h1>
        <div class="meta">
          <span>${now.toLocaleDateString(APP_CONFIG.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>${APP_CONFIG.gymName}</span>
          <span>${APP_CONFIG.hoursText}</span>
        </div>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="location.hash='#/fees'">${U.icon('cash')} Collect Fee</button>
        <button class="btn btn-secondary" onclick="location.hash='#/members'">${U.icon('plus')} Add Member</button>
      </div>
    </div>

    <div class="grid-cards" style="margin-bottom: 24px;" id="metric-grid">
      ${metricCard('Total Members', metrics.totalCount, 'All registered', 'users')}
      ${metricCard('Active Members', metrics.activeCount, 'Currently active', 'attendance')}
      ${metricCard('New This Month', metrics.newThisMonth, 'Recent registrations', 'plus')}
      ${metricCard("Today's Collection", U.money(metrics.todaysCollection), 'Payments received today', 'cash', true)}
      ${metricCard('This Month Revenue', U.money(metrics.monthCollection), 'Total collection this month', 'report', true)}
      ${metricCard('Pending Dues', U.money(metrics.totalPending), metrics.duesList.length + ' member(s) due', 'alert', true)}
      ${metricCard('Expiring Soon', metrics.expiringSoon, 'Expiring within 7 days', 'calendar')}
      ${metricCard("Today's Check-ins", metrics.attendanceToday, 'Attendance recorded', 'attendance')}
    </div>

    <div class="dash-grid">
      <div class="card chart-card card-glow">
        <div class="card-head">
          <div>
            <h3>Revenue Trend</h3>
            <div class="subtitle">Monthly collection — last 6 months</div>
          </div>
          <span class="badge gold">${APP_CONFIG.currencyCode}</span>
        </div>
        <div class="chart-wrap"><canvas id="revenue-chart"></canvas></div>
      </div>

      <div class="card card-glow">
        <div class="card-head">
          <div><h3>Quick Actions</h3><div class="subtitle">Jump to a task</div></div>
        </div>
        <div class="quick-action-grid">
          ${quickAction('cash', 'Collect Fee', 'Record a payment', '#/fees')}
          ${quickAction('users', 'New Member', 'Register a member', '#/members')}
          ${quickAction('attendance', 'Check-in', 'Mark attendance', '#/attendance')}
          ${quickAction('alert', 'Dues', 'Pending payments', '#/dues')}
          ${quickAction('report', 'Reports', 'View analytics', '#/reports')}
          ${quickAction('backup', 'Backup', 'Export data', '#/backup')}
        </div>
      </div>

      <div class="card chart-card card-glow">
        <div class="card-head">
          <div><h3>Attendance Trend</h3><div class="subtitle">Daily check-ins — last 7 days</div></div>
        </div>
        <div class="chart-wrap"><canvas id="attendance-chart"></canvas></div>
      </div>

      <div class="card card-glow">
        <div class="card-head">
          <div><h3>Expiring Memberships</h3><div class="subtitle">Within next 7 days</div></div>
          <button class="btn btn-ghost btn-sm" onclick="location.hash='#/members'">See all</button>
        </div>
        <div id="expiring-list" class="expiry-list"></div>
      </div>
    </div>
  `;

  // Populate expiring list
  const members = (await DB.all('members')).filter(m => {
    if (!m.expiryDate) return false;
    const d = U.diffDays(new Date(), m.expiryDate);
    return d >= 0 && d <= 7;
  }).sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || '')).slice(0, 6);
  const list = U.$('#expiring-list');
  if (members.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding: 24px;"><div class="ico">✓</div><h3>No upcoming expiries</h3><p>All memberships are current.</p></div>`;
  } else {
    members.forEach(m => {
      const days = U.diffDays(new Date(), m.expiryDate);
      list.innerHTML += `
        <div class="expiry-item">
          <div class="avatar sm">${U.initials(m.name)}</div>
          <div class="mid">
            <div class="name">${U.escape(m.name)}</div>
            <div class="info">${U.escape(m.memberCode || '')} · ${U.formatDate(m.expiryDate)}</div>
          </div>
          <span class="days ${days <= 3 ? 'danger' : 'warn'}">${days}d left</span>
        </div>`;
    });
  }

  // Draw charts
  renderRevenueChart(revenue);
  renderAttendanceChart(attendanceTrend);
};

function metricCard(label, value, sub, icon, gold = false) {
  return `
    <div class="metric-card">
      <div class="metric-icon">${U.icon(icon)}</div>
      <div class="metric-label">${label}</div>
      <div class="metric-value ${gold ? 'gold' : ''}">${value}</div>
      <div class="metric-sub">${sub}</div>
    </div>`;
}

function quickAction(icon, title, desc, href) {
  return `
    <a class="quick-action" href="${href}">
      <div class="ico">${U.icon(icon)}</div>
      <div class="label"><div class="t">${title}</div><div class="d">${desc}</div></div>
    </a>`;
}

function renderRevenueChart(data) {
  const ctx = document.getElementById('revenue-chart');
  if (!ctx) return;
  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(245, 215, 110, 0.5)');
  gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: 'Revenue',
        data: data.map(d => d.value),
        borderColor: '#D4AF37',
        backgroundColor: gradient,
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: 5,
        pointBackgroundColor: '#F5D76E',
        pointBorderColor: '#1a1203',
        pointBorderWidth: 2,
        pointHoverRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D0D0D',
          borderColor: '#D4AF37',
          borderWidth: 1,
          titleColor: '#F5D76E',
          bodyColor: '#fff',
          padding: 12,
          callbacks: {
            label: (ctx) => '  ' + APP_CONFIG.currency + ctx.parsed.y.toLocaleString(APP_CONFIG.locale)
          }
        }
      },
      scales: {
        x: { ticks: { color: '#A7A7A7' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          ticks: { color: '#A7A7A7', callback: (v) => APP_CONFIG.currency + v.toLocaleString(APP_CONFIG.locale) },
          grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true
        }
      }
    }
  });
}

function renderAttendanceChart(data) {
  const ctx = document.getElementById('attendance-chart');
  if (!ctx) return;
  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, '#F5D76E');
  gradient.addColorStop(1, '#9C7623');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        label: 'Check-ins',
        data: data.map(d => d.value),
        backgroundColor: gradient,
        borderRadius: 8,
        borderWidth: 0,
        maxBarThickness: 48,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D0D0D',
          borderColor: '#D4AF37',
          borderWidth: 1,
          titleColor: '#F5D76E',
          bodyColor: '#fff',
        }
      },
      scales: {
        x: { ticks: { color: '#A7A7A7' }, grid: { display: false } },
        y: { ticks: { color: '#A7A7A7', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}
