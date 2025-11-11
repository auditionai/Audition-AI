import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'cyan' | 'green' | 'pink';
  isSubtle?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, isSubtle = false }) => {
    const colorClasses = {
        cyan: 'from-cyan-500 to-blue-500 text-cyan-300',
        green: 'from-green-500 to-teal-500 text-green-300',
        pink: 'from-pink-500 to-fuchsia-500 text-pink-300',
    };

    const subtleColorClasses = {
        cyan: 'bg-cyan-500/10 text-cyan-400',
        green: 'bg-green-500/10 text-green-400',
        pink: 'bg-pink-500/10 text-pink-400',
    }

    if (isSubtle) {
        return (
            <div className={`p-4 rounded-lg ${subtleColorClasses[color]}`}>
                 <h3 className="text-sm font-medium text-gray-400">{title}</h3>
                 <p className="text-2xl font-bold mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            </div>
        );
    }

  return (
    <div className={`relative p-6 rounded-xl overflow-hidden bg-[#12121A] border border-white/10`}>
        <div className={`absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-gradient-radial ${colorClasses[color]} opacity-20 blur-3xl`}></div>
        <div className="relative z-10">
            <div className={`text-3xl mb-4 ${colorClasses[color]}`}>
                {icon}
            </div>
            <h3 className="text-gray-400">{title}</h3>
            <p className="text-4xl font-bold text-white mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        </div>
    </div>
  );
};

export default StatCard;
