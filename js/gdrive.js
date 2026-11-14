/* Google Drive Backup Sync
   Uses Google Identity Services (GIS) for OAuth2 and fetch() for Drive API v3.

   Quick setup:
   1. Go to https://console.cloud.google.com/
   2. Create a project → APIs & Services → Enable "Google Drive API"
   3. OAuth consent screen → External → add your email as test user
   4. Credentials → Create OAuth2 Client ID → Web application
   5. Add "Authorized JavaScript origins": http://localhost:5500 (dev) + your Vercel URL
   6. Copy the Client ID → Backup page → Drive Sync → paste & save
 */
(function () {
  'use strict';

  const GDrive = {
    _token: null,
    _tokenExpiry: 0,
    _tokenClient: null,
    _status: 'unconfigured', // unconfigured | ready | pending | authorized | error
    _listeners: [],
    _pendingResolve: null,
    _pendingReject: null,
    _driveTimer: null
  };

  // ---------- Public API ----------
  GDrive.onStatus = fn => GDrive._listeners.push(fn);
  GDrive._emit = () => GDrive._listeners.forEach(fn => fn(GDrive._status));

  GDrive.getClientId = () =>
    localStorage.getItem('skpfit_gdrive_clientid') || APP_CONFIG.googleClientId || '';
  GDrive.setClientId = id => {
    if (id) localStorage.setItem('skpfit_gdrive_clientid', id);
    else localStorage.removeItem('skpfit_gdrive_clientid');
  };

  GDrive.isConfigured = () => !!GDrive.getClientId();
  GDrive.isAuthorized = () => !!GDrive._token && Date.now() < GDrive._tokenExpiry;
  GDrive.getStatus = () => GDrive._status;
  GDrive.getLastBackupAt = () => localStorage.getItem('skpfit_gdrive_last') || null;

  // ---------- Library loading ----------
  GDrive._loadGIS = function () {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load Google Identity Services. Check internet.'));
      document.head.appendChild(s);
    });
  };

  // ---------- Initialization ----------
  GDrive.init = async function () {
    const clientId = GDrive.getClientId();
    if (!clientId) { GDrive._status = 'unconfigured'; GDrive._emit(); return; }
    try {
      await GDrive._loadGIS();
      GDrive._tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: resp => {
          const resolve = GDrive._pendingResolve;
          const reject = GDrive._pendingReject;
          GDrive._pendingResolve = null;
          GDrive._pendingReject = null;
          if (resp.error) {
            GDrive._status = 'error';
            GDrive._emit();
            if (reject) reject(new Error('Drive auth failed: ' + resp.error));
          } else {
            GDrive._token = resp.access_token;
            GDrive._tokenExpiry = Date.now() + ((resp.expires_in || 3600) - 60) * 1000;
            localStorage.setItem('skpfit_gdrive_authorized', '1');
            GDrive._status = 'authorized';
            GDrive._emit();
            if (resolve) resolve(resp.access_token);
          }
        }
      });
      GDrive._status = 'ready';
      GDrive._emit();
    } catch (e) {
      console.error('[GDrive] Init failed:', e);
      GDrive._status = 'error';
      GDrive._emit();
    }
  };

  // ---------- Authorization ----------
  GDrive.authorize = function (prompt = '') {
    return new Promise((resolve, reject) => {
      if (!GDrive._tokenClient) { reject(new Error('GDrive not initialized')); return; }
      GDrive._pendingResolve = resolve;
      GDrive._pendingReject = reject;
      GDrive._status = 'pending';
      GDrive._emit();
      GDrive._tokenClient.requestAccessToken({ prompt });
    });
  };

  GDrive.signOut = function () {
    if (GDrive._token && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(GDrive._token, () => {});
    }
    GDrive._token = null;
    GDrive._tokenExpiry = 0;
    localStorage.removeItem('skpfit_gdrive_authorized');
    GDrive.stopAutoSync();
    GDrive._status = 'ready';
    GDrive._emit();
  };

  // ---------- Drive API helpers ----------
  GDrive._fetch = async function (method, path, body, params) {
    if (!GDrive.isAuthorized()) throw new Error('Not authorized with Google Drive');
    const url = new URL('https://www.googleapis.com' + path);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const opts = { method, headers: { Authorization: 'Bearer ' + GDrive._token } };
    if (body !== null && body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(url.toString(), opts);
    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.status);
      throw new Error(`Drive ${resp.status}: ${txt}`);
    }
    return resp.status === 204 ? null : resp.json();
  };

  GDrive._multipart = async function (fileId, fileName, json) {
    const boundary = 'skpfit' + Date.now();
    const meta = JSON.stringify(fileId
      ? { name: fileName }
      : { name: fileName, parents: ['appDataFolder'] }
    );
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const resp = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: 'Bearer ' + GDrive._token,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => resp.status);
      throw new Error('Drive upload failed: ' + txt);
    }
    return resp.json();
  };

  // ---------- Backup operations ----------
  GDrive.uploadBackup = async function () {
    if (!GDrive.isAuthorized()) throw new Error('Not authorized with Google Drive');
    const data = await Backup.getData();
    const json = JSON.stringify(data);

    // Find existing backup file in appDataFolder
    const list = await GDrive._fetch('GET', '/drive/v3/files', null, {
      spaces: 'appDataFolder',
      q: "name='skpfit-backup.json' and trashed=false",
      fields: 'files(id)'
    });
    const fileId = list?.files?.[0]?.id || null;
    await GDrive._multipart(fileId, 'skpfit-backup.json', json);

    const ts = new Date().toISOString();
    localStorage.setItem('skpfit_gdrive_last', ts);
    GDrive._emit(); // notify UI of updated timestamp
    return ts;
  };

  GDrive.downloadFromDrive = async function () {
    if (!GDrive.isAuthorized()) throw new Error('Not authorized with Google Drive');
    const list = await GDrive._fetch('GET', '/drive/v3/files', null, {
      spaces: 'appDataFolder',
      q: "name='skpfit-backup.json' and trashed=false",
      fields: 'files(id,name,modifiedTime)'
    });
    const file = list?.files?.[0];
    if (!file) throw new Error('No backup found in Google Drive.');
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: 'Bearer ' + GDrive._token }
    });
    if (!resp.ok) throw new Error('Drive download failed: ' + resp.status);
    return { text: await resp.text(), meta: file };
  };

  // ---------- Auto-sync ----------
  GDrive.startAutoSync = function () {
    if (GDrive._driveTimer) return;
    const run = () => {
      if (GDrive.isAuthorized()) {
        GDrive.uploadBackup().catch(e => console.warn('[GDrive AutoSync]', e.message));
      }
    };
    run(); // immediate
    GDrive._driveTimer = setInterval(run, 2 * 60 * 1000);
  };

  GDrive.stopAutoSync = function () {
    if (GDrive._driveTimer) { clearInterval(GDrive._driveTimer); GDrive._driveTimer = null; }
  };

  window.GDrive = GDrive;
})();
