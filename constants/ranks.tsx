import React from 'react';
import { Rank } from '../types';

export const RANKS: Rank[] = [
  {
    levelThreshold: 1,
    title: 'Tân Binh',
    icon: React.createElement('i', { className: "ph-fill ph-student text-gray-400" }),
    color: 'text-gray-400',
  },
  {
    levelThreshold: 5,
    title: 'Vũ Công Tập Sự',
    icon: React.createElement('i', { className: "ph-fill ph-person-simple-run text-green-400" }),
    color: 'text-green-400',
  },
  {
    levelThreshold: 10,
    title: 'Ngôi Sao Sàn Nhảy',
    icon: React.createElement('i', { className: "ph-fill ph-star text-yellow-400" }),
    color: 'text-yellow-400',
  },
  {
    levelThreshold: 25,
    title: 'Huyền Thoại Audition',
    icon: React.createElement('i', { className: "ph-fill ph-trophy text-orange-400" }),
    color: 'text-orange-400',
  },
  {
    levelThreshold: 50,
    title: 'Thần Sáng Tạo',
    icon: React.createElement('i', { className: "ph-fill ph-shooting-star text-cyan-400" }),
    color: 'text-cyan-400',
  },
  {
    levelThreshold: 100,
    title: 'Bậc Thầy AI',
    icon: React.createElement('i', { className: "ph-fill ph-crown-simple text-fuchsia-400" }),
    color: 'text-fuchsia-400',
  },
];
