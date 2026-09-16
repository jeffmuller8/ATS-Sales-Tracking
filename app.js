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
  'michael@atsmanufacture.com': 'admin',
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
    } else {
      // Admin and accountant see only the accountant/commission view
      appContent.style.display = 'none';
      accountantContent.style.display = 'block';
    }

    // Load data
    setupDataListeners();

    // Ensure tables render after DOM is ready (for admin/accountant)
    if (role !== 'sales') {
      setTimeout(() => {
        renderInvoicesTable();
        renderCommissionsTable();
        renderHoursTable();
      }, 100);
    }

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
    renderHoursTable();
  });

  // Sales entries
  const salesQuery = query(collection(db, 'sales'), orderBy('date', 'desc'));
  onSnapshot(salesQuery, (snapshot) => {
    salesEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateCustomerDropdown();
    updateProductDropdown();
    updateDashboard();
    renderHistory();
    renderInvoicesTable();
    renderCommissionsTable();
    renderHoursTable();
  });
}

// Tab switching (sales view)
document.querySelectorAll('.tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
  });
});

// Tab switching (accountant view)
document.querySelectorAll('.tab[data-acc-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-acc-tab]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.acc-tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const tabName = tab.dataset.accTab;
    if (tabName === 'invoices') {
      document.getElementById('invoices-tab').classList.add('active');
      renderInvoicesTable();
    } else if (tabName === 'commissions') {
      document.getElementById('commissions-tab').classList.add('active');
      renderCommissionsTable();
    } else if (tabName === 'hours') {
      document.getElementById('hours-log-tab').classList.add('active');
      renderHoursTable();
    }
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
    salesOrder: document.getElementById('sale-so').value.trim(),
    customerPO: document.getElementById('sale-po').value.trim(),
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

  // Update DOM
  if (currentRole === 'sales') {
    document.getElementById('hours-month').textContent = totalHours.toFixed(1);
    document.getElementById('hours-earnings').textContent = `$${hoursEarnings.toFixed(2)}`;
    document.getElementById('sales-month').textContent = monthSales.length;
    document.getElementById('sales-gp').textContent = `$${totalGP.toFixed(2)} GP`;
    document.getElementById('commissions-earned').textContent = `$${earnedCommissions.toFixed(2)}`;
    document.getElementById('commissions-pending').textContent = `$${pendingCommissions.toFixed(2)}`;
    document.getElementById('total-earnings').textContent = `$${(hoursEarnings + earnedCommissions).toFixed(2)}`;
  }
  if (currentRole === 'accountant' || currentRole === 'admin') {
    // Accountant view - all time
    const allHours = hoursEntries.reduce((sum, h) => sum + h.hours, 0);
    const allHoursPay = allHours * HOURLY_RATE;
    const allGP = salesEntries.reduce((sum, s) => sum + s.grossProfit, 0);

    // Commissions unpaid = invoice paid by customer BUT not yet paid to sales person
    const unpaidCommissions = salesEntries
      .filter(s => s.invoiceStatus === 'paid' && !s.commissionPaid)
      .reduce((sum, s) => sum + s.commission, 0);

    // Pending = invoice not yet paid by customer
    const pendingInvoiceCommissions = salesEntries
      .filter(s => s.invoiceStatus === 'pending')
      .reduce((sum, s) => sum + s.commission, 0);

    // Paid out = commissions already paid to sales person
    const paidOutCommissions = salesEntries
      .filter(s => s.commissionPaid)
      .reduce((sum, s) => sum + s.commission, 0);

    document.getElementById('acc-hours-total').textContent = allHours.toFixed(1);
    document.getElementById('acc-hours-pay').textContent = `$${allHoursPay.toFixed(2)}`;
    document.getElementById('acc-sales-total').textContent = salesEntries.length;
    document.getElementById('acc-sales-gp').textContent = `$${allGP.toFixed(2)} GP`;
    document.getElementById('acc-commissions-owed').textContent = `$${unpaidCommissions.toFixed(2)}`;
    document.getElementById('acc-commissions-pending').textContent = `$${pendingInvoiceCommissions.toFixed(2)}`;
    document.getElementById('acc-commissions-paid').textContent = `$${paidOutCommissions.toFixed(2)}`;
  }
}

// Render history
let historySort = { column: 'date', direction: 'desc' };

