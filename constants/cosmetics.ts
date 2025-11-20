
import { CosmeticItem } from '../types';

export const AVATAR_FRAMES: CosmeticItem[] = [
    {
        id: 'default',
        type: 'frame',
        nameKey: 'creator.cosmetics.frames.default',
        rarity: 'common',
        cssClass: 'frame-none',
    },
    {
        id: 'neon-blue',
        type: 'frame',
        nameKey: 'creator.cosmetics.frames.neonBlue',
        rarity: 'rare',
        cssClass: 'frame-basic-blue',
        unlockCondition: { level: 5 },
    },
    {
        id: 'neon-pink',
        type: 'frame',
        nameKey: 'creator.cosmetics.frames.neonPink',
        rarity: 'rare',
        cssClass: 'frame-basic-pink',
        unlockCondition: { level: 10 },
    },
    {
        id: 'gradient-spin',
        type: 'frame',
        nameKey: 'creator.cosmetics.frames.gradientSpin',
        rarity: 'epic',
        cssClass: 'frame-gradient-spin',
        unlockCondition: { level: 20 },
    },
    {
        id: 'legendary-gold',
        type: 'frame',
        nameKey: 'creator.cosmetics.frames.legendaryGold',
        rarity: 'legendary',
        cssClass: 'frame-legendary-gold',
        unlockCondition: { level: 50 },
    },
    {
        id: 'mythic-fire',
        type: 'frame',
        nameKey: 'creator.cosmetics.frames.mythicFire',
        rarity: 'mythic',
        cssClass: 'frame-mythic-fire',
        unlockCondition: { level: 100 },
    }
];

export const ACHIEVEMENT_TITLES: CosmeticItem[] = [
    {
        id: 'newbie',
        type: 'title',
        nameKey: 'creator.cosmetics.titles.newbie',
        rarity: 'common',
        cssClass: 'title-basic',
    },
    {
        id: 'style-icon',
        type: 'title',
        nameKey: 'creator.cosmetics.titles.styleIcon',
        rarity: 'rare',
        cssClass: 'title-neon-blue',
        unlockCondition: { level: 5 },
    },
    {
        id: 'vip',
        type: 'title',
        nameKey: 'creator.cosmetics.titles.vip',
        rarity: 'epic',
        cssClass: 'title-vip-gold',
        unlockCondition: { level: 20 },
    },
    {
        id: 'glitch-master',
        type: 'title',
        nameKey: 'creator.cosmetics.titles.glitchMaster',
        rarity: 'legendary',
        cssClass: 'title-cyber-glitch',
        unlockCondition: { level: 50 },
    },
    {
        id: 'audition-god',
        type: 'title',
        nameKey: 'creator.cosmetics.titles.auditionGod',
        rarity: 'mythic',
        cssClass: 'title-mythic-fire',
        unlockCondition: { level: 100 },
    }
];

export const ALL_COSMETICS = [...AVATAR_FRAMES, ...ACHIEVEMENT_TITLES];

export const getCosmeticById = (id: string | undefined, type: 'frame' | 'title'): CosmeticItem | undefined => {
    const list = type === 'frame' ? AVATAR_FRAMES : ACHIEVEMENT_TITLES;
    return list.find(item => item.id === id) || list[0]; // Default to first item
};
