import { getGrokApiKey } from './_grok';

type GrokSession = {
  credentialId: string;
  credentialName: string;
  credentials: Record<string, never>;
  projectId: string;
  accessToken: string;
};

type RunWithGrokCredentialOptions<T> = {
  taskName: string;
  operation: (session: GrokSession) => Promise<T>;
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
export const runWithVertexCredentialFailover = async <T>({
  taskName,
  operation,
  onAttemptFailure,
}: RunWithGrokCredentialOptions<T>): Promise<T> => {
  const session: GrokSession = {
    credentialId: 'grok',
    credentialName: 'Grok API key',
    credentials: {},
    projectId: 'grok',
    accessToken: await getGrokApiKey(),
  };
  try {
    return await operation(session);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    await onAttemptFailure?.({ ...session, error: normalized, retryable: false });
    throw normalized;
  }
};

export const isVertexServiceAccountJson = () => false;
