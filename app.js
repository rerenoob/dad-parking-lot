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
  filterActive: null
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

  state.customers = (data || []).map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    plate: c.plate,
    vehicle: c.vehicle || '',
    spot: c.spot || '',
    monthlyFee: c.monthly_fee || 0,
    notes: c.notes || '',
    lastPaymentDate: c.last_payment_date,
    createdAt: c.created_at,
    payments: paymentsMap[c.id] || []
  }));
  // Auto-fix: customers with no payments should have null lastPaymentDate
  fixPaymentDates();
}

function fixPaymentDates() {
  const toFix = state.customers.filter(c => c.lastPaymentDate && (!c.payments || c.payments.length === 0));
  toFix.forEach(c => {
    c.lastPaymentDate = null;
    db.from('customers').update({ last_payment_date: null }).eq('id', c.id).eq('user_id', state.user.id).catch(() => {});
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
  if (error) console.error('Error saving settings:', error);
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
      last_payment_date: data.lastPaymentDate || null
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
    createdAt: result.created_at,
    payments: []
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

  const lastPayDate = localDateToISO(payDate);
  const { error: updError } = await db
    .from('customers')
    .update({ last_payment_date: lastPayDate })
    .eq('id', customerId)
    .eq('user_id', state.user.id);
  if (updError) { showToast('⚠️ Lỗi: ' + updError.message); return false; }

  const c = state.customers.find(c => c.id === customerId);
  if (c) {
    c.lastPaymentDate = lastPayDate;
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
  renderAll();
  showToast('💰 Đã ghi nhận thanh toán');
  return true;
}

// ===== Computed =====
function getDueStatus(customer) {
  if (!customer.lastPaymentDate) return 'no-data';
  const last = new Date(customer.lastPaymentDate);
  const next = addMonths(last, getLastPaymentMonths(customer));
  const now = new Date();
  const daysUntilDue = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
  if (daysUntilDue > state.settings.reminder_days) return 'active';
  if (daysUntilDue > 0) return 'due-soon';
  if (daysUntilDue > -30) return 'overdue';
  return 'expired';
}

function getStatusText(status) {
  const map = { 'active': 'Còn hạn', 'no-data': 'Chưa xác định', 'due-soon': 'Sắp hết hạn', 'overdue': 'Quá hạn', 'expired': 'Hết hạn' };
  return map[status] || status;
}

function getStatusBadgeClass(status) {
  const map = { 'active': 'status-active', 'no-data': 'status-expired', 'due-soon': 'status-due-soon', 'overdue': 'status-overdue', 'expired': 'status-expired' };
  return map[status] || '';
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  const m = months || 1;
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, maxDay));
  return d;
}

function getLastPaymentMonths(customer) {
  const payments = customer.payments;
  if (!payments || payments.length === 0) return 1;
  return payments[payments.length - 1].months_covered || 1;
}

function localDateToISO(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

function formatCurrency(amount) {
  if (!amount) return '0₫';
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '₫';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${mon}/${d.getFullYear()}`;
}

function getNextDueDate(customer) {
  if (!customer.lastPaymentDate) return 'Chưa xác định';
  return formatDate(addMonths(new Date(customer.lastPaymentDate), getLastPaymentMonths(customer)).toISOString());
}

function getDaysUntilDue(customer) {
  if (!customer.lastPaymentDate) return 0;
  const last = new Date(customer.lastPaymentDate);
  const next = addMonths(last, getLastPaymentMonths(customer));
  const now = new Date();
  return Math.ceil((next - now) / (1000 * 60 * 60 * 24));
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
  if (query) {
    customers = customers.filter(c =>
      c.plate.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      c.phone.includes(query)
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
    const status = getDueStatus(c);
    const daysNum = getDaysUntilDue(c);
    const dueLabel = !c.lastPaymentDate ? 'Chưa xác định' : daysNum > 0 ? `Còn ${daysNum} ngày` : daysNum === 0 ? 'Hết hạn hôm nay' : `Quá hạn ${Math.abs(daysNum)} ngày`;
    return `
      <div class="customer-card" onclick="openCustomerDetail('${c.id}')">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="plate">${escapeHtml(c.plate)}${c.vehicle ? ' · ' + escapeHtml(c.vehicle) : ''}</div>
        <div class="meta">
          <a href="tel:${escapeHtml(c.phone)}" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;">📞 ${escapeHtml(c.phone)}</a>
          <span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span>
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
  let active = 0, dueSoon = 0, overdue = 0;
  state.customers.forEach(c => {
    const s = getDueStatus(c);
    if (s === 'active') active++;
    else if (s === 'due-soon') dueSoon++;
    else if (s === 'overdue' || s === 'expired') overdue++;
  });
  document.getElementById('statActive').textContent = active;
  document.getElementById('statDue').textContent = dueSoon;
  document.getElementById('statOverdue').textContent = overdue;

  const cardActive = document.getElementById('statCardActive');
  const cardDue = document.getElementById('statCardDue');
  const cardOverdue = document.getElementById('statCardOverdue');
  [cardActive, cardDue, cardOverdue].forEach(el => {
    if (el) el.classList.remove('filter-active');
  });
  if (state.filterActive === 'active' && cardActive) cardActive.classList.add('filter-active');
  else if (state.filterActive === 'due-soon' && cardDue) cardDue.classList.add('filter-active');
  else if (state.filterActive === 'overdue' && cardOverdue) cardOverdue.classList.add('filter-active');

  if (cardActive) cardActive.onclick = () => setStatusFilter('active');
  if (cardDue) cardDue.onclick = () => setStatusFilter('due-soon');
  if (cardOverdue) cardOverdue.onclick = () => setStatusFilter('overdue');
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
  const fpd = now.getDate(), fpm = now.getMonth() + 1, fpy = now.getFullYear();
  const content = `
    <h2>➕ Thêm khách hàng</h2>
    <div class="field"><label>Tên khách *</label><input type="text" id="fName" placeholder="VD: Nguyễn Văn A"></div>
    <div class="field"><label>Số điện thoại *</label><input type="tel" id="fPhone" placeholder="VD: 0901234567"></div>
    <div class="field"><label>Biển số xe *</label><input type="text" id="fPlate" placeholder="VD: 51A-12345" style="text-transform:uppercase"></div>
    <div class="field"><label>Loại xe</label><input type="text" id="fVehicle" placeholder="VD: Toyota Vios"></div>
    <div class="field"><label>Chỗ đỗ</label><input type="text" id="fSpot" placeholder="VD: A12"></div>
    <div class="field"><label>Giá tháng (VNĐ)</label><input type="text" inputmode="numeric" id="fFee" placeholder="VD: 1,000,000"></div>
    <div class="field"><label>Ghi chú</label><textarea id="fNotes" placeholder="VD: Tình trạng xe, thỏa thuận đặc biệt..."></textarea></div>
    <div class="field"><label>Ngày bắt đầu gửi</label>
      <div style="display:flex;gap:6px;">
        <select id="fPayDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          ${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===fpd?'selected':''}>${i+1}</option>`).join('')}
        </select>
        <select id="fPayMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===fpm?'selected':''}>Tháng ${i+1}</option>`).join('')}
        </select>
        <select id="fPayYear" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          ${Array.from({length:10},(_,i)=>{ const yr=2022+i; return `<option value="${yr}" ${yr===fpy?'selected':''}>${yr}</option>`; }).join('')}
        </select>
      </div>
      <div style="font-size:12px;color:#999;margin-top:4px">Ngày — Tháng — Năm</div>
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
  if (!name || !phone || !plate) {
    showToast('⚠️ Vui lòng nhập tên, số điện thoại và biển số');
    return;
  }
  const fee = getCurrencyValue('fFee') || state.settings.monthly_rate;
  const fPayDay = document.getElementById('fPayDay').value.padStart(2, '0');
  const fPayMonth = document.getElementById('fPayMonth').value.padStart(2, '0');
  const fPayYear = document.getElementById('fPayYear').value;
  const lastPaymentDate = localDateToISO(`${fPayYear}-${fPayMonth}-${fPayDay}`);
  const ok = await addCustomer({
    name, phone, plate,
    vehicle: document.getElementById('fVehicle').value.trim(),
    spot: document.getElementById('fSpot').value.trim(),
    monthlyFee: fee,
    notes: document.getElementById('fNotes').value.trim(),
    lastPaymentDate
  });
  if (ok) openCustomerDetail(state.customers[0].id);
}

