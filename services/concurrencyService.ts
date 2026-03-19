import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getUserProfile } from './economyService';
import { getAllImagesFromStorage, saveImageToStorage } from './storageService';

export interface JobState {
  jobId: string;
  userId: string;
  type: 'image' | 'video';
  status: 'processing' | 'queued';
  timestamp: number;
}

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

  // Poll local storage to automatically broadcast my jobs and check TST API for queued jobs
  useEffect(() => {
    if (!userId || !globalChannel) return;

    const pollStorage = async () => {
      try {
        const images = await getAllImagesFromStorage();
        let stateChanged = false;

        // Check TST API for any queued or processing jobs
        const now = Date.now();
        for (const img of images) {
          if ((img.status === 'queued' || img.status === 'processing') && img.jobId) {
            try {
              const pollRes = await fetch(`/api/tst-poll?jobId=${img.jobId}`);
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.status === 'completed' && pollData.result) {
                  img.status = 'completed';
                  img.url = pollData.result;
                  await saveImageToStorage(img);
                  stateChanged = true;
                } else if (pollData.status === 'failed' || pollData.status === 'error') {
                  img.status = 'failed';
                  img.url = ''; // Or some error indicator
                  await saveImageToStorage(img);
                  stateChanged = true;
                } else if (pollData.status === 'processing') {
                  img.status = 'processing';
                  await saveImageToStorage(img);
                  stateChanged = true;
                }
              }
            } catch (err) {
              console.error(`Failed to poll TST API for job ${img.jobId}`, err);
            }
          }
        }

        // Re-fetch images if state changed
        const finalImages = stateChanged ? await getAllImagesFromStorage() : images;

        const myActiveJobs: JobState[] = finalImages
          .filter(img => (img.status === 'processing' || img.status === 'queued') && img.jobId)
          .map(img => ({
            jobId: img.id,
            userId: userId,
            type: 'image',
            status: img.status as 'processing' | 'queued',
            timestamp: img.timestamp
          }));

        // We could also check for video jobs here if they are stored similarly
        
        await globalChannel.track({ jobs: myActiveJobs });
      } catch (error) {
        console.error("Failed to poll storage for concurrency:", error);
      }
    };

    pollStorage();
    const interval = setInterval(pollStorage, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [userId, lastPollTime]);

  return { activeJobs, userId, updateMyJobs, triggerPoll };
};
