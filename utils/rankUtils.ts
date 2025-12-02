import { Rank } from '../types';
import { RANKS } from '../constants/ranks';

/**
 * Calculates a user's level based on their total XP.
 * This is a simple linear progression for the demo.
 * @param xp The user's total experience points.
 * @returns The calculated level.
 */
export const calculateLevelFromXp = (xp: number): number => {
  // Example: 100 XP per level
  return Math.floor(xp / 100) + 1;
};

/**
 * Gets the required XP for the next level.
 * @param currentLevel The user's current level.
 * @returns The total XP needed to reach the next level.
 */
export const getXpForNextLevel = (currentLevel: number): number => {
  return currentLevel * 100;
};


/**
 * Finds the correct rank (title, icon) for a given level.
 * It finds the highest rank tier that the user's level has surpassed.
 * @param level The user's current level.
 * @returns The corresponding Rank object.
 */
export const getRankForLevel = (level: number): Rank => {
  // RANKS are sorted by levelThreshold ascending
  let currentRank: Rank = RANKS[0];
  for (const rank of RANKS) {
    if (level >= rank.levelThreshold) {
      currentRank = rank;
    } else {
      break; // Stop when we find a rank the user hasn't reached yet
    }
  }
  return currentRank;
};