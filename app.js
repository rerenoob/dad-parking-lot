// Quản Lý Bãi Xe - Parking Lot Management App
// Data structures:
// Customer: { id, name, phone, plate, vehicle, spot, monthlyFee, notes, status, createdAt, payments: [{date, amount, method, note}] }
// Settings: { monthlyRate, totalSpots, reminderDays }

let state = {
  customers: [],
  settings: {
    monthlyRate: 0,
    totalSpots: 30,
    reminderDays: 3
  },
  currentPage: 'customers'
};

// --- Initialization ---
function init() {
  loadData();
  renderCustomers();
  renderStats();
  updateSettings();
  updateSettingsPage();
}

// --- Local Storage ---
function loadData() {
  try {
    const saved = localStorage.getItem('parkingLotData');
    if (saved) {
      const data = JSON.parse(saved);
      state.customers = data.customers || [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
    }
  } catch(e) { console.error('Load error:', e); }
}

function saveData() {
  try {
    localStorage.setItem('parkingLotData', JSON.stringify({
      customers: state.customers,
      settings: state.settings
    }));
  } catch(e) { console.error('Save error:', e); }
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
  if (!confirm('Xóa khách hàng này?')) return;
  state.customers = state.customers.filter(c => c.id !== id);
  saveData();
  renderAll();
  closeModal2();
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
  const now = new Date();
  const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= state.settings.reminderDays) return 'active';
  if (diffDays <= state.settings.reminderDays + 7) return 'due-soon';
  if (diffDays <= state.settings.reminderDays + 30) return 'overdue';
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
  const d = new Date(customer.lastPaymentDate);
  d.setMonth(d.getMonth() + 1);
  return formatDate(d.toISOString());
}

function getDaysUntilDue(customer) {
  if (!customer.lastPaymentDate) return 0;
  const last = new Date(customer.lastPaymentDate);
  const next = new Date(last);
  next.setMonth(next.getMonth() + 1);
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
    return `
      <div class="customer-card" onclick="openCustomerDetail('${c.id}')">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="plate">${escapeHtml(c.plate)}${c.vehicle ? ' · ' + escapeHtml(c.vehicle) : ''}</div>
        <div class="meta">
          <span>📞 ${c.phone}</span>
          <span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span>
        </div>
        <div class="meta">
          <span>📅 Hạn: ${getNextDueDate(c)}</span>
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
            <span style="font-size:12px;color:#666;">${escapeHtml(p.customerPlate)}</span>
          </div>
          <div style="text-align:right;">
            <span class="amount">${formatCurrency(p.amount)}</span><br>
            <span style="font-size:11px;color:#999;">${p.method}${p.note ? ' · ' + p.note : ''}</span>
          </div>
        </div>
      `;
    });
  });
  container.innerHTML = html;
}

