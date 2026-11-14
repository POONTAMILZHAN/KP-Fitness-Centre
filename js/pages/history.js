/* Payment History */
window.Pages = window.Pages || {};

const HISTORY_STATE = { page: 1, search: '', from: '', to: '' };

Pages.history = async function (outlet) {
  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Payment History</h1>
        <div class="sub">All transactions recorded in the system</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="export-pay">Export CSV</button>
      </div>
    </div>

    <div class="filter-bar">
      <input class="input search-input" type="text" placeholder="Search by member, receipt or method..." id="pay-search">
      <input class="input" type="date" id="pay-from" style="max-width: 180px;" title="From date">
      <input class="input" type="date" id="pay-to" style="max-width: 180px;" title="To date">
      <button class="btn btn-ghost btn-sm" id="pay-clear">Clear</button>
    </div>

    <div id="total-strip" class="card card-glow" style="margin-bottom: 20px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;"></div>

    <div class="table-wrap" id="pay-table-wrap"></div>
  `;

  U.$('#pay-search').addEventListener('input', U.debounce(() => { HISTORY_STATE.search = U.$('#pay-search').value; HISTORY_STATE.page = 1; render(); }, 200));
  U.$('#pay-from').addEventListener('change', () => { HISTORY_STATE.from = U.$('#pay-from').value; HISTORY_STATE.page = 1; render(); });
  U.$('#pay-to').addEventListener('change', () => { HISTORY_STATE.to = U.$('#pay-to').value; HISTORY_STATE.page = 1; render(); });
  U.$('#pay-clear').addEventListener('click', () => {
    HISTORY_STATE.search = ''; HISTORY_STATE.from = ''; HISTORY_STATE.to = ''; HISTORY_STATE.page = 1;
    U.$('#pay-search').value = ''; U.$('#pay-from').value = ''; U.$('#pay-to').value = '';
    render();
  });
  U.$('#export-pay').addEventListener('click', exportPayments);

  async function render() {
    const payments = await DB.all('payments');
    const members = await DB.all('members');
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

    const q = HISTORY_STATE.search.toLowerCase();
    const filtered = payments.filter(p => {
      const m = memberMap[p.memberId];
      if (q) {
        const hay = ((m?.name || '') + ' ' + (m?.memberCode || '') + ' ' + (p.receiptNo || '') + ' ' + (p.paymentMethod || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (HISTORY_STATE.from && p.paymentDate < HISTORY_STATE.from) return false;
      if (HISTORY_STATE.to && p.paymentDate > HISTORY_STATE.to) return false;
      return true;
    }).sort((a, b) => (b.paymentDate + b.createdAt).localeCompare(a.paymentDate + a.createdAt));

    const total = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);
    U.$('#total-strip').innerHTML = `
      <div><div style="font-size: 10px; letter-spacing: 2px; color: var(--text-muted); text-transform: uppercase;">Filtered Total</div>
      <div style="font-family: var(--font-display); font-size: 32px; color: var(--gold); font-weight: 700;">${U.money(total)}</div></div>
      <div style="color: var(--text-secondary);">${filtered.length} transaction(s)</div>
    `;

    const paging = U.paginate(filtered, HISTORY_STATE.page, APP_CONFIG.defaultPageSize);
    const wrap = U.$('#pay-table-wrap');
    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="ico">${U.icon('history')}</div><h3>No payments found</h3><p>Try adjusting filters.</p></div>`;
      return;
    }
    let html = `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>Date</th><th>Receipt</th><th>Member</th><th>Method</th><th class="num">Fee</th><th class="num">Disc</th><th class="num">Received</th><th></th></tr></thead><tbody>`;
    paging.items.forEach(p => {
      const m = memberMap[p.memberId];
      html += `<tr>
        <td>${U.formatDate(p.paymentDate)}</td>
        <td style="font-family: var(--font-mono); color: var(--gold);">${U.escape(p.receiptNo)}</td>
        <td><div style="font-weight: 600;">${U.escape(m?.name || '-')}</div><div style="font-size: 11px; color: var(--text-muted);">${U.escape(m?.memberCode || '')}</div></td>
        <td><span class="badge grey">${U.escape(p.paymentMethod || 'Cash')}</span></td>
        <td class="num">${U.money(p.totalFee || 0)}</td>
        <td class="num" style="color: var(--warning);">${U.money(p.discount || 0)}</td>
        <td class="num" style="color: var(--gold); font-weight: 700;">${U.money(p.amount)}</td>
        <td><button class="btn btn-ghost btn-sm" data-print="${p.id}">${U.icon('print')} Print</button></td>
      </tr>`;
    });
    html += `</tbody></table></div>
      <div class="pagination">
        <div>Showing ${(paging.page - 1) * APP_CONFIG.defaultPageSize + 1}–${Math.min(paging.page * APP_CONFIG.defaultPageSize, paging.total)} of ${paging.total}</div>
        <div class="pages">
          <button id="h-prev" ${paging.page === 1 ? 'disabled' : ''}>‹</button>
          ${Array.from({ length: paging.pages }).map((_, i) => `<button class="${i+1===paging.page?'active':''}" data-p="${i+1}">${i+1}</button>`).join('')}
          <button id="h-next" ${paging.page === paging.pages ? 'disabled' : ''}>›</button>
        </div>
      </div>`;
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { HISTORY_STATE.page = Number(b.dataset.p); render(); }));
    U.$('#h-prev')?.addEventListener('click', () => { HISTORY_STATE.page--; render(); });
    U.$('#h-next')?.addEventListener('click', () => { HISTORY_STATE.page++; render(); });
    wrap.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => window.printReceipt(b.dataset.print)));
  }

  async function exportPayments() {
    const payments = await DB.all('payments');
    const members = await DB.all('members');
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
    const csv = U.toCSV(payments.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || '')), [
      { label: 'Date', key: 'paymentDate' },
      { label: 'Receipt', key: 'receiptNo' },
      { label: 'Member', get: r => memberMap[r.memberId]?.name || '' },
      { label: 'Member ID', get: r => memberMap[r.memberId]?.memberCode || '' },
      { label: 'Method', key: 'paymentMethod' },
      { label: 'Total Fee', key: 'totalFee' },
      { label: 'Discount', key: 'discount' },
      { label: 'Amount', key: 'amount' },
      { label: 'Remarks', key: 'remarks' }
    ]);
    U.downloadFile('payments-' + U.today() + '.csv', csv, 'text/csv');
    U.toast('CSV exported.', 'success');
  }

  await render();
};
