import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';

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

const BUSY_QUEUE_POLL_MS = 15_000;
const IDLE_QUEUE_POLL_MS = 60_000;

let globalChannel: any = null;
let currentJobs: JobState[] = [];
const jobSubscribers = new Set<(jobs: JobState[]) => void>();

let sharedQueueStats: QueueStats = EMPTY_QUEUE_STATS;
const queueStatsSubscribers = new Set<(stats: QueueStats) => void>();
let queueStatsPollTimer: ReturnType<typeof setTimeout> | null = null;
let queueStatsPollPromise: Promise<void> | null = null;
let queueStatsConsumerCount = 0;
let sharedUserId: string | null = null;
let sharedUserIdPromise: Promise<string | null> | null = null;

const notifyJobSubscribers = () => {
  jobSubscribers.forEach((subscriber) => subscriber(currentJobs));
};

const notifyQueueStatsSubscribers = () => {
  queueStatsSubscribers.forEach((subscriber) => subscriber(sharedQueueStats));
};

const hasQueueActivity = (stats: QueueStats) =>
  stats.myImageProcessing > 0 ||
  stats.myVideoProcessing > 0 ||
  stats.myQueued > 0 ||
  stats.systemImageProcessing > 0 ||
  stats.systemVideoProcessing > 0 ||
  stats.systemQueued > 0;

const scheduleQueueStatsPoll = () => {
  if (queueStatsPollTimer) {
    clearTimeout(queueStatsPollTimer);
    queueStatsPollTimer = null;
  }

  if (queueStatsConsumerCount <= 0) {
    return;
  }

  const delay = hasQueueActivity(sharedQueueStats) ? BUSY_QUEUE_POLL_MS : IDLE_QUEUE_POLL_MS;
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

  if (!force && queueStatsPollPromise) {
    return queueStatsPollPromise;
  }

  queueStatsPollPromise = (async () => {
    try {
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
  if (!supabase || globalChannel) return;

  const userId = await getSharedUserId();

  globalChannel = supabase.channel('concurrency_tracker', {
    config: {
      presence: {
        key: userId || 'anonymous',
      },
    },
  });

  globalChannel
    .on('presence', { event: 'sync' }, () => {
      const state = globalChannel.presenceState();
      const jobs: JobState[] = [];
      for (const id in state) {
        state[id].forEach((presence: any) => {
          if (presence.jobs) {
            jobs.push(...presence.jobs);
          }
        });
      }
      currentJobs = Array.from(new Map(jobs.map((job) => [job.jobId, job])).values());
      notifyJobSubscribers();
    })
    .subscribe();
};

export const useConcurrency = () => {
  const [activeJobs, setActiveJobs] = useState<JobState[]>(currentJobs);
  const [userId, setUserId] = useState<string | null>(sharedUserId);
  const [queueStats, setQueueStats] = useState<QueueStats>(sharedQueueStats);

  useEffect(() => {
    let mounted = true;

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

    return () => {
      mounted = false;
      jobSubscribers.delete(handleJobUpdate);
      queueStatsSubscribers.delete(handleQueueStatsUpdate);
      queueStatsConsumerCount = Math.max(0, queueStatsConsumerCount - 1);
      if (queueStatsConsumerCount === 0 && queueStatsPollTimer) {
        clearTimeout(queueStatsPollTimer);
        queueStatsPollTimer = null;
      }
    };
  }, []);

  const updateMyJobs = useCallback(async (jobs: JobState[]) => {
    if (!globalChannel) return;
    await globalChannel.track({ jobs });
    if (jobs.length > 0) {
      fetchSharedQueueStats(true).catch(() => undefined);
    }
  }, []);

  const triggerPoll = useCallback(() => {
    fetchSharedQueueStats(true).catch(() => undefined);
  }, []);

  return { activeJobs, userId, queueStats, updateMyJobs, triggerPoll };
};
