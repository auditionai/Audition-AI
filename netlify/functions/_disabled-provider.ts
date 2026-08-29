// Retirement guard for queued records created before Gommo was removed.
// This module intentionally contains no provider credentials, endpoint, or
// network call. Current routing maps those rows to TST before dispatch.

const retired = () => {
  throw new Error('RETIRED_PROVIDER: Gommo routing has been removed. Requeue this job through TST or GPTi2.');
};

export const isGommoConfigured = () => false;
export const canUseGommoForPayload = async (..._args: unknown[]) => false;
export const submitGommoJob = async (..._args: unknown[]): Promise<any> => retired();
export const pollGommoJob = async (..._args: unknown[]): Promise<any> => retired();
export const cancelGommoJob = async (..._args: unknown[]) => false;
export const getGommoProviderCatalog = async () => null;
export const normalizeAndValidateGommoPayload = async (..._args: unknown[]): Promise<any> => retired();
