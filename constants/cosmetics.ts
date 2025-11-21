
import { CosmeticItem } from '../types';

// --- LEVEL BASED ITEMS (Existing) ---
export const AVATAR_FRAMES: CosmeticItem[] = [
    { id: 'default', type: 'frame', nameKey: 'creator.cosmetics.frames.default', rarity: 'common', cssClass: 'frame-none' },
    { id: 'wood-basic', type: 'frame', nameKey: 'creator.cosmetics.frames.wood', rarity: 'common', cssClass: 'frame-wood', unlockCondition: { level: 2 } },
    { id: 'neon-blue', type: 'frame', nameKey: 'creator.cosmetics.frames.neonBlue', rarity: 'rare', cssClass: 'frame-basic-blue', unlockCondition: { level: 5 } },
    { id: 'neon-pink', type: 'frame', nameKey: 'creator.cosmetics.frames.neonPink', rarity: 'rare', cssClass: 'frame-basic-pink', unlockCondition: { level: 10 } },
    { id: 'musical-note', type: 'frame', nameKey: 'creator.cosmetics.frames.music', rarity: 'rare', cssClass: 'frame-music', unlockCondition: { level: 15 } },
    { id: 'gradient-spin', type: 'frame', nameKey: 'creator.cosmetics.frames.gradientSpin', rarity: 'epic', cssClass: 'frame-gradient-spin', unlockCondition: { level: 20 } },
    { id: 'sakura-bloom', type: 'frame', nameKey: 'creator.cosmetics.frames.sakura', rarity: 'epic', cssClass: 'frame-sakura', unlockCondition: { level: 25 } },
    { id: 'cyber-tech', type: 'frame', nameKey: 'creator.cosmetics.frames.cyber', rarity: 'epic', cssClass: 'frame-cyber', unlockCondition: { level: 30 } },
    { id: 'angel-wings', type: 'frame', nameKey: 'creator.cosmetics.frames.angel', rarity: 'legendary', cssClass: 'frame-angel', unlockCondition: { level: 35 } },
    { id: 'demon-aura', type: 'frame', nameKey: 'creator.cosmetics.frames.demon', rarity: 'legendary', cssClass: 'frame-demon', unlockCondition: { level: 40 } },
    { id: 'thunder-storm', type: 'frame', nameKey: 'creator.cosmetics.frames.thunder', rarity: 'legendary', cssClass: 'frame-thunder', unlockCondition: { level: 45 } },
    { id: 'legendary-gold', type: 'frame', nameKey: 'creator.cosmetics.frames.legendaryGold', rarity: 'legendary', cssClass: 'frame-legendary-gold', unlockCondition: { level: 50 } },
    { id: 'ice-crystal', type: 'frame', nameKey: 'creator.cosmetics.frames.ice', rarity: 'legendary', cssClass: 'frame-ice', unlockCondition: { level: 55 } },
    { id: 'love-beat', type: 'frame', nameKey: 'creator.cosmetics.frames.love', rarity: 'epic', cssClass: 'frame-love', unlockCondition: { level: 60 } },
    { id: 'galaxy-void', type: 'frame', nameKey: 'creator.cosmetics.frames.galaxy', rarity: 'mythic', cssClass: 'frame-galaxy', unlockCondition: { level: 70 } },
    { id: 'matrix-code', type: 'frame', nameKey: 'creator.cosmetics.frames.matrix', rarity: 'mythic', cssClass: 'frame-matrix', unlockCondition: { level: 80 } },
    { id: 'rainbow-glitch', type: 'frame', nameKey: 'creator.cosmetics.frames.glitch', rarity: 'mythic', cssClass: 'frame-rainbow-glitch', unlockCondition: { level: 90 } },
    { id: 'mythic-fire', type: 'frame', nameKey: 'creator.cosmetics.frames.mythicFire', rarity: 'mythic', cssClass: 'frame-mythic-fire', unlockCondition: { level: 100 } },
    { id: 'infinity-god', type: 'frame', nameKey: 'creator.cosmetics.frames.god', rarity: 'mythic', cssClass: 'frame-infinity', unlockCondition: { level: 120 } }
];

