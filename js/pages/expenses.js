/* Expenses page */
window.Pages = window.Pages || {};

const EXPENSE_CATEGORIES = ['Rent', 'Equipment', 'Utilities', 'Staff Salary', 'Maintenance', 'Supplies', 'Marketing', 'Other'];

Pages.expenses = async function (outlet) {
  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Expenses</h1>
        <div class="sub">Track your gym operational expenses</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="export-exp">Export CSV</button>
        <button class="btn btn-primary" id="add-exp">${U.icon('plus')} New Expense</button>
      </div>
    </div>

    <div class="grid-cards" id="exp-stats" style="margin-bottom: 20px;"></div>

    <div class="table-wrap" id="exp-table"></div>
  `;
  U.$('#add-exp').addEventListener('click', () => openExpenseForm());
  U.$('#export-exp').addEventListener('click', exportExpenses);
  await refresh();
};

async function refresh() {
  const all = await DB.all('expenses');
  const now = new Date();
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-01`;
  const thisYearStart = `${now.getFullYear()}-01-01`;
  const total = all.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthTotal = all.filter(e => e.date >= thisMonthStart).reduce((s, e) => s + Number(e.amount || 0), 0);
  const yearTotal = all.filter(e => e.date >= thisYearStart).reduce((s, e) => s + Number(e.amount || 0), 0);

  U.$('#exp-stats').innerHTML = `
    <div class="metric-card"><div class="metric-icon">${U.icon('expense')}</div><div class="metric-label">This Month</div><div class="metric-value gold">${U.money(monthTotal)}</div><div class="metric-sub">Current month expenses</div></div>
    <div class="metric-card"><div class="metric-icon">${U.icon('calendar')}</div><div class="metric-label">This Year</div><div class="metric-value">${U.money(yearTotal)}</div><div class="metric-sub">Year-to-date</div></div>
    <div class="metric-card"><div class="metric-icon">${U.icon('history')}</div><div class="metric-label">All Time</div><div class="metric-value">${U.money(total)}</div><div class="metric-sub">${all.length} entries</div></div>
  `;

  const wrap = U.$('#exp-table');
  if (all.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="ico">${U.icon('expense')}</div><h3>No expenses recorded</h3><p>Start tracking your gym operational costs.</p></div>`;
    return;
  }
  const sorted = all.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  let html = `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead><tbody>`;
  sorted.forEach(e => {
    html += `<tr>
      <td>${U.formatDate(e.date)}</td>
      <td><span class="badge gold">${U.escape(e.category || 'Other')}</span></td>
      <td>${U.escape(e.description || '-')}</td>
      <td class="num" style="color: var(--danger); font-weight: 700;">${U.money(e.amount)}</td>
      <td style="text-align: right;">
        <button class="btn btn-sm btn-ghost" data-edit="${e.id}">${U.icon('edit')}</button>
        <button class="btn btn-sm btn-ghost" style="color: var(--danger);" data-del="${e.id}">${U.icon('trash')}</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openExpenseForm(b.dataset.edit)));
  wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const ok = await U.confirm('Delete this expense entry?', 'Delete Expense');
    if (!ok) return;
    await DB.remove('expenses', b.dataset.del);
    U.toast('Expense deleted.', 'success');
    refresh();
  }));
}

async function openExpenseForm(id) {
  const exp = id ? await DB.get('expenses', id) : {};
  const body = U.el('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label class="required">Date</label>
        <input class="input" name="date" type="date" value="${exp.date || U.today()}" required></div>
      <div class="form-group"><label class="required">Category</label>
        <select class="select" name="category" required>
          ${EXPENSE_CATEGORIES.map(c => `<option ${exp.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="required">Amount (${APP_CONFIG.currency})</label>
        <input class="input" name="amount" type="number" min="0" value="${exp.amount || ''}" required></div>
      <div class="form-group"><label>Paid To / Vendor</label>
        <input class="input" name="vendor" value="${U.escape(exp.vendor || '')}" placeholder="(optional)"></div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Description</label>
        <textarea class="textarea" name="description" rows="2" placeholder="Brief description">${U.escape(exp.description || '')}</textarea></div>
    </div>
  `;
  U.modal({
    title: id ? 'Edit Expense' : 'New Expense',
    body,
    actions: [
      { label: 'Cancel', variant: 'secondary' },
      { label: 'Save', variant: 'primary', closeAfter: false, onClick: async ({ close }) => {
        const data = Object.fromEntries(Array.from(body.querySelectorAll('[name]')).map(i => [i.name, i.value.trim()]));
        if (!data.date || !data.category || !data.amount) { U.toast('Fill required fields.', 'error'); return; }
        const payload = { ...(exp.id ? exp : {}), ...data, amount: Number(data.amount), createdAt: exp.createdAt || new Date().toISOString() };
        if (!payload.id) payload.id = DB.uid();
        await DB.put('expenses', payload);
        U.toast('Expense saved.', 'success');
        close();
        refresh();
      } }
    ]
  });
}

async function exportExpenses() {
  const all = await DB.all('expenses');
  const csv = U.toCSV(all.sort((a,b) => (b.date||'').localeCompare(a.date||'')), [
    { label: 'Date', key: 'date' },
    { label: 'Category', key: 'category' },
    { label: 'Vendor', key: 'vendor' },
    { label: 'Description', key: 'description' },
    { label: 'Amount', key: 'amount' }
  ]);
  U.downloadFile('expenses-' + U.today() + '.csv', csv, 'text/csv');
  U.toast('CSV exported.', 'success');
}
