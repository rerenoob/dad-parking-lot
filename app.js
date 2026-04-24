// Quản Lý Bãi Xe - Parking Lot Management App
// Data structures:
// Customer: { id, name, phone, plate, vehicle, spot, monthlyFee, notes, status, createdAt, payments: [{date, amount, method, note}] }
// Settings: { monthlyRate, totalSpots, reminderDays }

let _reminderPhone = '';
let _reminderMsg = '';

let state = {
  customers: [],
  settings: {
    monthlyRate: 0,
    totalSpots: 30,
    reminderDays: 3
  },
  currentPage: 'customers',
  lastBackupDate: null,
  initialized: false
};

// --- Initialization ---
function init() {
  loadData();
  renderCustomers();
  renderStats();
  updateSettings();
  updateSettingsPage();
  state.initialized = true;
  
  // Prompt to set monthly rate on first launch
  if (state.customers.length === 0 && (!state.settings.monthlyRate || state.settings.monthlyRate === 0)) {
    setTimeout(() => {
      showToast('⚙️ Vào Cài đặt để nhập giá tháng trước khi thêm khách hàng');
    }, 500);
  }
  
  // Backup reminder
  checkBackupReminder();
}

// --- Local Storage ---
function loadData() {
  try {
    const saved = localStorage.getItem('parkingLotData');
    if (saved) {
      const data = JSON.parse(saved);
      state.customers = data.customers || [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.lastBackupDate = data.lastBackupDate || null;
    }
  } catch(e) { console.error('Lỗi tải dữ liệu:', e); }
}

function saveData() {
  try {
    localStorage.setItem('parkingLotData', JSON.stringify({
      customers: state.customers,
      settings: state.settings,
      lastBackupDate: state.lastBackupDate
    }));
  } catch(e) {
    showToast('⚠️ Lỗi: không thể lưu dữ liệu. Dung lượng có thể đã đầy.');
    console.error('Lỗi lưu dữ liệu:', e);
  }
}

// --- Backup Reminder ---
function checkBackupReminder() {
  if (!state.lastBackupDate && state.customers.length > 0) {
    // First launch with data — remind to back up
    setTimeout(() => showToast('💾 Nhớ sao lưu dữ liệu trong Cài đặt để tránh mất'), 3000);
    return;
  }
  if (!state.lastBackupDate || state.customers.length === 0) return;
  const last = new Date(state.lastBackupDate);
  const now = new Date();
  const daysSinceBackup = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  if (daysSinceBackup >= 7) {
    setTimeout(() => {
      showToast(`💾 Đã ${daysSinceBackup} ngày chưa sao lưu — vào Cài đặt để xuất dữ liệu`);
    }, 2000);
  }
}

// --- Customer CRUD ---
function addCustomer(data) {
  const customer = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: data.name,
    phone: data.phone,
    plate: data.plate.toUpperCase(),
    vehicle: data.vehicle || '',
    spot: data.spot || '',
    monthlyFee: data.monthlyFee || state.settings.monthlyRate,
    notes: data.notes || '',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastPaymentDate: data.lastPaymentDate || new Date().toISOString(),
    payments: []
  };
  state.customers.push(customer);
  saveData();
  renderAll();
  showToast('✅ Đã thêm khách hàng');
}

function updateCustomer(id, data) {
  const idx = state.customers.findIndex(c => c.id === id);
  if (idx === -1) return;
  Object.assign(state.customers[idx], data);
  saveData();
  renderAll();
  showToast('✅ Đã cập nhật');
}

function deleteCustomer(id) {
  state.customers = state.customers.filter(c => c.id !== id);
  saveData();
  renderAll();
  showToast('🗑️ Đã xóa');
}

function recordPayment(customerId, amount, method, note) {
  const c = state.customers.find(c => c.id === customerId);
  if (!c) return;
  if (!c.payments) c.payments = [];
  
  const payment = {
    date: new Date().toISOString(),
    amount: amount,
    method: method || 'Tiền mặt',
    note: note || ''
  };
  c.payments.push(payment);
  c.lastPaymentDate = payment.date;
  c.status = 'active';
  
  saveData();
  renderAll();
  showToast('💰 Đã ghi nhận thanh toán');
}

