// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCmmWLcRXV9JmJm2NLWV9jDgJ5IAEdLYnw",
  authDomain: "ats-sales-tracking.firebaseapp.com",
  projectId: "ats-sales-tracking",
  storageBucket: "ats-sales-tracking.firebasestorage.app",
  messagingSenderId: "203752171125",
  appId: "1:203752171125:web:b6fe3800142bf25c917a3c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Constants
const HOURLY_RATE = 15.00; // MA minimum wage
const COMMISSION_RATES = {
  'new-self': { first: 0.15, trailing: 0.05, trailMonths: 18 },
  'company-lead': { first: 0.10, trailing: 0.03, trailMonths: 12 },
  'cross-sell': { first: 0.08, trailing: 0, trailMonths: 0 }
};

// Authorized users
const AUTHORIZED_USERS = {
  'jeff@atsmanufacture.com': 'admin',
  'matt@atsmanufacture.com': 'admin',
  'info@atsmanufacture.com': 'sales',
  'accountexecutive@atsmanufacture.com': 'sales',
  'accounting@atsmanufacture.com': 'accountant',
};

// State
let currentUser = null;
let currentRole = null;
let hoursEntries = [];
let salesEntries = [];

// DOM Elements
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const userInfo = document.getElementById('user-info');
const userRole = document.getElementById('user-role');
const appContent = document.getElementById('app-content');
const accountantContent = document.getElementById('accountant-content');

// Auth handlers
signInBtn.addEventListener('click', () => {
  signInWithPopup(auth, googleProvider).catch((error) => {
    console.error('Sign in error:', error);
    alert('Error signing in. Please try again.');
  });
});

signOutBtn.addEventListener('click', () => {
  signOut(auth);
});

// Auth state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    const role = AUTHORIZED_USERS[user.email];

    if (!role) {
      alert('You are not authorized to use this application. Contact the administrator.');
      signOut(auth);
      return;
    }

    currentRole = role;

    // Update UI
    signInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    userInfo.textContent = user.email;
    userInfo.style.display = 'inline';
    userRole.textContent = role;
    userRole.className = `user-role ${role}`;
    userRole.style.display = 'inline';

    if (role === 'sales') {
      appContent.style.display = 'block';
      accountantContent.style.display = 'none';
    } else if (role === 'admin') {
      // Admin sees both views
      appContent.style.display = 'block';
      accountantContent.style.display = 'block';
    } else {
      appContent.style.display = 'none';
      accountantContent.style.display = 'block';
    }

    // Load data
    setupDataListeners();

  } else {
    currentUser = null;
    currentRole = null;
    signInBtn.style.display = 'inline-block';
    signOutBtn.style.display = 'none';
    userInfo.style.display = 'none';
    userRole.style.display = 'none';
    appContent.style.display = 'none';
    accountantContent.style.display = 'none';
  }
});

// Data listeners
function setupDataListeners() {
  // Hours entries
  const hoursQuery = query(collection(db, 'hours'), orderBy('date', 'desc'));
  onSnapshot(hoursQuery, (snapshot) => {
    hoursEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateDashboard();
    renderHistory();
  });

  // Sales entries
  const salesQuery = query(collection(db, 'sales'), orderBy('date', 'desc'));
  onSnapshot(salesQuery, (snapshot) => {
    salesEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateCustomerDropdown();
    updateProductDropdown();
    updateDashboard();
    renderHistory();
    renderTrailing();
  });
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
  });
});

// Set default date to today
document.getElementById('hours-date').valueAsDate = new Date();
document.getElementById('sale-date').valueAsDate = new Date();

// Hours form submission
document.getElementById('hours-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const entry = {
    date: document.getElementById('hours-date').value,
    hours: parseFloat(document.getElementById('hours-amount').value),
    type: document.getElementById('hours-type').value,
    description: document.getElementById('hours-description').value,
    rate: HOURLY_RATE,
    createdBy: currentUser.email,
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'hours'), entry);
    e.target.reset();
    document.getElementById('hours-date').valueAsDate = new Date();
    alert('Hours logged successfully!');
  } catch (error) {
    console.error('Error logging hours:', error);
    alert('Error logging hours. Please try again.');
  }
});

