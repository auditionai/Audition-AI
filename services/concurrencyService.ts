import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';
import { QUEUE_SUBMITTED_EVENT } from './serverQueueService';
import { isSystemQueueKind } from '../shared/queueKinds';

export interface JobState {
  jobId: string;
  userId: string;
  type: 'image' | 'video';
  status: 'processing' | 'queued';
  timestamp: number;
  progress?: number;
}

export interface QueueStats {
  myImageProcessing: number;
  myVideoProcessing: number;
  myQueued: number;
  systemImageProcessing: number;
  systemVideoProcessing: number;
  systemQueued: number;
}

export const CONCURRENCY_LIMITS = {
  user: {
    imageProcessing: 1,
    videoProcessing: 1,
    queued: 1,
  },
  system: {
    imageProcessing: 4,
    videoProcessing: 4,
    queued: 10,
  },
} as const;

const EMPTY_QUEUE_STATS: QueueStats = {
  myImageProcessing: 0,
  myVideoProcessing: 0,
  myQueued: 0,
  systemImageProcessing: 0,
  systemVideoProcessing: 0,
  systemQueued: 0,
};

const BUSY_QUEUE_POLL_MS = 20_000;
const IDLE_QUEUE_POLL_MS = 300_000;
const MANUAL_QUEUE_POLL_MIN_INTERVAL_MS = 5_000;
const SUBMIT_FALLBACK_REFRESH_MS = 5_000;
const ACTIVE_JOB_STATUSES = new Set(['queued', 'processing']);

let currentJobs: JobState[] = [];
const jobSubscribers = new Set<(jobs: JobState[]) => void>();

let sharedQueueStats: QueueStats = EMPTY_QUEUE_STATS;
const queueStatsSubscribers = new Set<(stats: QueueStats) => void>();
let queueStatsPollTimer: ReturnType<typeof setTimeout> | null = null;
let queueStatsPollPromise: Promise<void> | null = null;
let lastQueueStatsFetchAt = 0;
let queueStatsConsumerCount = 0;
let sharedUserId: string | null = null;
let sharedUserIdPromise: Promise<string | null> | null = null;
let trackerUserId: string | null = null;
let trackerInitPromise: Promise<void> | null = null;
let activeJobsFetchPromise: Promise<void> | null = null;

type GeneratedImageQueueRow = {
  id: string;
  user_id: string;
  asset_type?: string | null;
  queue_kind?: string | null;
  status?: string | null;
  progress?: number | null;
  created_at?: string | null;
};

const notifyJobSubscribers = () => {
  jobSubscribers.forEach((subscriber) => subscriber(currentJobs));
};

const notifyQueueStatsSubscribers = () => {
  queueStatsSubscribers.forEach((subscriber) => subscriber(sharedQueueStats));
};

const hasMyQueueActivity = (stats: QueueStats) =>
  stats.myImageProcessing > 0 ||
  stats.myVideoProcessing > 0 ||
  stats.myQueued > 0;

const sortJobsByTimestampDesc = (jobs: JobState[]) =>
  [...jobs].sort((a, b) => b.timestamp - a.timestamp);

const mapGeneratedImageToJobState = (row: GeneratedImageQueueRow | null | undefined): JobState | null => {
  if (
    !row?.id ||
    !row.user_id ||
    !ACTIVE_JOB_STATUSES.has(String(row.status || '')) ||
    !isSystemQueueKind(row.queue_kind)
  ) {
    return null;
  }

  return {
    jobId: row.id,
    userId: row.user_id,
    type: row.asset_type === 'video' ? 'video' : 'image',
    status: row.status === 'processing' ? 'processing' : 'queued',
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    progress: typeof row.progress === 'number' ? row.progress : 0,
  };
};

const replaceCurrentJobs = (jobs: JobState[]) => {
  currentJobs = sortJobsByTimestampDesc(jobs);
  notifyJobSubscribers();
};

const cleanupConcurrencyTracker = () => {
  trackerUserId = null;
  replaceCurrentJobs([]);
};

const scheduleQueueStatsPoll = () => {
  if (queueStatsPollTimer) {
    clearTimeout(queueStatsPollTimer);
    queueStatsPollTimer = null;
  }

  if (queueStatsConsumerCount <= 0) {
    return;
  }

  const delay = hasMyQueueActivity(sharedQueueStats) || currentJobs.length > 0
    ? BUSY_QUEUE_POLL_MS
    : IDLE_QUEUE_POLL_MS;
  queueStatsPollTimer = setTimeout(() => {
    fetchSharedQueueStats().catch((error) => {
      console.warn('[Concurrency] Failed to refresh queue stats', error);
    });
  }, delay);
};

const getSharedUserId = async () => {
  if (sharedUserId !== null) {
    return sharedUserId;
  }

  if (!sharedUserIdPromise) {
    sharedUserIdPromise = getUserProfile()
      .then((user) => {
        sharedUserId = user?.id || null;
        return sharedUserId;
      })
      .catch(() => {
        sharedUserId = null;
        return null;
      })
      .finally(() => {
        sharedUserIdPromise = null;
      });
  }

  return sharedUserIdPromise;
};

