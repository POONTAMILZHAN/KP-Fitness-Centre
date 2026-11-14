/* Due Payments page */
window.Pages = window.Pages || {};

Pages.dues = async function (outlet) {
  const dues = await Store.dueList();
  const totalDues = dues.reduce((s, d) => s + d.balance, 0);
  const overdueCount = dues.filter(d => d.daysOverdue > 0).length;

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Due Payments</h1>
        <div class="sub">Members with outstanding balance</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="export-dues">Export CSV</button>
      </div>
    </div>

    <div class="grid-cards" style="margin-bottom: 20px;">
      <div class="metric-card"><div class="metric-icon">${U.icon('cash')}</div><div class="metric-label">Total Pending</div><div class="metric-value gold">${U.money(totalDues)}</div><div class="metric-sub">Across ${dues.length} member(s)</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('alert')}</div><div class="metric-label">Overdue</div><div class="metric-value" style="color: var(--danger);">${overdueCount}</div><div class="metric-sub">Past due date</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('users')}</div><div class="metric-label">Due Members</div><div class="metric-value">${dues.length}</div><div class="metric-sub">Awaiting payment</div></div>
    </div>

    <div class="card card-glow">
      <div class="card-head"><div><h3>Pending Dues</h3><div class="subtitle">Sorted by most overdue first</div></div></div>
      <div id="due-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
    </div>
  `;

  const list = U.$('#due-list');
  if (dues.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="ico">✓</div><h3>All Clear</h3><p>No outstanding dues. Every member is up to date.</p></div>`;
    return;
  }
  dues.forEach(d => {
    const el = document.createElement('div');
    el.className = 'due-card ' + (d.daysOverdue > 0 ? '' : 'warn');
    el.innerHTML = `
      <div class="avatar">${d.member.photo ? `<img src="${d.member.photo}" alt="">` : U.initials(d.member.name)}</div>
      <div class="main">
        <div class="name">${U.escape(d.member.name)}</div>
        <div class="meta">${U.escape(d.member.memberCode)} · ${U.escape(d.member.phone || '')} · Due ${U.formatDate(d.dueDate)}</div>
      </div>
      <div class="amount">${U.money(d.balance)}</div>
      <span class="age">${d.daysOverdue > 0 ? d.daysOverdue + 'd overdue' : 'due now'}</span>
      <button class="btn btn-primary btn-sm" data-member="${d.member.id}">${U.icon('cash')} Collect</button>
    `;
    el.querySelector('[data-member]').addEventListener('click', () => { location.hash = '#/fees?member=' + d.member.id; });
    list.appendChild(el);
  });

  U.$('#export-dues').addEventListener('click', () => {
    const csv = U.toCSV(dues, [
      { label: 'Member ID', get: r => r.member.memberCode },
      { label: 'Name', get: r => r.member.name },
      { label: 'Phone', get: r => r.member.phone },
      { label: 'Total Open Balance', get: r => r.balance },
      { label: 'Open Transactions', get: r => r.openTxns.length },
      { label: 'Last Payment Date', get: r => r.lastPayment?.paymentDate },
      { label: 'Due Date', get: r => r.dueDate },
      { label: 'Days Overdue', get: r => r.daysOverdue }
    ]);
    U.downloadFile('dues-' + U.today() + '.csv', csv, 'text/csv');
    U.toast('CSV exported.', 'success');
  });
};
