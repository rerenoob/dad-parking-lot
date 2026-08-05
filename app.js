// Quản Lý Bãi Xe — Bãi xe Thành Dương
// Supabase + Auth version

// ===== Supabase Client =====
const SUPABASE_URL = 'https://wgtkiapaxdrnhontmkux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndndGtpYXBheGRybmhvbnRta3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDU0NTIsImV4cCI6MjA5MjU4MTQ1Mn0._w6P1xYbPN27famcr-csw9okcAyByx48IHNyzX-3peY';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Currency Input Helpers =====
function formatComma(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function initCurrencyInput(id) {
  const el = document.getElementById(id);
  if (!el || el._currencyInit) return;
  el._currencyInit = true;
  // Format on input
  el.addEventListener('input', () => {
    const raw = el.value.replace(/[^0-9]/g, '');
    const pos = el.selectionStart;
    const oldLen = el.value.length;
    el.value = raw ? formatComma(parseInt(raw)) : '';
    // Restore cursor roughly
    const newLen = el.value.length;
    el.selectionStart = el.selectionEnd = pos + (newLen - oldLen);
  });
  // Format on blur
  el.addEventListener('blur', () => {
    const raw = el.value.replace(/[^0-9]/g, '');
    el.value = raw ? formatComma(parseInt(raw)) : '';
  });
}

function setCurrencyValue(id, num) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = num ? formatComma(parseInt(num)) : '';
}

function getCurrencyValue(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return parseInt(el.value.replace(/[^0-9]/g, '')) || 0;
}

// ===== State =====
let state = {
  customers: [],
  settings: {
    monthly_rate: 0,
    total_spots: 30,
    reminder_days: 3
  },
  user: null,
  currentPage: 'customers',
  loading: false,
  filterActive: null,
  showInactive: false
};

// ===== Auth =====
async function initAuth() {
  // If user didn't check "stay logged in", clear session on fresh page load
  if (localStorage.getItem('stayLoggedIn') === '0') {
    localStorage.removeItem('stayLoggedIn');
    try { await db.auth.signOut(); } catch (_) {}
  }
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
      state.user = session.user;
      showApp();
      await initApp();
    } else {
      showAuth();
    }
  } catch (e) {
    console.error('initAuth error:', e);
    showAuth();
  }

  db.auth.onAuthStateChange((event, session) => {
    if (session && !state.user) {
      state.user = session.user;
      showApp();
      initApp();
    } else if (!session && state.user) {
      state.user = null;
      showAuth();
      state.customers = [];
    }
  });
}

function showAuth() {
  document.getElementById('authScreen').classList.remove('hide');
  document.getElementById('appScreen').classList.remove('show');
}

function showApp() {
  document.getElementById('authScreen').classList.add('hide');
  document.getElementById('appScreen').classList.add('show');
}

function toggleLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang xử lý...';
  } else {
    btn.disabled = false;
    const isLogin = btn.id === 'loginBtn';
    btn.textContent = isLogin ? 'Đăng nhập' : 'Đăng ký';
  }
}

function setAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
  document.getElementById('authSuccess').classList.remove('show');
}

function setAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  el.textContent = msg;
  el.classList.add('show');
  document.getElementById('authError').classList.remove('show');
}

function clearAuthMessages() {
  document.getElementById('authError').classList.remove('show');
  document.getElementById('authSuccess').classList.remove('show');
}

async function handleLogin() {
  const input = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const stayLoggedIn = document.getElementById('stayLoggedIn').checked;
  if (!input || !password) { setAuthError('Vui lòng nhập tên đăng nhập và mật khẩu'); return; }
  clearAuthMessages();
  const btn = document.getElementById('loginBtn');
  toggleLoading(btn, true);

  let email = input;
  if (!input.includes('@')) {
    // Username → email lookup (profiles table has public select policy)
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('email')
      .eq('username', input.toLowerCase())
      .maybeSingle();
    if (profileError || !profile || !profile.email) {
      toggleLoading(btn, false);
      setAuthError('Không tìm thấy tên đăng nhập. Thử lại hoặc đăng ký tài khoản mới.');
      return;
    }
    email = profile.email;
  }

  const { error } = await db.auth.signInWithPassword({ email, password });
  toggleLoading(btn, false);
  if (!error) {
    localStorage.setItem('stayLoggedIn', stayLoggedIn ? '1' : '0');
  }
  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      setAuthError('Sai tên đăng nhập hoặc mật khẩu. Thử lại hoặc đăng ký tài khoản mới.');
    } else {
      setAuthError(error.message);
    }
  }
}

async function handleSignUp() {
  const username = document.getElementById('signupUsername').value.trim().toLowerCase();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  if (!username) { setAuthError('Vui lòng nhập tên đăng nhập'); return; }
  if (!email || !password) { setAuthError('Vui lòng nhập email và mật khẩu'); return; }
  if (password.length < 6) { setAuthError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
  clearAuthMessages();
  const btn = document.getElementById('signupBtn');
  toggleLoading(btn, true);
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) {
    toggleLoading(btn, false);
    setAuthError(error.message);
    return;
  }
  // Save username + email to profiles
  if (data.user) {
    const { error: profileError } = await db.from('profiles').insert({ user_id: data.user.id, username, email });
    if (profileError) {
      toggleLoading(btn, false);
      setAuthError('Tên đăng nhập đã tồn tại hoặc có lỗi khi tạo tài khoản. Vui lòng chọn tên khác.');
      return;
    }
  }
  toggleLoading(btn, false);
  setAuthSuccess('Đăng ký thành công! Kiểm tra email để xác nhận tài khoản.');
  setTimeout(() => showLogin(), 3000);
}

async function handleLogout() {
  localStorage.removeItem('stayLoggedIn');
  await db.auth.signOut();
}

function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('signupForm').style.display = 'none';
  clearAuthMessages();
}

function showSignUp() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'block';
  clearAuthMessages();
}

// ===== Data Loading =====
async function initApp() {
  switchPage('customers');
  state.loading = true;
  document.getElementById('customerList').innerHTML = '<div class="loading-text"><span class="spinner"></span> Đang tải dữ liệu...</div>';
  try {
    await Promise.all([loadCustomers(), loadSettings()]);
    initCurrencyInput('monthlyRate');
    renderAll();
  } catch (e) {
    console.error('Error loading data:', e);
    showToast('⚠️ Lỗi tải dữ liệu từ máy chủ');
  }
  state.loading = false;
}

async function loadCustomers() {
  const { data, error } = await db
    .from('customers')
    .select('*')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const customerIds = (data || []).map(c => c.id);
  let paymentsMap = {};
  if (customerIds.length > 0) {
    const { data: payments, error: payError } = await db
      .from('payments')
      .select('*')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: true });
    if (!payError && payments) {
      payments.forEach(p => {
        if (!paymentsMap[p.customer_id]) paymentsMap[p.customer_id] = [];
        paymentsMap[p.customer_id].push(p);
      });
      Object.keys(paymentsMap).forEach(cid => {
        paymentsMap[cid].sort((a, b) => new Date(a.payment_date || a.created_at) - new Date(b.payment_date || b.created_at));
      });
    }
  }

  const now = new Date().toISOString();
  state.customers = (data || []).map(c => {
    const payments = paymentsMap[c.id] || [];
    // Auto-fix: customers with no payments should have null lastPaymentDate
    let lpd = c.last_payment_date;
    if (payments.length === 0 && lpd) {
      lpd = null;
      // Fire and forget — fix DB in background
      db.from('customers').update({ last_payment_date: null }).eq('id', c.id).eq('user_id', state.user.id).then(() => {}).catch(() => {});
    }
    return {
      id: c.id, name: c.name, phone: c.phone || '', plate: c.plate,
      vehicle: c.vehicle || '', spot: c.spot || '',
      monthlyFee: c.monthly_fee || 0, notes: c.notes || '',
      lastPaymentDate: lpd, billingDay: c.billing_day || null, createdAt: c.created_at, payments,
      contactZalo: c.contact_zalo || false,
      active: c.active !== false
    };
  });
}