export const ACHIEVEMENT_TITLES: CosmeticItem[] = [
    { id: 'newbie', type: 'title', nameKey: 'creator.cosmetics.titles.newbie', rarity: 'common', cssClass: 'title-basic' },
    { id: 'dancer', type: 'title', nameKey: 'creator.cosmetics.titles.dancer', rarity: 'common', cssClass: 'title-basic', unlockCondition: { level: 2 } },
    { id: 'style-icon', type: 'title', nameKey: 'creator.cosmetics.titles.styleIcon', rarity: 'rare', cssClass: 'title-neon-blue', unlockCondition: { level: 5 } },
    { id: 'party-animal', type: 'title', nameKey: 'creator.cosmetics.titles.party', rarity: 'rare', cssClass: 'title-neon-pink', unlockCondition: { level: 10 } },
    { id: 'rhythm-master', type: 'title', nameKey: 'creator.cosmetics.titles.rhythm', rarity: 'rare', cssClass: 'title-music', unlockCondition: { level: 15 } },
    { id: 'vip', type: 'title', nameKey: 'creator.cosmetics.titles.vip', rarity: 'epic', cssClass: 'title-vip-gold', unlockCondition: { level: 20 } },
    { id: 'charming', type: 'title', nameKey: 'creator.cosmetics.titles.charming', rarity: 'epic', cssClass: 'title-sakura', unlockCondition: { level: 25 } },
    { id: 'cyber-punk', type: 'title', nameKey: 'creator.cosmetics.titles.cyber', rarity: 'epic', cssClass: 'title-cyber', unlockCondition: { level: 30 } },
    { id: 'angel-voice', type: 'title', nameKey: 'creator.cosmetics.titles.angel', rarity: 'legendary', cssClass: 'title-angel', unlockCondition: { level: 35 } },
    { id: 'demon-king', type: 'title', nameKey: 'creator.cosmetics.titles.demon', rarity: 'legendary', cssClass: 'title-demon', unlockCondition: { level: 40 } },
    { id: 'thunder-lord', type: 'title', nameKey: 'creator.cosmetics.titles.thunder', rarity: 'legendary', cssClass: 'title-thunder', unlockCondition: { level: 45 } },
    { id: 'glitch-master', type: 'title', nameKey: 'creator.cosmetics.titles.glitchMaster', rarity: 'legendary', cssClass: 'title-cyber-glitch', unlockCondition: { level: 50 } },
    { id: 'ice-queen', type: 'title', nameKey: 'creator.cosmetics.titles.ice', rarity: 'legendary', cssClass: 'title-ice', unlockCondition: { level: 55 } },
    { id: 'heart-breaker', type: 'title', nameKey: 'creator.cosmetics.titles.love', rarity: 'epic', cssClass: 'title-love', unlockCondition: { level: 60 } },
    { id: 'galaxy-star', type: 'title', nameKey: 'creator.cosmetics.titles.galaxy', rarity: 'mythic', cssClass: 'title-galaxy', unlockCondition: { level: 70 } },
    { id: 'the-one', type: 'title', nameKey: 'creator.cosmetics.titles.matrix', rarity: 'mythic', cssClass: 'title-matrix', unlockCondition: { level: 80 } },
    { id: 'legend', type: 'title', nameKey: 'creator.cosmetics.titles.legend', rarity: 'mythic', cssClass: 'title-rainbow', unlockCondition: { level: 90 } },
    { id: 'audition-god', type: 'title', nameKey: 'creator.cosmetics.titles.auditionGod', rarity: 'mythic', cssClass: 'title-mythic-fire', unlockCondition: { level: 100 } }
];

