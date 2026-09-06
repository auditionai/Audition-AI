import { getClaudeApiKey } from './_grok';

type ClaudeSession = {
  credentialId: string;
  credentialName: string;
  credentials: Record<string, never>;
  projectId: string;
  accessToken: string;
};

type RunWithClaudeCredentialOptions<T> = {
  taskName: string;
  operation: (session: ClaudeSession) => Promise<T>;
  onAttemptFailure?: (info: {
    credentialId: string;
    credentialName: string;
    projectId: string;
    error: Error;
    retryable: boolean;
  }) => Promise<void> | void;
};

// Compatibility export while queue diagnostic types are migrated. It never
// creates a Google token or contacts Vertex AI.
export const runWithClaudeCredential = async <T>({
  taskName,
  operation,
  onAttemptFailure,
}: RunWithClaudeCredentialOptions<T>): Promise<T> => {
  const session: ClaudeSession = {
    credentialId: 'claude',
    credentialName: 'Claude API key',
    credentials: {},
    projectId: 'claude',
    accessToken: await getClaudeApiKey(),
  };
  try {
    return await operation(session);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    await onAttemptFailure?.({ ...session, error: normalized, retryable: false });
    throw normalized;
  }
};