function updateSettingsPage() {
  document.getElementById('settingsCustomerCount').textContent = state.customers.length;
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
    lastPaymentDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString()
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
      <td>${p.method}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;color:#999;">Chưa có giao dịch</td></tr>';

  const content = `
    <h2>${escapeHtml(c.name)} <span class="status-badge ${getStatusBadgeClass(status)}">${getStatusText(status)}</span></h2>
    
    <div style="margin-bottom:12px;">
      <div class="field" style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:14px;"><strong>🪪 Biển số:</strong> ${escapeHtml(c.plate)}</span>
        <span style="font-size:14px;"><strong>📞</strong> ${c.phone}</span>
      </div>
      <div style="font-size:14px;margin-bottom:4px;">${c.vehicle ? '🚗 ' + escapeHtml(c.vehicle) : ''}${c.spot ? ' · 🅿️ ' + escapeHtml(c.spot) : ''}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>💰 Giá tháng:</strong> ${formatCurrency(c.monthlyFee)}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>📅 Đóng gần nhất:</strong> ${formatDate(c.lastPaymentDate)}</div>
      <div style="font-size:14px;margin-bottom:4px;"><strong>⏰ Hạn tới:</strong> ${getNextDueDate(c)} (còn ${getDaysUntilDue(c)} ngày)</div>
      ${c.notes ? '<div style="font-size:13px;color:#666;margin-top:4px;padding:8px;background:#f9f9f9;border-radius:6px;">📝 ' + escapeHtml(c.notes) + '</div>' : ''}
    </div>

    <div style="margin:12px 0;">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px;">💰 Ghi nhận thanh toán</div>
      <div style="display:flex;gap:8px;">
        <input type="number" id="payAmount" placeholder="Số tiền" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;" value="${c.monthlyFee}">
        <select id="payMethod" style="padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
          <option value="Tiền mặt">Tiền mặt</option>
          <option value="Chuyển khoản">Chuyển khoản</option>
        </select>
      </div>
      <button class="btn-success" style="width:100%;margin-top:6px;padding:10px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;" onclick="submitPayment('${c.id}')">✅ Ghi nhận thanh toán</button>
    </div>

    <div style="margin:12px 0;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Lịch sử thanh toán</div>
      <table class="payment-table">
        <thead><tr><th>Ngày</th><th>Số tiền</th><th>Phương thức</th></tr></thead>
        <tbody>${payments}</tbody>
      </table>
    </div>

    <div class="btn-row">
      <button class="btn-secondary" onclick="editCustomer('${c.id}')">✏️ Sửa</button>
      <button class="btn-secondary" onclick="sendReminder('${c.id}')">📨 Nhắc nhở</button>
      <button class="btn-danger" onclick="deleteCustomer('${c.id}')">🗑️ Xóa</button>
    </div>
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal2()" style="flex:1;">Đóng</button>
    </div>
  `;
  showModal(content);
}

function submitPayment(customerId) {
  const amount = parseInt(document.getElementById('payAmount').value);
  const method = document.getElementById('payMethod').value;
  if (!amount || amount <= 0) {
    showToast('⚠️ Nhập số tiền hợp lệ');
    return;
  }
  recordPayment(customerId, amount, method, '');
  openCustomerDetail(customerId);
}

function editCustomer(id) {
  const c = state.customers.find(c => c.id === id);
  if (!c) return;
  const content = `
    <h2>✏️ Sửa thông tin</h2>
    <div class="field"><label>Tên khách</label><input type="text" id="eName" value="${escapeHtml(c.name)}"></div>
    <div class="field"><label>Số điện thoại</label><input type="tel" id="ePhone" value="${c.phone}"></div>
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
    msg = `Khách ${c.name} (${c.plate}) đã quá hạn ${Math.abs(days)} ngày. Số tiền: ${formatCurrency(c.monthlyFee)}`;
  } else {
    msg = `Khách ${c.name} (${c.plate}) còn ${days} ngày đến hạn. Số tiền: ${formatCurrency(c.monthlyFee)}`;
  }
  
  // Copy to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast('📋 Đã copy nội dung nhắc nhở, hãy dán vào tin nhắn SMS/Zalo');
    }).catch(() => {
      showToast('📋 ' + msg);
    });
  } else {
    showToast('📋 ' + msg);
  }
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
          <span>📞 ${c.phone}</span>
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
    <div style="font-size:13px;color:#666;margin-bottom:8px;">
      ${dueSoon.length} khách hàng ${dueSoon.length > 1 ? 'cần' : 'cần'} được nhắc
    </div>
    ${list}
    <div class="btn-row">
      <button class="btn-secondary" onclick="closeModal2()" style="flex:1;">Đóng</button>
    </div>
  `;
  showModal(content);
  document.querySelector('.modal').style.maxHeight = '70vh';
}

// --- Utility ---
function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
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
  t._timeout = setTimeout(() => t.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function exportData() {
  const data = JSON.stringify({ customers: state.customers, settings: state.settings }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `baixe-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Đã xuất dữ liệu');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.customers) {
        state.customers = data.customers;
        state.settings = { ...state.settings, ...(data.settings || {}) };
        saveData();
        renderAll();
        updateSettings();
        showToast('✅ Đã nhập dữ liệu');
      } else {
        showToast('⚠️ File không hợp lệ');
      }
    } catch(err) {
      showToast('⚠️ Lỗi đọc file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Start
document.addEventListener('DOMContentLoaded', init);
