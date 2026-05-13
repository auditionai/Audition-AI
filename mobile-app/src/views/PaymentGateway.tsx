import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ManualPaymentGateway } from '../../../views/ManualPaymentGateway';
import type { Transaction } from '../types';

const PENDING_TRANSACTION_STORAGE_KEY = 'audition-mobile-pending-transaction';

function readPendingTransactionFromStorage(): Transaction | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_TRANSACTION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Transaction;
  } catch (error) {
    console.warn('[PaymentGatewayView] Failed to read pending transaction from storage:', error);
    return null;
  }
}

function clearPendingTransaction() {
  try {
    window.sessionStorage.removeItem(PENDING_TRANSACTION_STORAGE_KEY);
  } catch (error) {
    console.warn('[PaymentGatewayView] Failed to clear pending transaction from storage:', error);
  }
}

export function PaymentGatewayView() {
  const location = useLocation();
  const navigate = useNavigate();

  const transaction = useMemo(() => {
    const stateTransaction = (location.state as { transaction?: Transaction } | null)?.transaction;
    return stateTransaction || readPendingTransactionFromStorage();
  }, [location.state]);

  if (!transaction) {
    return <Navigate to="/topup" replace />;
  }

  return (
    <ManualPaymentGateway
      transaction={transaction}
      onSuccess={() => {
        clearPendingTransaction();
        navigate('/topup', { replace: true });
      }}
      onCancel={() => {
        clearPendingTransaction();
        navigate('/topup', { replace: true });
      }}
    />
  );
}