async function loadSettings() {
  const { data, error } = await db
    .from('settings')
    .select('*')
    .eq('user_id', state.user.id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (data) {
    state.settings = {
      monthly_rate: data.monthly_rate || 0,
      total_spots: data.total_spots || 30,
      reminder_days: data.reminder_days || 3
    };
  }
}

async function saveSettingsToDB() {
  const { error } = await db
    .from('settings')
    .upsert({
      user_id: state.user.id,
      monthly_rate: state.settings.monthly_rate,
      total_spots: state.settings.total_spots,
      reminder_days: state.settings.reminder_days
    }, { onConflict: 'user_id' });
  if (error) { console.error('Error saving settings:', error); showToast('⚠️ Lỗi lưu cài đặt — thử lại sau'); }
}

// ===== Customer CRUD =====
async function addCustomer(data) {
  const { data: result, error } = await db
    .from('customers')
    .insert({
      user_id: state.user.id,
      name: data.name,
      phone: data.phone,
      plate: data.plate.toUpperCase(),
      vehicle: data.vehicle || '',
      spot: data.spot || '',
      monthly_fee: data.monthlyFee || state.settings.monthly_rate,
      notes: data.notes || '',
      last_payment_date: data.lastPaymentDate || null,
      billing_day: data.billingDay || null,
      contact_zalo: data.contactZalo || false
    })
    .select()
    .single();
  if (error) { showToast('⚠️ Lỗi: ' + error.message); return false; }

  state.customers.unshift({
    id: result.id,
    name: result.name,
    phone: result.phone || '',
    plate: result.plate,
    vehicle: result.vehicle || '',
    spot: result.spot || '',
    monthlyFee: result.monthly_fee || 0,
    notes: result.notes || '',
    lastPaymentDate: result.last_payment_date,
    billingDay: result.billing_day || null,
    createdAt: result.created_at,
    payments: [],
    contactZalo: result.contact_zalo || false,
    active: true
  });
  renderAll();
  showToast('✅ Đã thêm khách hàng');
  return true;
}

async function updateCustomer(id, data) {
  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.plate !== undefined) updateData.plate = data.plate;
  if (data.vehicle !== undefined) updateData.vehicle = data.vehicle;
  if (data.spot !== undefined) updateData.spot = data.spot;
  if (data.monthlyFee !== undefined) updateData.monthly_fee = data.monthlyFee;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.lastPaymentDate !== undefined) updateData.last_payment_date = data.lastPaymentDate;
  if (data.contactZalo !== undefined) updateData.contact_zalo = data.contactZalo;
  if (data.billingDay !== undefined) updateData.billing_day = data.billingDay;
  if (data.active !== undefined) updateData.active = data.active;

  const { error } = await db
    .from('customers')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', state.user.id);
  if (error) { showToast('⚠️ Lỗi: ' + error.message); return; }

  const idx = state.customers.findIndex(c => c.id === id);
  if (idx !== -1) Object.assign(state.customers[idx], data);
  renderAll();
  showToast('✅ Đã cập nhật');
}

async function deactivateCustomer(id) {
  await updateCustomer(id, { active: false });
  closeModal2();
  showToast('⏸️ Đã đánh dấu tạm nghỉ');
}

async function reactivateCustomer(id) {
  await updateCustomer(id, { active: true });
  closeModal2();
  showToast('🔄 Đã kích hoạt lại');
}

async function deleteCustomer(id) {
  const { error } = await db
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('user_id', state.user.id);
  if (error) { showToast('⚠️ Lỗi: ' + error.message); return; }

  state.customers = state.customers.filter(c => c.id !== id);
  renderAll();
  showToast('🗑️ Đã xóa');
}

async function recordPayment(customerId, amount, method, note, paymentDate, monthsCovered) {
  const payDate = paymentDate || new Date().toISOString().split('T')[0];
  const months = parseInt(monthsCovered) || 1;
  const { data: payment, error: payError } = await db
    .from('payments')
    .insert({
      customer_id: customerId,
      amount: amount,
      method: method || 'Tiền mặt',
      note: note || '',
      payment_date: payDate,
      months_covered: months
    })
    .select()
    .single();
  if (payError) { showToast('⚠️ Lỗi: ' + payError.message); return false; }

  const c = state.customers.find(c => c.id === customerId);
  if (c) {
    if (!c.payments) c.payments = [];
    c.payments.push({
      id: payment.id,
      customer_id: customerId,
      amount,
      method: method || 'Tiền mặt',
      note: note || '',
      payment_date: payDate,
      months_covered: months,
      created_at: payment.created_at
    });
    c.payments.sort((a, b) => new Date(a.payment_date || a.created_at) - new Date(b.payment_date || b.created_at));
  }
  await recalcLastPaymentDate(customerId);
  renderAll();
  showToast('💰 Đã ghi nhận thanh toán');
  return true;
}

// Fixed billing-day anchor (day-of-month of first payment). Immutable — never overwritten.
const GRACE_DAYS = 5;   // lenient; hardcoded
const LATE_WINDOW = 6;  // periods considered for the repeat badge

function getBillingDay(customer) {
  if (customer.billingDay) return customer.billingDay;
  const pays = customer.payments || [];
  const first = pays[0];
  if (first) { const d = parseDateNoTz(first.payment_date); if (d) return d.getDate(); }
  if (customer.lastPaymentDate) { const d = new Date(customer.lastPaymentDate); if (!isNaN(d.getTime())) return d.getDate(); }
  return 1;
}

function getPeriodsCovered(customer) {
  return (customer.payments || []).reduce((n, p) => n + (p.months_covered || 1), 0);
}

// Due date of the k-th billing period after the first payment (0-indexed).
// Target month is computed first, then the billing day is clamped to THAT month's length
// (so a day-31 anchor doesn't get permanently downgraded just because the base month was short).
function getDueDateForPeriod(customer, k) {
  const pays = customer.payments || [];
  const first = pays[0];
  if (!first) return null;
  const base = parseDateNoTz(first.payment_date);
  if (!base) return null;
  const target = new Date(base.getFullYear(), base.getMonth() + k, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(getBillingDay(customer), maxDay));
  return target;
}

// THE key function: due date of the first period NOT yet covered by payments.
// Falls back to the old rolling (lastPaymentDate + 1 month) calc for customers with no
// payment rows yet (e.g. a manually-edited lastPaymentDate before any recordPayment call).
function getNextDueDateObj(customer) {
  const pays = customer.payments || [];
  if (pays.length === 0) {
    if (!customer.lastPaymentDate) return null;
    const last = new Date(customer.lastPaymentDate);
    return isNaN(last.getTime()) ? null : addMonths(last, 1);
  }
  return getDueDateForPeriod(customer, getPeriodsCovered(customer));
}

// Repeat-offender count: how many of the last LATE_WINDOW periods were settled > GRACE_DAYS late.
function getLateCount(customer) {
  if (customer.active === false) return 0; // Tạm nghỉ excluded
  const pays = customer.payments || [];
  if (pays.length === 0) return 0;
  let covered = 0;
  const lateness = [];
  for (const p of pays) {
    const paidOn = parseDateNoTz(p.payment_date);
    for (let i = 0; i < (p.months_covered || 1); i++) {
      const due = getDueDateForPeriod(customer, covered++);
      if (due) lateness.push(Math.round((paidOn - due) / 86400000));
    }
  }
  return lateness.slice(-LATE_WINDOW).filter(d => d > GRACE_DAYS).length;
}

// ===== Computed =====
function getDueStatus(customer) {
  if (!customer.lastPaymentDate && !(customer.payments && customer.payments.length > 0)) return 'no-data';
  const daysUntilDue = getDaysUntilDue(customer);
  if (daysUntilDue > state.settings.reminder_days) return 'active';
  if (daysUntilDue > 0) return 'due-soon';
  if (daysUntilDue > -30) return 'overdue';
  return 'expired';
}

function getStatusText(status) {
  const map = { 'active': 'Còn hạn', 'no-data': 'Chưa xác định', 'due-soon': 'Sắp hết hạn', 'overdue': 'Quá hạn', 'expired': 'Hết hạn', 'inactive': 'Tạm nghỉ' };
  return map[status] || status;
}

function getStatusBadgeClass(status) {
  const map = { 'active': 'status-active', 'no-data': 'status-expired', 'due-soon': 'status-due-soon', 'overdue': 'status-overdue', 'expired': 'status-expired', 'inactive': 'status-inactive' };
  return map[status] || '';
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  const m = (months === undefined || months === null) ? 1 : months;
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, maxDay));
  return d;
}