const refreshCurrentJobs = async (userId = sharedUserId) => {
  if (!supabase || !userId) {
    replaceCurrentJobs([]);
    return;
  }

  if (activeJobsFetchPromise) {
    return activeJobsFetchPromise;
  }

  activeJobsFetchPromise = (async () => {
    const { data, error } = await supabase
      .from('generated_images')
      .select('id, user_id, asset_type, queue_kind, status, progress, created_at')
      .eq('user_id', userId)
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    replaceCurrentJobs(
      (data || [])
        .map((row: GeneratedImageQueueRow) => mapGeneratedImageToJobState(row))
        .filter(Boolean) as JobState[],
    );
  })()
    .catch((error) => {
      console.warn('[Concurrency] Failed to refresh active jobs', error);
    })
    .finally(() => {
      activeJobsFetchPromise = null;
    });

  return activeJobsFetchPromise;
};

const fetchSharedQueueStats = async (force = false) => {
  if (!supabase) {
    sharedQueueStats = EMPTY_QUEUE_STATS;
    notifyQueueStatsSubscribers();
    return;
  }

  if (queueStatsPollPromise) {
    return queueStatsPollPromise;
  }

  if (force && Date.now() - lastQueueStatsFetchAt < MANUAL_QUEUE_POLL_MIN_INTERVAL_MS) {
    return;
  }

  queueStatsPollPromise = (async () => {
    try {
      lastQueueStatsFetchAt = Date.now();
      const { data, error } = await supabase.rpc('get_generation_queue_stats');
      if (error) {
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : data;
      sharedQueueStats = {
        myImageProcessing: Number(row?.my_image_processing || 0),
        myVideoProcessing: Number(row?.my_video_processing || 0),
        myQueued: Number(row?.my_queued || 0),
        systemImageProcessing: Number(row?.system_image_processing || 0),
        systemVideoProcessing: Number(row?.system_video_processing || 0),
        systemQueued: Number(row?.system_queued || 0),
      };
      notifyQueueStatsSubscribers();
      await refreshCurrentJobs();
    } catch (error) {
      console.warn('[Concurrency] Failed to load queue stats', error);
    } finally {
      queueStatsPollPromise = null;
      scheduleQueueStatsPoll();
    }
  })();

  return queueStatsPollPromise;
};

export const initConcurrencyTracker = async () => {
  if (!supabase) {
    cleanupConcurrencyTracker();
    return;
  }

  if (trackerInitPromise) {
    return trackerInitPromise;
  }

  trackerInitPromise = (async () => {
    const userId = await getSharedUserId();

    if (!userId || queueStatsConsumerCount <= 0) {
      cleanupConcurrencyTracker();
      return;
    }

    if (trackerUserId === userId) {
      return;
    }

    cleanupConcurrencyTracker();
    trackerUserId = userId;
    await refreshCurrentJobs(userId);
  })()
    .finally(() => {
      trackerInitPromise = null;
    });

  return trackerInitPromise;
};

export const useConcurrency = () => {
  const [activeJobs, setActiveJobs] = useState<JobState[]>(currentJobs);
  const [userId, setUserId] = useState<string | null>(sharedUserId);
  const [queueStats, setQueueStats] = useState<QueueStats>(sharedQueueStats);

  useEffect(() => {
    let mounted = true;
    let queuedRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    queueStatsConsumerCount += 1;

    const handleJobUpdate = (jobs: JobState[]) => {
      setActiveJobs(jobs);
    };
    const handleQueueStatsUpdate = (stats: QueueStats) => {
      setQueueStats(stats);
    };

    jobSubscribers.add(handleJobUpdate);
    queueStatsSubscribers.add(handleQueueStatsUpdate);

    setActiveJobs(currentJobs);
    setQueueStats(sharedQueueStats);

    getSharedUserId().then((id) => {
      if (mounted) {
        setUserId(id);
      }
    });

    initConcurrencyTracker();
    fetchSharedQueueStats().catch((error) => {
      console.warn('[Concurrency] Initial queue stats load failed', error);
    });

    const handleQueueSubmitted = () => {
      if (queuedRefreshTimer) {
        clearTimeout(queuedRefreshTimer);
      }

      fetchSharedQueueStats(true).catch((error) => {
        console.warn('[Concurrency] Queue stats refresh after submit failed', error);
      });

      queuedRefreshTimer = setTimeout(() => {
        fetchSharedQueueStats(true).catch((error) => {
          console.warn('[Concurrency] Fallback queue stats refresh after submit failed', error);
        });
      }, SUBMIT_FALLBACK_REFRESH_MS);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
    }

    return () => {
      mounted = false;
      if (queuedRefreshTimer) {
        clearTimeout(queuedRefreshTimer);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener(QUEUE_SUBMITTED_EVENT, handleQueueSubmitted);
      }
      jobSubscribers.delete(handleJobUpdate);
      queueStatsSubscribers.delete(handleQueueStatsUpdate);
      queueStatsConsumerCount = Math.max(0, queueStatsConsumerCount - 1);
      if (queueStatsConsumerCount === 0 && queueStatsPollTimer) {
        clearTimeout(queueStatsPollTimer);
        queueStatsPollTimer = null;
      }
      if (queueStatsConsumerCount === 0) {
        cleanupConcurrencyTracker();
      }
    };
  }, []);

  const updateMyJobs = useCallback(async (_jobs: JobState[]) => {
    return;
  }, []);

  const triggerPoll = useCallback(() => {
    fetchSharedQueueStats(true).catch(() => undefined);
  }, []);

  return { activeJobs, userId, queueStats, updateMyJobs, triggerPoll };
};