async function openCustomerDetail(id) {
  const c = state.customers.find(c => c.id === id);
  if (!c) return;
  const status = getDueStatus(c);
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
    <h2>${escapeHtml(c.name)} <span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span></h2>
    <div style="margin-bottom:12px;">
      <div class="field" style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:14px;"><strong>🪪 Biển số:</strong> ${escapeHtml(c.plate)}</span>
        <a href="tel:${escapeHtml(c.phone)}" style="font-size:14px;color:inherit;text-decoration:none;"><strong>📞</strong> ${escapeHtml(c.phone)}</a>
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
        <div style="display:flex;gap:6px;">
          <select id="payDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
            ${Array.from({length:31},(_,i)=>'<option value="'+(i+1)+'"'+(i+1===parseInt(new Date().toISOString().split('T')[0].split('-')[2])?' selected':'')+'>'+(i+1)+'</option>').join('')}
          </select>
          <select id="payMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
            ${Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'"'+(i+1===parseInt(new Date().toISOString().split('T')[0].split('-')[1])?' selected':'')+'>Tháng '+(i+1)+'</option>').join('')}
          </select>
          <select id="payYear" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
            ${Array.from({length:10},(_,i)=>'<option value="'+(2022+i)+'"'+(2022+i===parseInt(new Date().toISOString().split('T')[0].split('-')[0])?' selected':'')+'>'+(2022+i)+'</option>').join('')}
          </select>
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
      <button class="btn-danger" onclick="confirmDelete('${c.id}')" style="flex:1;">🗑️ Xóa</button>
    </div>
  `;
  showModal(content);
  setCurrencyValue('payAmount', c.monthlyFee);
  initCurrencyInput('payAmount');
}

function confirmDelete(id) {
  closeModal2();
  setTimeout(async () => {
    if (confirm('Xóa khách hàng này?')) {
      await deleteCustomer(id);
    }
  }, 200);
}

async function submitPayment(customerId) {
  const amount = getCurrencyValue('payAmount');
  const method = document.getElementById('payMethod').value;
  const note = document.getElementById('payNote').value.trim();
  const payDay = document.getElementById('payDay').value.padStart(2,'0');
  const payMonth = document.getElementById('payMonth').value.padStart(2,'0');
  const payYear = document.getElementById('payYear').value;
  const paymentDate = payYear+'-'+payMonth+'-'+payDay;
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

  const dateStr = p.payment_date || (p.created_at ? p.created_at.split('T')[0] : '');
  let pd = 1, pm = 1, py = new Date().getFullYear();
  if (dateStr) {
    const parts = dateStr.split('-');
    py = parseInt(parts[0]) || py;
    pm = parseInt(parts[1]) || pm;
    pd = parseInt(parts[2]) || pd;
  }

  const days = Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===pd?'selected':''}>${i+1}</option>`).join('');
  const months = Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===pm?'selected':''}>Tháng ${i+1}</option>`).join('');
  const years = Array.from({length:10},(_,i)=>{ const yr=2022+i; return `<option value="${yr}" ${yr===py?'selected':''}>${yr}</option>`; }).join('');

  const content = `
    <h2>✏️ Sửa giao dịch</h2>
    <div class="field"><label>Ngày thanh toán</label>
      <div style="display:flex;gap:6px;">
        <select id="editPayDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${days}</select>
        <select id="editPayMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${months}</select>
        <select id="editPayYear" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">${years}</select>
      </div>
      <div style="font-size:12px;color:#999;margin-top:4px">Ngày — Tháng — Năm</div>
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
  const day = document.getElementById('editPayDay').value.padStart(2, '0');
  const month = document.getElementById('editPayMonth').value.padStart(2, '0');
  const year = document.getElementById('editPayYear').value;
  const paymentDate = `${year}-${month}-${day}`;
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
  let epd, epm, epy;
  if (c.lastPaymentDate) {
    const dt = new Date(c.lastPaymentDate);
    epd = dt.getDate(); epm = dt.getMonth() + 1; epy = dt.getFullYear();
  } else {
    const now = new Date();
    epd = now.getDate(); epm = now.getMonth() + 1; epy = now.getFullYear();
  }
  const content = `
    <h2>✏️ Sửa thông tin</h2>
    <div class="field"><label>Tên khách</label><input type="text" id="eName" value="${escapeHtml(c.name)}"></div>
    <div class="field"><label>Số điện thoại</label><input type="tel" id="ePhone" value="${escapeHtml(c.phone)}"></div>
    <div class="field"><label>Biển số xe</label><input type="text" id="ePlate" value="${escapeHtml(c.plate)}" style="text-transform:uppercase"></div>
    <div class="field"><label>Loại xe</label><input type="text" id="eVehicle" value="${escapeHtml(c.vehicle)}"></div>
    <div class="field"><label>Chỗ đỗ</label><input type="text" id="eSpot" value="${escapeHtml(c.spot)}"></div>
    <div class="field"><label>Giá tháng (VNĐ)</label><input type="text" inputmode="numeric" id="eFee"></div>
    <div class="field"><label>Ghi chú</label><textarea id="eNotes">${escapeHtml(c.notes)}</textarea></div>
    <div class="field"><label>Ngày bắt đầu gửi</label>
      <div style="display:flex;gap:6px;">
        <select id="ePayDay" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          ${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${i+1===epd?'selected':''}>${i+1}</option>`).join('')}
        </select>
        <select id="ePayMonth" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===epm?'selected':''}>Tháng ${i+1}</option>`).join('')}
        </select>
        <select id="ePayYear" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          ${Array.from({length:10},(_,i)=>{ const yr=2022+i; return `<option value="${yr}" ${yr===epy?'selected':''}>${yr}</option>`; }).join('')}
        </select>
      </div>
      <div style="font-size:12px;color:#999;margin-top:4px">Ngày — Tháng — Năm</div>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="openCustomerDetail('${c.id}')">Hủy</button>
      <button class="btn-primary" onclick="submitEdit('${c.id}')">Lưu</button>
    </div>
  `;
  showModal(content);
  setCurrencyValue('eFee', c.monthlyFee);
  initCurrencyInput('eFee');
}

