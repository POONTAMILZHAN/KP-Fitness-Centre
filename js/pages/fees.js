/* Fee Collection page — each payment is an independent transaction */
window.Pages = window.Pages || {};

Pages.fees = async function (outlet) {
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const preselectId = query.get('member');

  const members = (await DB.all('members')).sort((a, b) => a.name.localeCompare(b.name));
  const plans = await DB.all('plans');
  const planMap = Object.fromEntries(plans.map(p => [p.id, p]));

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Fee Collection</h1>
        <div class="sub">Record an independent payment transaction</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="location.hash='#/history'">View History</button>
      </div>
    </div>

    <div class="collect-grid">
      <div class="card card-glow">
        <div class="card-head"><div><h3>Payment Details</h3><div class="subtitle">Each entry is a standalone transaction</div></div></div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="required">Select Member</label>
          <select class="select" id="member-select" required>
            <option value="">Choose a member...</option>
            ${members.map(m => `<option value="${m.id}" ${m.id === preselectId ? 'selected' : ''}>${U.escape(m.name)} (${U.escape(m.memberCode)}) — ${U.escape(m.phone || '')}</option>`).join('')}
          </select>
        </div>

        <div id="member-context"></div>

        <div class="form-grid" style="margin-top: 16px;">
          <div class="form-group"><label>Plan</label>
            <select class="select" id="plan-select">
              <option value="">— No plan —</option>
              ${plans.map(p => `<option value="${p.id}" data-months="${p.durationMonths}" data-price="${p.price}">${U.escape(p.name)} — ${U.money(p.price)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label>Total Fee (${APP_CONFIG.currency})</label>
            <input class="input" id="total-fee" type="number" min="0" step="0.01" value="0"></div>
          <div class="form-group"><label>Discount (${APP_CONFIG.currency})</label>
            <input class="input" id="discount" type="number" min="0" step="0.01" value="0"></div>
          <div class="form-group"><label class="required">Amount Received (${APP_CONFIG.currency})</label>
            <input class="input" id="amount" type="number" min="0" step="0.01" value="0" required></div>
          <div class="form-group"><label class="required">Payment Date</label>
            <input class="input" id="payment-date" type="date" value="${U.today()}" required></div>
          <div class="form-group"><label class="required">Payment Method</label>
            <select class="select" id="method" required>
              <option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option>
            </select></div>
          <div class="form-group"><label>Valid From</label>
            <input class="input" id="cycle-start" type="date" value="${U.today()}">
            <div class="help-text">Membership start date for this payment</div></div>
          <div class="form-group"><label>Valid Till</label>
            <input class="input" id="cycle-end" type="date">
            <div class="help-text">Auto-filled from plan duration; extends member expiry if later</div></div>
          <div class="form-group" style="grid-column: 1/-1;"><label>Remarks</label>
            <input class="input" id="remarks" placeholder="(optional)"></div>
        </div>

        <div id="warn-box" class="hidden" style="margin-top: 16px; padding: 12px 14px; background: rgba(245, 166, 35, 0.08); border: 1px solid rgba(245, 166, 35, 0.3); border-radius: 10px; color: var(--warning); font-size: 13px;"></div>

        <div style="display: flex; gap: 10px; margin-top: 24px;">
          <button class="btn btn-ghost" id="clear-btn">Clear</button>
          <button class="btn btn-primary" id="save-btn" style="flex: 1;">${U.icon('cash')} Save &amp; Generate Receipt</button>
        </div>
      </div>

      <div class="summary-card">
        <h3>Transaction Summary</h3>
        <div class="amount-big" id="receive-amount">${U.money(0)}</div>
        <div style="color: var(--text-muted); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; text-align: center; margin-top: -8px; margin-bottom: 20px;">Amount Received Now</div>

        <div class="summary-breakdown">
          <div class="row"><span class="l">Total Fee</span><span class="v" id="s-fee">${U.money(0)}</span></div>
          <div class="row"><span class="l">Discount</span><span class="v" id="s-disc" style="color: var(--warning);">${U.money(0)}</span></div>
          <div class="row"><span class="l">Net Bill</span><span class="v" id="s-net">${U.money(0)}</span></div>
          <div class="row"><span class="l">Amount Received</span><span class="v gold" id="s-now">${U.money(0)}</span></div>
          <div class="row total"><span class="l">Txn Balance</span><span class="v" id="s-bal">${U.money(0)}</span></div>
        </div>

        <div class="divider" style="margin: 20px 0 16px;"></div>
        <div style="font-size: 10px; letter-spacing: 2px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Lifetime (informational)</div>
        <div class="summary-breakdown">
          <div class="row"><span class="l">Previously Paid</span><span class="v" id="s-prev">${U.money(0)}</span></div>
          <div class="row"><span class="l">After This Payment</span><span class="v gold" id="s-grand">${U.money(0)}</span></div>
        </div>
      </div>
    </div>
  `;

  const $$ = (s) => U.$(s);
  const memberSel = $$('#member-select');
  const planSel = $$('#plan-select');
  const totalFee = $$('#total-fee');
  const discount = $$('#discount');
  const amountIn = $$('#amount');
  const cycleStart = $$('#cycle-start');
  const cycleEnd = $$('#cycle-end');
  const ctx = $$('#member-context');
  const warnBox = $$('#warn-box');
  let lifetimePrev = 0;
  let currentMember = null;

  async function onMemberChange() {
    const id = memberSel.value;
    ctx.innerHTML = '';
    currentMember = null;
    lifetimePrev = 0;
    if (!id) { refreshSummary(); return; }

    const data = await Store.memberWithMeta(id);
    const { member, plan, payments } = data;
    currentMember = member;
    lifetimePrev = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Detect open transactions (unpaid balance on existing records)
    const openTxns = payments.map(p => {
      const net = Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0));
      const received = Number(p.amount || 0);
      const bal = net - received;
      return { ...p, _net: net, _received: received, _bal: bal };
    }).filter(p => p._bal > 0.005);

    const totalOpen = openTxns.reduce((s, p) => s + p._bal, 0);

    const expired = member.expiryDate && U.diffDays(new Date(), member.expiryDate) < 0;
    const expiryBadge = expired
      ? `<span class="badge danger">Expired</span>`
      : (member.expiryDate ? `<span class="badge success">Valid till ${U.formatDate(member.expiryDate)}</span>` : '');

    // Build open-balance EMI section
    const emiSection = openTxns.length > 0 ? `
      <div style="margin-top:14px; border:1px solid rgba(245,166,35,0.35); border-radius:10px; overflow:hidden;">
        <div style="padding:10px 14px; background:rgba(245,166,35,0.1); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="color:var(--warning); font-weight:700; font-size:13px;">⚠ Open Balance: ${U.money(totalOpen)}</span>
            <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">from ${openTxns.length} transaction(s)</span>
          </div>
          <span style="font-size:11px; color:var(--text-muted);">← Pay EMI here · New billing below</span>
        </div>
        ${openTxns.map((p, i) => `
          <div style="padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; justify-content:space-between;">
              <div>
                <div style="font-size:11px; color:var(--text-muted);">${U.escape(p.receiptNo)} · ${U.formatDate(p.paymentDate)}</div>
                <div style="font-size:13px; margin-top:3px;">Net Bill: <strong>${U.money(p._net)}</strong> &nbsp;·&nbsp; Paid: <strong style="color:var(--success);">${U.money(p._received)}</strong></div>
                <div style="color:var(--warning); font-weight:700; font-size:14px; margin-top:2px;">Balance due: ${U.money(p._bal)}</div>
              </div>
              <button class="btn btn-primary btn-sm pay-emi-btn" data-idx="${i}">Pay EMI</button>
            </div>
            <div class="emi-form" data-idx="${i}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.07);">
              <div class="form-grid" style="gap:10px;">
                <div class="form-group">
                  <label>Amount to Pay Now (max ${U.money(p._bal)})</label>
                  <input class="input emi-amount" type="number" min="0.01" step="0.01" placeholder="Enter amount" data-max="${p._bal}">
                </div>
                <div class="form-group">
                  <label>Payment Date</label>
                  <input class="input emi-date" type="date" value="${U.today()}">
                </div>
                <div class="form-group">
                  <label>Payment Method</label>
                  <select class="select emi-method"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option><option>Cheque</option></select>
                </div>
              </div>
              <div style="display:flex; gap:8px; margin-top:10px;">
                <button class="btn btn-primary btn-sm collect-emi-btn" data-txn-id="${p.id}" data-max="${p._bal}">Collect &amp; Receipt</button>
                <button class="btn btn-ghost btn-sm cancel-emi-btn" data-idx="${i}">Cancel</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    ctx.innerHTML = `
      <div style="padding:14px; background:rgba(212,175,55,0.04); border:1px solid var(--gold-border); border-radius:10px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <div class="avatar">${member.photo ? `<img src="${member.photo}" alt="">` : U.initials(member.name)}</div>
        <div style="flex:1; min-width:180px;">
          <div style="font-weight:600;">${U.escape(member.name)}</div>
          <div style="color:var(--text-muted); font-size:12px;">${U.escape(member.memberCode)} · ${U.escape(member.phone || '')}</div>
          <div style="margin-top:6px;">${expiryBadge}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px; letter-spacing:1.5px; color:var(--text-muted); text-transform:uppercase;">Lifetime paid</div>
          <div style="color:var(--gold); font-weight:700; font-family:var(--font-mono); font-size:18px;">${U.money(lifetimePrev)}</div>
          <div style="font-size:10px; color:var(--text-muted);">${payments.length} payment(s)</div>
        </div>
      </div>
      ${emiSection}
      ${openTxns.length > 0 ? `<div style="margin-top:16px; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px dashed rgba(255,255,255,0.1); font-size:12px; color:var(--text-muted);">↓ New billing (creates a fresh independent transaction)</div>` : ''}
    `;

    // Wire EMI buttons
    ctx.querySelectorAll('.pay-emi-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.idx;
        const form = ctx.querySelector(`.emi-form[data-idx="${idx}"]`);
        const isOpen = form.style.display !== 'none';
        ctx.querySelectorAll('.emi-form').forEach(f => { f.style.display = 'none'; });
        if (!isOpen) form.style.display = 'block';
      });
    });

    ctx.querySelectorAll('.cancel-emi-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ctx.querySelector(`.emi-form[data-idx="${btn.dataset.idx}"]`).style.display = 'none';
      });
    });

    ctx.querySelectorAll('.collect-emi-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const txnId = btn.dataset.txnId;
        const maxBal = Number(btn.dataset.max);
        const form = btn.closest('.emi-form');
        const emiAmt = Number(form.querySelector('.emi-amount').value || 0);
        const emiDate = form.querySelector('.emi-date').value;
        const emiMethod = form.querySelector('.emi-method').value;

        if (!emiAmt || emiAmt <= 0) { U.toast('Enter a valid amount.', 'error'); return; }
        if (emiAmt > maxBal + 0.01) { U.toast(`Amount exceeds remaining balance of ${U.money(maxBal)}.`, 'error'); return; }

        try {
          btn.disabled = true;
          const updatedPayment = await Store.addEmiPayment(txnId, emiAmt, { paymentDate: emiDate, paymentMethod: emiMethod });
          const memberNow = await DB.get('members', id);
          const pln = updatedPayment.planId ? planMap[updatedPayment.planId] : null;
          U.toast('EMI collected. Receipt ready.', 'success');
          Pages.openEmiReceipt({ payment: updatedPayment, member: memberNow, plan: pln, emiAmount: emiAmt });
          await onMemberChange(); // refresh to show updated balances
        } catch (e) {
          U.toast(e.message || 'EMI collection failed.', 'error');
          btn.disabled = false;
        }
      });
    });

    // Auto-populate plan for the new billing section (only if no plan pre-selected)
    if (member.planId && !planSel.value) {
      planSel.value = member.planId;
      const p = planMap[member.planId];
      if (p) {
        totalFee.value = p.price;
        if (!cycleStart.value) cycleStart.value = U.today();
        cycleEnd.value = U.toInputDate(U.addMonths(cycleStart.value, p.durationMonths));
      }
    }
    refreshSummary();
  }
  memberSel.addEventListener('change', onMemberChange);
  if (preselectId) onMemberChange();

  planSel.addEventListener('change', () => {
    const opt = planSel.selectedOptions[0];
    if (!opt || !opt.dataset.price) { refreshSummary(); return; }
    totalFee.value = opt.dataset.price;
    const months = Number(opt.dataset.months);
    if (!cycleStart.value) cycleStart.value = U.today();
    cycleEnd.value = U.toInputDate(U.addMonths(cycleStart.value, months));
    refreshSummary();
  });

  [totalFee, discount, amountIn].forEach(el => el.addEventListener('input', refreshSummary));
  cycleStart.addEventListener('change', () => {
    const opt = planSel.selectedOptions[0];
    if (opt && opt.dataset.months) cycleEnd.value = U.toInputDate(U.addMonths(cycleStart.value, Number(opt.dataset.months)));
  });

  function refreshSummary() {
    const fee = Math.max(0, Number(totalFee.value || 0));
    const disc = Math.max(0, Number(discount.value || 0));
    const net = Math.max(0, fee - disc);
    const now = Math.max(0, Number(amountIn.value || 0));
    const txnBalance = net - now; // can be negative if overpaid, positive if underpaid, 0 if exact
    const grand = lifetimePrev + now;

    $$('#receive-amount').textContent = U.money(now);
    $$('#s-fee').textContent = U.money(fee);
    $$('#s-disc').textContent = '− ' + U.money(disc);
    $$('#s-net').textContent = U.money(net);
    $$('#s-now').textContent = U.money(now);
    $$('#s-prev').textContent = U.money(lifetimePrev);
    $$('#s-grand').textContent = U.money(grand);

    const bal = $$('#s-bal');
    bal.textContent = U.money(Math.abs(txnBalance));
    if (txnBalance > 0) { bal.style.color = 'var(--warning)'; bal.previousElementSibling.textContent = 'Txn Balance (unpaid)'; }
    else if (txnBalance < 0) { bal.style.color = 'var(--danger)'; bal.previousElementSibling.textContent = 'Overpaid'; }
    else { bal.style.color = 'var(--success)'; bal.previousElementSibling.textContent = 'Fully Paid'; }

    // Warnings
    const warnings = [];
    if (disc > fee) warnings.push('Discount exceeds total fee.');
    if (fee > 0 && now > net) warnings.push(`Amount received exceeds the net bill by ${U.money(now - net)}.`);
    if (now === 0 && (fee > 0 || disc > 0)) warnings.push('Amount received is zero.');
    if (warnings.length) {
      warnBox.innerHTML = '⚠ ' + warnings.join(' · ');
      warnBox.classList.remove('hidden');
    } else warnBox.classList.add('hidden');
  }
  refreshSummary();

  $$('#clear-btn').addEventListener('click', () => {
    memberSel.value = '';
    planSel.value = '';
    totalFee.value = 0;
    discount.value = 0;
    amountIn.value = 0;
    $$('#remarks').value = '';
    $$('#payment-date').value = U.today();
    cycleStart.value = U.today();
    cycleEnd.value = '';
    ctx.innerHTML = '';
    currentMember = null;
    lifetimePrev = 0;
    refreshSummary();
  });

  $$('#save-btn').addEventListener('click', async () => {
    const memberId = memberSel.value;
    if (!memberId) { U.toast('Select a member first.', 'error'); return; }

    const fee = Math.max(0, Number(totalFee.value || 0));
    const disc = Math.max(0, Number(discount.value || 0));
    const amount = Math.max(0, Number(amountIn.value || 0));
    if (amount <= 0) { U.toast('Enter an amount greater than zero.', 'error'); return; }
    if (disc > fee) { U.toast('Discount cannot exceed total fee.', 'error'); return; }

    const planId = planSel.value || null;

    const payment = await Store.recordPayment({
      memberId,
      planId,
      totalFee: fee,
      discount: disc,
      netBill: Math.max(0, fee - disc),
      amount,
      txnBalance: Math.max(0, (fee - disc) - amount),
      paymentMethod: $$('#method').value,
      paymentDate: $$('#payment-date').value || U.today(),
      validFrom: cycleStart.value || null,
      validTill: cycleEnd.value || null,
      remarks: $$('#remarks').value || ''
    });

    // Update member — plan ref + expiry (only if Valid Till is later than existing)
    const member = await DB.get('members', memberId);
    if (planId) {
      const p = planMap[planId];
      member.planId = planId;
      member.planName = p?.name;
      member.planPrice = p?.price;
    }
    if (!member.joiningDate && cycleStart.value) member.joiningDate = cycleStart.value;
    if (cycleEnd.value && (!member.expiryDate || cycleEnd.value > member.expiryDate)) {
      member.expiryDate = cycleEnd.value;
    }
    await Store.saveMember(member);

    U.toast('Payment saved. Receipt ready.', 'success');
    const plan = planId ? planMap[planId] : null;
    Pages.openReceipt({ payment, member, plan, previouslyPaid: lifetimePrev });

    // Reset form after save
    $$('#clear-btn').click();
  });
};

