/* Settings page */
window.Pages = window.Pages || {};

Pages.settings = async function (outlet) {
  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Settings</h1>
        <div class="sub">Manage your account and application preferences</div>
      </div>
    </div>
    <div class="settings-grid">
      <div class="settings-side">
        <div class="side-item active" data-tab="general">${U.icon('settings')}<span>General</span></div>
        <div class="side-item" data-tab="brand">${U.icon('report')}<span>Branding</span></div>
        <div class="side-item" data-tab="account">${U.icon('user')}<span>Admin Account</span></div>
        <div class="side-item" data-tab="danger">${U.icon('alert')}<span>Danger Zone</span></div>
      </div>
      <div id="settings-content"></div>
    </div>
  `;

  const render = async (tab) => {
    outlet.querySelectorAll('.side-item').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    const container = U.$('#settings-content');
    if (tab === 'general') await renderGeneral(container);
    else if (tab === 'brand') await renderBrand(container);
    else if (tab === 'account') await renderAccount(container);
    else if (tab === 'danger') await renderDanger(container);
  };
  outlet.querySelectorAll('.side-item').forEach(x => x.addEventListener('click', () => render(x.dataset.tab)));
  await render('general');
};

async function getSettings() {
  const keys = ['gymName', 'address', 'phone', 'hours'];
  const out = {};
  for (const k of keys) {
    const row = await DB.get('settings', k);
    out[k] = row?.value || '';
  }
  return out;
}

async function renderGeneral(container) {
  const s = await getSettings();
  container.innerHTML = `
    <div class="card card-glow">
      <div class="card-head"><div><h3>General Information</h3><div class="subtitle">About your gym</div></div></div>
      <div class="form-grid">
        <div class="form-group"><label>Gym Name</label><input class="input" id="s-name" value="${U.escape(s.gymName || APP_CONFIG.gymName)}"></div>
        <div class="form-group"><label>Contact Phone</label><input class="input" id="s-phone" value="${U.escape(s.phone || APP_CONFIG.phone)}"></div>
        <div class="form-group" style="grid-column: 1/-1;"><label>Address</label><textarea class="textarea" id="s-address" rows="2">${U.escape(s.address || APP_CONFIG.address)}</textarea></div>
        <div class="form-group" style="grid-column: 1/-1;"><label>Operating Hours</label><input class="input" id="s-hours" value="${U.escape(s.hours || APP_CONFIG.hoursText)}"></div>
      </div>
      <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
        <button class="btn btn-primary" id="save-general">Save Changes</button>
      </div>
    </div>
  `;
  U.$('#save-general').addEventListener('click', async () => {
    await DB.put('settings', { key: 'gymName', value: U.$('#s-name').value.trim() });
    await DB.put('settings', { key: 'phone', value: U.$('#s-phone').value.trim() });
    await DB.put('settings', { key: 'address', value: U.$('#s-address').value.trim() });
    await DB.put('settings', { key: 'hours', value: U.$('#s-hours').value.trim() });
    U.toast('General settings saved.', 'success');
  });
}

async function renderBrand(container) {
  container.innerHTML = `
    <div class="card card-glow">
      <div class="card-head"><div><h3>Brand Identity</h3><div class="subtitle">Theme preview</div></div></div>
      <div style="display: flex; gap: 24px; align-items: center; padding: 24px; background: var(--bg-card-2); border-radius: 12px;">
        <div style="width: 96px; height: 96px; border-radius: 20px; background: var(--gold-gradient); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 800; font-size: 36px; color: #1a1203; box-shadow: var(--shadow-gold-strong);">SKP</div>
        <div>
          <div style="font-family: var(--font-display); font-size: 28px; color: var(--gold-bright); letter-spacing: 1.5px;">${APP_CONFIG.gymName}</div>
          <div style="color: var(--text-secondary); font-size: 14px; margin-top: 4px;">${APP_CONFIG.address}</div>
          <div style="color: var(--gold); font-size: 13px; font-weight: 600; margin-top: 4px;">${APP_CONFIG.phone}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div><h3 style="font-size: 16px; margin-bottom: 14px; color: var(--gold);">Color Palette</h3></div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
        ${[
          ['Primary Gold', '#D4AF37'],
          ['Bright Gold', '#F5D76E'],
          ['Dark Gold', '#9C7623'],
          ['Background', '#090909'],
          ['Card', '#151515'],
          ['Sidebar', '#0D0D0D']
        ].map(([name, color]) => `
          <div style="background: var(--bg-card-2); padding: 14px; border-radius: 10px; border: 1px solid rgba(212, 175, 55, 0.15);">
            <div style="width: 100%; height: 44px; background: ${color}; border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.06);"></div>
            <div style="font-size: 11px; font-weight: 600; color: var(--text-primary);">${name}</div>
            <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${color}</div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

async function renderAccount(container) {
  const session = Auth.session();
  container.innerHTML = `
    <div class="card card-glow">
      <div class="card-head"><div><h3>Admin Account</h3><div class="subtitle">${U.escape(session.username)}</div></div></div>
      <div class="info-row"><span class="label">Username</span><span class="value">${U.escape(session.username)}</span></div>
      <div class="info-row"><span class="label">Name</span><span class="value">${U.escape(session.name)}</span></div>
      <div class="info-row"><span class="label">Role</span><span class="value">${U.escape(session.role)}</span></div>
      <div class="info-row"><span class="label">Signed in</span><span class="value">${U.formatDateTime(session.loggedInAt)}</span></div>

      <div class="divider"></div>

      <h3 style="font-size: 16px; margin-bottom: 14px; color: var(--gold);">Change Password</h3>
      <div class="form-grid">
        <div class="form-group"><label class="required">Current Password</label><input class="input" id="curr-pw" type="password"></div>
        <div class="form-group"><label class="required">New Password</label><input class="input" id="new-pw" type="password"></div>
        <div class="form-group"><label class="required">Confirm New</label><input class="input" id="new-pw2" type="password"></div>
      </div>
      <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
        <button class="btn btn-primary" id="save-pw">Update Password</button>
      </div>
    </div>
  `;
  U.$('#save-pw').addEventListener('click', async () => {
    const curr = U.$('#curr-pw').value;
    const n1 = U.$('#new-pw').value;
    const n2 = U.$('#new-pw2').value;
    if (!curr || !n1) { U.toast('Fill all fields.', 'error'); return; }
    if (n1.length < 6) { U.toast('New password must be at least 6 characters.', 'error'); return; }
    if (n1 !== n2) { U.toast('New passwords do not match.', 'error'); return; }
    try {
      await Auth.updatePassword({ currentPassword: curr, newPassword: n1 });
      U.toast('Password updated.', 'success');
      U.$('#curr-pw').value = U.$('#new-pw').value = U.$('#new-pw2').value = '';
    } catch (e) {
      U.toast(e.message || 'Update failed.', 'error');
    }
  });
}

async function renderDanger(container) {
  container.innerHTML = `
    <div class="card" style="border: 1px solid rgba(239, 83, 80, 0.3);">
      <div class="card-head" style="border-bottom-color: rgba(239, 83, 80, 0.15);"><div><h3 style="color: var(--danger);">Danger Zone</h3><div class="subtitle">Irreversible operations</div></div></div>

      <div style="padding: 18px 20px; border: 1px solid rgba(239, 83, 80, 0.25); border-radius: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Clear All Data</div>
          <div style="color: var(--text-secondary); font-size: 13px;">Removes all members, payments, attendance, expenses. Admin login is preserved.</div>
        </div>
        <button class="btn btn-danger" id="clear-data">Clear Data</button>
      </div>

      <div style="padding: 18px 20px; border: 1px solid rgba(239, 83, 80, 0.25); border-radius: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Reset Entire Application</div>
          <div style="color: var(--text-secondary); font-size: 13px;">Wipes everything — data, admin, settings. You'll need to set up again.</div>
        </div>
        <button class="btn btn-danger" id="full-reset">Full Reset</button>
      </div>
    </div>
  `;

  U.$('#clear-data').addEventListener('click', async () => {
    const ok = await U.confirm('This will permanently delete all members, payments, attendance, expenses, and plans. Your admin login will be kept. Are you sure?', 'Clear All Data');
    if (!ok) return;
    const clearStores = ['members', 'payments', 'attendance', 'expenses', 'plans'];
    for (const s of clearStores) await DB.clear(s);
    await Store.seedDefaults();
    U.toast('All data cleared.', 'success');
    setTimeout(() => location.reload(), 800);
  });

  U.$('#full-reset').addEventListener('click', async () => {
    const ok = await U.confirm('This will wipe EVERYTHING including your admin login. You will need to set up the application from scratch. Are you absolutely sure?', 'Full Application Reset');
    if (!ok) return;
    for (const s of DB.STORE_NAMES) await DB.clear(s);
    localStorage.clear();
    U.toast('Application reset. Redirecting...', 'success');
    setTimeout(() => window.location.replace('index.html'), 800);
  });
}
