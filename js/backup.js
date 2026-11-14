/* JSON Backup & Restore + Local Snapshots + Auto-Backup
   ------------------------------------------------------- */
(function () {
  const DATA_STORES = () => DB.STORE_NAMES.filter(n => n !== 'snapshots');

  const Backup = {};

  Backup.getData = async function () {
    const data = {
      meta: { app: APP_CONFIG.gymName, version: APP_CONFIG.buildVersion, generatedAt: new Date().toISOString() },
      stores: {}
    };
    for (const name of DATA_STORES()) {
      data.stores[name] = await DB.all(name);
    }
    return data;
  };

  Backup.exportAll = async function () {
    const data = await Backup.getData();
    const json = JSON.stringify(data, null, 2);
    const filename = `sri-kp-fitness-backup-${U.toInputDate(new Date())}.json`;
    U.downloadFile(filename, json);
    return data;
  };

  Backup.importAll = async function (jsonText, { wipe = true } = {}) {
    let data;
    try { data = JSON.parse(jsonText); } catch (e) { throw new Error('Invalid JSON backup file.'); }
    if (!data.stores) throw new Error('Backup file is missing required structure.');
    if (wipe) {
      for (const name of DATA_STORES()) {
        if (name === 'admins') continue;
        await DB.clear(name);
      }
    }
    for (const name of DATA_STORES()) {
      if (!data.stores[name]) continue;
      if (name === 'admins' && wipe) continue;
      for (const row of data.stores[name]) { await DB.put(name, row); }
    }
    return true;
  };

  // ---------- Local Snapshots (stored in IndexedDB 'snapshots' store) ----------
  Backup.saveLocalSnapshot = async function () {
    const data = await Backup.getData();
    const json = JSON.stringify(data);
    const snap = { id: DB.uid(), createdAt: new Date().toISOString(), size: json.length, json };
    await DB.put('snapshots', snap);
    // Keep only last 3 snapshots
    const all = (await DB.all('snapshots')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (let i = 3; i < all.length; i++) await DB.remove('snapshots', all[i].id);
    return snap;
  };

  Backup.getLocalSnapshots = async function () {
    return (await DB.all('snapshots')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  Backup.downloadSnapshot = function (snap) {
    const dt = snap.createdAt.slice(0, 19).replace('T', '_').replace(/:/g, '-');
    U.downloadFile(`skpfit-backup-${dt}.json`, snap.json);
  };

  Backup.deleteSnapshot = async function (id) {
    await DB.remove('snapshots', id);
  };

  // ---------- Auto-backup (runs every 2 minutes) ----------
  Backup._autoTimer = null;

  Backup.startAutoBackup = function () {
    if (Backup._autoTimer) return;
    const run = () => Backup.saveLocalSnapshot().catch(e => console.warn('[AutoBackup]', e));
    run(); // immediate first run
    Backup._autoTimer = setInterval(run, 2 * 60 * 1000);
  };

  window.Backup = Backup;
})();
