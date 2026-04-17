# 🌟 Stellar Wallet

A full-stack Stellar blockchain wallet with **Soroban smart contract** escrow integration. Create accounts, send XLM payments, track transactions — all on the Stellar Testnet.

![Stellar](https://img.shields.io/badge/Stellar-Testnet-blue?logo=stellar&logoColor=white)
![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contract-purple)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-1.74%2B-orange?logo=rust&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Smart Contract](#smart-contract)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Security](#security)
- [License](#license)

---

## Overview

This project demonstrates a production-ready approach to building on the **Stellar network**:

1. **Web Wallet** — A Node.js/Express backend serving a glassmorphism-styled single-page app for creating accounts, checking balances, sending payments, and viewing transaction history.
2. **Soroban Escrow Contract** — A Rust-based smart contract that implements a trustless escrow system with deposit, release, refund, and dispute resolution capabilities.

> ⚠️ **This application uses the Stellar Testnet.** All XLM are test tokens with no real-world value. Never use real secret keys with this app.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│   HTML / CSS (Glassmorphism) / Vanilla JS                    │
│   - Create Account UI                                        │
│   - Send Payment Form                                        │
│   - Balance Display                                          │
│   - Transaction History                                      │
└────────────────────────┬─────────────────────────────────────┘
                         │  HTTP REST
┌────────────────────────▼─────────────────────────────────────┐
│                    Express Server (Node.js)                   │
│   - POST /create-account                                     │
│   - POST /send-payment                                       │
│   - GET  /balance/:publicKey                                 │
│   - GET  /transactions/:publicKey                            │
│   - GET  /health                                             │
└────────────────────────┬─────────────────────────────────────┘
                         │  Stellar SDK
┌────────────────────────▼─────────────────────────────────────┐
│              Stellar Testnet (Horizon API)                    │
│   - Account creation via Friendbot                           │
│   - XLM transfers                                            │
│   - Ledger queries                                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              Soroban Smart Contract (Rust/WASM)               │
│   - Escrow: initialize → release / refund / dispute          │
│   - On-chain state: depositor, beneficiary, arbiter          │
│   - Token transfers via Stellar Asset Contract (SAC)         │
└──────────────────────────────────────────────────────────────┘
```

---

## Features

### Web Wallet
| Feature | Description |
|---------|-------------|
| 🔑 **Account Creation** | Generate a Stellar keypair and fund via Friendbot |
| 💰 **Balance Check** | Query native XLM balance in real time |
| 💸 **Send Payments** | Transfer XLM to any Stellar address |
| 📜 **Transaction History** | View the last 10 transactions for an account |
| 🔒 **Secret Key Protection** | Blurred display with reveal toggle |
| 📋 **Copy to Clipboard** | One-click copy for keys and hashes |
| 🎨 **Modern UI** | Dark glassmorphism design with animated background |

### Smart Contract (Escrow)
| Feature | Description |
|---------|-------------|
| 📥 **Initialize** | Lock tokens in escrow with depositor, beneficiary, and arbiter |
| ✅ **Release** | Depositor or arbiter releases funds to beneficiary |
| ↩️ **Refund** | Beneficiary, arbiter, or anyone (after expiry) refunds to depositor |
| ⚖️ **Dispute** | Depositor or beneficiary can flag a dispute for arbiter resolution |
| ⏰ **Auto-Expiry** | Escrow auto-expires after a configurable number of ledgers |
| 📊 **Queries** | Read escrow state and global counter on-chain |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla CSS, Vanilla JS |
| Backend | Node.js 18+, Express 4.x |
| Blockchain SDK | `@stellar/stellar-sdk` v12+ |
| Smart Contract | Rust, `soroban-sdk` v25.3.1 |
| Network | Stellar Testnet + Horizon API |
| Contract Runtime | Soroban (WASM) |

---

## Prerequisites

### For the Web Wallet
- **Node.js** ≥ 18.0 (for native `fetch` support)
- **npm** ≥ 9.0

### For the Smart Contract
- **Rust** ≥ 1.74 with `wasm32-unknown-unknown` target
- **Stellar CLI** (`stellar` or `soroban`)

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install Stellar CLI
cargo install --locked stellar-cli
```

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd blockchain2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
npm start
# or with auto-reload:
npm run dev
```

### 4. Open in Browser

Navigate to **http://localhost:3001**

---

## Smart Contract

The escrow smart contract is located in `smart-contract/` and is written in Rust using the Soroban SDK.

### Build

```bash
cd smart-contract
cargo build --target wasm32-unknown-unknown --release
```

The compiled WASM binary will be at:
```
target/wasm32-unknown-unknown/release/stellar_wallet_escrow.wasm
```

### Test

```bash
cd smart-contract
cargo test
```

### Deploy to Testnet

```bash
# Generate a deployer identity (first time only)
stellar keys generate deployer --network testnet

# Deploy the contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_wallet_escrow.wasm \
  --source deployer \
  --network testnet
```

### Interact via CLI

```bash
# Initialize an escrow
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --depositor <DEPOSITOR_ADDRESS> \
  --beneficiary <BENEFICIARY_ADDRESS> \
  --arbiter <ARBITER_ADDRESS> \
  --token <TOKEN_CONTRACT_ID> \
  --amount 1000000 \
  --timeout_ledgers 5000

# Check escrow status
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_escrow
```

### Contract Functions

| Function | Auth Required | Description |
|----------|--------------|-------------|
| `initialize(depositor, beneficiary, arbiter, token, amount, timeout_ledgers)` | Depositor | Create and fund an escrow |
| `release(caller)` | Depositor or Arbiter | Release funds to beneficiary |
| `refund(caller)` | Beneficiary, Arbiter, or Anyone (after expiry) | Refund to depositor |
| `dispute(caller)` | Depositor or Beneficiary | Flag escrow as disputed |
| `get_escrow()` | None | Read current escrow state |
| `get_count()` | None | Get total escrows created |

### Error Codes

| Code | Name | Meaning |
|------|------|---------|
| 1 | `AlreadyInitialized` | Escrow already exists in this contract instance |
| 2 | `NotInitialized` | No escrow has been created yet |
| 3 | `Unauthorized` | Caller is not permitted for this action |
| 4 | `AlreadySettled` | Escrow has already been released or refunded |
| 5 | `InvalidAmount` | Deposit amount must be > 0 |
| 6 | `Expired` | Escrow has passed its expiration ledger |
| 7 | `NotExpired` | Escrow has not yet expired |

---

## API Endpoints

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| `POST` | `/create-account` | Create & fund a new Stellar account | — |
| `POST` | `/send-payment` | Send XLM to another account | `{ secret, destination, amount }` |
| `GET` | `/balance/:publicKey` | Get native XLM balance | — |
| `GET` | `/transactions/:publicKey` | Get recent transaction history | Query: `?limit=10` |
| `GET` | `/health` | Server health check | — |

### Example: Create Account

```bash
curl -X POST http://localhost:3001/create-account
```

Response:
```json
{
  "publicKey": "GABC...XYZ",
  "secret": "SABC...XYZ"
}
```

### Example: Send Payment

```bash
curl -X POST http://localhost:3001/send-payment \
  -H "Content-Type: application/json" \
  -d '{"secret":"SABC...","destination":"GDEF...","amount":"100"}'
```

Response:
```json
{
  "success": true,
  "hash": "abc123...",
  "ledger": 12345
}
```

---

## Project Structure

```
blockchain2/
├── server.js                    # Express backend (Stellar SDK integration)
├── package.json                 # Node.js dependencies & scripts
├── public/                      # Static frontend files
│   ├── index.html               # Main HTML (glassmorphism UI)
│   ├── styles.css               # Design system (dark mode, animations)
│   └── app.js                   # Frontend logic (account, payments, history)
├── smart-contract/              # Soroban smart contract (Rust)
│   ├── Cargo.toml               # Rust project configuration
│   └── src/
│       └── lib.rs               # Escrow contract (initialize, release, refund, dispute)
└── README.md                    # This file
```

---

## Security

> **⚠️ Important Security Notes**

- **Testnet Only** — This application is configured for the Stellar Testnet. Never use it with mainnet credentials.
- **Secret Keys** — Secret keys are displayed client-side for demo purposes. In production, use a proper key management system (KMS) or hardware wallets.
- **No Authentication** — The API has no auth layer. Add JWT/session auth before deploying publicly.
- **Input Validation** — Basic validation is in place server-side; extend it for production use.
- **HTTPS** — Always serve over HTTPS in production.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ on the <strong>Stellar Network</strong>
</p>