function getDateFromDropdowns(prefix) {
  const d = document.getElementById(prefix + 'Day').value;
  const m = document.getElementById(prefix + 'Month').value;
  const y = document.getElementById(prefix + 'Year').value;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function localDateToISO(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

function formatCurrency(amount) {
  if (!amount) return '0 ₫';
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ₫';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${mon}/${d.getFullYear()}`;
}

// Parse YYYY-MM-DD without UTC shift (avoids off-by-one in local timezones)
function parseDateNoTz(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// Format YYYY-MM-DD string directly as DD/MM/YYYY without constructing a Date
function formatDateStr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function getNextDueDate(customer) {
  const next = getNextDueDateObj(customer);
  if (!next) return 'Chưa xác định';
  return formatDate(next.toISOString());
}

function getDaysUntilDue(customer) {
  const next = getNextDueDateObj(customer);
  if (!next) return 0;
  const now = new Date();
  // floor both sides to local midnight to avoid time-of-day rollover
  const a = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

// Show the red Quá hạn/Hết hạn pill the moment the first uncovered due date is ANY days
// in the past (daysUntilDue < 0). No grace window on the visible status: if you're late,
// you show red immediately. (The GRACE_DAYS tolerance still applies to the repeat-offender
// badge in getLateCount().)
// If the due date can't be determined (missing/corrupt payment_date), keep the red pill
// rather than silently downgrading an unknown to "Còn hạn".
function shouldShowOverduePill(customer) {
  const next = getNextDueDateObj(customer);
  if (!next || isNaN(next.getTime())) return true;
  return getDaysUntilDue(customer) < 0;
}

// Render-status for the pill: inactive customers always read "Tạm nghỉ". A customer whose
// due date is in the past shows red Quá hạn/Hết hạn immediately (no grace window).
// getDueStatus() itself is left unchanged (filtering/stats still use it).
function getPillStatus(customer) {
  if (customer.active === false) return 'inactive';
  const status = getDueStatus(customer);
  if ((status === 'overdue' || status === 'expired') && !shouldShowOverduePill(customer)) {
    return 'active';
  }
  return status;
}

// ===== Rendering =====
function renderAll() {
  renderCustomers();
  renderStats();
  renderHistory();
  updateSettingsPage();
}

function renderCustomers() {
  const query = (document.getElementById('searchInput').value || '').toLowerCase();
  const list = document.getElementById('customerList');
  let customers = state.customers;
  if (!state.showInactive) {
    customers = customers.filter(c => c.active !== false);
  }
  if (query) {
    customers = customers.filter(c =>
      (c.plate || '').toLowerCase().includes(query) ||
      (c.name || '').toLowerCase().includes(query) ||
      (c.phone || '').includes(query) ||
      (c.vehicle || '').toLowerCase().includes(query)
    );
  }
  if (state.filterActive) {
    if (state.filterActive === 'active') {
      customers = customers.filter(c => getDueStatus(c) === 'active');
    } else if (state.filterActive === 'due-soon') {
      customers = customers.filter(c => getDueStatus(c) === 'due-soon');
    } else if (state.filterActive === 'overdue') {
      customers = customers.filter(c => ['overdue', 'expired'].includes(getDueStatus(c)));
    }
  }
  if (customers.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🚗</div><p>${query ? 'Không tìm thấy' : 'Chưa có khách hàng nào'}</p></div>`;
    return;
  }
  list.innerHTML = customers.map(c => {
    const status = getPillStatus(c);
    const daysNum = getDaysUntilDue(c);
    const dueLabel = !c.lastPaymentDate ? 'Chưa xác định' : daysNum > 0 ? `Còn ${daysNum} ngày` : daysNum === 0 ? 'Hết hạn hôm nay' : `Quá hạn ${Math.abs(daysNum)} ngày`;
    return `
      <div class="customer-card ${c.active === false ? 'inactive-card' : ''}" onclick="openCustomerDetail('${c.id}')">
        <div class="name">${escapeHtml(c.name)} ${c.active === false ? '<span class="inactive-badge">Tạm nghỉ</span>' : ''}</div>
        <div class="plate">${escapeHtml(c.plate)}${c.vehicle ? ' · ' + escapeHtml(c.vehicle) : ''}</div>
        <div class="meta">
          ${c.contactZalo ? '<span style="color:#0068FF;">💬 Zalo</span>' : c.phone ? `<a href="tel:${escapeHtml(c.phone)}" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;">📞 ${escapeHtml(c.phone)}</a>` : ''}
          <span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span>
          ${getLateCount(c) >= 2 ? `<span class="status-badge status-overdue">⚠️ Chậm ${getLateCount(c)}/${LATE_WINDOW} kỳ</span>` : ''}
        </div>
        <div class="meta">
          <span>📅 Hạn: ${getNextDueDate(c)} (${dueLabel})</span>
          <span>💰 ${formatCurrency(c.monthlyFee)}/th</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderStats() {
  let active = 0, dueSoon = 0, overdue = 0, inactive = 0;
  state.customers.forEach(c => {
    if (c.active === false) { inactive++; return; }
    const s = getDueStatus(c);
    if (s === 'active') active++;
    else if (s === 'due-soon') dueSoon++;
    else if (s === 'overdue' || s === 'expired') overdue++;
  });
  document.getElementById('statActive').textContent = active;
  document.getElementById('statDue').textContent = dueSoon;
  document.getElementById('statOverdue').textContent = overdue;
  document.getElementById('statInactive').textContent = inactive;

  const cardActive = document.getElementById('statCardActive');
  const cardDue = document.getElementById('statCardDue');
  const cardOverdue = document.getElementById('statCardOverdue');
  [cardActive, cardDue, cardOverdue].forEach(el => {
    if (el) el.classList.remove('filter-active');
  });
  if (state.filterActive === 'active' && cardActive) cardActive.classList.add('filter-active');
  else if (state.filterActive === 'due-soon' && cardDue) cardDue.classList.add('filter-active');
  else if (state.filterActive === 'overdue' && cardOverdue) cardOverdue.classList.add('filter-active');

  const toggle = document.getElementById('inactiveToggle');
  if (toggle) toggle.style.display = state.showInactive && inactive > 0 ? 'block' : 'none';

  if (cardActive) cardActive.onclick = () => setStatusFilter('active');
  if (cardDue) cardDue.onclick = () => setStatusFilter('due-soon');
  if (cardOverdue) cardOverdue.onclick = () => setStatusFilter('overdue');
}

function toggleShowInactive() {
  state.showInactive = !state.showInactive;
  renderCustomers();
  renderStats();
}

function setStatusFilter(filter) {
  state.filterActive = state.filterActive === filter ? null : filter;
  renderCustomers();
  renderStats();
}

function renderHistory() {
  const container = document.getElementById('historyList');
  const allPayments = [];
  state.customers.forEach(c => {
    if (c.payments && c.payments.length > 0) {
      c.payments.forEach(p => {
        allPayments.push({ ...p, customerName: c.name, customerPlate: c.plate, customerId: c.id });
      });
    }
  });
  allPayments.sort((a, b) => new Date(b.payment_date || b.created_at || b.date) - new Date(a.payment_date || a.created_at || a.date));
  if (allPayments.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">💰</div><p>Chưa có giao dịch</p></div>';
    return;
  }
  const groups = {};
  allPayments.forEach(p => {
    const key = formatDate(p.payment_date || p.created_at || p.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  let html = '<div class="history-date" style="margin-top:0;">Lịch sử thanh toán</div>';
  Object.keys(groups).forEach(date => {
    html += `<div class="history-date">${date}</div>`;
    groups[date].forEach(p => {
      html += `
        <div class="history-item" onclick="openCustomerDetail('${p.customerId}')">
          <div>
            <strong>${escapeHtml(p.customerName)}</strong><br>
            <span style="font-size:13px;color:#666;">${escapeHtml(p.customerPlate)}</span>
          </div>
          <div style="text-align:right;">
            <span class="amount">${formatCurrency(p.amount)}</span><br>
            <span style="font-size:12px;color:#999;">${escapeHtml(p.method)}${p.note ? ' · ' + escapeHtml(p.note) : ''}</span>
          </div>
        </div>
      `;
    });
  });
  container.innerHTML = html;
}

function updateSettingsPage() {
  document.getElementById('settingsCustomerCount').textContent = state.customers.length;
  document.getElementById('settingsTotalSpots').textContent = state.settings.total_spots || 30;
  document.getElementById('settingsAvailableSpots').textContent = Math.max(0, (state.settings.total_spots || 30) - state.customers.length);
  let revenue = 0;
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  state.customers.forEach(c => {
    if (c.payments) {
      c.payments.forEach(p => {
        const pd = new Date(p.payment_date || p.created_at || p.date);
        if (pd.getMonth() === thisMonth && pd.getFullYear() === thisYear) {
          revenue += p.amount;
        }
      });
    }
  });
  document.getElementById('settingsMonthlyRevenue').textContent = formatCurrency(revenue);
}

function updateSettings() {
  setCurrencyValue('monthlyRate', state.settings.monthly_rate);
  document.getElementById('totalSpots').value = state.settings.total_spots || 30;
  document.getElementById('reminderDays').value = state.settings.reminder_days || 3;
}

async function saveSettings() {
  state.settings.monthly_rate = getCurrencyValue('monthlyRate');
  state.settings.total_spots = parseInt(document.getElementById('totalSpots').value) || 30;
  state.settings.reminder_days = parseInt(document.getElementById('reminderDays').value) || 3;
  await saveSettingsToDB();
  renderAll();
  showToast('✅ Đã lưu cài đặt');
}

function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav button')[['customers','history','settings'].indexOf(page)].classList.add('active');
  state.currentPage = page;
  if (page === 'history') renderHistory();
  if (page === 'settings') { updateSettings(); updateSettingsPage(); }
  if (page === 'customers') renderCustomers();
}

// ===== Modals =====
function openAddCustomer() {
  const rate = state.settings.monthly_rate || 0;
  const now = new Date();
  const todayD = now.getDate();
  const todayM = now.getMonth() + 1;
  const todayY = now.getFullYear();
  const dayOpts = Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===todayD?'selected':''}>${i+1}</option>`).join('');
  const monOpts = Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===todayM?'selected':''}>${i+1}</option>`).join('');
  const yearOpts = Array.from({length:11},(_,i)=>`<option value="${2020+i}" ${2020+i===todayY?'selected':''}>${2020+i}</option>`).join('');
  const content = `
    <h2>➕ Thêm khách hàng</h2>
    <div class="field"><label>Tên khách *</label><input type="text" id="fName" placeholder="VD: Nguyễn Văn A"></div>
    <div class="field"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="fZalo" onchange="togglePhoneField('f')" style="width:18px;height:18px;accent-color:#0068FF;"><span>Liên hệ qua Zalo (số điện thoại ẩn)</span></label></div>
    <div id="fPhoneGroup"><div class="field"><label>Số điện thoại</label><input type="tel" id="fPhone" placeholder="VD: 0901234567"></div></div>
    <div class="field"><label>Biển số xe *</label><input type="text" id="fPlate" placeholder="VD: 51A-12345" style="text-transform:uppercase"></div>
    <div class="field"><label>Loại xe</label><input type="text" id="fVehicle" placeholder="VD: Toyota Vios"></div>
    <div class="field"><label>Chỗ đỗ</label><input type="text" id="fSpot" placeholder="VD: A12"></div>
    <div class="field"><label>Giá tháng (VNĐ)</label><input type="text" inputmode="numeric" id="fFee" placeholder="VD: 1,000,000"></div>
    <div class="field"><label>Ghi chú</label><textarea id="fNotes" placeholder="VD: Tình trạng xe, thỏa thuận đặc biệt..."></textarea></div>
    <div class="field"><label>Ngày bắt đầu gửi</label>
      <div style="display:flex;gap:6px;align-items:center;">
        <select id="fPayDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${dayOpts}</select>
        <span style="color:#666;">tháng</span>
        <select id="fPayMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${monOpts}</select>
        <span style="color:#666;">năm</span>
        <select id="fPayYear" style="flex:1.2;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${yearOpts}</select>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal2()">Hủy</button>
      <button class="btn-primary" onclick="submitAddCustomer()">Lưu</button>
    </div>
  `;
  showModal(content);
  setCurrencyValue('fFee', rate);
  initCurrencyInput('fFee');
}

async function submitAddCustomer() {
  const name = document.getElementById('fName').value.trim();
  const phone = document.getElementById('fPhone').value.trim();
  const plate = document.getElementById('fPlate').value.trim();
  if (!name || !plate) {
    showToast('⚠️ Vui lòng nhập tên và biển số');
    return;
  }
  const fee = getCurrencyValue('fFee') || state.settings.monthly_rate;
  const startDate = localDateToISO(getDateFromDropdowns('fPay'));
  const ok = await addCustomer({
    name, phone, plate,
    vehicle: document.getElementById('fVehicle').value.trim(),
    spot: document.getElementById('fSpot').value.trim(),
    monthlyFee: fee,
    notes: document.getElementById('fNotes').value.trim(),
    lastPaymentDate: startDate,
    contactZalo: document.getElementById('fZalo').checked
  });
  if (!ok) return;
  const newCustomer = state.customers[0];
  if (startDate) {
    await recordPayment(newCustomer.id, newCustomer.monthlyFee, 'Tiền mặt', 'Thanh toán đầu tiên', startDate, 1);
  }
  openCustomerDetail(newCustomer.id);
}

async function openCustomerDetail(id) {
  const c = state.customers.find(c => c.id === id);
  if (!c) return;
  const status = getPillStatus(c);
  const payments = (c.payments || []).slice().reverse().map(p => `
    <tr>
      <td>${formatDate(p.payment_date || p.created_at || p.date)}</td>
      <td>${formatCurrency(p.amount)}</td>
      <td>${p.months_covered > 1 ? p.months_covered + ' tháng' : '1 tháng'}</td>
      <td>${escapeHtml(p.method)}</td>
      <td style="font-size:12px;color:#999;">${escapeHtml(p.note || '')}</td>
      <td style="white-space:nowrap;">
        <button onclick="editPayment('${p.id}','${c.id}')" style="background:none;border:none;cursor:pointer;font-size:16px;padding:8px;min-width:40px;min-height:40px;" title="Sửa">✏️</button>
        <button onclick="deletePayment('${p.id}','${c.id}')" style="background:none;border:none;cursor:pointer;font-size:16px;padding:8px;min-width:40px;min-height:40px;" title="Xóa">🗑️</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:#999;">Chưa có giao dịch</td></tr>';

  const daysNum = getDaysUntilDue(c);
  const dueLabel = !c.lastPaymentDate ? 'chưa xác định' : daysNum > 0 ? `còn ${daysNum} ngày` : daysNum === 0 ? 'hết hạn hôm nay' : `quá hạn ${Math.abs(daysNum)} ngày`;

  const content = `
    <h2>${escapeHtml(c.name)} <span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span>${getLateCount(c) >= 2 ? `<span class="status-badge status-overdue">⚠️ Chậm ${getLateCount(c)}/${LATE_WINDOW} kỳ</span>` : ''}</h2>
    <div style="margin-bottom:12px;">
      <div class="field" style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:14px;"><strong>🪪 Biển số:</strong> ${escapeHtml(c.plate)}</span>
        ${c.contactZalo ? '<span style="font-size:14px;color:#0068FF;">💬 Zalo</span>' : c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="font-size:14px;color:inherit;text-decoration:none;"><strong>📞</strong> ${escapeHtml(c.phone)}</a>` : ''}
      </div>
      <div style="font-size:14px;margin-bottom:4px;">${c.vehicle ? '🚗 ' + escapeHtml(c.vehicle) : ''}${c.spot ? ' · 🅿️ ' + escapeHtml(c.spot) : ''}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>💰 Giá tháng:</strong> ${formatCurrency(c.monthlyFee)}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>📅 Đóng gần nhất:</strong> ${formatDate(c.lastPaymentDate)}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>⏰ Hạn tới:</strong> ${getNextDueDate(c)} (${dueLabel})</div>
      ${c.notes ? '<div style="font-size:13px;color:#666;margin-top:4px;padding:8px;background:#f9f9f9;border-radius:6px;">📝 ' + escapeHtml(c.notes) + '</div>' : ''}
    </div>
    <div style="margin:12px 0;">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px;">💰 Ghi nhận thanh toán</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="text" inputmode="numeric" id="payAmount" placeholder="Số tiền" style="flex:1;min-width:100px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;">
        <select id="payMethod" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          <option value="Tiền mặt">Tiền mặt</option>
          <option value="Chuyển khoản">Chuyển khoản</option>
        </select>
      </div>
      <div style="margin-top:6px;">
        <label style="font-size:12px;color:#666;margin-bottom:2px;display:block;">Ngày thanh toán</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="payDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${(()=>{const n=new Date();const d=n.getDate();return Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===d?'selected':''}>${i+1}</option>`).join('');})()}</select>
          <span style="color:#666;">tháng</span>
          <select id="payMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${(()=>{const n=new Date();const m=n.getMonth()+1;return Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===m?'selected':''}>${i+1}</option>`).join('');})()}</select>
          <span style="color:#666;">năm</span>
          <select id="payYear" style="flex:1.2;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${(()=>{const n=new Date();const y=n.getFullYear();return Array.from({length:11},(_,i)=>`<option value="${2020+i}" ${2020+i===y?'selected':''}>${2020+i}</option>`).join('');})()}</select>
        </div>
      </div>
      <div style="margin-top:6px;">
        <label style="font-size:12px;color:#666;margin-bottom:2px;display:block;">Số tháng đóng (1, 2, 3...)</label>
        <input type="number" id="payMonths" value="1" min="1" max="24" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
      </div>
      <input type="text" id="payNote" placeholder="Ghi chú (VD: đóng tháng 4)" style="width:100%;margin-top:6px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
      <button class="btn-success" style="width:100%;margin-top:6px;padding:12px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;" onclick="submitPayment('${c.id}')">✅ Ghi nhận thanh toán</button>
    </div>
    <div style="margin:12px 0;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Lịch sử thanh toán</div>
      <div style="overflow-x:auto;">
        <table class="payment-table">
          <thead><tr><th>Ngày</th><th>Tiền</th><th>Số tháng</th><th>Hình thức</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
          <tbody>${payments}</tbody>
        </table>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="editCustomer('${c.id}')" style="flex:1;">✏️ Sửa</button>
      <button class="btn-secondary" onclick="sendReminder('${c.id}')" style="flex:1;">📨 Nhắc nhở</button>
    </div>
    <div class="btn-row" style="margin-top:4px;">
      <button class="btn-secondary" onclick="closeModal2()" style="flex:2;">Đóng</button>
      ${c.active === false
        ? `<button class="btn-success" onclick="reactivateCustomer('${c.id}')" style="flex:1;background:#1a73e8;color:white;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;">🔄 Kích hoạt lại</button>`
        : `<button class="btn-secondary" onclick="deactivateCustomer('${c.id}')" style="flex:1;">⏸️ Cho tạm nghỉ</button>`
      }
      <button class="btn-danger" onclick="confirmDelete('${c.id}')" style="flex:1;">🗑️ Xóa</button>
    </div>
  `;
  showModal(content);
  setCurrencyValue('payAmount', c.monthlyFee);
  initCurrencyInput('payAmount');
}

function confirmDelete(id) {
  const content = `
    <h2>🗑️ Xác nhận xóa</h2>
    <p style="font-size:15px;margin-bottom:20px;color:#555;">Xóa khách hàng này?</p>
    <div class="btn-row">
      <button class="btn-secondary" onclick="openCustomerDetail('${id}')">Hủy</button>
      <button class="btn-danger" onclick="deleteCustomerConfirmed('${id}')">Xác nhận</button>
    </div>
  `;
  showModal(content);
}

async function deleteCustomerConfirmed(id) {
  closeModal2();
  await deleteCustomer(id);
}

async function submitPayment(customerId) {
  const amount = getCurrencyValue('payAmount');
  const method = document.getElementById('payMethod').value;
  const note = document.getElementById('payNote').value.trim();
  const paymentDate = getDateFromDropdowns('pay');
  const monthsCovered = parseInt(document.getElementById('payMonths').value) || 1;
  if (!amount || amount <= 0) { showToast('⚠️ Nhập số tiền hợp lệ'); return; }
  const ok = await recordPayment(customerId, amount, method, note, paymentDate, monthsCovered);
  if (ok) openCustomerDetail(customerId);
}

// ===== Payment Edit/Delete =====
function editPayment(paymentId, customerId) {
  const c = state.customers.find(c => c.id === customerId);
  const p = c && c.payments && c.payments.find(p => p.id === paymentId);
  if (!p) return;

  const dateStr = p.payment_date || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
  const [edY, edM, edD] = dateStr.split('-').map(Number);
  const edDayOpts = Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===edD?'selected':''}>${i+1}</option>`).join('');
  const edMonOpts = Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===edM?'selected':''}>${i+1}</option>`).join('');
  const edYearOpts = Array.from({length:11},(_,i)=>`<option value="${2020+i}" ${2020+i===edY?'selected':''}>${2020+i}</option>`).join('');

  const content = `
    <h2>✏️ Sửa giao dịch</h2>
    <div class="field"><label>Ngày thanh toán</label>
      <div style="display:flex;gap:6px;align-items:center;">
        <select id="editPayDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${edDayOpts}</select>
        <span style="color:#666;">tháng</span>
        <select id="editPayMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${edMonOpts}</select>
        <span style="color:#666;">năm</span>
        <select id="editPayYear" style="flex:1.2;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${edYearOpts}</select>
      </div>
    </div>
    <div class="field"><label>Số tiền (VNĐ)</label>
      <input type="text" inputmode="numeric" id="editPayAmount" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
    </div>
    <div class="field"><label>Hình thức</label>
      <select id="editPayMethod" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
        <option value="Tiền mặt" ${p.method==='Tiền mặt'?'selected':''}>Tiền mặt</option>
        <option value="Chuyển khoản" ${p.method==='Chuyển khoản'?'selected':''}>Chuyển khoản</option>
      </select>
    </div>
    <div class="field"><label>Số tháng đóng</label>
      <input type="number" id="editPayMonths" value="${p.months_covered || 1}" min="1" max="24" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
    </div>
    <div class="field"><label>Ghi chú</label>
      <input type="text" id="editPayNote" value="${escapeHtml(p.note || '')}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="openCustomerDetail('${customerId}')">Hủy</button>
      <button class="btn-primary" onclick="submitEditPayment('${paymentId}','${customerId}')">Lưu</button>
    </div>
  `;
  showModal(content);
  setCurrencyValue('editPayAmount', p.amount);
  initCurrencyInput('editPayAmount');
}

async function submitEditPayment(paymentId, customerId) {
  const amount = getCurrencyValue('editPayAmount');
  if (!amount || amount <= 0) { showToast('⚠️ Nhập số tiền hợp lệ'); return; }
  const paymentDate = getDateFromDropdowns('editPay');
  const method = document.getElementById('editPayMethod').value;
  const monthsCovered = parseInt(document.getElementById('editPayMonths').value) || 1;
  const note = document.getElementById('editPayNote').value.trim();

  const { error } = await db.from('payments').update({
    amount,
    payment_date: paymentDate,
    method,
    months_covered: monthsCovered,
    note
  }).eq('id', paymentId);
  if (error) { showToast('⚠️ Lỗi: ' + error.message); return; }

  const c = state.customers.find(c => c.id === customerId);
  if (c) {
    const p = c.payments.find(p => p.id === paymentId);
    if (p) {
      p.amount = amount;
      p.payment_date = paymentDate;
      p.method = method;
      p.months_covered = monthsCovered;
      p.note = note;
    }
    c.payments.sort((a, b) => new Date(a.payment_date || a.created_at) - new Date(b.payment_date || b.created_at));
    await recalcLastPaymentDate(customerId);
  }
  renderAll();
  showToast('✅ Đã cập nhật giao dịch');
  openCustomerDetail(customerId);
}

async function deletePayment(paymentId, customerId) {
  const c = state.customers.find(c => c.id === customerId);
  const p = c && c.payments && c.payments.find(p => p.id === paymentId);
  if (!p) return;
  const dateStr = formatDate(p.payment_date || p.created_at);
  const amountStr = formatCurrency(p.amount);
  if (!confirm(`Xóa giao dịch ngày ${dateStr} số tiền ${amountStr}?`)) return;

  const { error } = await db.from('payments').delete().eq('id', paymentId);
  if (error) { showToast('⚠️ Lỗi: ' + error.message); return; }

  if (c) {
    c.payments = c.payments.filter(pay => pay.id !== paymentId);
    if (c.payments.length > 0) {
      await recalcLastPaymentDate(customerId);
    } else {
      c.lastPaymentDate = null;
      const { error: clearErr } = await db.from('customers').update({ last_payment_date: null }).eq('id', customerId).eq('user_id', state.user.id);
      if (clearErr) { showToast('⚠️ Lỗi cập nhật ngày: ' + clearErr.message); return; }
    }
  }
  renderAll();
  showToast('🗑️ Đã xóa giao dịch');
  openCustomerDetail(customerId);
}

async function recalcLastPaymentDate(customerId) {
  const c = state.customers.find(c => c.id === customerId);
  if (!c || !c.payments || c.payments.length === 0) return;
  const sorted = c.payments.slice().sort((a, b) =>
    new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at)
  );
  const latest = sorted[0];
  const dateKey = latest.payment_date || (latest.created_at ? latest.created_at.split('T')[0] : null);
  const newLastPayDate = localDateToISO(dateKey);
  const { error } = await db.from('customers').update({ last_payment_date: newLastPayDate }).eq('id', customerId).eq('user_id', state.user.id);
  if (error) { showToast('⚠️ Lỗi cập nhật ngày: ' + error.message); return; }
  c.lastPaymentDate = newLastPayDate;
}

function editCustomer(id) {
  const c = state.customers.find(c => c.id === id);
  if (!c) return;
  let ePayDateVal;
  if (c.lastPaymentDate) {
    const dt = new Date(c.lastPaymentDate);
    ePayDateVal = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  } else {
    const now = new Date();
    ePayDateVal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  const content = `
    <h2>✏️ Sửa thông tin</h2>
    <div class="field"><label>Tên khách</label><input type="text" id="eName" value="${escapeHtml(c.name)}"></div>
    <div class="field"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="eZalo" onchange="togglePhoneField('e')" style="width:18px;height:18px;accent-color:#0068FF;"${c.contactZalo ? ' checked' : ''}><span>Liên hệ qua Zalo (số điện thoại ẩn)</span></label></div>
    <div id="ePhoneGroup"><div class="field"><label>Số điện thoại</label><input type="tel" id="ePhone" value="${escapeHtml(c.phone)}"></div></div>
    <div class="field"><label>Biển số xe</label><input type="text" id="ePlate" value="${escapeHtml(c.plate)}" style="text-transform:uppercase"></div>
    <div class="field"><label>Loại xe</label><input type="text" id="eVehicle" value="${escapeHtml(c.vehicle)}"></div>
    <div class="field"><label>Chỗ đỗ</label><input type="text" id="eSpot" value="${escapeHtml(c.spot)}"></div>
    <div class="field"><label>Giá tháng (VNĐ)</label><input type="text" inputmode="numeric" id="eFee"></div>
    <div class="field"><label>Ghi chú</label><textarea id="eNotes">${escapeHtml(c.notes)}</textarea></div>
    <div class="field"><label>Ngày thanh toán gần nhất</label>
      <input type="date" id="ePayDate" value="${ePayDateVal}" style="width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:8px;font-size:16px;outline:none;">
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="openCustomerDetail('${c.id}')">Hủy</button>
      <button class="btn-primary" onclick="submitEdit('${c.id}')">Lưu</button>
    </div>
  `;
  showModal(content);
  setCurrencyValue('eFee', c.monthlyFee);
  initCurrencyInput('eFee');
  togglePhoneField('e');
}

async function submitEdit(id) {
  const name = document.getElementById('eName').value.trim();
  if (!name) { showToast('⚠️ Nhập tên khách'); return; }
  const ePayDateVal = document.getElementById('ePayDate').value;
  const lastPaymentDate = ePayDateVal ? localDateToISO(ePayDateVal) : null;
  await updateCustomer(id, {
    name,
    phone: document.getElementById('ePhone').value.trim(),
    plate: document.getElementById('ePlate').value.trim().toUpperCase(),
    vehicle: document.getElementById('eVehicle').value.trim(),
    spot: document.getElementById('eSpot').value.trim(),
    monthlyFee: getCurrencyValue('eFee') || 0,
    notes: document.getElementById('eNotes').value.trim(),
    lastPaymentDate,
    contactZalo: document.getElementById('eZalo').checked
  });
  openCustomerDetail(id);
}

function sendReminder(customerId) {
  const c = state.customers.find(c => c.id === customerId);
  if (!c) return;
  const days = getDaysUntilDue(c);
  let msg;
  if (days <= 0) {
    msg = `Chào anh/chị ${c.name}, kỳ hạn gửi xe tháng này (biển số ${c.plate}) đã quá hạn ${Math.abs(days)} ngày. Anh/chị vui lòng đóng ${formatCurrency(c.monthlyFee)} để tiếp tục gửi xe. Cảm ơn!`;
  } else {
    msg = `Chào anh/chị ${c.name}, kỳ hạn gửi xe tháng này (biển số ${c.plate}) còn ${days} ngày nữa. Anh/chị vui lòng đóng ${formatCurrency(c.monthlyFee)} trước ngày ${getNextDueDate(c)}. Cảm ơn!`;
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast('📋 Đã copy — hãy dán vào tin nhắn SMS/Zalo cho khách');
    }).catch(() => { showToast('📋 ' + msg); });
  } else { showToast('📋 ' + msg); }

  if (c.phone) {
    window._reminderPhone = c.phone;
    window._reminderMsg = msg;
    setTimeout(() => {
      const content = `
        <h2>📨 Gửi nhắc nhở</h2>
        <p style="font-size:14px;margin-bottom:12px;padding:10px;background:#f5f5f5;border-radius:8px;">${escapeHtml(msg)}</p>
        <div class="btn-row">
          ${c.phone ? `<button class="btn-primary" onclick="window.open('sms:' + window._reminderPhone + '?body=' + encodeURIComponent(window._reminderMsg), '_blank');closeModal2();" style="flex:1;">💬 Gửi SMS</button>` : ''}
          <button class="btn-success" onclick="navigator.clipboard.writeText(window._reminderMsg);showToast('📋 Đã copy, dán vào Zalo');closeModal2();" style="flex:1;">📱 Gửi Zalo</button>
        </div>
        <div class="btn-row">
          <button class="btn-secondary" onclick="closeModal2()" style="flex:1;">Đóng</button>
        </div>
      `;
      showModal(content);
    }, 500);
  }
}

function togglePhoneField(prefix) {
  const cb = document.getElementById(prefix + 'Zalo');
  const group = document.getElementById(prefix + 'PhoneGroup');
  const existingBadge = document.getElementById(prefix + 'ZaloBadge');
  if (existingBadge) existingBadge.remove();
  if (cb.checked) {
    group.style.display = 'none';
    const badge = document.createElement('div');
    badge.id = prefix + 'ZaloBadge';
    badge.className = 'field';
    badge.innerHTML = '<label>Liên hệ</label><div style="padding:10px;background:#f0f7ff;border:1px solid #0068FF;border-radius:8px;color:#0068FF;font-size:15px;">💬 Liên hệ qua Zalo</div>';
    group.parentNode.insertBefore(badge, group.nextSibling);
  } else {
    group.style.display = '';
  }
}

function showDueSoon() {
  const dueSoon = state.customers.filter(c => {
    const status = getDueStatus(c);
    return status === 'due-soon' || status === 'overdue' || status === 'expired';
  });
  if (dueSoon.length === 0) {
    showToast('✅ Tất cả khách hàng đều còn hạn');
    return;
  }
  const list = dueSoon.map(c => {
    const status = getDueStatus(c);
    const days = getDaysUntilDue(c);
    const daysText = !c.lastPaymentDate ? 'Chưa xác định' : days <= 0 ? `Quá hạn ${Math.abs(days)} ngày` : `Còn ${days} ngày`;
    return `
      <div class="customer-card" onclick="openCustomerDetail('${c.id}')">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="plate">${escapeHtml(c.plate)}</div>
        <div class="meta">
          ${c.contactZalo ? '<span style="color:#0068FF;">💬 Zalo</span>' : c.phone ? `<a href="tel:${escapeHtml(c.phone)}" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;">📞 ${escapeHtml(c.phone)}</a>` : ''}
          <span class="status-badge ${getStatusBadgeClass(status)}">${daysText}</span>
        </div>
        <div class="meta">
          <span>💰 ${formatCurrency(c.monthlyFee)}</span>
        </div>
      </div>
    `;
  }).join('');

  const content = `
    <h2>🔔 Khách cần nhắc</h2>
    <div style="font-size:14px;color:#666;margin-bottom:8px;">
      Có ${dueSoon.length} khách hàng cần được nhắc
    </div>
    ${list}
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal2()" style="flex:1;">Đóng</button>
    </div>
  `;
  showModal(content);
}

// ===== Reports =====
let _reportTab = 'monthly'; // 'monthly' | 'range'

function showReportsModal() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const todayStr = now.toISOString().split('T')[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const monthOptions = Array.from({length: 12}, (_, i) =>
    `<option value="${i+1}"${i+1 === currentMonth ? ' selected' : ''}>Tháng ${i+1}</option>`
  ).join('');

  const yearOptions = Array.from({length: 7}, (_, i) => {
    const yr = 2022 + i;
    return `<option value="${yr}"${yr === currentYear ? ' selected' : ''}>${yr}</option>`;
  }).join('');

  const content = `
    <h2>📊 Báo cáo doanh thu</h2>
    <div style="display:flex;gap:4px;margin-bottom:14px;background:#f1f3f4;border-radius:10px;padding:4px;">
      <button id="reportTabMonthly" onclick="switchReportTab('monthly')" style="flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#1a73e8;color:white;box-shadow:0 1px 3px rgba(0,0,0,0.2);">Theo tháng</button>
      <button id="reportTabRange" onclick="switchReportTab('range')" style="flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#e8eaed;color:#555;">Theo khoảng ngày</button>
    </div>

    <!-- Monthly view -->
    <div id="reportMonthlyView">
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap;">
        <select id="reportMonth" style="flex:1;min-width:90px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${monthOptions}</select>
        <select id="reportYear" style="flex:1;min-width:80px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${yearOptions}</select>
        <button class="btn-primary" onclick="renderReportBody()" style="padding:10px 14px;border:none;font-size:14px;font-weight:600;cursor:pointer;border-radius:8px;white-space:nowrap;">Xem báo cáo</button>
      </div>
      <div id="reportBody"></div>
    </div>

    <!-- Date range view -->
    <div id="reportRangeView" style="display:none;">
      <div style="margin-bottom:14px;">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <div style="flex:1;">
            <label style="font-size:12px;color:#666;display:block;margin-bottom:2px;">Từ ngày</label>
            <input type="date" id="rangeStart" value="${monthStart}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
          </div>
          <div style="flex:1;">
            <label style="font-size:12px;color:#666;display:block;margin-bottom:2px;">Đến ngày</label>
            <input type="date" id="rangeEnd" value="${todayStr}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
          </div>
        </div>
        <button onclick="renderRangeReportBody()" style="width:100%;padding:11px 14px;border:none;font-size:14px;font-weight:600;cursor:pointer;border-radius:8px;background:#1a73e8;color:white;">Xem báo cáo</button>
      </div>
      <div id="rangeReportBody"></div>
    </div>

    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal2()">Đóng</button>
    </div>
  `;
  showModal(content);
  _reportTab = 'monthly';
  renderReportBody();
}

function switchReportTab(tab) {
  _reportTab = tab;
  const monthlyView = document.getElementById('reportMonthlyView');
  const rangeView = document.getElementById('reportRangeView');
  const tabMonthly = document.getElementById('reportTabMonthly');
  const tabRange = document.getElementById('reportTabRange');
  if (!monthlyView || !rangeView || !tabMonthly || !tabRange) return;

  if (tab === 'monthly') {
    monthlyView.style.display = '';
    rangeView.style.display = 'none';
    tabMonthly.style.background = '#1a73e8';
    tabMonthly.style.color = 'white';
    tabMonthly.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    tabRange.style.background = '#e8eaed';
    tabRange.style.color = '#555';
    tabRange.style.boxShadow = 'none';
    renderReportBody();
  } else {
    monthlyView.style.display = 'none';
    rangeView.style.display = '';
    tabMonthly.style.background = '#e8eaed';
    tabMonthly.style.color = '#555';
    tabMonthly.style.boxShadow = 'none';
    tabRange.style.background = '#1a73e8';
    tabRange.style.color = 'white';
    tabRange.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    renderRangeReportBody();
  }
}

function renderReportBody() {
  const bodyEl = document.getElementById('reportBody');
  const monthEl = document.getElementById('reportMonth');
  const yearEl = document.getElementById('reportYear');
  if (!bodyEl || !monthEl || !yearEl) return;

  const month = parseInt(monthEl.value);
  const year = parseInt(yearEl.value);

  // Estimated monthly revenue = sum of active customers' monthlyFee
  const estimatedRevenue = state.customers
    .filter(c => c.active !== false)
    .reduce((sum, c) => sum + (c.monthlyFee || 0), 0);

  let revenue = 0;
  const payingCustomerIds = new Set();

  state.customers.forEach(c => {
    (c.payments || []).forEach(p => {
      const pd = new Date(p.payment_date || p.created_at);
      if (pd.getMonth() + 1 === month && pd.getFullYear() === year) {
        revenue += (p.amount || 0);
        payingCustomerIds.add(c.id);
      }
    });
  });

  const totalCustomers = state.customers.filter(c => c.active !== false).length;
  const paidCount = payingCustomerIds.size;
  const paidRate = totalCustomers > 0 ? ((paidCount / totalCustomers) * 100).toFixed(1) : '0.0';
  const rateColor = parseFloat(paidRate) >= 80 ? '#1e7e34' : parseFloat(paidRate) >= 50 ? '#e37400' : '#c5221f';

  const unpaidCustomers = state.customers.filter(c => !payingCustomerIds.has(c.id));

  const unpaidHtml = unpaidCustomers.length === 0
    ? '<div style="color:#1e7e34;font-size:14px;padding:8px 0;">✅ Tất cả khách đã đóng phí tháng này</div>'
    : unpaidCustomers.map(c => `
        <div class="history-item" onclick="openCustomerDetail('${c.id}')" style="margin-bottom:4px;">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            <div style="font-size:12px;color:#999;">${escapeHtml(c.plate || '')}</div>
          </div>
          <span class="status-badge status-overdue">Chưa đóng</span>
        </div>
      `).join('');

  // Last 6 months revenue
  const sixMonths = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) { m += 12; y--; }
    let mRev = 0;
    const mPayers = new Set();
    state.customers.forEach(c => {
      (c.payments || []).forEach(p => {
        const pd = new Date(p.payment_date || p.created_at);
        if (pd.getMonth() + 1 === m && pd.getFullYear() === y) {
          mRev += (p.amount || 0);
          mPayers.add(c.id);
        }
      });
    });
    sixMonths.push({ label: `${m}/${y}`, revenue: mRev, count: mPayers.size });
  }

  const tableRows = sixMonths.map((d, idx) => {
    const isCurrent = idx === 5;
    return `<tr${isCurrent ? ' style="font-weight:600;background:#f0f7ff;"' : ''}>
      <td>Tháng ${d.label}</td>
      <td style="text-align:right;color:#1e7e34;">${formatCurrency(d.revenue)}</td>
      <td style="text-align:right;">${d.count}</td>
    </tr>`;
  }).join('');

  bodyEl.innerHTML = `
    <div style="background:#f9f9f9;border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;">💰 Doanh thu tháng ${month}/${year}</span>
        <span style="font-size:17px;font-weight:700;color:#1e7e34;">${formatCurrency(revenue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;">📊 Doanh thu dự kiến/tháng</span>
        <span style="font-size:17px;font-weight:700;color:#1a73e8;">${formatCurrency(estimatedRevenue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;">✅ Tổng số khách hàng đã đóng</span>
        <span style="font-size:17px;font-weight:700;color:#1a73e8;">${paidCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;">👥 Khách đang gửi</span>
        <span style="font-size:17px;font-weight:700;">${totalCustomers}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <span style="font-size:14px;color:#555;">📈 Tỉ lệ đóng phí</span>
        <span style="font-size:17px;font-weight:700;color:${rateColor};">${paidRate}%</span>
      </div>
    </div>
    <div style="font-size:14px;font-weight:600;margin-bottom:8px;">❌ Khách chưa đóng (${unpaidCustomers.length} người)</div>
    <div style="max-height:180px;overflow-y:auto;margin-bottom:14px;">${unpaidHtml}</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:8px;">📅 Doanh thu 6 tháng gần nhất</div>
    <div style="overflow-x:auto;">
      <table class="payment-table">
        <thead><tr><th>Tháng</th><th style="text-align:right;">Doanh thu</th><th style="text-align:right;">Số KH đóng</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderRangeReportBody() {
  const bodyEl = document.getElementById('rangeReportBody');
  const startEl = document.getElementById('rangeStart');
  const endEl = document.getElementById('rangeEnd');
  if (!bodyEl || !startEl || !endEl) return;

  const startRaw = startEl.value;
  const endRaw = endEl.value;
  if (!startRaw || !endRaw) {
    bodyEl.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Vui lòng chọn ngày bắt đầu và kết thúc</div>';
    return;
  }
  if (startRaw > endRaw) {
    bodyEl.innerHTML = '<div style="color:#c5221f;text-align:center;padding:20px;">⚠️ Ngày bắt đầu không được sau ngày kết thúc</div>';
    return;
  }

  const startDate = parseDateNoTz(startRaw);
  const endDate = parseDateNoTz(endRaw);

  // Collect payments in range (compare by YYYY-MM-DD key to avoid tz issues)
  const rangePayments = [];
  state.customers.forEach(c => {
    (c.payments || []).forEach(p => {
      const pdKey = (p.payment_date || p.created_at || '').split('T')[0];
      if (pdKey >= startRaw && pdKey <= endRaw) {
        rangePayments.push({
          ...p,
          customerName: c.name,
          customerPlate: c.plate,
          customerId: c.id
        });
      }
    });
  });

  if (rangePayments.length === 0) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:36px 20px;color:#999;"><div style="font-size:40px;margin-bottom:12px;">📅</div><p style="margin:0;font-size:14px;">Không có giao dịch trong khoảng này</p></div>';
    return;
  }

  const estimatedRevenue = state.customers
    .filter(c => c.active !== false)
    .reduce((sum, c) => sum + (c.monthlyFee || 0), 0);
  const totalRevenue = rangePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const uniquePayingIds = new Set(rangePayments.map(p => p.customerId));
  const transactionCount = rangePayments.length;

  // Group by date for daily breakdown
  const byDate = {};
  rangePayments.forEach(p => {
    const key = (p.payment_date || p.created_at || '').split('T')[0];
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(p);
  });
  const sortedDates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));

  const dailyRows = sortedDates.map((date, idx) => {
    const dayPayments = byDate[date];
    const dayTotal = dayPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const dayDetails = dayPayments.map(p =>
      `<div style="font-size:13px;display:flex;justify-content:space-between;padding:4px 0;">
        <span>${escapeHtml(p.customerName)} — ${escapeHtml(p.customerPlate)}</span>
        <span style="color:#1e7e34;">${formatCurrency(p.amount)}</span>
      </div>`
    ).join('');
    const rowId = `dayRow_${idx}`;
    const detailId = `dayDetail_${idx}`;
    return `
      <div style="margin-bottom:4px;">
        <div id="${rowId}" class="history-item" style="cursor:pointer;" onclick="(function(){var d=document.getElementById('${detailId}');var c=document.getElementById('${rowId}_chev');var open=d.style.display==='block';d.style.display=open?'none':'block';c.style.transform=open?'rotate(0deg)':'rotate(90deg)';})()">
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="${rowId}_chev" style="font-size:10px;color:#aaa;display:inline-block;transition:transform 0.2s;">▶</span>
            <div>
              <strong>${formatDateStr(date)}</strong>
              <span style="font-size:12px;color:#999;margin-left:6px;">(${dayPayments.length} giao dịch)</span>
            </div>
          </div>
          <span class="amount">${formatCurrency(dayTotal)}</span>
        </div>
        <div id="${detailId}" style="display:none;background:#f6f8ff;border-left:3px solid #1a73e8;border-radius:0 0 8px 0;padding:8px 14px;margin-bottom:4px;">
          ${dayDetails}
        </div>
      </div>`;
  }).join('');

  // daysDiff: inclusive count from startRaw to endRaw
  const startD = parseDateNoTz(startRaw);
  const endD = parseDateNoTz(endRaw);
  const daysDiff = Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

  bodyEl.innerHTML = `
    <div style="background:#f9f9f9;border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;white-space:nowrap;">📅 Khoảng thời gian</span>
        <span style="font-size:15px;font-weight:600;text-align:right;">${formatDateStr(startRaw)} → ${formatDateStr(endRaw)} (${daysDiff} ngày)</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;white-space:nowrap;">💰 Tổng doanh thu</span>
        <span style="font-size:20px;font-weight:700;color:#1e7e34;">${formatCurrency(totalRevenue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;white-space:nowrap;">📊 Doanh thu dự kiến/tháng</span>
        <span style="font-size:17px;font-weight:700;color:#1a73e8;">${formatCurrency(estimatedRevenue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:14px;color:#555;white-space:nowrap;">📊 Số giao dịch</span>
        <span style="font-size:17px;font-weight:700;">${transactionCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <span style="font-size:14px;color:#555;white-space:nowrap;">👥 Khách hàng đã đóng</span>
        <span style="font-size:17px;font-weight:700;color:#1a73e8;">${uniquePayingIds.size}</span>
      </div>
    </div>
    <div style="font-size:14px;font-weight:600;margin-bottom:8px;">📋 Chi tiết theo ngày</div>
    ${dailyRows}
  `;
}

// ===== Utility =====
function showModal(html) {
  const modal = document.getElementById('modalContent');
  modal.innerHTML = html;
  modal.style.maxHeight = '';
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  closeModal2();
}

function closeModal2() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
}

function exportData() {
  const data = JSON.stringify({ customers: state.customers, settings: state.settings }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `baixe-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('✅ Đã sao lưu dữ liệu');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.customers || !Array.isArray(data.customers)) {
        showToast('⚠️ File không hợp lệ — thiếu danh sách khách hàng');
        return;
      }
      if (!confirm(`Nhập dữ liệu JSON sẽ hiển thị tạm thời trên màn hình.\n\n⚠️ Lưu ý: dữ liệu này KHÔNG được lưu vào máy chủ — tải lại trang sẽ mất.\n\nĐể thêm khách hàng lâu dài, hãy dùng nút "Thêm khách" sau khi nhập.\n\nTiếp tục?`)) {
        return;
      }
      state.customers = data.customers.map(c => ({
        ...c,
        monthlyFee: Number(c.monthlyFee) || 0,
        payments: (c.payments || []).map(p => ({ ...p, amount: Number(p.amount) || 0 }))
      }));
      state.settings = { ...state.settings, ...(data.settings || {}) };
      renderAll();
      updateSettings();
      showToast(`✅ Đã nhập ${data.customers.length} khách hàng (tạm thời — tải lại trang sẽ mất)`);
    } catch(err) {
      showToast('⚠️ Lỗi đọc file — file không đúng định dạng');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

document.addEventListener('DOMContentLoaded', initAuth);

/*
 * =====================================================================
 * CODE AUDIT REPORT — Bãi xe Thành Dương / app.js
 * Audited: 2026-04-28
 * =====================================================================
 *
 * Finding #1
 * Severity: HIGH — FIXED
 * Description: Null/undefined crash in search filter. `c.phone.includes(query)`,
 *   `c.plate.toLowerCase()`, and `c.name.toLowerCase()` all throw TypeError if the
 *   field is null or undefined. This can happen when data is loaded via importData()
 *   from a JSON file that doesn't guarantee these fields are strings.
 * Lines: 519–526 (renderCustomers)
 * Fix Applied: Added `|| ''` fallback for each field:
 *   (c.plate || '').toLowerCase(), (c.name || '').toLowerCase(), (c.phone || '').includes()
 *
 * Finding #2
 * Severity: MEDIUM — FIXED
 * Description: saveSettingsToDB() silently swallows errors — the user receives no
 *   feedback if the DB write fails (e.g. network error, RLS rejection). Settings
 *   appear saved locally but the server state diverges.
 * Line: 310 (saveSettingsToDB)
 * Fix Applied: Added showToast('⚠️ Lỗi lưu cài đặt — thử lại sau') in the error branch.
 *
 * Finding #3
 * Severity: MEDIUM
 * Description: deletePayment (line 961) and submitEditPayment (line 926) update/delete
 *   from the `payments` table using only the payment ID with no user ownership check.
 *   The payments table has no user_id column; ownership flows through customer_id →
 *   customers.user_id. If Supabase Row Level Security is not configured on the payments
 *   table, a user who obtains another user's payment UUID could delete or modify it.
 * Lines: 926, 961
 * Suggested Fix: Ensure Supabase RLS policy on `payments` enforces ownership via a
 *   join: `USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))`.
 *   No app-code change can substitute for proper DB-level RLS here.
 *
 * Finding #4
 * Severity: LOW
 * Description: Dead property reference `p.date` appears in three places
 *   (renderHistory sort, renderHistory grouping key, updateSettingsPage revenue calc).
 *   No payment object ever has a `.date` field — the correct fields are
 *   `payment_date` and `created_at`. The `|| p.date` fallback silently evaluates to
 *   undefined and is ignored, so there is no runtime error, but it's misleading.
 * Lines: 605, 612, 648
 * Suggested Fix: Remove the `|| p.date` fallbacks from all three locations.
 *
 * Finding #5
 * Severity: LOW
 * Description: window._reminderPhone and window._reminderMsg are set as global window
 *   properties in sendReminder() to pass data into a delayed modal. If sendReminder()
 *   is called twice within 500 ms (e.g. tapping two customer cards rapidly), the second
 *   call overwrites these globals before the first setTimeout fires, causing the first
 *   modal to show the wrong customer's data.
 * Lines: 1076–1078
 * Suggested Fix: Capture the values in a closure instead of using window globals:
 *   const phone = c.phone; const msg = msg; setTimeout(() => { ... use phone/msg ... }, 500)
 *
 * Finding #6
 * Severity: LOW
 * Description: submitAddCustomer() triggers two full renderAll() cycles — one inside
 *   addCustomer() and one inside recordPayment(). On a large customer list this causes
 *   two complete DOM re-renders in rapid succession with no visible benefit.
 * Lines: 347, 432 (called from submitAddCustomer at lines 736–748)
 * Suggested Fix: Suppress the renderAll() inside addCustomer() when called from
 *   submitAddCustomer, or batch the two DB operations and call renderAll() once at
 *   the end. Low priority — only noticeable with 100+ customers.
 *
 * Finding #7
 * Severity: LOW
 * Description: formatDate() with an invalid or unparseable dateStr returns 'NaN/NaN/NaN'
 *   instead of an empty string or a meaningful fallback, since d.getDate() returns NaN.
 * Line: 487–493
 * Suggested Fix: Add a guard: `if (isNaN(d.getTime())) return '';`
 *
 * =====================================================================
 */
