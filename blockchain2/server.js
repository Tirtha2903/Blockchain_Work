const express = require('express');
const StellarSdk = require('stellar-sdk');

const app = express();

app.use(express.static('public'));
app.use(express.json());

// Use testnet
const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');

app.post('/create-account', async (req, res) => {
  try {
    const pair = StellarSdk.Keypair.random();
    // Fund from friendbot
    const response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(pair.publicKey())}`);
    if (!response.ok) {
      throw new Error('Failed to fund account');
    }
    res.json({ publicKey: pair.publicKey(), secret: pair.secret() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-payment', async (req, res) => {
  const { secret, destination, amount } = req.body;
  try {
    const sourceKeys = StellarSdk.Keypair.fromSecret(secret);
    const sourceAccount = await server.loadAccount(sourceKeys.publicKey());
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: destination,
        asset: StellarSdk.Asset.native(),
        amount: amount,
      }))
      .setTimeout(180)
      .build();
    transaction.sign(sourceKeys);
    const result = await server.submitTransaction(transaction);
    res.json({ success: true, hash: result.hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/balance/:publicKey', async (req, res) => {
  try {
    const account = await server.loadAccount(req.params.publicKey);
    const balance = account.balances.find(b => b.asset_type === 'native');
    res.json({ balance: balance ? balance.balance : '0' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => console.log('Stellar Wallet server running on port 3001'));