function renderHistory() {
  // Only render for sales role - admin/accountant use tables instead
  if (currentRole !== 'sales') return;

  const filter = document.getElementById('history-filter')?.value || 'all';
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

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

  // Sort
  items.sort((a, b) => {
    let aVal, bVal;

    if (historySort.column === 'date') {
      aVal = new Date(a.date);
      bVal = new Date(b.date);
    } else if (historySort.column === 'type') {
      aVal = a.entryType;
      bVal = b.entryType;
    } else {
      aVal = a[historySort.column] || '';
      bVal = b[historySort.column] || '';
    }

    if (aVal < bVal) return historySort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return historySort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No entries found</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    if (item.entryType === 'hours') {
      return `
        <tr>
          <td>${formatDate(item.date)}</td>
          <td><span class="status-badge unpaid">Hours</span></td>
          <td>${escapeHtml(item.type.replace('-', ' '))}${item.description ? ': ' + escapeHtml(item.description) : ''}</td>
          <td>${item.hours}h</td>
          <td>$${(item.hours * item.rate).toFixed(2)}</td>
          <td><span class="status-badge ${item.approved ? 'paid' : 'pending'}">${item.approved ? 'Approved' : 'Pending'}</span></td>
        </tr>
      `;
    } else {
      const unitsDisplay = item.units && item.units > 1 ? `${item.units} × ` : '';
      return `
        <tr>
          <td>${formatDate(item.date)}</td>
          <td><span class="status-badge paid">Sale</span></td>
          <td>
            <strong>${escapeHtml(item.customer)}</strong><br>
            <span style="font-size:0.8rem;color:#666;">${unitsDisplay}${escapeHtml(item.item)} · $${item.price.toFixed(2)}</span>
          </td>
          <td>$${item.grossProfit.toFixed(2)} GP</td>
          <td style="color:#2e7d32;font-weight:600;">+$${item.commission.toFixed(2)}</td>
          <td><span class="status-badge ${item.invoiceStatus}">${item.invoiceStatus}</span></td>
        </tr>
      `;
    }
  }).join('');
}

// History table sorting
document.querySelectorAll('#history-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const column = th.dataset.sort;
    if (historySort.column === column) {
      historySort.direction = historySort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      historySort.column = column;
      historySort.direction = 'asc';
    }
    document.querySelectorAll('#history-table th').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(historySort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
    renderHistory();
  });
});

// Inline invoice status update
window.updateInvoiceStatus = async function(saleId, status) {
  try {
    await updateDoc(doc(db, 'sales', saleId), {
      invoiceStatus: status
    });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    alert('Error updating. Please try again.');
    renderInvoicesTable(); // Re-render to reset dropdown
  }
};

