import React from 'react';

interface DiamondIconProps {
  cost: number;
}

const DiamondIcon: React.FC<DiamondIconProps> = ({ cost }) => (
  <span className="flex items-center gap-1">
    <i className="ph-fill ph-diamonds-four text-base"></i>
    <span className="font-bold">{cost}</span>
  </span>
);

export default DiamondIcon;
