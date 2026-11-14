/* Membership Plans page */
window.Pages = window.Pages || {};

Pages.plans = async function (outlet) {
  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Membership Plans</h1>
        <div class="sub">Define pricing tiers for your gym memberships</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="add-plan">${U.icon('plus')} New Plan</button>
      </div>
    </div>
    <div id="plans-area"></div>
  `;
  U.$('#add-plan').addEventListener('click', () => openPlanForm());
  await renderPlans();
};

async function renderPlans() {
  const area = U.$('#plans-area');
  const plans = await DB.all('plans');
  const members = await DB.all('members');
  const planUsage = new Map();
  members.forEach(m => { if (m.planId) planUsage.set(m.planId, (planUsage.get(m.planId) || 0) + 1); });

  if (plans.length === 0) {
    area.innerHTML = `<div class="empty-state"><div class="ico">${U.icon('plans')}</div><h3>No plans yet</h3><p>Create your first membership plan.</p></div>`;
    return;
  }

  area.innerHTML = `<div class="plans-grid">${plans.map(p => `
    <div class="plan-card">
      <div class="plan-name">${U.escape(p.name)}</div>
      <div class="plan-duration">${p.durationMonths} month${p.durationMonths > 1 ? 's' : ''}</div>
      <div class="plan-price"><span class="cur">${APP_CONFIG.currency}</span>${Number(p.price).toLocaleString(APP_CONFIG.locale)}<span class="suffix">/ period</span></div>
      <div class="plan-desc">${U.escape(p.description || '—')}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.08);">
        <span class="badge gold">${planUsage.get(p.id) || 0} member(s)</span>
      </div>
      <div class="plan-actions">
        <button class="btn btn-sm btn-secondary" data-edit="${p.id}" style="flex: 1;">${U.icon('edit')} Edit</button>
        <button class="btn btn-sm btn-ghost" data-del="${p.id}" style="color: var(--danger);">${U.icon('trash')}</button>
      </div>
    </div>`).join('')}</div>`;

  area.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openPlanForm(b.dataset.edit)));
  area.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const usedBy = planUsage.get(b.dataset.del) || 0;
    if (usedBy > 0) { U.toast(`Cannot delete — ${usedBy} member(s) are on this plan.`, 'error'); return; }
    const ok = await U.confirm('Delete this plan? This cannot be undone.', 'Delete Plan');
    if (!ok) return;
    await DB.remove('plans', b.dataset.del);
    U.toast('Plan deleted.', 'success');
    renderPlans();
  }));
}

async function openPlanForm(id) {
  const plan = id ? await DB.get('plans', id) : {};
  const body = U.el('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label class="required">Plan Name</label>
        <input class="input" name="name" value="${U.escape(plan.name || '')}" placeholder="e.g. Quarterly" required></div>
      <div class="form-group"><label class="required">Duration (months)</label>
        <input class="input" name="durationMonths" type="number" min="1" value="${plan.durationMonths || 1}" required></div>
      <div class="form-group"><label class="required">Price (${APP_CONFIG.currency})</label>
        <input class="input" name="price" type="number" min="0" value="${plan.price || 0}" required></div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Description</label>
        <textarea class="textarea" name="description" rows="3">${U.escape(plan.description || '')}</textarea></div>
    </div>
  `;
  U.modal({
    title: id ? 'Edit Plan' : 'New Membership Plan',
    size: 'md',
    body,
    actions: [
      { label: 'Cancel', variant: 'secondary' },
      { label: 'Save Plan', variant: 'primary', closeAfter: false, onClick: async ({ close }) => {
        const data = Object.fromEntries(Array.from(body.querySelectorAll('[name]')).map(i => [i.name, i.value.trim()]));
        if (!data.name || !data.durationMonths || !data.price) { U.toast('Fill required fields.', 'error'); return; }
        const payload = {
          ...(plan.id ? plan : {}),
          name: data.name,
          durationMonths: Number(data.durationMonths),
          price: Number(data.price),
          description: data.description,
          createdAt: plan.createdAt || new Date().toISOString()
        };
        await DB.put('plans', payload);
        U.toast(id ? 'Plan updated.' : 'Plan created.', 'success');
        close();
        renderPlans();
      } }
    ]
  });
}
