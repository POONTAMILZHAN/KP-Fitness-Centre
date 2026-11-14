/* Members page */
window.Pages = window.Pages || {};

const MEMBER_STATE = { page: 1, search: '', statusFilter: 'all' };

Pages.members = async function (outlet, params) {
  // Sub-route: /members/{id} shows profile
  if (params && params[0]) return renderProfile(outlet, params[0]);

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Members</h1>
        <div class="sub">Manage gym members and their profiles</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="export-members">Export CSV</button>
        <button class="btn btn-primary" id="add-member">${U.icon('plus')} Add Member</button>
      </div>
    </div>

    <div class="filter-bar">
      <input class="input search-input" type="text" placeholder="Search by name, phone or member ID..." id="search-input">
      <select class="select" id="status-filter" style="max-width: 200px;">
        <option value="all">All status</option>
        <option value="Active">Active</option>
        <option value="Upcoming">Upcoming Due</option>
        <option value="Expired">Expired</option>
      </select>
    </div>

    <div class="table-wrap" id="members-table-wrap"></div>
  `;

  U.$('#add-member').addEventListener('click', () => openMemberForm());
  U.$('#export-members').addEventListener('click', exportMembersCSV);

  const searchInput = U.$('#search-input');
  const statusFilter = U.$('#status-filter');
  searchInput.value = MEMBER_STATE.search;
  statusFilter.value = MEMBER_STATE.statusFilter;
  searchInput.addEventListener('input', U.debounce(() => {
    MEMBER_STATE.search = searchInput.value.trim();
    MEMBER_STATE.page = 1;
    renderTable();
  }, 200));
  statusFilter.addEventListener('change', () => {
    MEMBER_STATE.statusFilter = statusFilter.value;
    MEMBER_STATE.page = 1;
    renderTable();
  });

  await renderTable();
};

async function renderTable() {
  const wrap = U.$('#members-table-wrap');
  const members = await DB.all('members');
  const plans = await DB.all('plans');
  const planMap = Object.fromEntries(plans.map(p => [p.id, p.name]));

  const paymentsAll = await DB.all('payments');
  const paidMap = new Map();
  paymentsAll.forEach(p => { paidMap.set(p.memberId, (paidMap.get(p.memberId) || 0) + Number(p.amount || 0)); });

  // Update statuses
  members.forEach(m => { m.status = U.memberStatus(m); });

  // Filter
  const q = MEMBER_STATE.search.toLowerCase();
  const filtered = members.filter(m => {
    if (q) {
      const hay = (m.name + ' ' + m.phone + ' ' + m.memberCode + ' ' + (m.email || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (MEMBER_STATE.statusFilter !== 'all' && m.status !== MEMBER_STATE.statusFilter) return false;
    return true;
  }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const paging = U.paginate(filtered, MEMBER_STATE.page, APP_CONFIG.defaultPageSize);

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="ico">${U.icon('users')}</div>
        <h3>No members found</h3>
        <p>${MEMBER_STATE.search ? 'Try a different search.' : 'Add your first member to get started.'}</p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="document.getElementById('add-member').click()">${U.icon('plus')} Add First Member</button>
      </div>`;
    return;
  }

  let html = `<div class="table-scroll"><table class="data-table">
    <thead><tr>
      <th>Member</th><th>Mobile</th><th>Plan</th><th>Joined</th><th>Expiry</th>
      <th class="num">Paid</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>`;

  paging.items.forEach(m => {
    const paid = paidMap.get(m.id) || 0;
    html += `<tr data-id="${m.id}">
      <td>
        <div style="display:flex; gap: 12px; align-items: center;">
          <div class="avatar sm">${m.photo ? `<img src="${m.photo}" alt="">` : U.initials(m.name)}</div>
          <div>
            <div style="font-weight: 600;">${U.escape(m.name)}</div>
            <div style="color: var(--gold); font-size: 11px; font-family: var(--font-mono);">${U.escape(m.memberCode || '')}</div>
          </div>
        </div>
      </td>
      <td>${U.escape(m.phone || '-')}</td>
      <td>${U.escape(planMap[m.planId] || '—')}</td>
      <td>${U.formatDate(m.joiningDate)}</td>
      <td>${U.formatDate(m.expiryDate)}</td>
      <td class="num">${U.money(paid)}</td>
      <td>${U.badge(m.status)}</td>
      <td>
        <div style="display:flex; gap: 6px;">
          <button class="btn btn-icon btn-ghost" title="View" data-action="view">${U.icon('eye')}</button>
          <button class="btn btn-icon btn-ghost" title="Edit" data-action="edit">${U.icon('edit')}</button>
          <button class="btn btn-icon btn-ghost" title="Collect" data-action="collect" style="color: var(--gold);">${U.icon('cash')}</button>
          <button class="btn btn-icon btn-ghost" title="Delete" data-action="delete" style="color: var(--danger);">${U.icon('trash')}</button>
        </div>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div>
    <div class="pagination">
      <div>Showing ${(paging.page - 1) * APP_CONFIG.defaultPageSize + 1}–${Math.min(paging.page * APP_CONFIG.defaultPageSize, paging.total)} of ${paging.total}</div>
      <div class="pages">
        <button id="prev" ${paging.page === 1 ? 'disabled' : ''}>‹</button>
        ${Array.from({ length: paging.pages }).map((_, i) => `<button class="${i+1===paging.page?'active':''}" data-p="${i+1}">${i+1}</button>`).join('')}
        <button id="next" ${paging.page === paging.pages ? 'disabled' : ''}>›</button>
      </div>
    </div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { MEMBER_STATE.page = Number(b.dataset.p); renderTable(); }));
  U.$('#prev')?.addEventListener('click', () => { MEMBER_STATE.page--; renderTable(); });
  U.$('#next')?.addEventListener('click', () => { MEMBER_STATE.page++; renderTable(); });

  wrap.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'view') location.hash = '#/members/' + id;
        else if (action === 'edit') openMemberForm(id);
        else if (action === 'collect') location.hash = '#/fees?member=' + id;
        else if (action === 'delete') deleteMember(id);
      });
    });
    tr.addEventListener('click', () => { location.hash = '#/members/' + id; });
    tr.style.cursor = 'pointer';
  });
}

async function openMemberForm(id) {
  const plans = await DB.all('plans');
  const member = id ? await DB.get('members', id) : {};
  const nextCode = id ? member.memberCode : await Store.nextMemberCode();
  const today = U.today();

  const body = U.el('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label class="required">Member Code</label>
        <input class="input" name="memberCode" value="${U.escape(nextCode)}" readonly></div>
      <div class="form-group"><label class="required">Full Name</label>
        <input class="input" name="name" placeholder="e.g. Rajesh Kumar" value="${U.escape(member.name || '')}" required></div>
      <div class="form-group"><label class="required">Mobile Number</label>
        <input class="input" name="phone" type="tel" placeholder="10-digit number" value="${U.escape(member.phone || '')}" required></div>
      <div class="form-group"><label>Email</label>
        <input class="input" name="email" type="email" placeholder="(optional)" value="${U.escape(member.email || '')}"></div>
      <div class="form-group"><label>Date of Birth</label>
        <input class="input" name="dob" type="date" value="${member.dob || ''}"></div>
      <div class="form-group"><label>Gender</label>
        <select class="select" name="gender">
          <option value="">Select</option>
          <option ${member.gender==='Male'?'selected':''}>Male</option>
          <option ${member.gender==='Female'?'selected':''}>Female</option>
          <option ${member.gender==='Other'?'selected':''}>Other</option>
        </select></div>
      <div class="form-group"><label>Height (cm)</label>
        <input class="input" name="height" type="number" min="0" step="0.1" placeholder="e.g. 175" value="${member.height || ''}"></div>
      <div class="form-group"><label>Weight (kg)</label>
        <input class="input" name="weight" type="number" min="0" step="0.1" placeholder="e.g. 72.5" value="${member.weight || ''}"></div>
      <div class="form-group"><label>Blood Group</label>
        <select class="select" name="bloodGroup">
          <option value="">Select</option>
          ${['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g => `<option ${member.bloodGroup===g?'selected':''}>${g}</option>`).join('')}
        </select></div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Address</label>
        <textarea class="textarea" name="address" rows="2" placeholder="Street, locality, city">${U.escape(member.address || '')}</textarea></div>
      <div class="form-group"><label class="required">Membership Plan</label>
        <select class="select" name="planId" required>
          <option value="">Choose a plan</option>
          ${plans.map(p => `<option value="${p.id}" data-months="${p.durationMonths}" data-price="${p.price}" ${p.id===member.planId?'selected':''}>${U.escape(p.name)} — ${U.money(p.price)} / ${p.durationMonths}m</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="required">Joining Date</label>
        <input class="input" name="joiningDate" type="date" value="${member.joiningDate || today}" required></div>
      <div class="form-group"><label>Expiry Date</label>
        <input class="input" name="expiryDate" type="date" value="${member.expiryDate || ''}"></div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Member Photo</label>
        <input class="input" name="photo" type="file" accept="image/*">
        <div class="help-text">Optional. Will be stored locally.</div>
        ${member.photo ? `<div style="margin-top: 10px;"><img src="${member.photo}" style="width: 72px; height: 72px; border-radius: 10px; border: 1px solid var(--gold-border);"></div>` : ''}
      </div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Notes</label>
        <textarea class="textarea" name="notes" rows="2" placeholder="Any additional notes">${U.escape(member.notes || '')}</textarea></div>
    </div>`;

  // Auto-calc expiry when plan or joining changes
  const planSel = body.querySelector('[name="planId"]');
  const joiningInp = body.querySelector('[name="joiningDate"]');
  const expiryInp = body.querySelector('[name="expiryDate"]');
  const recalc = () => {
    const opt = planSel.selectedOptions[0];
    if (!opt || !opt.dataset.months) return;
    const m = Number(opt.dataset.months);
    const start = joiningInp.value || U.today();
    expiryInp.value = U.toInputDate(U.addMonths(start, m));
  };
  planSel.addEventListener('change', recalc);
  joiningInp.addEventListener('change', recalc);
  if (!member.id) setTimeout(recalc, 10);

  let photoData = member.photo || '';
  body.querySelector('[name="photo"]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { photoData = reader.result; };
    reader.readAsDataURL(file);
  });

  const { close } = U.modal({
    title: id ? 'Edit Member' : 'Add New Member',
    size: 'lg',
    body,
    actions: [
      { label: 'Cancel', variant: 'secondary' },
      { label: id ? 'Save Changes' : 'Create Member', variant: 'primary', closeAfter: false, onClick: async () => {
        const data = Object.fromEntries(Array.from(body.querySelectorAll('[name]')).map(i => [i.name, i.value.trim()]));
        if (!data.name || !data.phone || !data.planId) { U.toast('Fill required fields.', 'error'); return; }
        const plan = plans.find(p => p.id === data.planId);
        const payload = {
          ...member,
          ...data,
          photo: photoData || member.photo || '',
          planName: plan?.name,
          planPrice: plan?.price
        };
        await Store.saveMember(payload);
        U.toast(id ? 'Member updated.' : 'Member created successfully.', 'success');
        close();
        renderTable();
      } }
    ]
  });
}

async function deleteMember(id) {
  const member = await DB.get('members', id);
  const ok = await U.confirm(`Delete member "${member.name}" and all related payments and attendance? This cannot be undone.`, 'Delete Member');
  if (!ok) return;
  await Store.deleteMember(id);
  U.toast('Member deleted.', 'success');
  renderTable();
}

async function exportMembersCSV() {
  const members = await DB.all('members');
  const plans = await DB.all('plans');
  const planMap = Object.fromEntries(plans.map(p => [p.id, p.name]));
  const paymentsAll = await DB.all('payments');
  const paidMap = new Map();
  paymentsAll.forEach(p => { paidMap.set(p.memberId, (paidMap.get(p.memberId) || 0) + Number(p.amount || 0)); });

  const csv = U.toCSV(members, [
    { label: 'Member ID', key: 'memberCode' },
    { label: 'Name', key: 'name' },
    { label: 'Phone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Plan', get: r => planMap[r.planId] || '' },
    { label: 'Joined', key: 'joiningDate' },
    { label: 'Expiry', key: 'expiryDate' },
    { label: 'Total Paid', get: r => paidMap.get(r.id) || 0 },
    { label: 'Status', get: r => U.memberStatus(r) }
  ]);
  U.downloadFile('members-' + U.today() + '.csv', csv, 'text/csv');
  U.toast('CSV exported.', 'success');
}

// --------- Profile page ---------
async function renderProfile(outlet, memberId) {
  const data = await Store.memberWithMeta(memberId);
  if (!data) {
    outlet.innerHTML = `<div class="empty-state"><div class="ico">⚠</div><h3>Member not found</h3><button class="btn btn-secondary" onclick="location.hash='#/members'">Back to Members</button></div>`;
    return;
  }
  const { member, plan, payments, totalPaid, attendance } = data;
  const status = U.memberStatus(member);

  // Lifetime billing math — each payment stands alone
  const totalBilled = payments.reduce((s, p) => s + Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0)), 0);
  const totalDiscount = payments.reduce((s, p) => s + Number(p.discount || 0), 0);
  const openBalance = payments.reduce((s, p) => {
    const net = Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0));
    return s + Math.max(0, net - Number(p.amount || 0));
  }, 0);
  const openCount = payments.filter(p => {
    const net = Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0));
    return (net - Number(p.amount || 0)) > 0;
  }).length;

  // Personal details
  const ht = Number(member.height || 0);
  const wt = Number(member.weight || 0);
  const bmi = (ht > 0 && wt > 0) ? (wt / Math.pow(ht / 100, 2)) : 0;
  const bmiLabel = bmi === 0 ? '—'
    : bmi < 18.5 ? 'Underweight'
    : bmi < 25 ? 'Normal'
    : bmi < 30 ? 'Overweight' : 'Obese';
  const bmiColor = bmi === 0 ? 'var(--text-muted)'
    : bmi < 18.5 ? 'var(--warning)'
    : bmi < 25 ? 'var(--success)'
    : bmi < 30 ? 'var(--warning)' : 'var(--danger)';
  const age = member.dob ? Math.floor((Date.now() - new Date(member.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <div class="path" style="color: var(--text-muted); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;">
          <a href="#/members" style="color: var(--text-muted);">Members</a> / ${U.escape(member.name)}
        </div>
        <h1 style="margin-top: 4px;">Member Profile</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="location.hash='#/members'">Back</button>
        <button class="btn btn-secondary" id="edit-profile">${U.icon('edit')} Edit</button>
        <button class="btn btn-primary" onclick="location.hash='#/fees?member=${member.id}'">${U.icon('cash')} Collect Fee</button>
      </div>
    </div>

    <div class="profile-hero">
      <div class="avatar xl">${member.photo ? `<img src="${member.photo}" alt="">` : U.initials(member.name)}</div>
      <div class="info">
        <h2>${U.escape(member.name)}</h2>
        <div class="id">${U.escape(member.memberCode)} · ${U.badge(status)}</div>
        <div class="meta">
          <span class="item">${U.icon('phone')} ${U.escape(member.phone || '-')}</span>
          <span class="item">${U.icon('calendar')} Joined ${U.formatDate(member.joiningDate)}</span>
          <span class="item">${U.icon('calendar')} Expires ${U.formatDate(member.expiryDate)}</span>
          ${member.email ? `<span class="item">✉ ${U.escape(member.email)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="profile-grid">
      <div class="card card-glow">
        <div class="card-head"><div><h3>Payment History</h3><div class="subtitle">${payments.length} transaction(s) · each is independent</div></div></div>
        ${payments.length === 0 ? `<div class="empty-state"><div class="ico">${U.icon('cash')}</div><h3>No payments yet</h3></div>` : `
          <div class="table-scroll"><table class="data-table">
            <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th class="num">Net Bill</th><th class="num">Received</th><th class="num">Balance</th><th></th></tr></thead>
            <tbody>
              ${payments.map(p => {
                const net = Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0));
                const received = Number(p.amount || 0);
                const bal = Math.max(0, net - received);
                return `<tr>
                  <td>${U.formatDate(p.paymentDate)}</td>
                  <td style="color: var(--gold); font-family: var(--font-mono);">${U.escape(p.receiptNo)}</td>
                  <td>${U.escape(p.paymentMethod || 'Cash')}</td>
                  <td class="num">${U.money(net)}</td>
                  <td class="num" style="color: var(--gold);">${U.money(received)}</td>
                  <td class="num" style="color: ${bal > 0 ? 'var(--danger)' : 'var(--success)'};">${U.money(bal)}</td>
                  <td><button class="btn btn-sm btn-ghost" onclick="window.printReceipt('${p.id}')">${U.icon('print')} Print</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`}
      </div>

      <div>
        <div class="card card-glow" style="margin-bottom: 16px;">
          <div class="card-head"><div><h3>Personal Details</h3><div class="subtitle">Health &amp; identity profile</div></div></div>

          ${(ht > 0 || wt > 0) ? `
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
            <div style="padding: 14px 12px; background: var(--bg-card-2); border: 1px solid var(--gold-border); border-radius: 10px; text-align: center;">
              <div style="font-size: 10px; letter-spacing: 1.5px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Height</div>
              <div style="font-family: var(--font-display); font-size: 22px; color: var(--gold); font-weight: 700;">${ht > 0 ? ht : '—'}<span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-body); margin-left: 3px;">cm</span></div>
            </div>
            <div style="padding: 14px 12px; background: var(--bg-card-2); border: 1px solid var(--gold-border); border-radius: 10px; text-align: center;">
              <div style="font-size: 10px; letter-spacing: 1.5px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Weight</div>
              <div style="font-family: var(--font-display); font-size: 22px; color: var(--gold); font-weight: 700;">${wt > 0 ? wt : '—'}<span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-body); margin-left: 3px;">kg</span></div>
            </div>
            <div style="padding: 14px 12px; background: var(--bg-card-2); border: 1px solid var(--gold-border); border-radius: 10px; text-align: center;">
              <div style="font-size: 10px; letter-spacing: 1.5px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">BMI</div>
              <div style="font-family: var(--font-display); font-size: 22px; color: ${bmiColor}; font-weight: 700;">${bmi > 0 ? bmi.toFixed(1) : '—'}</div>
              ${bmi > 0 ? `<div style="font-size: 10px; letter-spacing: 1px; color: ${bmiColor}; text-transform: uppercase; margin-top: 2px;">${bmiLabel}</div>` : ''}
            </div>
          </div>
          ` : ''}

          <div class="info-row"><span class="label">Gender</span><span class="value">${U.escape(member.gender || '—')}</span></div>
          <div class="info-row"><span class="label">Date of Birth</span><span class="value">${member.dob ? U.formatDate(member.dob) + (age !== null ? ` · ${age} yrs` : '') : '—'}</span></div>
          <div class="info-row"><span class="label">Blood Group</span><span class="value gold">${U.escape(member.bloodGroup || '—')}</span></div>
          ${member.address ? `<div class="info-row"><span class="label">Address</span><span class="value" style="text-align: right; max-width: 60%;">${U.escape(member.address)}</span></div>` : ''}
          ${member.notes ? `<div class="info-row"><span class="label">Notes</span><span class="value" style="text-align: right; max-width: 60%;">${U.escape(member.notes)}</span></div>` : ''}
        </div>

        <div class="summary-card" style="margin-bottom: 16px;">
          <h3>Account Summary</h3>
          <div class="info-row"><span class="label">Plan</span><span class="value">${U.escape(plan?.name || '—')}</span></div>
          <div class="info-row"><span class="label">Plan Price</span><span class="value">${U.money(plan?.price || 0)}</span></div>
          <div class="info-row"><span class="label">Transactions</span><span class="value">${payments.length}</span></div>
          <div class="info-row"><span class="label">Total Billed (lifetime)</span><span class="value">${U.money(totalBilled)}</span></div>
          <div class="info-row"><span class="label">Total Discount</span><span class="value" style="color: var(--warning);">${U.money(totalDiscount)}</span></div>
          <div class="info-row"><span class="label">Total Paid (lifetime)</span><span class="value gold">${U.money(totalPaid)}</span></div>
          ${openBalance > 0
            ? `<div class="info-row"><span class="label">Open Balance</span><span class="value" style="color: var(--danger);">${U.money(openBalance)} · ${openCount} txn</span></div>`
            : `<div class="info-row"><span class="label">Open Balance</span><span class="value" style="color: var(--success);">All settled</span></div>`}
        </div>

        <div class="card card-glow">
          <div class="card-head"><div><h3>Recent Attendance</h3><div class="subtitle">${attendance.length} check-in(s)</div></div></div>
          ${attendance.slice(0, 6).length === 0 ? `<div class="empty-state" style="padding:20px;"><div class="ico">${U.icon('attendance')}</div><h3>No check-ins yet</h3></div>` :
            attendance.slice(0, 8).map(a => `<div class="info-row"><span class="label">${U.formatDate(a.date)}</span><span class="value">${a.time}</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  U.$('#edit-profile').addEventListener('click', () => openMemberForm(memberId));
}

// Helper exposed for payment list print buttons — recomputes lifetime-prev at reprint time
window.printReceipt = async function (paymentId) {
  const payment = await DB.get('payments', paymentId);
  if (!payment) return;
  const member = await DB.get('members', payment.memberId);
  const plan = payment.planId ? await DB.get('plans', payment.planId) : null;
  // Previously paid = sum of this member's payments made BEFORE this one (by date + createdAt)
  const allPay = (await DB.all('payments')).filter(p => p.memberId === payment.memberId);
  const key = (p) => (p.paymentDate || '') + '|' + (p.createdAt || '');
  const thisKey = key(payment);
  const previouslyPaid = allPay.filter(p => key(p) < thisKey).reduce((s, p) => s + Number(p.amount || 0), 0);
  Pages.openReceipt({ payment, member, plan, previouslyPaid });
};
