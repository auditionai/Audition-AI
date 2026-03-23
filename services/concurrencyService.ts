import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';
import { getAllImagesFromStorage } from './storageService';

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

let globalChannel: any = null;
let currentJobs: JobState[] = [];
const subscribers = new Set<(jobs: JobState[]) => void>();

const notifySubscribers = () => {
  subscribers.forEach(sub => sub(currentJobs));
};

export const initConcurrencyTracker = async () => {
  if (!supabase || globalChannel) return;

  const user = await getUserProfile();
  
  globalChannel = supabase.channel('concurrency_tracker', {
    config: {
      presence: {
        key: user?.id || 'anonymous',
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
      currentJobs = Array.from(new Map(jobs.map(j => [j.jobId, j])).values());
      notifySubscribers();
    })
    .subscribe();
};

export const useConcurrency = () => {
  const [activeJobs, setActiveJobs] = useState<JobState[]>(currentJobs);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState<number>(0);
  const [queueStats, setQueueStats] = useState<QueueStats>(EMPTY_QUEUE_STATS);

  useEffect(() => {
    getUserProfile().then(user => {
      if (user) setUserId(user.id);
    });

    initConcurrencyTracker();

    const handleUpdate = (jobs: JobState[]) => {
      setActiveJobs(jobs);
    };

    subscribers.add(handleUpdate);
    return () => {
      subscribers.delete(handleUpdate);
    };
  }, []);

  const updateMyJobs = useCallback(async (jobs: JobState[]) => {
    if (!globalChannel) return;
    await globalChannel.track({ jobs });
  }, []);

  const triggerPoll = useCallback(() => {
    setLastPollTime(Date.now());
  }, []);

  // Poll storage + queue stats
  useEffect(() => {
    if (!userId || !globalChannel) return;

    const pollStorage = async () => {
      try {
        const finalImages = await getAllImagesFromStorage();

        const myActiveJobs: JobState[] = finalImages
          .filter(img => (img.status === 'processing' || img.status === 'queued'))
          .map(img => ({
            jobId: img.jobId || img.id,
            userId: userId,
            type: img.toolId?.includes('video') || img.toolId?.includes('motion') ? 'video' : 'image',
            status: img.status as 'processing' | 'queued',
            timestamp: img.timestamp,
            progress: img.progress || 0,
          }));

        const fallbackStats: QueueStats = {
          myImageProcessing: myActiveJobs.filter(job => job.userId === userId && job.type === 'image' && job.status === 'processing').length,
          myVideoProcessing: myActiveJobs.filter(job => job.userId === userId && job.type === 'video' && job.status === 'processing').length,
          myQueued: myActiveJobs.filter(job => job.userId === userId && job.status === 'queued').length,
          systemImageProcessing: currentJobs.filter(job => job.type === 'image' && job.status === 'processing').length,
          systemVideoProcessing: currentJobs.filter(job => job.type === 'video' && job.status === 'processing').length,
          systemQueued: currentJobs.filter(job => job.status === 'queued').length,
        };

        await globalChannel.track({ jobs: myActiveJobs });

        if (supabase) {
          try {
            const { data, error } = await supabase.rpc('get_generation_queue_stats');
            if (!error) {
              const row = Array.isArray(data) ? data[0] : data;
              setQueueStats({
                myImageProcessing: Number(row?.my_image_processing || 0),
                myVideoProcessing: Number(row?.my_video_processing || 0),
                myQueued: Number(row?.my_queued || 0),
                systemImageProcessing: Number(row?.system_image_processing || 0),
                systemVideoProcessing: Number(row?.system_video_processing || 0),
                systemQueued: Number(row?.system_queued || 0),
              });
            } else {
              setQueueStats(fallbackStats);
            }
          } catch {
            setQueueStats(fallbackStats);
          }
        } else {
          setQueueStats(fallbackStats);
        }
      } catch (error) {
        console.error("Failed to poll storage for concurrency:", error);
      }
    };

    pollStorage();
    const interval = setInterval(pollStorage, 10000);
    return () => clearInterval(interval);
  }, [userId, lastPollTime]);

  return { activeJobs, userId, queueStats, updateMyJobs, triggerPoll };
};
