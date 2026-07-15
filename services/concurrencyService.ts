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
const REALTIME_STATS_REFRESH_DEBOUNCE_MS = 1_000;
const SUBMIT_FALLBACK_REFRESH_MS = 5_000;
const RECENT_REALTIME_WINDOW_MS = 7_000;
const ACTIVE_JOB_STATUSES = new Set(['queued', 'processing']);

let globalChannel: any = null;
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
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let lastRealtimeQueueEventAt = 0;

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

const upsertCurrentJob = (job: JobState | null) => {
  if (!job) {
    return;
  }

  const nextJobs = currentJobs.filter((entry) => entry.jobId !== job.jobId);
  nextJobs.push(job);
  replaceCurrentJobs(nextJobs);
};

const removeCurrentJob = (jobId?: string | null) => {
  if (!jobId) {
    return;
  }

  const nextJobs = currentJobs.filter((entry) => entry.jobId !== jobId);
  if (nextJobs.length !== currentJobs.length) {
    replaceCurrentJobs(nextJobs);
  }
};

const clearRealtimeRefreshTimer = () => {
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
};

const scheduleRealtimeStatsRefresh = (triggerReason: string) => {
  lastRealtimeQueueEventAt = Date.now();
  clearRealtimeRefreshTimer();
  realtimeRefreshTimer = setTimeout(() => {
    fetchSharedQueueStats(true).catch((error) => {
      console.warn(`[Concurrency] Queue stats refresh after ${triggerReason} failed`, error);
    });
  }, REALTIME_STATS_REFRESH_DEBOUNCE_MS);
};

const cleanupConcurrencyTracker = () => {
  clearRealtimeRefreshTimer();
  if (globalChannel && supabase) {
    supabase.removeChannel(globalChannel).catch(() => undefined);
  }
  globalChannel = null;
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

  const delay = hasMyQueueActivity(sharedQueueStats) ? BUSY_QUEUE_POLL_MS : IDLE_QUEUE_POLL_MS;
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

    if (globalChannel && trackerUserId === userId) {
      return;
    }

    cleanupConcurrencyTracker();
    trackerUserId = userId;

    try {
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
    } catch (error) {
      console.warn('[Concurrency] Failed to seed active jobs from Supabase', error);
      replaceCurrentJobs([]);
    }

    if (queueStatsConsumerCount <= 0) {
      cleanupConcurrencyTracker();
      return;
    }

    globalChannel = supabase
      .channel(`audition:queue:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generated_images',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const previousJob = currentJobs.find((entry) => entry.jobId === (payload?.old?.id || payload?.new?.id));
          const nextRow = mapGeneratedImageToJobState(payload?.new as GeneratedImageQueueRow | undefined);
          const previousJobId = payload?.old?.id || payload?.new?.id;

          if (nextRow) {
            upsertCurrentJob(nextRow);
          } else {
            removeCurrentJob(previousJobId);
          }

          const statusChanged = previousJob?.status !== nextRow?.status;
          if (payload?.eventType !== 'UPDATE' || statusChanged) {
            scheduleRealtimeStatsRefresh(`realtime ${payload?.eventType || 'change'}`);
          }
        },
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Concurrency] Realtime queue channel failed, relying on polling fallback.');
        }
      });
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

      const trackerReady = Boolean(globalChannel) && trackerUserId === sharedUserId;
      if (!trackerReady) {
        fetchSharedQueueStats(true).catch((error) => {
          console.warn('[Concurrency] Queue stats refresh after submit failed', error);
        });
        return;
      }

      queuedRefreshTimer = setTimeout(() => {
        if (Date.now() - lastRealtimeQueueEventAt < RECENT_REALTIME_WINDOW_MS) {
          return;
        }

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