// Sales form - GP and commission preview
const saleCustomerSelect = document.getElementById('sale-customer');
const saleCustomerNewInput = document.getElementById('sale-customer-new');
const saleItemSelect = document.getElementById('sale-item');
const saleItemNewInput = document.getElementById('sale-item-new');
const saleUnitsInput = document.getElementById('sale-units');
const saleUnitPriceInput = document.getElementById('sale-unit-price');
const saleUnitCostInput = document.getElementById('sale-unit-cost');
const salePriceInput = document.getElementById('sale-price');
const saleCostInput = document.getElementById('sale-cost');
const saleGPInput = document.getElementById('sale-gp');
const saleTypeSelect = document.getElementById('sale-type');
const saleFirstOrderSelect = document.getElementById('sale-first-order');
const firstOrderGroup = document.getElementById('first-order-group');
const existingCustomerInfo = document.getElementById('existing-customer-info');
const trailingCountdown = document.getElementById('trailing-countdown');
const commissionPreview = document.getElementById('commission-preview');
const commissionRate = document.getElementById('commission-rate');

// Track customers and products from sales
let customersMap = {}; // { customerName: { accountType, firstOrderDate, trailingExpires } }
let productsMap = {}; // { productName: { unitPrice, unitCost } }

// Calculate months between two dates properly
function getMonthsDiff(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  let months = (to.getFullYear() - from.getFullYear()) * 12;
  months += to.getMonth() - from.getMonth();
  // Adjust for partial month
  if (to.getDate() < from.getDate()) {
    months--;
  }
  return months;
}

function updateCustomerDropdown() {
  // Build unique customers from sales
  customersMap = {};
  salesEntries.forEach(sale => {
    if (sale.customer && sale.isFirstOrder) {
      // Only track the first order for each customer
      if (!customersMap[sale.customer] || new Date(sale.date) < new Date(customersMap[sale.customer].firstOrderDate)) {
        customersMap[sale.customer] = {
          accountType: sale.accountType,
          firstOrderDate: sale.date,
          trailingExpires: sale.trailingExpires,
          trailingRate: sale.trailingRate
        };
      }
    }
  });

  // Update dropdown
  const currentValue = saleCustomerSelect.value;
  saleCustomerSelect.innerHTML = '<option value="">-- Select or Add New --</option><option value="__new__">+ Add New Customer</option>';

  Object.keys(customersMap).sort().forEach(customer => {
    const option = document.createElement('option');
    option.value = customer;
    option.textContent = customer;
    saleCustomerSelect.appendChild(option);
  });

  // Restore selection if still valid
  if (currentValue && saleCustomerSelect.querySelector(`option[value="${currentValue}"]`)) {
    saleCustomerSelect.value = currentValue;
  }
}

function updateProductDropdown() {
  // Build unique products from sales with their most recent prices
  productsMap = {};
  // Sort by date descending to get most recent prices first
  const sortedSales = [...salesEntries].sort((a, b) => new Date(b.date) - new Date(a.date));

  sortedSales.forEach(sale => {
    if (sale.item && !productsMap[sale.item]) {
      productsMap[sale.item] = {
        unitPrice: sale.unitPrice || sale.price,
        unitCost: sale.unitCost || sale.cost
      };
    }
  });

  // Update dropdown
  const currentValue = saleItemSelect.value;
  saleItemSelect.innerHTML = '<option value="">-- Select or Add New --</option><option value="__new__">+ Add New Product</option>';

  Object.keys(productsMap).sort().forEach(product => {
    const option = document.createElement('option');
    option.value = product;
    option.textContent = `${product} ($${productsMap[product].unitPrice.toFixed(2)})`;
    saleItemSelect.appendChild(option);
  });

  // Restore selection if still valid
  if (currentValue && saleItemSelect.querySelector(`option[value="${currentValue}"]`)) {
    saleItemSelect.value = currentValue;
  }
}

// Handle product selection
saleItemSelect.addEventListener('change', function() {
  const value = this.value;

  if (value === '__new__') {
    // New product - show text input, clear prices
    saleItemNewInput.style.display = 'block';
    saleItemNewInput.required = true;
    saleUnitPriceInput.value = '';
    saleUnitCostInput.value = '';
  } else if (value && productsMap[value]) {
    // Existing product - hide text input, fill in prices
    saleItemNewInput.style.display = 'none';
    saleItemNewInput.required = false;
    saleItemNewInput.value = '';
    saleUnitPriceInput.value = productsMap[value].unitPrice;
    saleUnitCostInput.value = productsMap[value].unitCost;
    updateTotals();
  } else {
    // No selection
    saleItemNewInput.style.display = 'none';
    saleItemNewInput.required = false;
  }
});