// Export CSV (accountant)
document.getElementById('export-btn')?.addEventListener('click', () => {
  let csv = 'Date,Type,Description,Hours,Rate,Amount,Customer,Item,Units,Unit Price,Unit Cost,Total Price,Total Cost,GP,Commission,Invoice Status,SO#,Customer PO#\n';

  const allItems = [
    ...hoursEntries.map(h => ({ ...h, entryType: 'hours' })),
    ...salesEntries.map(s => ({ ...s, entryType: 'sale' }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  allItems.forEach(item => {
    if (item.entryType === 'hours') {
      csv += `${item.date},Hours,"${item.description || ''}",${item.hours},${item.rate},${(item.hours * item.rate).toFixed(2)},,,,,,,,,,,\n`;
    } else {
      const units = item.units || 1;
      const unitPrice = item.unitPrice || item.price;
      const unitCost = item.unitCost || item.cost;
      csv += `${item.date},Sale,,,,,"${item.customer}","${item.item}",${units},${unitPrice},${unitCost},${item.price},${item.cost},${item.grossProfit},${item.commission},${item.invoiceStatus},"${item.salesOrder || ''}","${item.customerPO || ''}"\n`;
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
document.getElementById('hide-paid-invoices-toggle')?.addEventListener('change', renderInvoicesTable);
document.getElementById('hide-paid-toggle')?.addEventListener('change', renderCommissionsTable);
document.getElementById('hide-paid-hours-toggle')?.addEventListener('change', renderHoursTable);

// Table sorting state
let invoiceSort = { column: 'date', direction: 'desc' };
let commissionSort = { column: 'date', direction: 'desc' };
let hoursSort = { column: 'date', direction: 'desc' };

// Render Invoices Table
function renderInvoicesTable() {
  const tbody = document.getElementById('invoices-tbody');
  if (!tbody) return;

  const hidePaid = document.getElementById('hide-paid-invoices-toggle')?.checked || false;

  let filtered = [...salesEntries];
  if (hidePaid) {
    filtered = filtered.filter(s => s.invoiceStatus !== 'paid');
  }

  // Sort - map data-sort values to actual field names
  const invoiceFieldMap = {
    date: 'date',
    customer: 'customer',
    item: 'item',
    price: 'price',
    gp: 'grossProfit',
    so: 'salesOrder',
    po: 'customerPO',
    status: 'invoiceStatus'
  };

  filtered = [...filtered].sort((a, b) => {
    const field = invoiceFieldMap[invoiceSort.column] || invoiceSort.column;
    let aVal = a[field] || '';
    let bVal = b[field] || '';

    if (invoiceSort.column === 'date') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    } else if (typeof aVal === 'number') {
      // Numeric comparison
    } else {
      // String comparison (case-insensitive)
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (aVal < bVal) return invoiceSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return invoiceSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No invoices found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(sale => `
    <tr>
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(sale.customer)}</td>
      <td>${sale.units > 1 ? sale.units + ' × ' : ''}${escapeHtml(sale.item)}</td>
      <td>$${sale.price.toFixed(2)}</td>
      <td>$${sale.grossProfit.toFixed(2)}</td>
      <td>${escapeHtml(sale.salesOrder || '-')}</td>
      <td>${escapeHtml(sale.customerPO || '-')}</td>
      <td>
        <select class="inline-select ${sale.invoiceStatus === 'paid' ? 'paid' : ''}" onchange="updateInvoiceStatus('${sale.id}', this.value)">
          <option value="pending" ${sale.invoiceStatus === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="paid" ${sale.invoiceStatus === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="returned" ${sale.invoiceStatus === 'returned' ? 'selected' : ''}>Returned</option>
        </select>
      </td>
    </tr>
  `).join('');
}

// Render Commissions Table
function renderCommissionsTable() {
  const tbody = document.getElementById('commissions-tbody');
  if (!tbody) return;

  const hidePaid = document.getElementById('hide-paid-toggle')?.checked || false;

  let filtered = salesEntries.filter(s => s.invoiceStatus === 'paid'); // Only show paid invoices

  if (hidePaid) {
    filtered = filtered.filter(s => !s.commissionPaid);
  }

  // Sort - map data-sort values to actual field names
  const commissionFieldMap = {
    date: 'date',
    customer: 'customer',
    item: 'item',
    gp: 'grossProfit',
    rate: 'commissionRate',
    commission: 'commission',
    invoiceStatus: 'invoiceStatus',
    commissionPaid: 'commissionPaid'
  };

  filtered = [...filtered].sort((a, b) => {
    const field = commissionFieldMap[commissionSort.column] || commissionSort.column;
    let aVal = a[field] || '';
    let bVal = b[field] || '';

    if (commissionSort.column === 'date') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    } else if (typeof aVal === 'number') {
      // Numeric comparison
    } else if (typeof aVal === 'boolean') {
      aVal = aVal ? 1 : 0;
      bVal = bVal ? 1 : 0;
    } else {
      // String comparison (case-insensitive)
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (aVal < bVal) return commissionSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return commissionSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No commissions found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(sale => `
    <tr>
      <td>${formatDate(sale.date)}</td>
      <td>${escapeHtml(sale.customer)}</td>
      <td>${escapeHtml(sale.item)}</td>
      <td>$${sale.grossProfit.toFixed(2)}</td>
      <td>${(sale.commissionRate * 100).toFixed(0)}%</td>
      <td>$${sale.commission.toFixed(2)}</td>
      <td><span class="status-badge paid">Paid</span></td>
      <td>
        <select class="inline-select ${sale.commissionPaid ? 'paid' : ''}" onchange="updateCommissionStatus('${sale.id}', this.value)">
          <option value="unpaid" ${!sale.commissionPaid ? 'selected' : ''}>Unpaid</option>
          <option value="paid" ${sale.commissionPaid ? 'selected' : ''}>Paid</option>
        </select>
      </td>
      <td>${sale.commissionPaid && sale.commissionPaidDate
        ? `<span style="font-size:0.75rem;color:#666;">${formatDate(sale.commissionPaidDate)}</span>`
        : '-'
      }</td>
    </tr>
  `).join('');
}

// Render Hours Table
function renderHoursTable() {
  const tbody = document.getElementById('hours-tbody');
  if (!tbody) return;

  const hidePaid = document.getElementById('hide-paid-hours-toggle')?.checked || false;
  const canApprove = currentUser && (currentUser.email === 'jeff@atsmanufacture.com' || currentUser.email === 'matt@atsmanufacture.com');

  let filtered = [...hoursEntries];
  if (hidePaid) {
    filtered = filtered.filter(h => !h.hoursPaid);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hours logged</td></tr>';
    return;
  }

  // Sort - map data-sort values to actual field names
  const hoursFieldMap = {
    date: 'date',
    type: 'type',
    description: 'description',
    hours: 'hours',
    amount: 'hours',
    approved: 'approved',
    hoursPaid: 'hoursPaid'
  };

  let sorted = [...filtered].sort((a, b) => {
    const field = hoursFieldMap[hoursSort.column] || hoursSort.column;
    let aVal = a[field] || '';
    let bVal = b[field] || '';

    if (hoursSort.column === 'date') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    } else if (hoursSort.column === 'hours' || hoursSort.column === 'amount') {
      aVal = hoursSort.column === 'amount' ? a.hours * a.rate : a.hours;
      bVal = hoursSort.column === 'amount' ? b.hours * b.rate : b.hours;
    } else if (typeof aVal === 'boolean') {
      aVal = aVal ? 1 : 0;
      bVal = bVal ? 1 : 0;
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (aVal < bVal) return hoursSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return hoursSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(h => `
    <tr>
      <td>${formatDate(h.date)}</td>
      <td>${escapeHtml(h.type.replace('-', ' '))}</td>
      <td>${escapeHtml(h.description || '-')}</td>
      <td>${h.hours}h</td>
      <td>$${(h.hours * h.rate).toFixed(2)}</td>
      <td>
        ${canApprove
          ? `<select class="inline-select ${h.approved ? 'paid' : ''}" onchange="updateHoursApproval('${h.id}', this.value)">
              <option value="no" ${!h.approved ? 'selected' : ''}>No</option>
              <option value="yes" ${h.approved ? 'selected' : ''}>Yes</option>
            </select>`
          : `<span class="status-badge ${h.approved ? 'paid' : 'pending'}">${h.approved ? 'Yes' : 'No'}</span>`
        }
      </td>
      <td>
        <select class="inline-select ${h.hoursPaid ? 'paid' : ''}" onchange="updateHoursPaid('${h.id}', this.value)" ${!h.approved ? 'disabled' : ''}>
          <option value="no" ${!h.hoursPaid ? 'selected' : ''}>Unpaid</option>
          <option value="yes" ${h.hoursPaid ? 'selected' : ''}>Paid</option>
        </select>
      </td>
      <td>${h.hoursPaid && h.hoursPaidDate ? formatDate(h.hoursPaidDate) : '-'}</td>
    </tr>
  `).join('');
}

// Table header sorting
document.querySelectorAll('#invoices-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const column = th.dataset.sort;
    if (invoiceSort.column === column) {
      invoiceSort.direction = invoiceSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      invoiceSort.column = column;
      invoiceSort.direction = 'asc';
    }
    document.querySelectorAll('#invoices-table th').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(invoiceSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
    renderInvoicesTable();
  });
});

document.querySelectorAll('#commissions-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const column = th.dataset.sort;
    if (commissionSort.column === column) {
      commissionSort.direction = commissionSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      commissionSort.column = column;
      commissionSort.direction = 'asc';
    }
    document.querySelectorAll('#commissions-table th').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(commissionSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
    renderCommissionsTable();
  });
});

document.querySelectorAll('#hours-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const column = th.dataset.sort;
    if (hoursSort.column === column) {
      hoursSort.direction = hoursSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      hoursSort.column = column;
      hoursSort.direction = 'asc';
    }
    document.querySelectorAll('#hours-table th').forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(hoursSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
    renderHoursTable();
  });
});

// Inline commission status update
window.updateCommissionStatus = async function(saleId, status) {
  try {
    const updates = {
      commissionPaid: status === 'paid',
      commissionPaidDate: status === 'paid' ? new Date().toISOString().split('T')[0] : null
    };
    await updateDoc(doc(db, 'sales', saleId), updates);
  } catch (error) {
    console.error('Error updating commission status:', error);
    alert('Error updating. Please try again.');
    renderCommissionsTable(); // Re-render to reset dropdown
  }
};

// Hours approval update (only Jeff or Matt can approve)
window.updateHoursApproval = async function(hoursId, value) {
  const canApprove = currentUser && (currentUser.email === 'jeff@atsmanufacture.com' || currentUser.email === 'matt@atsmanufacture.com');
  if (!canApprove) {
    alert('Only Jeff or Matt can approve hours.');
    renderHoursTable();
    return;
  }

  try {
    await updateDoc(doc(db, 'hours', hoursId), {
      approved: value === 'yes',
      approvedBy: value === 'yes' ? currentUser.email : null,
      approvedDate: value === 'yes' ? new Date().toISOString().split('T')[0] : null
    });
  } catch (error) {
    console.error('Error updating hours approval:', error);
    alert('Error updating. Please try again.');
    renderHoursTable();
  }
};

// Hours paid status update
window.updateHoursPaid = async function(hoursId, value) {
  try {
    await updateDoc(doc(db, 'hours', hoursId), {
      hoursPaid: value === 'yes',
      hoursPaidDate: value === 'yes' ? new Date().toISOString().split('T')[0] : null
    });
  } catch (error) {
    console.error('Error updating hours paid status:', error);
    alert('Error updating. Please try again.');
    renderHoursTable();
  }
};

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
