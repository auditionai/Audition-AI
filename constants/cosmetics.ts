import { CosmeticItem } from '../types';

export const AVATAR_FRAMES: CosmeticItem[] = [
    {
        id: 'frame_none',
        name: 'Mặc định',
        description: 'Khung viền cơ bản.',
        type: 'frame',
        cssClass: 'frame-none',
        rarity: 'common',
        requirement: { type: 'level', value: 1, description: 'Mở khóa từ đầu' }
    },
    {
        id: 'frame_blue',
        name: 'Tân Binh',
        description: 'Dành cho người mới gia nhập.',
        type: 'frame',
        cssClass: 'frame-basic-blue',
        rarity: 'common',
        requirement: { type: 'level', value: 2, description: 'Đạt Cấp 2' }
    },
    {
        id: 'frame_neon_green',
        name: 'Sành Điệu',
        description: 'Phát sáng nhẹ nhàng, tạo điểm nhấn.',
        type: 'frame',
        cssClass: 'frame-neon-green',
        rarity: 'rare',
        requirement: { type: 'creations', value: 5, description: 'Tạo 5 bức ảnh' }
    },
    {
        id: 'frame_pink',
        name: 'Dễ Thương',
        description: 'Khung viền hồng cá tính.',
        type: 'frame',
        cssClass: 'frame-basic-pink',
        rarity: 'rare',
        requirement: { type: 'checkin_streak', value: 3, description: 'Điểm danh 3 ngày liên tiếp' }
    },
    {
        id: 'frame_gradient',
        name: 'Vũ Điệu Neon',
        description: 'Hiệu ứng chuyển màu xoay vòng cực chất.',
        type: 'frame',
        cssClass: 'frame-gradient-spin',
        rarity: 'epic',
        requirement: { type: 'level', value: 10, description: 'Đạt Cấp 10' }
    },
    {
        id: 'frame_gold',
        name: 'Hoàng Gia',
        description: 'Vòng xoay vàng kim đẳng cấp.',
        type: 'frame',
        cssClass: 'frame-legendary-gold',
        rarity: 'legendary',
        requirement: { type: 'diamonds', value: 500, description: 'Đã nạp tổng cộng 500 Kim Cương' }
    },
    {
        id: 'frame_fire',
        name: 'Thần Lửa',
        description: 'Hiệu ứng lửa cháy rực rỡ.',
        type: 'frame',
        cssClass: 'frame-mythic-fire',
        rarity: 'mythic',
        requirement: { type: 'creations', value: 100, description: 'Tạo 100 bức ảnh' }
    }
];

export const ACHIEVEMENT_TITLES: CosmeticItem[] = [
    {
        id: 'title_none',
        name: 'Không hiển thị',
        description: 'Ẩn danh hiệu.',
        type: 'title',
        cssClass: '',
        rarity: 'common',
        requirement: { type: 'level', value: 1, description: 'Mặc định' }
    },
    {
        id: 'title_newbie',
        name: 'Người Mới',
        description: 'Danh hiệu khởi đầu.',
        type: 'title',
        cssClass: 'title-basic',
        rarity: 'common',
        requirement: { type: 'level', value: 1, description: 'Mặc định' }
    },
    {
        id: 'title_artist',
        name: 'Nghệ Sĩ',
        description: 'Người đam mê cái đẹp.',
        type: 'title',
        cssClass: 'title-neon-blue',
        rarity: 'rare',
        requirement: { type: 'creations', value: 10, description: 'Tạo 10 bức ảnh' }
    },
    {
        id: 'title_hardworking',
        name: 'Chăm Chỉ',
        description: 'Luôn có mặt đúng giờ.',
        type: 'title',
        cssClass: 'title-neon-blue',
        rarity: 'rare',
        requirement: { type: 'checkin_streak', value: 7, description: 'Điểm danh 7 ngày liên tiếp' }
    },
    {
        id: 'title_cyber',
        name: 'Cyberpunk',
        description: 'Dân chơi công nghệ.',
        type: 'title',
        cssClass: 'title-cyber-glitch',
        rarity: 'epic',
        requirement: { type: 'xp', value: 5000, description: 'Đạt 5000 XP' }
    },
    {
        id: 'title_rich',
        name: 'Đại Gia',
        description: 'Người chơi hệ nạp.',
        type: 'title',
        cssClass: 'title-vip-gold',
        rarity: 'legendary',
        requirement: { type: 'diamonds', value: 200, description: 'Sở hữu 200 KC cùng lúc' }
    },
    {
        id: 'title_legend',
        name: 'Huyền Thoại',
        description: 'Đỉnh cao của sự nghiệp.',
        type: 'title',
        cssClass: 'title-mythic-fire',
        rarity: 'mythic',
        requirement: { type: 'level', value: 50, description: 'Đạt Cấp 50' }
    }
];

// Function to check if a user meets the requirements for an item
export const checkRequirement = (item: CosmeticItem, userStats: { level: number, xp: number, diamonds: number, creations: number, checkinStreak: number }): boolean => {
    switch (item.requirement.type) {
        case 'level': return userStats.level >= item.requirement.value;
        case 'xp': return userStats.xp >= item.requirement.value;
        case 'diamonds': return userStats.diamonds >= item.requirement.value; // Note: Simple check on current balance, ideally should be total topped up
        case 'creations': return userStats.creations >= item.requirement.value;
        case 'checkin_streak': return userStats.checkinStreak >= item.requirement.value;
        case 'admin': return false; // Only manual unlock
        default: return true;
    }
};