// --- Computed ---
function getDueStatus(customer) {
  if (!customer.lastPaymentDate) return 'active';
  const last = new Date(customer.lastPaymentDate);
  const next = addOneMonth(last);
  const now = new Date();
  const daysUntilDue = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntilDue > state.settings.reminderDays) return 'active';
  if (daysUntilDue > 0) return 'due-soon';
  if (daysUntilDue > -30) return 'overdue';
  return 'expired';
}

function getStatusText(status) {
  const map = { 'active': 'Còn hạn', 'due-soon': 'Sắp hết hạn', 'overdue': 'Quá hạn', 'expired': 'Hết hạn' };
  return map[status] || status;
}

function getStatusBadgeClass(status) {
  const map = { 'active': 'status-active', 'due-soon': 'status-due-soon', 'overdue': 'status-overdue', 'expired': 'status-expired' };
  return map[status] || '';
}

function addOneMonth(date) {
  const d = new Date(date);
  const targetMonth = (d.getMonth() + 1) % 12;
  d.setMonth(d.getMonth() + 1);
  // Rolled over (e.g. Jan 31 → Mar 3): back up to last day of target month
  if (d.getMonth() !== targetMonth) d.setDate(0);
  return d;
}

// Parse YYYY-MM-DD date input as local noon to avoid UTC-midnight off-by-one in UTC+7
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
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

function getNextDueDate(customer) {
  if (!customer.lastPaymentDate) return 'Chưa xác định';
  return formatDate(addOneMonth(new Date(customer.lastPaymentDate)).toISOString());
}

function getDaysUntilDue(customer) {
  if (!customer.lastPaymentDate) return 0;
  const last = new Date(customer.lastPaymentDate);
  const next = addOneMonth(last);
  const now = new Date();
  return Math.ceil((next - now) / (1000 * 60 * 60 * 24));
}