// Handle customer selection
saleCustomerSelect.addEventListener('change', function() {
  const value = this.value;

  if (value === '__new__') {
    // New customer - show text input, show account type options, show first order
    saleCustomerNewInput.style.display = 'block';
    saleCustomerNewInput.required = true;
    saleTypeSelect.disabled = false;
    firstOrderGroup.style.display = 'block';
    saleFirstOrderSelect.value = 'yes';
    existingCustomerInfo.style.display = 'none';
  } else if (value && customersMap[value]) {
    // Existing customer - hide text input, lock account type, hide first order (always reorder)
    saleCustomerNewInput.style.display = 'none';
    saleCustomerNewInput.required = false;
    saleCustomerNewInput.value = '';
    saleTypeSelect.value = customersMap[value].accountType;
    saleTypeSelect.disabled = true;
    firstOrderGroup.style.display = 'none';
    saleFirstOrderSelect.value = 'no'; // Always a reorder for existing customers
    existingCustomerInfo.style.display = 'block';

    // Show trailing countdown if applicable
    const customer = customersMap[value];
    if (customer.trailingExpires && customer.trailingRate > 0) {
      const expires = new Date(customer.trailingExpires);
      const now = new Date();
      if (expires > now) {
        const monthsLeft = getMonthsDiff(now, expires);
        const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
        const displayMonths = Math.max(0, monthsLeft);
        const displayText = displayMonths > 0
          ? `Trailing: ${displayMonths} mo remaining (${(customer.trailingRate * 100).toFixed(0)}%)`
          : `Trailing: ${daysLeft} days remaining (${(customer.trailingRate * 100).toFixed(0)}%)`;
        trailingCountdown.textContent = displayText;
        trailingCountdown.className = 'trailing-active';
      } else {
        trailingCountdown.textContent = 'Trailing period expired';
        trailingCountdown.className = 'trailing-expired';
      }
    } else {
      trailingCountdown.textContent = 'No trailing commission';
      trailingCountdown.className = '';
    }
  } else {
    // No selection
    saleCustomerNewInput.style.display = 'none';
    saleCustomerNewInput.required = false;
    saleTypeSelect.disabled = false;
    firstOrderGroup.style.display = 'block';
    existingCustomerInfo.style.display = 'none';
  }

  updateCommissionPreview();
});

function updateTotals() {
  const units = parseInt(saleUnitsInput.value) || 1;
  const unitPrice = parseFloat(saleUnitPriceInput.value) || 0;
  const unitCost = parseFloat(saleUnitCostInput.value) || 0;

  const totalPrice = units * unitPrice;
  const totalCost = units * unitCost;
  const gp = totalPrice - totalCost;

  salePriceInput.value = `$${totalPrice.toFixed(2)}`;
  saleCostInput.value = `$${totalCost.toFixed(2)}`;
  saleGPInput.value = gp >= 0 ? `$${gp.toFixed(2)}` : `-$${Math.abs(gp).toFixed(2)}`;

  updateCommissionPreview();
}

function updateCommissionPreview() {
  const units = parseInt(saleUnitsInput.value) || 1;
  const unitPrice = parseFloat(saleUnitPriceInput.value) || 0;
  const unitCost = parseFloat(saleUnitCostInput.value) || 0;
  const price = units * unitPrice;
  const cost = units * unitCost;
  const gp = price - cost;
  const type = saleTypeSelect.value;
  const isFirstOrder = saleFirstOrderSelect.value === 'yes';

  const rates = COMMISSION_RATES[type];
  let rate = isFirstOrder ? rates.first : rates.trailing;

  // No trailing for cross-sell
  if (type === 'cross-sell' && !isFirstOrder) {
    rate = 0;
  }

  const commission = gp * rate;
  commissionPreview.textContent = commission >= 0 ? `$${commission.toFixed(2)}` : '$0.00';
  commissionRate.textContent = `(${(rate * 100).toFixed(0)}% of GP)`;
}

saleUnitsInput.addEventListener('input', updateTotals);
saleUnitPriceInput.addEventListener('input', updateTotals);
saleUnitCostInput.addEventListener('input', updateTotals);
saleTypeSelect.addEventListener('change', updateCommissionPreview);
saleFirstOrderSelect.addEventListener('change', updateCommissionPreview);

