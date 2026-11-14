/* Backup & Restore page — with local auto-snapshots + Google Drive sync */
window.Pages = window.Pages || {};

Pages.backup = async function (outlet) {
  const counts = {};
  for (const name of DB.STORE_NAMES.filter(n => n !== 'snapshots')) {
    counts[name] = await DB.count(name);
  }
  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  outlet.innerHTML = `
    <div class="page-head">
      <div class="page-title-block">
        <h1>Backup &amp; Restore</h1>
        <div class="sub">Auto-snapshots every 2 min · Optional Google Drive sync</div>
      </div>
    </div>

    <div class="grid-cards" style="margin-bottom: 24px;">
      <div class="metric-card"><div class="metric-icon">${U.icon('users')}</div><div class="metric-label">Members</div><div class="metric-value">${counts.members || 0}</div><div class="metric-sub">Records</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('cash')}</div><div class="metric-label">Payments</div><div class="metric-value">${counts.payments || 0}</div><div class="metric-sub">Transactions</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('attendance')}</div><div class="metric-label">Attendance</div><div class="metric-value">${counts.attendance || 0}</div><div class="metric-sub">Check-ins</div></div>
      <div class="metric-card"><div class="metric-icon">${U.icon('expense')}</div><div class="metric-label">Expenses</div><div class="metric-value">${counts.expenses || 0}</div><div class="metric-sub">Entries</div></div>
    </div>

    <!-- Row 1: Export + Restore -->
    <div class="grid-2" style="margin-bottom: 20px;">
      <div class="card card-glow">
        <div class="card-head"><div><h3>Export Data</h3><div class="subtitle">Download a full JSON backup</div></div></div>
        <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">
          Complete backup — members, plans, payments, attendance, expenses, settings. ${totalRecords} record(s) across ${DB.STORE_NAMES.filter(n=>n!=='snapshots').length} stores.
        </p>
        <button class="btn btn-primary btn-block btn-lg" id="btn-export">${U.icon('backup')} Download Backup</button>
      </div>

      <div class="card card-glow">
        <div class="card-head"><div><h3>Restore Data</h3><div class="subtitle">Import from a JSON backup file</div></div></div>
        <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">
          <span style="color: var(--warning);">This will replace all current data</span> (admin logins preserved).
        </p>
        <input type="file" id="restore-file" accept="application/json,.json" style="display: none;">
        <div id="selected-file" style="padding: 12px; background: var(--bg-input); border: 1px dashed rgba(255,255,255,0.1); border-radius: 10px; margin-bottom: 12px; color: var(--text-muted); font-size: 13px; text-align: center;">No file selected</div>
        <button class="btn btn-secondary btn-block" id="btn-select">Select Backup File</button>
        <button class="btn btn-primary btn-block" id="btn-restore" style="margin-top: 10px;" disabled>Restore Data</button>
      </div>
    </div>

    <!-- Row 2: Local snapshots + Google Drive -->
    <div class="grid-2" style="margin-bottom: 20px;">

      <!-- Local snapshots -->
      <div class="card card-glow">
        <div class="card-head">
          <div><h3>Auto Snapshots</h3><div class="subtitle">Last 3 saved locally every 2 min</div></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge badge-success" style="font-size:10px;">● Live</span>
          </div>
        </div>
        <div id="snapshot-list" style="display:flex;flex-direction:column;gap:8px;min-height:60px;">
          <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Loading snapshots…</div>
        </div>
      </div>

      <!-- Google Drive sync -->
      <div class="card card-glow">
        <div class="card-head">
          <div><h3>Google Drive Sync</h3><div class="subtitle">Cloud backup every 2 min</div></div>
          <div id="drive-status-badge"></div>
        </div>
        <div id="drive-panel"></div>
      </div>
    </div>

    <!-- Notes -->
    <div class="card" style="border-left: 4px solid var(--warning);">
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="color: var(--warning); font-size: 24px;">⚠</div>
        <div>
          <div style="color: var(--warning); font-weight: 600; margin-bottom: 4px;">Data Safety</div>
          <ul style="color: var(--text-secondary); font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Auto-snapshots are stored <strong>in this browser only</strong>. Clear browser data = lose snapshots.</li>
            <li>Google Drive backup survives browser wipes and works across devices.</li>
            <li>Download a manual backup weekly and store it safely (USB / email to yourself).</li>
            <li>Admin credentials are preserved on restore — you won't be logged out.</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  // --- Export ---
  U.$('#btn-export').addEventListener('click', async () => {
    try { await Backup.exportAll(); U.toast('Backup downloaded.', 'success'); }
    catch (e) { U.toast(e.message || 'Export failed.', 'error'); }
  });

  // --- Restore ---
  const fileInput = U.$('#restore-file');
  U.$('#btn-select').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    U.$('#selected-file').innerHTML = `<strong style="color:var(--gold);">📄 ${U.escape(file.name)}</strong> · ${(file.size / 1024).toFixed(1)} KB`;
    U.$('#btn-restore').disabled = false;
  });
  U.$('#btn-restore').addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const ok = await U.confirm('This will replace all your current data with the backup. This cannot be undone. Continue?', 'Restore Backup');
    if (!ok) return;
    try {
      const text = await file.text();
      await Backup.importAll(text, { wipe: true });
      U.toast('Restored successfully. Reloading…', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (e) { U.toast(e.message || 'Restore failed.', 'error'); }
  });

  // --- Local snapshots ---
  async function renderSnapshots() {
    const list = U.$('#snapshot-list');
    if (!list) return;
    const snaps = await Backup.getLocalSnapshots();
    if (snaps.length === 0) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">No snapshots yet — first one saves in 2 min.</div>`;
      return;
    }
    list.innerHTML = snaps.map((s, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-card-2);border-radius:8px;border:1px solid rgba(212,175,55,0.1);">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">Snapshot ${i + 1} ${i === 0 ? '<span style="color:var(--gold);font-size:10px;margin-left:6px;">LATEST</span>' : ''}</div>
          <div style="font-size:11px;color:var(--text-muted);">${U.formatDateTime(s.createdAt)} · ${(s.size / 1024).toFixed(1)} KB</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" data-snap-dl="${s.id}">↓</button>
          <button class="btn btn-danger btn-sm" data-snap-del="${s.id}">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-snap-dl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const snap = snaps.find(s => s.id === btn.dataset.snapDl);
        if (snap) Backup.downloadSnapshot(snap);
      });
    });
    list.querySelectorAll('[data-snap-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await Backup.deleteSnapshot(btn.dataset.snapDel);
        await renderSnapshots();
        U.toast('Snapshot deleted.', 'success');
      });
    });
  }
  await renderSnapshots();
  // Refresh snapshot list every minute while on this page
  const snapRefreshTimer = setInterval(renderSnapshots, 60 * 1000);
  // Clean up timer when page changes (router replaces outlet.innerHTML)
  const obs = new MutationObserver(() => { clearInterval(snapRefreshTimer); obs.disconnect(); });
  obs.observe(outlet, { childList: true });

  // --- Google Drive panel ---
  renderDrivePanel();
  GDrive.onStatus(renderDrivePanel);

  async function renderDrivePanel() {
    const panel = U.$('#drive-panel');
    const badge = U.$('#drive-status-badge');
    if (!panel || !badge) return;

    const status = GDrive.getStatus();
    const clientId = GDrive.getClientId();
    const lastAt = GDrive.getLastBackupAt();

    // Status badge
    const badgeMap = {
      unconfigured: ['badge-grey', 'Not configured'],
      ready: ['badge-warning', 'Ready'],
      pending: ['badge-warning', 'Authorizing…'],
      authorized: ['badge-success', '● Syncing'],
      error: ['badge-danger', 'Error']
    };
    const [cls, label] = badgeMap[status] || ['badge-grey', status];
    badge.innerHTML = `<span class="badge ${cls}" style="font-size:10px;">${label}</span>`;

    if (status === 'unconfigured' || !clientId) {
      panel.innerHTML = `
        <p style="color:var(--text-secondary);font-size:13px;line-height:1.7;margin-bottom:16px;">
          Connect Google Drive to automatically back up your data to the cloud every 2 minutes.
          Your data is stored privately in the app's hidden Drive folder.
        </p>
        <div style="background:rgba(212,175,55,0.07);border:1px dashed var(--gold-border);border-radius:10px;padding:14px;margin-bottom:16px;">
          <div style="font-size:11px;letter-spacing:1px;color:var(--gold);text-transform:uppercase;margin-bottom:8px;">Setup steps</div>
          <ol style="color:var(--text-secondary);font-size:12px;line-height:1.9;margin:0;padding-left:18px;">
            <li>Go to <strong style="color:var(--gold);">console.cloud.google.com</strong></li>
            <li>Create project → Enable <strong>Google Drive API</strong></li>
            <li>OAuth consent screen → External → add your email</li>
            <li>Credentials → OAuth2 Client ID → <strong>Web application</strong></li>
            <li>Add Authorized origin: <code style="color:var(--gold);">${location.origin}</code></li>
            <li>Paste the Client ID below</li>
          </ol>
        </div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Google OAuth2 Client ID</label>
        <input class="input" id="drive-client-id" placeholder="xxxx.apps.googleusercontent.com" value="${U.escape(clientId)}" style="margin-bottom:10px;">
        <button class="btn btn-primary btn-block" id="drive-save-id">Save &amp; Connect</button>
      `;
      U.$('#drive-save-id').addEventListener('click', async () => {
        const id = U.$('#drive-client-id').value.trim();
        if (!id) { U.toast('Enter a Client ID.', 'error'); return; }
        GDrive.setClientId(id);
        await GDrive.init();
        driveConnect();
      });
    } else if (status === 'ready' || status === 'error') {
      panel.innerHTML = `
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:14px;">
          Client ID configured. Click <strong>Connect</strong> to authorize access to Google Drive.
        </p>
        ${status === 'error' ? `<div style="color:var(--danger);font-size:12px;margin-bottom:12px;">Authorization failed — try again or check your Client ID.</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="drive-connect">Connect Google Drive</button>
          <button class="btn btn-secondary btn-sm" id="drive-clear-id">Change Client ID</button>
        </div>
      `;
      U.$('#drive-connect').addEventListener('click', driveConnect);
      U.$('#drive-clear-id').addEventListener('click', () => {
        GDrive.setClientId('');
        renderDrivePanel();
      });
    } else if (status === 'pending') {
      panel.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Waiting for Google sign-in popup… allow popups if prompted.</p>`;
    } else if (status === 'authorized') {
      panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(76,175,80,0.08);border:1px solid rgba(76,175,80,0.2);border-radius:10px;margin-bottom:14px;">
          <span style="font-size:22px;">☁</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--success);">Connected to Google Drive</div>
            <div style="font-size:11px;color:var(--text-muted);">Syncing every 2 minutes · Data stored in private app folder</div>
          </div>
        </div>
        ${lastAt ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Last sync: <strong>${U.formatDateTime(lastAt)}</strong></div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" id="drive-sync-now">Sync Now</button>
          <button class="btn btn-secondary btn-sm" id="drive-restore-cloud">Restore from Drive</button>
          <button class="btn btn-danger btn-sm" id="drive-disconnect">Disconnect</button>
        </div>
      `;
      U.$('#drive-sync-now').addEventListener('click', async () => {
        try {
          await GDrive.uploadBackup();
          U.toast('Synced to Google Drive.', 'success');
          renderDrivePanel();
        } catch (e) { U.toast(e.message, 'error'); }
      });
      U.$('#drive-restore-cloud').addEventListener('click', async () => {
        const ok = await U.confirm('This will download the Drive backup and restore it, replacing all current data. Continue?', 'Restore from Drive');
        if (!ok) return;
        try {
          const { text } = await GDrive.downloadFromDrive();
          await Backup.importAll(text, { wipe: true });
          U.toast('Restored from Google Drive. Reloading…', 'success');
          setTimeout(() => location.reload(), 1200);
        } catch (e) { U.toast(e.message, 'error'); }
      });
      U.$('#drive-disconnect').addEventListener('click', async () => {
        const ok = await U.confirm('Disconnect Google Drive? Auto-sync will stop. Local snapshots continue.', 'Disconnect');
        if (!ok) return;
        GDrive.signOut();
        U.toast('Disconnected from Google Drive.', 'success');
      });
    }
  }

  async function driveConnect() {
    try {
      await GDrive.authorize('');
      GDrive.startAutoSync();
      U.toast('Google Drive connected! Auto-sync started.', 'success');
    } catch (e) {
      U.toast('Drive authorization failed: ' + e.message, 'error');
    }
  }
};
