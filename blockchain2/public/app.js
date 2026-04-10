document.getElementById('createAccount').addEventListener('click', async () => {
  const button = document.getElementById('createAccount');
  button.disabled = true;
  button.textContent = 'Creating...';
  try {
    const response = await fetch('/create-account', { method: 'POST' });
    const data = await response.json();
    if (response.ok) {
      document.getElementById('publicKey').textContent = data.publicKey;
      document.getElementById('secret').textContent = data.secret;
      document.getElementById('accountInfo').style.display = 'block';
      document.getElementById('balance').textContent = 'Loading...';
      // Auto check balance
      await checkBalance(data.publicKey);
    } else {
      alert('Error creating account: ' + data.error);
    }
  } catch (error) {
    alert('Network error: ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Create Account';
  }
});

async function checkBalance(publicKey) {
  try {
    const response = await fetch(`/balance/${publicKey}`);
    const data = await response.json();
    if (response.ok) {
      document.getElementById('balance').textContent = data.balance;
    } else {
      document.getElementById('balance').textContent = 'Error';
    }
  } catch (error) {
    document.getElementById('balance').textContent = 'Error';
  }
}

document.getElementById('checkBalance').addEventListener('click', async () => {
  const publicKey = document.getElementById('publicKey').textContent;
  if (publicKey) {
    document.getElementById('balance').textContent = 'Loading...';
    await checkBalance(publicKey);
  }
});

document.getElementById('sendPayment').addEventListener('click', async () => {
  const secret = document.getElementById('senderSecret').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const amount = document.getElementById('amount').value.trim();
  const resultEl = document.getElementById('transactionResult');

  if (!secret || !destination || !amount) {
    resultEl.className = 'mt-3 text-danger';
    resultEl.textContent = 'Please fill all fields.';
    return;
  }

  const button = document.getElementById('sendPayment');
  button.disabled = true;
  button.textContent = 'Sending...';
  resultEl.textContent = '';

  try {
    const response = await fetch('/send-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, destination, amount })
    });
    const data = await response.json();
    if (response.ok) {
      resultEl.className = 'mt-3 text-success';
      resultEl.textContent = `Transaction successful! Hash: ${data.hash}`;
      // Update balance if it's the same account
      const publicKey = document.getElementById('publicKey').textContent;
      if (typeof StellarSdk !== 'undefined') {
        try {
          if (StellarSdk.Keypair.fromSecret(secret).publicKey() === publicKey) {
            await checkBalance(publicKey);
          }
        } catch (e) {
          // Ignore if StellarSdk not available
        }
      }
    } else {
      resultEl.className = 'mt-3 text-danger';
      resultEl.textContent = 'Error: ' + data.error;
    }
  } catch (error) {
    resultEl.className = 'mt-3 text-danger';
    resultEl.textContent = 'Network error: ' + error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Send Payment';
  }
});