// --- SHOP EXCLUSIVE ITEMS (NEW PREMIUM) ---
export const SHOP_EXCLUSIVE_COSMETICS: CosmeticItem[] = [
    // FRAMES - Premium Redesigned
    { id: 'shop-frame-01', type: 'frame', name: 'Neon Cyan', rarity: 'rare', cssClass: 'shop-frame-01', price: 50 },
    { id: 'shop-frame-02', type: 'frame', name: 'Neon Magenta', rarity: 'rare', cssClass: 'shop-frame-02', price: 50 },
    { id: 'shop-frame-03', type: 'frame', name: 'Hỏa Ngục', rarity: 'epic', cssClass: 'shop-frame-03', price: 150 },
    { id: 'shop-frame-04', type: 'frame', name: 'Thần Thánh', rarity: 'legendary', cssClass: 'shop-frame-04', price: 300 },
    { id: 'shop-frame-05', type: 'frame', name: 'Độc Dược', rarity: 'rare', cssClass: 'shop-frame-05', price: 80 },
    { id: 'shop-frame-06', type: 'frame', name: 'Thủy Tinh', rarity: 'rare', cssClass: 'shop-frame-06', price: 80 },
    { id: 'shop-frame-07', type: 'frame', name: 'Hoàng Kim 24K', rarity: 'legendary', cssClass: 'shop-frame-07', price: 500 },
    { id: 'shop-frame-08', type: 'frame', name: 'Nhịp Tim', rarity: 'epic', cssClass: 'shop-frame-08', price: 200 },
    { id: 'shop-frame-09', type: 'frame', name: 'Hư Không', rarity: 'epic', cssClass: 'shop-frame-09', price: 200 },
    { id: 'shop-frame-10', type: 'frame', name: 'RGB Master', rarity: 'mythic', cssClass: 'shop-frame-10', price: 1000 },
    { id: 'shop-frame-11', type: 'frame', name: 'Công Nghệ Cao', rarity: 'epic', cssClass: 'shop-frame-11', price: 250 },
    { id: 'shop-frame-12', type: 'frame', name: 'Dung Nham', rarity: 'legendary', cssClass: 'shop-frame-12', price: 400 },
    { id: 'shop-frame-13', type: 'frame', name: 'Băng Vĩnh Cửu', rarity: 'epic', cssClass: 'shop-frame-13', price: 250 },
    { id: 'shop-frame-14', type: 'frame', name: 'Cổ Ngữ', rarity: 'epic', cssClass: 'shop-frame-14', price: 200 },
    { id: 'shop-frame-15', type: 'frame', name: 'Rừng Rậm', rarity: 'rare', cssClass: 'shop-frame-15', price: 100 },
    { id: 'shop-frame-16', type: 'frame', name: 'Siêu Sao', rarity: 'legendary', cssClass: 'shop-frame-16', price: 450 },
    { id: 'shop-frame-17', type: 'frame', name: 'Linh Hồn', rarity: 'rare', cssClass: 'shop-frame-17', price: 120 },
    { id: 'shop-frame-18', type: 'frame', name: 'Hắc Ám', rarity: 'mythic', cssClass: 'shop-frame-18', price: 1200 },
    { id: 'shop-frame-19', type: 'frame', name: 'Đại Dương', rarity: 'epic', cssClass: 'shop-frame-19', price: 220 },
    { id: 'shop-frame-20', type: 'frame', name: 'Vũ Trụ', rarity: 'mythic', cssClass: 'shop-frame-20', price: 1500 },

    // TITLES - Premium Redesigned (Removed "Newbie" variants)
    { id: 'shop-title-01', type: 'title', name: 'Cyan Neon', rarity: 'rare', cssClass: 'shop-title-01', price: 50 },
    { id: 'shop-title-02', type: 'title', name: 'Magenta Neon', rarity: 'rare', cssClass: 'shop-title-02', price: 50 },
    { id: 'shop-title-03', type: 'title', name: 'Hỏa Long', rarity: 'epic', cssClass: 'shop-title-03', price: 150 },
    { id: 'shop-title-04', type: 'title', name: 'Thủy Quái', rarity: 'epic', cssClass: 'shop-title-04', price: 150 },
    { id: 'shop-title-05', type: 'title', name: 'Hacker', rarity: 'rare', cssClass: 'shop-title-05', price: 100 },
    { id: 'shop-title-06', type: 'title', name: 'Đại Gia', rarity: 'legendary', cssClass: 'shop-title-06', price: 500 },
    { id: 'shop-title-08', type: 'title', name: 'Bóng Tối', rarity: 'rare', cssClass: 'shop-title-08', price: 80 },
    { id: 'shop-title-09', type: 'title', name: 'Hư Không', rarity: 'epic', cssClass: 'shop-title-09', price: 200 },
    { id: 'shop-title-10', type: 'title', name: 'Minimalist', rarity: 'common', cssClass: 'shop-title-10', price: 20 },
    { id: 'shop-title-11', type: 'title', name: 'Cyberpunk 2077', rarity: 'epic', cssClass: 'shop-title-11', price: 250 },
    { id: 'shop-title-12', type: 'title', name: 'Huyết Tộc', rarity: 'legendary', cssClass: 'shop-title-12', price: 400 },
    { id: 'shop-title-13', type: 'title', name: 'Glassmorphism', rarity: 'rare', cssClass: 'shop-title-13', price: 100 },
    { id: 'shop-title-14', type: 'title', name: 'Cosmic Voyager', rarity: 'epic', cssClass: 'shop-title-14', price: 220 },
    { id: 'shop-title-16', type: 'title', name: 'Super Idol', rarity: 'legendary', cssClass: 'shop-title-16', price: 450 },
    { id: 'shop-title-17', type: 'title', name: 'Phù Thủy', rarity: 'epic', cssClass: 'shop-title-17', price: 180 },
    { id: 'shop-title-18', type: 'title', name: 'Bóng Ma', rarity: 'rare', cssClass: 'shop-title-18', price: 90 },
    { id: 'shop-title-19', type: 'title', name: 'Vua Trò Chơi', rarity: 'mythic', cssClass: 'shop-title-19', price: 1000 },
    { id: 'shop-title-20', type: 'title', name: 'RGB God', rarity: 'mythic', cssClass: 'shop-title-20', price: 2000 },
];

export const ALL_COSMETICS = [...AVATAR_FRAMES, ...ACHIEVEMENT_TITLES, ...SHOP_EXCLUSIVE_COSMETICS];

export const getCosmeticById = (id: string | undefined, type: 'frame' | 'title'): CosmeticItem | undefined => {
    return ALL_COSMETICS.find(item => item.id === id && item.type === type);
};