// Sales form submission
document.getElementById('sales-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Get customer name (from dropdown or new input)
  let customerName = saleCustomerSelect.value;
  if (customerName === '__new__') {
    customerName = saleCustomerNewInput.value.trim();
    if (!customerName) {
      alert('Please enter a customer name');
      return;
    }
  }

  // Get product name (from dropdown or new input)
  let itemName = saleItemSelect.value;
  if (itemName === '__new__') {
    itemName = saleItemNewInput.value.trim();
    if (!itemName) {
      alert('Please enter a product name');
      return;
    }
  }

  const units = parseInt(saleUnitsInput.value) || 1;
  const unitPrice = parseFloat(saleUnitPriceInput.value) || 0;
  const unitCost = parseFloat(saleUnitCostInput.value) || 0;
  const price = units * unitPrice;
  const cost = units * unitCost;
  const gp = price - cost;
  const type = saleTypeSelect.value;
  const isFirstOrder = saleFirstOrderSelect.value === 'yes';
  const rates = COMMISSION_RATES[type];

  let commissionRateValue = isFirstOrder ? rates.first : rates.trailing;
  if (type === 'cross-sell' && !isFirstOrder) commissionRateValue = 0;

  const commission = gp * commissionRateValue;

  const entry = {
    date: document.getElementById('sale-date').value,
    customer: customerName,
    item: itemName,
    units: units,
    unitPrice: unitPrice,
    unitCost: unitCost,
    price: price,
    cost: cost,
    grossProfit: gp,
    accountType: type,
    isFirstOrder: isFirstOrder,
    invoiceStatus: document.getElementById('invoice-status').value,
    commissionRate: commissionRateValue,
    commission: commission,
    trailingRate: isFirstOrder ? rates.trailing : 0,
    trailingMonths: isFirstOrder ? rates.trailMonths : 0,
    trailingExpires: isFirstOrder && rates.trailMonths > 0
      ? new Date(new Date(document.getElementById('sale-date').value).setMonth(
          new Date(document.getElementById('sale-date').value).getMonth() + rates.trailMonths
        )).toISOString().split('T')[0]
      : null,
    notes: document.getElementById('sale-notes').value,
    createdBy: currentUser.email,
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'sales'), entry);
    e.target.reset();
    document.getElementById('sale-date').valueAsDate = new Date();
    saleUnitsInput.value = '1';
    // Reset customer dropdown state
    saleCustomerNewInput.style.display = 'none';
    saleCustomerNewInput.required = false;
    saleTypeSelect.disabled = false;
    firstOrderGroup.style.display = 'block';
    existingCustomerInfo.style.display = 'none';
    // Reset product dropdown state
    saleItemNewInput.style.display = 'none';
    saleItemNewInput.required = false;
    updateTotals();
    alert('Sale logged successfully!');
  } catch (error) {
    console.error('Error logging sale:', error);
    alert('Error logging sale. Please try again.');
  }
});