async function submitEdit(id) {
  const name = document.getElementById('eName').value.trim();
  if (!name) { showToast('⚠️ Nhập tên khách'); return; }
  const ePayDay = document.getElementById('ePayDay').value.padStart(2, '0');
  const ePayMonth = document.getElementById('ePayMonth').value.padStart(2, '0');
  const ePayYear = document.getElementById('ePayYear').value;
  const lastPaymentDate = localDateToISO(`${ePayYear}-${ePayMonth}-${ePayDay}`);
  await updateCustomer(id, {
    name,
    phone: document.getElementById('ePhone').value.trim(),
    plate: document.getElementById('ePlate').value.trim().toUpperCase(),
    vehicle: document.getElementById('eVehicle').value.trim(),
    spot: document.getElementById('eSpot').value.trim(),
    monthlyFee: getCurrencyValue('eFee') || 0,
    notes: document.getElementById('eNotes').value.trim(),
    lastPaymentDate
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
          <button class="btn-primary" onclick="window.open('sms:' + window._reminderPhone + '?body=' + encodeURIComponent(window._reminderMsg), '_blank');closeModal2();" style="flex:1;">💬 Gửi SMS</button>
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
          <a href="tel:${escapeHtml(c.phone)}" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;">📞 ${escapeHtml(c.phone)}</a>
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
