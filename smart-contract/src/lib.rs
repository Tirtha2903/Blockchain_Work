#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
    Symbol, Vec, vec,
};

// ──────────────────────────────────────────────
// Error Codes
// ──────────────────────────────────────────────
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    /// The escrow has already been initialized.
    AlreadyInitialized = 1,
    /// The escrow has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not authorized for this action.
    Unauthorized = 3,
    /// The escrow has already been released or refunded.
    AlreadySettled = 4,
    /// The deposit amount must be greater than zero.
    InvalidAmount = 5,
    /// The escrow has expired and can only be refunded.
    Expired = 6,
    /// The escrow has not yet expired.
    NotExpired = 7,
}

// ──────────────────────────────────────────────
// Data Types
// ──────────────────────────────────────────────
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowData {
    /// The depositor who locked funds.
    pub depositor: Address,
    /// The beneficiary who will receive funds on release.
    pub beneficiary: Address,
    /// The arbiter who can resolve disputes.
    pub arbiter: Address,
    /// The token contract address (e.g., native XLM wrapper).
    pub token: Address,
    /// The amount held in escrow (in stroops for XLM).
    pub amount: i128,
    /// Current status of the escrow.
    pub status: EscrowStatus,
    /// Ledger sequence number after which the escrow can be refunded.
    pub expiration_ledger: u32,
}

// ──────────────────────────────────────────────
// Storage Keys
// ──────────────────────────────────────────────
const ESCROW_KEY: Symbol = symbol_short!("ESCROW");
const COUNTER_KEY: Symbol = symbol_short!("COUNTER");

