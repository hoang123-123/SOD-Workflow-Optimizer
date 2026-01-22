import React from 'react';

interface InventoryBarProps {
  available: number;
  needed: number;
}

export const InventoryBar: React.FC<InventoryBarProps> = ({ available, needed }) => {
  // Prevent division by zero
  const safeNeeded = needed > 0 ? needed : 1;
  const percentage = Math.min(100, Math.max(0, (available / safeNeeded) * 100));
  
  const isSufficient = available >= needed;
  const isCritical = available === 0;

  let colorClass = 'bg-emerald-500';
  if (isCritical) colorClass = 'bg-rose-500';
  else if (!isSufficient) colorClass = 'bg-amber-500';

  return (
    <div className="w-full flex items-center gap-3 text-sm">
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200 relative">
         {/* Background pattern for "needed but missing" */}
         <div className="absolute inset-0 w-full h-full opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:4px_4px]"></div>
         
        <div 
          className={`h-full ${colorClass} transition-all duration-500 ease-out rounded-full`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-gray-600 font-medium w-24 text-right">
        <span className={isSufficient ? 'text-emerald-700' : 'text-rose-600'}>
          {available}
        </span>
        <span className="text-gray-400"> / </span>
        <span>{needed}</span>
      </div>
    </div>
  );
};
