const express = require('express');
const StellarSdk = require('@stellar/stellar-sdk');

const app = express();

app.use(express.static('public'));
app.use(express.json());

// ── Stellar Configuration ─────────────────────────────────
const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const PORT = process.env.PORT || 3001;

// Use the Horizon.Server class (v15+ API)
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// ── Create Account ────────────────────────────────────────
app.post('/create-account', async (req, res) => {
  try {
    const pair = StellarSdk.Keypair.random();

    // Fund from Friendbot (testnet only)
    const response = await fetch(
      `${FRIENDBOT_URL}?addr=${encodeURIComponent(pair.publicKey())}`
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Friendbot funding failed: ${errorBody}`);
    }

    res.json({
      publicKey: pair.publicKey(),
      secret: pair.secret(),
    });
  } catch (error) {
    console.error('Create account error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Send Payment ──────────────────────────────────────────
app.post('/send-payment', async (req, res) => {
  const { secret, destination, amount } = req.body;

  // Input validation
  if (!secret || !destination || !amount) {
    return res.status(400).json({ error: 'Missing required fields: secret, destination, amount' });
  }

  if (isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const sourceKeys = StellarSdk.Keypair.fromSecret(secret);
    const sourceAccount = await server.loadAccount(sourceKeys.publicKey());

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: destination,
          asset: StellarSdk.Asset.native(),
          amount: String(amount),
        })
      )
      .addMemo(StellarSdk.Memo.text('StellarWallet'))
      .setTimeout(180)
      .build();

    transaction.sign(sourceKeys);

    const result = await server.submitTransaction(transaction);

    res.json({
      success: true,
      hash: result.hash,
      ledger: result.ledger,
    });
  } catch (error) {
    console.error('Send payment error:', error.message);
    // Extract extra detail from Horizon errors
    const extras = error?.response?.data?.extras?.result_codes;
    const detail = extras
      ? JSON.stringify(extras)
      : error.message;
    res.status(500).json({ error: detail });
  }
});

// ── Get Balance ───────────────────────────────────────────
app.get('/balance/:publicKey', async (req, res) => {
  try {
    const account = await server.loadAccount(req.params.publicKey);
    const nativeBalance = account.balances.find(
      (b) => b.asset_type === 'native'
    );
    res.json({
      balance: nativeBalance ? nativeBalance.balance : '0',
      balances: account.balances,
    });
  } catch (error) {
    console.error('Balance check error:', error.message);
    if (error?.response?.status === 404) {
      return res.status(404).json({ error: 'Account not found on the network' });
    }
    res.status(500).json({ error: error.message });
  }
});

// ── Transaction History ───────────────────────────────────
app.get('/transactions/:publicKey', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const txPage = await server
      .transactions()
      .forAccount(req.params.publicKey)
      .order('desc')
      .limit(limit)
      .call();

    const transactions = txPage.records.map((tx) => ({
      id: tx.id,
      hash: tx.hash,
      ledger: tx.ledger,
      created_at: tx.created_at,
      fee_charged: tx.fee_charged,
      memo: tx.memo || null,
      operation_count: tx.operation_count,
      successful: tx.successful,
    }));

    res.json({ transactions });
  } catch (error) {
    console.error('Transaction history error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Health Check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    network: 'testnet',
    horizon: HORIZON_URL,
    timestamp: new Date().toISOString(),
  });
});

// ── Start Server ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Stellar Wallet server running on http://localhost:${PORT}`);
  console.log(`🌐 Network: Testnet`);
  console.log(`🔭 Horizon: ${HORIZON_URL}\n`);
});