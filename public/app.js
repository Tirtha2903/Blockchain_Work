// ═══════════════════════════════════════════════
// Stellar Wallet — Frontend Application
// ═══════════════════════════════════════════════

// ── Helpers ─────────────────────────────────────
function showStatus(message, type = 'info') {
  const bar = document.getElementById('statusBar');
  const msg = document.getElementById('statusMessage');
  bar.className = `status-bar ${type}`;
  msg.textContent = message;
  bar.style.display = 'block';
  clearTimeout(bar._timeout);
  bar._timeout = setTimeout(() => {
    bar.style.display = 'none';
  }, 6000);
}

function setLoading(button, loading) {
  const text = button.querySelector('.btn-text');
  const loader = button.querySelector('.btn-loader');
  if (text) text.style.display = loading ? 'none' : 'inline';
  if (loader) loader.style.display = loading ? 'inline-block' : 'none';
  button.disabled = loading;
}

function truncateHash(hash, len = 8) {
  if (!hash || hash.length <= len * 2) return hash;
  return hash.slice(0, len) + '…' + hash.slice(-len);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Keep track of the current account
let currentPublicKey = null;
let currentSecret = null;

// ── Create Account ──────────────────────────────
document.getElementById('createAccount').addEventListener('click', async () => {
  const button = document.getElementById('createAccount');
  setLoading(button, true);

  try {
    const response = await fetch('/create-account', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      currentPublicKey = data.publicKey;
      currentSecret = data.secret;

      document.getElementById('publicKey').textContent = data.publicKey;
      document.getElementById('secret').textContent = data.secret;

      // Show account info card with animation
      const accountCard = document.getElementById('accountInfo');
      accountCard.style.display = 'block';
      accountCard.style.animation = 'fadeInUp 0.4s ease-out';

      // Show history section
      document.getElementById('historySection').style.display = 'block';

      // Auto-fill sender secret in payment form
      document.getElementById('senderSecret').value = data.secret;

      showStatus('Account created and funded with 10,000 test XLM!', 'success');

      // Auto-refresh balance
      document.getElementById('balance').textContent = '…';
      await refreshBalance(data.publicKey);
      await loadTransactions(data.publicKey);
    } else {
      showStatus('Error: ' + data.error, 'error');
    }
  } catch (error) {
    showStatus('Network error: ' + error.message, 'error');
  } finally {
    setLoading(button, false);
  }
});

// ── Refresh Balance ─────────────────────────────
async function refreshBalance(publicKey) {
  try {
    const response = await fetch(`/balance/${publicKey}`);
    const data = await response.json();
    if (response.ok) {
      document.getElementById('balance').textContent =
        parseFloat(data.balance).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 7,
        });
    } else {
      document.getElementById('balance').textContent = 'Error';
    }
  } catch {
    document.getElementById('balance').textContent = 'Error';
  }
}

document.getElementById('checkBalance').addEventListener('click', async () => {
  if (!currentPublicKey) return;
  document.getElementById('balance').textContent = '…';
  await refreshBalance(currentPublicKey);
  await loadTransactions(currentPublicKey);
});

// ── Toggle Secret Visibility ────────────────────
document.getElementById('toggleSecret').addEventListener('click', () => {
  const el = document.getElementById('secret');
  el.classList.toggle('revealed');
  const btn = document.getElementById('toggleSecret');
  btn.textContent = el.classList.contains('revealed') ? '🙈' : '👁️';
});

// ── Copy to Clipboard ───────────────────────────
document.querySelectorAll('.btn-copy').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copy);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.textContent);
      const original = btn.textContent;
      btn.textContent = '✅';
      setTimeout(() => (btn.textContent = original), 1500);
    } catch {
      // Fallback
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
});

// ── Send Payment ────────────────────────────────
document.getElementById('sendPayment').addEventListener('click', async () => {
  const secret = document.getElementById('senderSecret').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const amount = document.getElementById('amount').value.trim();
  const resultEl = document.getElementById('transactionResult');

  if (!secret || !destination || !amount) {
    resultEl.style.display = 'block';
    resultEl.className = 'tx-result error';
    resultEl.textContent = 'Please fill in all fields.';
    return;
  }

  const button = document.getElementById('sendPayment');
  setLoading(button, true);
  resultEl.style.display = 'none';

  try {
    const response = await fetch('/send-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, destination, amount }),
    });
    const data = await response.json();

    resultEl.style.display = 'block';

    if (response.ok) {
      resultEl.className = 'tx-result success';
      resultEl.innerHTML = `✅ Transaction successful!<br><small>Hash: ${truncateHash(data.hash, 12)}</small>`;
      showStatus('Payment sent successfully!', 'success');

      // Refresh balance if same account
      if (currentPublicKey) {
        await refreshBalance(currentPublicKey);
        await loadTransactions(currentPublicKey);
      }
    } else {
      resultEl.className = 'tx-result error';
      resultEl.textContent = '❌ ' + data.error;
    }
  } catch (error) {
    resultEl.style.display = 'block';
    resultEl.className = 'tx-result error';
    resultEl.textContent = 'Network error: ' + error.message;
  } finally {
    setLoading(button, false);
  }
});

// ── Load Transaction History ────────────────────
async function loadTransactions(publicKey) {
  const txList = document.getElementById('txList');

  try {
    const response = await fetch(`/transactions/${publicKey}?limit=10`);
    const data = await response.json();

    if (response.ok && data.transactions.length > 0) {
      txList.innerHTML = data.transactions
        .map(
          (tx) => `
        <div class="tx-item">
          <div class="tx-item-left">
            <span class="tx-hash">${truncateHash(tx.hash, 10)}</span>
            <span class="tx-time">${timeAgo(tx.created_at)} · Ledger ${tx.ledger}</span>
          </div>
          <span class="tx-status ${tx.successful ? 'success' : 'failed'}">
            ${tx.successful ? 'Success' : 'Failed'}
          </span>
        </div>`
        )
        .join('');
    } else {
      txList.innerHTML = '<p class="empty-state">No transactions yet.</p>';
    }
  } catch {
    txList.innerHTML = '<p class="empty-state">Could not load transactions.</p>';
  }
}