// Dashboard update
function updateDashboard() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Filter for current month
  const monthHours = hoursEntries.filter(h => {
    const d = new Date(h.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const monthSales = salesEntries.filter(s => {
    const d = new Date(s.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  // Hours stats
  const totalHours = monthHours.reduce((sum, h) => sum + h.hours, 0);
  const hoursEarnings = totalHours * HOURLY_RATE;

  // Sales stats
  const totalGP = monthSales.reduce((sum, s) => sum + s.grossProfit, 0);

  // Commission stats - only count paid invoices
  const paidSales = monthSales.filter(s => s.invoiceStatus === 'paid');
  const earnedCommissions = paidSales.reduce((sum, s) => sum + s.commission, 0);

  const pendingSales = monthSales.filter(s => s.invoiceStatus === 'pending');
  const pendingCommissions = pendingSales.reduce((sum, s) => sum + s.commission, 0);

  // Trailing commissions (from past sales, still in trailing period)
  const trailingTotal = calculateTrailingCommissions();

  // Update DOM
  if (currentRole === 'sales' || currentRole === 'admin') {
    document.getElementById('hours-month').textContent = totalHours.toFixed(1);
    document.getElementById('hours-earnings').textContent = `$${hoursEarnings.toFixed(2)}`;
    document.getElementById('sales-month').textContent = monthSales.length;
    document.getElementById('sales-gp').textContent = `$${totalGP.toFixed(2)} GP`;
    document.getElementById('commissions-earned').textContent = `$${earnedCommissions.toFixed(2)}`;
    document.getElementById('commissions-pending').textContent = `$${pendingCommissions.toFixed(2)}`;
    document.getElementById('trailing-total').textContent = `$${trailingTotal.toFixed(2)}`;
    document.getElementById('total-earnings').textContent = `$${(hoursEarnings + earnedCommissions).toFixed(2)}`;
  }
  if (currentRole === 'accountant' || currentRole === 'admin') {
    // Accountant view - all time
    const allHours = hoursEntries.reduce((sum, h) => sum + h.hours, 0);
    const allHoursPay = allHours * HOURLY_RATE;
    const allGP = salesEntries.reduce((sum, s) => sum + s.grossProfit, 0);
    const allPaidCommissions = salesEntries.filter(s => s.invoiceStatus === 'paid').reduce((sum, s) => sum + s.commission, 0);
    const allPendingCommissions = salesEntries.filter(s => s.invoiceStatus === 'pending').reduce((sum, s) => sum + s.commission, 0);

    document.getElementById('acc-hours-total').textContent = allHours.toFixed(1);
    document.getElementById('acc-hours-pay').textContent = `$${allHoursPay.toFixed(2)}`;
    document.getElementById('acc-sales-total').textContent = salesEntries.length;
    document.getElementById('acc-sales-gp').textContent = `$${allGP.toFixed(2)} GP`;
    document.getElementById('acc-commissions-owed').textContent = `$${allPaidCommissions.toFixed(2)}`;
    document.getElementById('acc-commissions-pending').textContent = `$${allPendingCommissions.toFixed(2)}`;
  }
}

// Calculate trailing commissions
function calculateTrailingCommissions() {
  const now = new Date();
  let total = 0;

  salesEntries.forEach(sale => {
    if (sale.trailingExpires && sale.trailingRate > 0 && sale.invoiceStatus === 'paid') {
      const expires = new Date(sale.trailingExpires);
      if (expires > now) {
        // This sale is still in its trailing period
        total += sale.grossProfit * sale.trailingRate;
      }
    }
  });

  return total;
}

// Render history
function renderHistory() {
  const filter = document.getElementById(currentRole === 'sales' ? 'history-filter' : 'acc-filter')?.value || 'all';
  const listEl = document.getElementById(currentRole === 'sales' ? 'history-list' : 'acc-history-list');

  let items = [];

  if (filter === 'all' || filter === 'hours') {
    items = items.concat(hoursEntries.map(h => ({ ...h, entryType: 'hours' })));
  }

  if (filter === 'all' || filter === 'sales' || filter === 'pending') {
    let sales = salesEntries.map(s => ({ ...s, entryType: 'sale' }));
    if (filter === 'pending') {
      sales = sales.filter(s => s.invoiceStatus === 'pending');
    }
    items = items.concat(sales);
  }

  // Sort by date descending
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (items.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No entries found</p>';
    return;
  }

  listEl.innerHTML = items.map(item => {
    if (item.entryType === 'hours') {
      return `
        <div class="history-item hours">
          <div class="history-info">
            <div class="history-title">${escapeHtml(item.type.replace('-', ' '))}</div>
            <div class="history-details">${escapeHtml(item.description || 'No description')}</div>
          </div>
          <div class="history-meta">
            <div class="history-amount">${item.hours}h = $${(item.hours * item.rate).toFixed(2)}</div>
            <div class="history-date">${formatDate(item.date)}</div>
          </div>
        </div>
      `;
    } else {
      const statusClass = item.invoiceStatus === 'returned' ? 'returned' : (item.invoiceStatus === 'pending' ? 'pending-invoice' : '');
      const unitsDisplay = item.units && item.units > 1 ? `${item.units} × ` : '';
      return `
        <div class="history-item sale ${statusClass}">
          <div class="history-info">
            <div class="history-title">${escapeHtml(item.customer)}</div>
            <div class="history-details">${unitsDisplay}${escapeHtml(item.item)} · $${item.price.toFixed(2)} (GP: $${item.grossProfit.toFixed(2)})</div>
            <div class="history-details">${getAccountTypeLabel(item.accountType)} · ${item.isFirstOrder ? 'First Order' : 'Reorder'}</div>
            <span class="history-status ${item.invoiceStatus}">${item.invoiceStatus}</span>
            ${currentRole === 'accountant' || currentRole === 'admin' ? `<button class="update-status-btn" onclick="openStatusModal('${item.id}')">Update Status</button>` : ''}
          </div>
          <div class="history-meta">
            <div class="history-amount commission">+$${item.commission.toFixed(2)}</div>
            <div class="history-date">${formatDate(item.date)}</div>
          </div>
        </div>
      `;
    }
  }).join('');
}

// Render trailing commissions
function renderTrailing() {
  const listEl = document.getElementById('trailing-list');
  const now = new Date();

  const trailingSales = salesEntries.filter(s =>
    s.trailingExpires &&
    s.trailingRate > 0 &&
    new Date(s.trailingExpires) > now &&
    s.invoiceStatus === 'paid'
  );

  if (trailingSales.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No active trailing commissions</p>';
    return;
  }

  listEl.innerHTML = trailingSales.map(sale => {
    const expires = new Date(sale.trailingExpires);
    const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    const monthsLeft = getMonthsDiff(now, expires);

    let countdownText;
    if (monthsLeft > 0) {
      countdownText = `${monthsLeft} month${monthsLeft !== 1 ? 's' : ''} remaining`;
    } else {
      countdownText = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
    }

    const urgencyClass = monthsLeft <= 1 ? 'expiring-soon' : (monthsLeft <= 3 ? 'expiring-medium' : '');

    return `
      <div class="trailing-item ${urgencyClass}">
        <div class="trailing-customer">${escapeHtml(sale.customer)}</div>
        <div class="trailing-details">${escapeHtml(sale.item)} · Original GP: $${sale.grossProfit.toFixed(2)}</div>
        <div class="trailing-rate">Trailing rate: <strong>${(sale.trailingRate * 100).toFixed(0)}%</strong> = $${(sale.grossProfit * sale.trailingRate).toFixed(2)} per reorder</div>
        <div class="trailing-countdown">${countdownText}</div>
        <div class="trailing-expires">Expires: ${formatDate(sale.trailingExpires)}</div>
      </div>
    `;
  }).join('');
}

// Modal for updating invoice status (accountant only)
let selectedSaleId = null;

window.openStatusModal = function(saleId) {
  selectedSaleId = saleId;
  const sale = salesEntries.find(s => s.id === saleId);
  if (!sale) return;

  document.getElementById('modal-sale-info').textContent = `${sale.customer} - ${sale.item} ($${sale.price.toFixed(2)})`;
  document.getElementById('modal-status').value = sale.invoiceStatus;
  document.getElementById('invoice-modal').style.display = 'flex';
};

document.getElementById('modal-cancel')?.addEventListener('click', () => {
  document.getElementById('invoice-modal').style.display = 'none';
  selectedSaleId = null;
});

document.getElementById('modal-save')?.addEventListener('click', async () => {
  if (!selectedSaleId) return;

  const newStatus = document.getElementById('modal-status').value;

  try {
    await updateDoc(doc(db, 'sales', selectedSaleId), {
      invoiceStatus: newStatus
    });
    document.getElementById('invoice-modal').style.display = 'none';
    selectedSaleId = null;
  } catch (error) {
    console.error('Error updating status:', error);
    alert('Error updating status. Please try again.');
  }
});

// Export CSV (accountant)
document.getElementById('export-btn')?.addEventListener('click', () => {
  let csv = 'Date,Type,Description,Hours,Rate,Amount,Customer,Item,Units,Unit Price,Unit Cost,Total Price,Total Cost,GP,Commission,Invoice Status\n';

  const allItems = [
    ...hoursEntries.map(h => ({ ...h, entryType: 'hours' })),
    ...salesEntries.map(s => ({ ...s, entryType: 'sale' }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  allItems.forEach(item => {
    if (item.entryType === 'hours') {
      csv += `${item.date},Hours,"${item.description || ''}",${item.hours},${item.rate},${(item.hours * item.rate).toFixed(2)},,,,,,,,,,\n`;
    } else {
      const units = item.units || 1;
      const unitPrice = item.unitPrice || item.price;
      const unitCost = item.unitCost || item.cost;
      csv += `${item.date},Sale,,,,,"${item.customer}","${item.item}",${units},${unitPrice},${unitCost},${item.price},${item.cost},${item.grossProfit},${item.commission},${item.invoiceStatus}\n`;
    }
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ats-sales-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
});

// Filter change listeners
document.getElementById('history-filter')?.addEventListener('change', renderHistory);
document.getElementById('acc-filter')?.addEventListener('change', renderHistory);

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAccountTypeLabel(type) {
  const labels = {
    'new-self': 'New (Self-Sourced)',
    'company-lead': 'Company Lead',
    'cross-sell': 'Cross-Sell'
  };
  return labels[type] || type;
}