// ----------- Receipt modal -----------
Pages.openReceipt = function ({ payment, member, plan, previouslyPaid = 0 }) {
  const fee = Number(payment.totalFee || 0);
  const disc = Number(payment.discount || 0);
  const net = Math.max(0, fee - disc);
  const now = Number(payment.amount || 0);
  const txnBalance = Math.max(0, net - now);
  const grandTotal = previouslyPaid + now;

  const body = U.el('div');
  body.innerHTML = `
    <div class="receipt-preview" id="receipt-root">
      <div class="receipt-head">
        <div class="brand-mark">SKP</div>
        <h2>${APP_CONFIG.gymName}</h2>
        <div class="addr">${APP_CONFIG.address}</div>
        <div class="phone">${APP_CONFIG.phone}</div>
        <div class="label">Payment Receipt</div>
      </div>

      <div class="receipt-meta">
        <div class="block"><div class="l">Receipt No.</div><div class="v">${U.escape(payment.receiptNo)}</div></div>
        <div class="block"><div class="l">Date</div><div class="v">${U.formatDate(payment.paymentDate)}</div></div>
        <div class="block"><div class="l">Member</div><div class="v">${U.escape(member?.name || '-')}</div></div>
        <div class="block"><div class="l">Member ID</div><div class="v">${U.escape(member?.memberCode || '-')}</div></div>
      </div>

      <div class="receipt-body">
        <table>
          <tr><td class="l">Plan</td><td class="v">${U.escape(plan?.name || '—')}</td></tr>
          <tr><td class="l">Payment Method</td><td class="v">${U.escape(payment.paymentMethod || 'Cash')}</td></tr>
          ${payment.validFrom ? `<tr><td class="l">Valid From</td><td class="v">${U.formatDate(payment.validFrom)}</td></tr>` : ''}
          ${payment.validTill ? `<tr><td class="l">Valid Till</td><td class="v">${U.formatDate(payment.validTill)}</td></tr>` : ''}
          <tr><td class="l">Total Fee</td><td class="v">${U.money(fee)}</td></tr>
          <tr><td class="l">Discount</td><td class="v">− ${U.money(disc)}</td></tr>
          <tr><td class="l">Net Bill</td><td class="v">${U.money(net)}</td></tr>
          <tr class="total"><td class="l">Amount Received</td><td class="v">${U.money(now)}</td></tr>
          ${txnBalance > 0 ? `<tr><td class="l">Txn Balance</td><td class="v" style="color: var(--warning);">${U.money(txnBalance)}</td></tr>` : ''}
          <tr><td class="l">Previously Paid (Lifetime)</td><td class="v">${U.money(previouslyPaid)}</td></tr>
          <tr><td class="l">Total Paid (Lifetime)</td><td class="v" style="color: var(--success);">${U.money(grandTotal)}</td></tr>
        </table>
      </div>

      <div class="receipt-footer">
        <div class="thanks">Thank You for Your Membership</div>
        <div>Stay Strong · Train Hard · Transform Your Life</div>
        <div class="hours">${APP_CONFIG.hoursText}</div>
      </div>
    </div>
  `;

  U.modal({
    title: 'Payment Receipt',
    size: 'lg',
    body,
    actions: [
      { label: 'Close', variant: 'secondary' },
      { label: 'Print Receipt', variant: 'primary', closeAfter: false, onClick: () => printReceiptRoot() }
    ]
  });
};

