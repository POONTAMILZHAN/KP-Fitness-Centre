/* Local Admin Authentication
   PBKDF2-SHA256 hashing with crypto.subtle; session persisted in localStorage
   ------------------------------------------------------------------ */
(function () {
  const Auth = {};
  const SESSION_KEY = APP_CONFIG.sessionKey;

  function enc(s) { return new TextEncoder().encode(s); }
  function buf2hex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function hex2buf(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i*2, 2), 16); return a.buffer; }

  async function hashPassword(password, saltHex) {
    const salt = saltHex ? hex2buf(saltHex) : crypto.getRandomValues(new Uint8Array(16)).buffer;
    const baseKey = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 50000, hash: 'SHA-256' }, baseKey, 256);
    return { hash: buf2hex(bits), salt: saltHex || buf2hex(salt) };
  }

  Auth.hasAdmin = async function () {
    const admins = await DB.all('admins');
    return admins.length > 0;
  };

  Auth.createAdmin = async function ({ username, password, name }) {
    if (!username || !password) throw new Error('Username and password are required.');
    const existing = await DB.getByIndex('admins', 'username', username.trim().toLowerCase());
    if (existing) throw new Error('Username already exists.');
    const { hash, salt } = await hashPassword(password);
    const admin = {
      id: DB.uid(),
      username: username.trim().toLowerCase(),
      name: name || username,
      role: 'Owner',
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString()
    };
    await DB.add('admins', admin);
    return admin;
  };

  Auth.login = async function ({ username, password }) {
    const admin = await DB.getByIndex('admins', 'username', String(username || '').trim().toLowerCase());
    if (!admin) throw new Error('Invalid username or password.');
    const { hash } = await hashPassword(password, admin.passwordSalt);
    if (hash !== admin.passwordHash) throw new Error('Invalid username or password.');
    const session = {
      adminId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  };

  Auth.session = function () {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  Auth.requireSession = function () {
    const s = Auth.session();
    if (!s) {
      window.location.replace('index.html');
      return null;
    }
    return s;
  };

  Auth.logout = function () {
    localStorage.removeItem(SESSION_KEY);
    window.location.replace('index.html');
  };

  Auth.updatePassword = async function ({ currentPassword, newPassword }) {
    const session = Auth.session();
    if (!session) throw new Error('Not logged in.');
    const admin = await DB.get('admins', session.adminId);
    if (!admin) throw new Error('Admin account not found.');
    const check = await hashPassword(currentPassword, admin.passwordSalt);
    if (check.hash !== admin.passwordHash) throw new Error('Current password is incorrect.');
    const { hash, salt } = await hashPassword(newPassword);
    admin.passwordHash = hash;
    admin.passwordSalt = salt;
    admin.updatedAt = new Date().toISOString();
    await DB.put('admins', admin);
    return true;
  };

  Auth.recoveryWipe = async function () {
    // last-resort local account recovery — clears admins so a new one can be created
    await DB.clear('admins');
    localStorage.removeItem(SESSION_KEY);
  };

  window.Auth = Auth;
})();
