/* High-level data access — business logic over IndexedDB
   -------------------------------------------------------- */
(function () {
  const Store = {};

  // ---------- Seed defaults ----------
  Store.seedDefaults = async function () {
    const plans = await DB.all('plans');
    if (plans.length === 0) {
      const base = [
        { name: 'Monthly',    durationMonths: 1,  price: 1000, description: 'One month full gym access with all equipment and services.' },
        { name: 'Quarterly',  durationMonths: 3,  price: 2700, description: '3-month plan with ₹300 savings vs monthly billing.' },
        { name: 'Half Yearly', durationMonths: 6, price: 5000, description: '6-month plan with ₹1000 savings and locker access.' },
        { name: 'Annual',     durationMonths: 12, price: 9000, description: 'Best value — 12 months with all premium facilities and personal guidance.' }
      ];
      for (const p of base) {
        await DB.add('plans', { id: DB.uid(), ...p, createdAt: new Date().toISOString() });
      }
    }
    // Settings defaults
    const taxKey = await DB.get('settings', 'gymName');
    if (!taxKey) {
      await DB.put('settings', { key: 'gymName', value: APP_CONFIG.gymName });
      await DB.put('settings', { key: 'address', value: APP_CONFIG.address });
      await DB.put('settings', { key: 'phone', value: APP_CONFIG.phone });
      await DB.put('settings', { key: 'hours', value: APP_CONFIG.hoursText });
    }
  };

  // ---------- Member code generator ----------
  Store.nextMemberCode = async function () {
    const list = await DB.all('members');
    const max = list.reduce((m, x) => {
      const n = parseInt((x.memberCode || '').replace(/[^0-9]/g, ''), 10) || 0;
      return Math.max(m, n);
    }, 0);
    return APP_CONFIG.memberCodePrefix + String(max + 1).padStart(4, '0');
  };

  Store.nextReceiptNo = async function () {
    const list = await DB.all('payments');
    const max = list.reduce((m, x) => {
      const n = parseInt((x.receiptNo || '').replace(/[^0-9]/g, ''), 10) || 0;
      return Math.max(m, n);
    }, 0);
    return APP_CONFIG.receiptPrefix + '-' + String(max + 1).padStart(5, '0');
  };

  // ---------- Members ----------
  Store.saveMember = async function (m) {
    if (!m.id) {
      m.id = DB.uid();
      m.memberCode = m.memberCode || await Store.nextMemberCode();
      m.createdAt = new Date().toISOString();
    }
    m.updatedAt = new Date().toISOString();
    m.status = U.memberStatus(m);
    await DB.put('members', m);
    return m;
  };

  Store.getMember = (id) => DB.get('members', id);
  Store.allMembers = () => DB.all('members');

  Store.memberWithMeta = async (id) => {
    const member = await DB.get('members', id);
    if (!member) return null;
    const plan = member.planId ? await DB.get('plans', member.planId) : null;
    const payments = (await DB.all('payments')).filter(p => p.memberId === id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const attendance = (await DB.all('attendance')).filter(a => a.memberId === id)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    return { member, plan, payments, totalPaid, attendance };
  };

  Store.deleteMember = async (id) => {
    await DB.remove('members', id);
    // Clean related payments and attendance
    const payments = await DB.all('payments');
    for (const p of payments) { if (p.memberId === id) await DB.remove('payments', p.id); }
    const att = await DB.all('attendance');
    for (const a of att) { if (a.memberId === id) await DB.remove('attendance', a.id); }
  };

  // ---------- Payments ----------
  Store.recordPayment = async function (p) {
    if (!p.id) {
      p.id = DB.uid();
      p.receiptNo = p.receiptNo || await Store.nextReceiptNo();
      p.createdAt = new Date().toISOString();
    }
    p.paymentDate = p.paymentDate || U.today();
    await DB.put('payments', p);
    return p;
  };

  Store.memberLedger = async (memberId) => {
    const payments = (await DB.all('payments')).filter(p => p.memberId === memberId);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalDiscount = payments.reduce((s, p) => s + Number(p.discount || 0), 0);
    const totalBilled = payments.reduce((s, p) => s + Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0)), 0);
    const totalOpenBalance = payments.reduce((s, p) => {
      const net = Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0));
      return s + Math.max(0, net - Number(p.amount || 0));
    }, 0);
    return { payments, totalPaid, totalDiscount, totalBilled, totalOpenBalance };
  };

  // ---------- Attendance ----------
  Store.checkIn = async function (memberId) {
    const now = new Date();
    const date = U.toInputDate(now);
    const time = now.toTimeString().slice(0, 5);
    // Prevent duplicate check-in on same date
    const todays = (await DB.all('attendance')).filter(a => a.memberId === memberId && a.date === date);
    if (todays.length) return { duplicate: true, record: todays[0] };
    const rec = { id: DB.uid(), memberId, date, time, type: 'checkin', createdAt: now.toISOString() };
    await DB.add('attendance', rec);
    return { duplicate: false, record: rec };
  };

  // ---------- Dues computation ----------
  // Each payment is independent. A due = any payment where Net Bill > Amount Received.
  // Members with open transaction balances show up here; their total balance is aggregated.
  Store.dueList = async function () {
    const members = await DB.all('members');
    const paymentsAll = await DB.all('payments');
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
    const byMember = new Map();

    for (const p of paymentsAll) {
      const net = Math.max(0, Number(p.totalFee || 0) - Number(p.discount || 0));
      const received = Number(p.amount || 0);
      const txnBal = net - received;
      if (txnBal <= 0) continue;
      const m = memberMap[p.memberId];
      if (!m) continue;
      if (!byMember.has(p.memberId)) byMember.set(p.memberId, { member: m, balance: 0, openTxns: [], lastPayment: null, latestDueDate: null });
      const rec = byMember.get(p.memberId);
      rec.balance += txnBal;
      rec.openTxns.push({ paymentId: p.id, receiptNo: p.receiptNo, paymentDate: p.paymentDate, netBill: net, received, balance: txnBal, validTill: p.validTill });
      if (!rec.lastPayment || (p.paymentDate || '').localeCompare(rec.lastPayment.paymentDate || '') > 0) rec.lastPayment = p;
      // Latest due date = most future validTill among open txns, else member's expiry
      const candidate = p.validTill || m.expiryDate;
      if (candidate && (!rec.latestDueDate || candidate > rec.latestDueDate)) rec.latestDueDate = candidate;
    }

    const result = Array.from(byMember.values()).map(r => {
      const dueDate = r.latestDueDate || r.member.expiryDate || r.lastPayment?.paymentDate || null;
      const daysOverdue = dueDate ? U.diffDays(dueDate, new Date()) : 0;
      return { member: r.member, balance: r.balance, openTxns: r.openTxns, dueDate, daysOverdue, lastPayment: r.lastPayment };
    });
    result.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return result;
  };

  // ---------- Dashboard metrics ----------
  Store.dashboardMetrics = async function () {
    const members = await DB.all('members');
    const payments = await DB.all('payments');
    const today = U.today();
    const now = new Date();
    const thisMonth = now.getMonth(), thisYear = now.getFullYear();

    const activeCount = members.filter(m => U.memberStatus(m) === 'Active').length;
    const totalCount = members.length;
    const newThisMonth = members.filter(m => {
      if (!m.joiningDate) return false;
      const d = new Date(m.joiningDate);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const todaysCollection = payments.filter(p => p.paymentDate === today)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const monthCollection = payments.filter(p => {
      if (!p.paymentDate) return false;
      const d = new Date(p.paymentDate);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).reduce((s, p) => s + Number(p.amount || 0), 0);

    // Pending dues
    const dues = await Store.dueList();
    const totalPending = dues.reduce((s, d) => s + d.balance, 0);

    // Expiring in next 7 days
    const expiringSoon = members.filter(m => {
      if (!m.expiryDate) return false;
      const diff = U.diffDays(new Date(), m.expiryDate);
      return diff >= 0 && diff <= 7;
    }).length;

    const attendanceToday = (await DB.all('attendance')).filter(a => a.date === today).length;

    return {
      activeCount, totalCount, newThisMonth, todaysCollection,
      monthCollection, totalPending, expiringSoon, attendanceToday,
      duesList: dues
    };
  };

  // Last N months revenue
  Store.monthlyRevenue = async function (months = 6) {
    const payments = await DB.all('payments');
    const result = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth(), year = d.getFullYear();
      const total = payments.filter(p => {
        if (!p.paymentDate) return false;
        const pd = new Date(p.paymentDate);
        return pd.getMonth() === month && pd.getFullYear() === year;
      }).reduce((s, p) => s + Number(p.amount || 0), 0);
      result.push({
        label: d.toLocaleString(APP_CONFIG.locale, { month: 'short', year: '2-digit' }),
        value: total
      });
    }
    return result;
  };

  // Last N days check-ins
  Store.dailyAttendance = async function (days = 7) {
    const att = await DB.all('attendance');
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const ds = U.toInputDate(d);
      const count = att.filter(a => a.date === ds).length;
      result.push({
        label: d.toLocaleString(APP_CONFIG.locale, { day: '2-digit', month: 'short' }),
        value: count
      });
    }
    return result;
  };

  window.Store = Store;
})();