// EMI receipt — shows this installment and remaining balance
Pages.openEmiReceipt = function ({ payment, member, plan, emiAmount }) {
  const fee = Number(payment.totalFee || 0);
  const disc = Number(payment.discount || 0);
  const net = Math.max(0, fee - disc);
  const totalReceived = Number(payment.amount || 0);       // cumulative after this EMI
  const remaining = Math.max(0, net - totalReceived);
  const prevReceived = totalReceived - Number(emiAmount);  // before this EMI

  const body = U.el('div');
  body.innerHTML = `
    <div class="receipt-preview" id="receipt-root">
      <div class="receipt-head">
        <div class="brand-mark">SKP</div>
        <h2>${APP_CONFIG.gymName}</h2>
        <div class="addr">${APP_CONFIG.address}</div>
        <div class="phone">${APP_CONFIG.phone}</div>
        <div class="label">EMI Payment Receipt</div>
      </div>
      <div class="receipt-meta">
        <div class="block"><div class="l">Original Receipt</div><div class="v">${U.escape(payment.receiptNo)}</div></div>
        <div class="block"><div class="l">Date</div><div class="v">${U.formatDate(payment.emiHistory?.at(-1)?.paymentDate || U.today())}</div></div>
        <div class="block"><div class="l">Member</div><div class="v">${U.escape(member?.name || '-')}</div></div>
        <div class="block"><div class="l">Member ID</div><div class="v">${U.escape(member?.memberCode || '-')}</div></div>
      </div>
      <div class="receipt-body">
        <table>
          <tr><td class="l">Plan</td><td class="v">${U.escape(plan?.name || '—')}</td></tr>
          <tr><td class="l">Payment Method</td><td class="v">${U.escape(payment.emiHistory?.at(-1)?.paymentMethod || 'Cash')}</td></tr>
          <tr><td class="l">Total Fee</td><td class="v">${U.money(fee)}</td></tr>
          <tr><td class="l">Discount</td><td class="v">− ${U.money(disc)}</td></tr>
          <tr><td class="l">Net Bill</td><td class="v">${U.money(net)}</td></tr>
          <tr><td class="l">Previously Paid</td><td class="v">${U.money(prevReceived)}</td></tr>
          <tr class="total"><td class="l">This EMI Payment</td><td class="v" style="color:var(--gold);">${U.money(emiAmount)}</td></tr>
          <tr><td class="l">Total Paid So Far</td><td class="v" style="color:var(--success);">${U.money(totalReceived)}</td></tr>
          <tr><td class="l">Remaining Balance</td><td class="v" style="color:${remaining > 0 ? 'var(--warning)' : 'var(--success)'};">${remaining > 0 ? U.money(remaining) : '✓ Fully Paid'}</td></tr>
          ${payment.validFrom ? `<tr><td class="l">Valid From</td><td class="v">${U.formatDate(payment.validFrom)}</td></tr>` : ''}
          ${payment.validTill ? `<tr><td class="l">Valid Till</td><td class="v">${U.formatDate(payment.validTill)}</td></tr>` : ''}
        </table>
      </div>
      <div class="receipt-footer">
        <div class="thanks">Thank You for Your Payment</div>
        <div>Stay Strong · Train Hard · Transform Your Life</div>
        <div class="hours">${APP_CONFIG.hoursText}</div>
      </div>
    </div>`;

  U.modal({
    title: 'EMI Receipt',
    size: 'lg',
    body,
    actions: [
      { label: 'Close', variant: 'secondary' },
      { label: 'Print Receipt', variant: 'primary', closeAfter: false, onClick: () => printReceiptRoot() }
    ]
  });
};

function printReceiptRoot() {
  const receipt = document.getElementById('receipt-root');
  if (!receipt) return;
  const w = window.open('', 'receipt-print', 'width=720,height=900');
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
    <link rel="stylesheet" href="css/variables.css">
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/receipt.css">
    <style>body{background:#fff;padding:20px;color:#000;}</style>
    </head><body>${receipt.outerHTML}
    <script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},300);}</script>
    </body></html>`);
  w.document.close();
}