// --- Rendering ---
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

  if (customers.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🚗</div><p>${query ? 'Không tìm thấy' : 'Chưa có khách hàng nào'}</p></div>`;
    return;
  }

  list.innerHTML = customers.map(c => {
    const status = getDueStatus(c);
    const daysNum = getDaysUntilDue(c);
    const dueLabel = daysNum > 0 ? `Còn ${daysNum} ngày` : daysNum === 0 ? 'Hết hạn hôm nay' : `Quá hạn ${Math.abs(daysNum)} ngày`;
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
}

function renderHistory() {
  const container = document.getElementById('historyList');
  
  // Get all payments sorted by date
  const allPayments = [];
  state.customers.forEach(c => {
    if (c.payments && c.payments.length > 0) {
      c.payments.forEach(p => {
        allPayments.push({ ...p, customerName: c.name, customerPlate: c.plate, customerId: c.id });
      });
    }
  });
  allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allPayments.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">💰</div><p>Chưa có giao dịch</p></div>`;
    return;
  }

  // Group by date
  const groups = {};
  allPayments.forEach(p => {
    const key = formatDate(p.date);
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
  document.getElementById('settingsTotalSpots').textContent = state.settings.totalSpots || 30;
  document.getElementById('settingsAvailableSpots').textContent = Math.max(0, (state.settings.totalSpots || 30) - state.customers.length);
  
  let revenue = 0;
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  state.customers.forEach(c => {
    if (c.payments) {
      c.payments.forEach(p => {
        const pd = new Date(p.date);
        if (pd.getMonth() === thisMonth && pd.getFullYear() === thisYear) {
          revenue += p.amount;
        }
      });
    }
  });
  document.getElementById('settingsMonthlyRevenue').textContent = formatCurrency(revenue);
}

function updateSettings() {
  document.getElementById('monthlyRate').value = state.settings.monthlyRate || '';
  document.getElementById('totalSpots').value = state.settings.totalSpots || 30;
  document.getElementById('reminderDays').value = state.settings.reminderDays || 3;
}

function saveSettings() {
  state.settings.monthlyRate = parseInt(document.getElementById('monthlyRate').value) || 0;
  state.settings.totalSpots = parseInt(document.getElementById('totalSpots').value) || 30;
  state.settings.reminderDays = parseInt(document.getElementById('reminderDays').value) || 3;
  saveData();
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

// --- Modals ---
function openAddCustomer() {
  const rate = state.settings.monthlyRate || 0;
  const content = `
    <h2>➕ Thêm khách hàng</h2>
    <div class="field"><label>Tên khách *</label><input type="text" id="fName" placeholder="VD: Nguyễn Văn A"></div>
    <div class="field"><label>Số điện thoại *</label><input type="tel" id="fPhone" placeholder="VD: 0901234567"></div>
    <div class="field"><label>Biển số xe *</label><input type="text" id="fPlate" placeholder="VD: 51A-12345" style="text-transform:uppercase"></div>
    <div class="field"><label>Loại xe</label><input type="text" id="fVehicle" placeholder="VD: Toyota Vios"></div>
    <div class="field"><label>Chỗ đỗ</label><input type="text" id="fSpot" placeholder="VD: A12"></div>
    <div class="field"><label>Giá tháng (VNĐ)</label><input type="number" id="fFee" value="${rate}" placeholder="VD: 1000000"></div>
    <div class="field"><label>Ngày bắt đầu</label><input type="date" id="fStart" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="field"><label>Ghi chú</label><textarea id="fNotes" placeholder="VD: Tình trạng xe, thỏa thuận đặc biệt..."></textarea></div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal2()">Hủy</button>
      <button class="btn-primary" onclick="submitAddCustomer()">Lưu</button>
    </div>
  `;
  showModal(content);
}

function submitAddCustomer() {
  const name = document.getElementById('fName').value.trim();
  const phone = document.getElementById('fPhone').value.trim();
  const plate = document.getElementById('fPlate').value.trim();
  if (!name || !phone || !plate) {
    showToast('⚠️ Vui lòng nhập tên, số điện thoại và biển số');
    return;
  }
  const fee = parseInt(document.getElementById('fFee').value) || state.settings.monthlyRate;
  const startDate = document.getElementById('fStart').value;
  addCustomer({
    name, phone, plate,
    vehicle: document.getElementById('fVehicle').value.trim(),
    spot: document.getElementById('fSpot').value.trim(),
    monthlyFee: fee,
    notes: document.getElementById('fNotes').value.trim(),
    lastPaymentDate: localDateToISO(startDate)
  });
  closeModal2();
}

function openCustomerDetail(id) {
  const c = state.customers.find(c => c.id === id);
  if (!c) return;
  const status = getDueStatus(c);
  const payments = (c.payments || []).map(p => `
    <tr>
      <td>${formatDate(p.date)}</td>
      <td>${formatCurrency(p.amount)}</td>
      <td>${escapeHtml(p.method)}</td>
      <td style="font-size:12px;color:#999;">${escapeHtml(p.note || '')}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:#999;">Chưa có giao dịch</td></tr>';

  const daysNum = getDaysUntilDue(c);
  const dueLabel = daysNum > 0 ? `còn ${daysNum} ngày` : daysNum === 0 ? 'hết hạn hôm nay' : `quá hạn ${Math.abs(daysNum)} ngày`;

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
        <input type="number" id="payAmount" placeholder="Số tiền" style="flex:1;min-width:100px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;" value="${c.monthlyFee}">
        <select id="payMethod" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;background:white;">
          <option value="Tiền mặt">Tiền mặt</option>
          <option value="Chuyển khoản">Chuyển khoản</option>
        </select>
      </div>
      <input type="text" id="payNote" placeholder="Ghi chú (VD: đóng tháng 4)" style="width:100%;margin-top:6px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;">
      <button class="btn-success" style="width:100%;margin-top:6px;padding:12px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;" onclick="submitPayment('${c.id}')">✅ Ghi nhận thanh toán</button>
    </div>

    <div style="margin:12px 0;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Lịch sử thanh toán</div>
      <div style="overflow-x:auto;">
        <table class="payment-table">
          <thead><tr><th>Ngày</th><th>Tiền</th><th>Hình thức</th><th>Ghi chú</th></tr></thead>
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
}

function confirmDelete(id) {
  closeModal2();
  setTimeout(() => {
    if (confirm('Xóa khách hàng này?')) {
      state.customers = state.customers.filter(c => c.id !== id);
      saveData();
      renderAll();
      showToast('🗑️ Đã xóa');
    }
  }, 200);
}

function submitPayment(customerId) {
  const amount = parseInt(document.getElementById('payAmount').value);
  const method = document.getElementById('payMethod').value;
  const note = document.getElementById('payNote').value.trim();
  if (!amount || amount <= 0) {
    showToast('⚠️ Nhập số tiền hợp lệ');
    return;
  }
  recordPayment(customerId, amount, method, note);
  openCustomerDetail(customerId);
}

function editCustomer(id) {
  const c = state.customers.find(c => c.id === id);
  if (!c) return;
  const content = `
    <h2>✏️ Sửa thông tin</h2>
    <div class="field"><label>Tên khách</label><input type="text" id="eName" value="${escapeHtml(c.name)}"></div>
    <div class="field"><label>Số điện thoại</label><input type="tel" id="ePhone" value="${escapeHtml(c.phone)}"></div>
    <div class="field"><label>Biển số xe</label><input type="text" id="ePlate" value="${escapeHtml(c.plate)}" style="text-transform:uppercase"></div>
    <div class="field"><label>Loại xe</label><input type="text" id="eVehicle" value="${escapeHtml(c.vehicle)}"></div>
    <div class="field"><label>Chỗ đỗ</label><input type="text" id="eSpot" value="${escapeHtml(c.spot)}"></div>
    <div class="field"><label>Giá tháng (VNĐ)</label><input type="number" id="eFee" value="${c.monthlyFee}"></div>
    <div class="field"><label>Ghi chú</label><textarea id="eNotes">${escapeHtml(c.notes)}</textarea></div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="openCustomerDetail('${c.id}')">Hủy</button>
      <button class="btn-primary" onclick="submitEdit('${c.id}')">Lưu</button>
    </div>
  `;
  showModal(content);
}

function submitEdit(id) {
  const name = document.getElementById('eName').value.trim();
  if (!name) { showToast('⚠️ Nhập tên khách'); return; }
  updateCustomer(id, {
    name,
    phone: document.getElementById('ePhone').value.trim(),
    plate: document.getElementById('ePlate').value.trim().toUpperCase(),
    vehicle: document.getElementById('eVehicle').value.trim(),
    spot: document.getElementById('eSpot').value.trim(),
    monthlyFee: parseInt(document.getElementById('eFee').value) || 0,
    notes: document.getElementById('eNotes').value.trim()
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
  
  // Copy to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast('📋 Đã copy — hãy dán vào tin nhắn SMS/Zalo cho khách');
    }).catch(() => {
      showToast('📋 ' + msg);
    });
  } else {
    showToast('📋 ' + msg);
  }
  
  // Offer SMS option if phone is available
  if (c.phone) {
    _reminderPhone = c.phone;
    _reminderMsg = msg;
    setTimeout(() => {
      const content = `
        <h2>📨 Gửi nhắc nhở</h2>
        <p style="font-size:14px;margin-bottom:12px;padding:10px;background:#f5f5f5;border-radius:8px;">${escapeHtml(msg)}</p>
        <div class="btn-row">
          <button class="btn-primary" onclick="sendSMSReminder()" style="flex:1;">💬 Gửi SMS</button>
          <button class="btn-success" onclick="showToast('📋 Đã copy, dán vào Zalo');closeModal2();" style="flex:1;">📱 Gửi Zalo</button>
        </div>
        <div class="btn-row">
          <button class="btn-secondary" onclick="closeModal2()" style="flex:1;">Đóng</button>
        </div>
      `;
      showModal(content);
    }, 500);
  }
}

function sendSMSReminder() {
  window.open('sms:' + _reminderPhone + '?body=' + encodeURIComponent(_reminderMsg), '_blank');
  closeModal2();
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
    const daysText = days <= 0 ? `Quá hạn ${Math.abs(days)} ngày` : `Còn ${days} ngày`;
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

// --- Utility ---
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
  state.lastBackupDate = new Date().toISOString();
  saveData();
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
      
      // Confirm before overwriting
      if (state.customers.length > 0) {
        if (!confirm(`Nhập dữ liệu sẽ THAY THẾ toàn bộ ${state.customers.length} khách hàng hiện tại. Tiếp tục?`)) {
          return;
        }
      }
      
      state.customers = data.customers.map(c => ({
        ...c,
        monthlyFee: Number(c.monthlyFee) || 0,
        payments: (c.payments || []).map(p => ({ ...p, amount: Number(p.amount) || 0 }))
      }));
      state.settings = { ...state.settings, ...(data.settings || {}) };
      saveData();
      renderAll();
      updateSettings();
      showToast(`✅ Đã nhập ${data.customers.length} khách hàng`);
    } catch(err) {
      showToast('⚠️ Lỗi đọc file — file không đúng định dạng');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Start
document.addEventListener('DOMContentLoaded', init);