// ──────────────────────────────────────────────
// Contract
// ──────────────────────────────────────────────
#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // ── Initialize ──────────────────────────────
    /// Create a new escrow.  The depositor must authorize this transaction,
    /// which will transfer `amount` of `token` into the contract.
    ///
    /// # Arguments
    /// * `depositor`        – The address funding the escrow.
    /// * `beneficiary`      – The address that will receive funds on release.
    /// * `arbiter`          – A trusted third-party who can settle disputes.
    /// * `token`            – The token contract (e.g., wrapped XLM SAC).
    /// * `amount`           – Amount to lock (must be > 0).
    /// * `timeout_ledgers`  – Number of ledgers until the escrow expires.
    pub fn initialize(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        timeout_ledgers: u32,
    ) -> Result<u32, EscrowError> {
        // Prevent re-initialization
        if env.storage().instance().has(&ESCROW_KEY) {
            return Err(EscrowError::AlreadyInitialized);
        }

        // Validate amount
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        // The depositor must authorize the call
        depositor.require_auth();

        // Transfer tokens from depositor → this contract
        let contract_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&depositor, &contract_address, &amount);

        // Calculate expiration
        let expiration_ledger = env.ledger().sequence() + timeout_ledgers;

        // Persist escrow data
        let escrow = EscrowData {
            depositor,
            beneficiary,
            arbiter,
            token,
            amount,
            status: EscrowStatus::Active,
            expiration_ledger,
        };

        env.storage().instance().set(&ESCROW_KEY, &escrow);

        // Increment global counter
        let count: u32 = env
            .storage()
            .instance()
            .get(&COUNTER_KEY)
            .unwrap_or(0);
        env.storage().instance().set(&COUNTER_KEY, &(count + 1));

        // Emit event
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("init")),
            amount,
        );

        Ok(count + 1)
    }

    // ── Release ─────────────────────────────────
    /// Release funds to the beneficiary.  Only the depositor or arbiter
    /// may call this.
    pub fn release(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let mut escrow: EscrowData = env
            .storage()
            .instance()
            .get(&ESCROW_KEY)
            .ok_or(EscrowError::NotInitialized)?;

        // Must still be active
        if escrow.status != EscrowStatus::Active {
            return Err(EscrowError::AlreadySettled);
        }

        // Only depositor or arbiter can release
        if caller != escrow.depositor && caller != escrow.arbiter {
            return Err(EscrowError::Unauthorized);
        }

        // Transfer to beneficiary
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );

        escrow.status = EscrowStatus::Released;
        env.storage().instance().set(&ESCROW_KEY, &escrow);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("release")),
            escrow.amount,
        );

        Ok(())
    }

    // ── Refund ──────────────────────────────────
    /// Refund funds back to the depositor.  This can be called by:
    /// - The beneficiary (voluntary refund), or
    /// - The arbiter (dispute resolution), or
    /// - Anyone after the escrow has expired.
    pub fn refund(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let mut escrow: EscrowData = env
            .storage()
            .instance()
            .get(&ESCROW_KEY)
            .ok_or(EscrowError::NotInitialized)?;

        if escrow.status != EscrowStatus::Active {
            return Err(EscrowError::AlreadySettled);
        }

        let is_expired = env.ledger().sequence() >= escrow.expiration_ledger;
        let is_beneficiary = caller == escrow.beneficiary;
        let is_arbiter = caller == escrow.arbiter;

        // Either an authorized party, or anyone after expiry
        if !is_beneficiary && !is_arbiter && !is_expired {
            return Err(EscrowError::Unauthorized);
        }

        // Transfer back to depositor
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.depositor,
            &escrow.amount,
        );

        escrow.status = EscrowStatus::Refunded;
        env.storage().instance().set(&ESCROW_KEY, &escrow);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("refund")),
            escrow.amount,
        );

        Ok(())
    }

    // ── Dispute ─────────────────────────────────
    /// Mark the escrow as disputed.  Only the depositor or beneficiary
    /// can raise a dispute.  Once disputed, only the arbiter can
    /// call `release` or `refund` to settle.
    pub fn dispute(env: Env, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let mut escrow: EscrowData = env
            .storage()
            .instance()
            .get(&ESCROW_KEY)
            .ok_or(EscrowError::NotInitialized)?;

        if escrow.status != EscrowStatus::Active {
            return Err(EscrowError::AlreadySettled);
        }

        if caller != escrow.depositor && caller != escrow.beneficiary {
            return Err(EscrowError::Unauthorized);
        }

        escrow.status = EscrowStatus::Disputed;
        env.storage().instance().set(&ESCROW_KEY, &escrow);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("dispute")),
            escrow.amount,
        );

        Ok(())
    }

    // ── Read-Only Queries ───────────────────────
    /// Get the current escrow details.
    pub fn get_escrow(env: Env) -> Result<EscrowData, EscrowError> {
        env.storage()
            .instance()
            .get(&ESCROW_KEY)
            .ok_or(EscrowError::NotInitialized)
    }

    /// Get the total number of escrows ever created through this contract.
    pub fn get_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&COUNTER_KEY)
            .unwrap_or(0)
    }
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};
    use soroban_sdk::Env;

    fn setup_token(env: &Env, admin: &Address) -> (Address, TokenClient, StellarAssetClient) {
        let token_address = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let token = TokenClient::new(env, &token_address);
        let token_admin = StellarAssetClient::new(env, &token_address);
        (token_address, token, token_admin)
    }

    #[test]
    fn test_full_escrow_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let (token_address, token, token_admin) = setup_token(&env, &arbiter);

        // Mint tokens to the depositor
        token_admin.mint(&depositor, &1_000_000);
        assert_eq!(token.balance(&depositor), 1_000_000);

        // Register the escrow contract
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        // Initialize escrow
        let result = client.initialize(
            &depositor,
            &beneficiary,
            &arbiter,
            &token_address,
            &500_000,
            &1000,
        );
        assert_eq!(result, 1);

        // Depositor balance should decrease
        assert_eq!(token.balance(&depositor), 500_000);

        // Check escrow data
        let escrow = client.get_escrow();
        assert_eq!(escrow.amount, 500_000);
        assert_eq!(escrow.status, EscrowStatus::Active);

        // Release to beneficiary
        client.release(&depositor);

        // Beneficiary should receive funds
        assert_eq!(token.balance(&beneficiary), 500_000);

        let escrow = client.get_escrow();
        assert_eq!(escrow.status, EscrowStatus::Released);
    }

    #[test]
    fn test_refund_after_expiry() {
        let env = Env::default();
        env.mock_all_auths();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let (token_address, token, token_admin) = setup_token(&env, &arbiter);
        token_admin.mint(&depositor, &1_000_000);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(
            &depositor,
            &beneficiary,
            &arbiter,
            &token_address,
            &500_000,
            &100, // expires after 100 ledgers
        );

        // Fast-forward past expiration
        env.ledger().set_sequence_number(env.ledger().sequence() + 200);

        // Anyone can refund after expiry (using beneficiary here)
        client.refund(&beneficiary);

        assert_eq!(token.balance(&depositor), 1_000_000);

        let escrow = client.get_escrow();
        assert_eq!(escrow.status, EscrowStatus::Refunded);
    }

    #[test]
    fn test_dispute_and_arbiter_release() {
        let env = Env::default();
        env.mock_all_auths();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let (token_address, token, token_admin) = setup_token(&env, &arbiter);
        token_admin.mint(&depositor, &1_000_000);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(
            &depositor,
            &beneficiary,
            &arbiter,
            &token_address,
            &500_000,
            &1000,
        );

        // Depositor raises dispute
        client.dispute(&depositor);
        let escrow = client.get_escrow();
        assert_eq!(escrow.status, EscrowStatus::Disputed);

        // Arbiter resolves by releasing to beneficiary
        client.release(&arbiter);
        assert_eq!(token.balance(&beneficiary), 500_000);
    }

    #[test]
    fn test_counter_increments() {
        let env = Env::default();
        env.mock_all_auths();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let arbiter = Address::generate(&env);

        let (token_address, _token, token_admin) = setup_token(&env, &arbiter);
        token_admin.mint(&depositor, &10_000_000);

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        assert_eq!(client.get_count(), 0);

        client.initialize(
            &depositor,
            &beneficiary,
            &arbiter,
            &token_address,
            &100,
            &1000,
        );

        assert_eq!(client.get_count(), 1);
    }
}
