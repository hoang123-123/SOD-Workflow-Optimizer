
import React from 'react';
import { SODStatus } from '../types';
import { CheckCircle2, AlertCircle, Clock, PackageCheck } from 'lucide-react';

interface BadgeProps {
  status: SODStatus;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status }) => {
  const baseClasses = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors";

  switch (status) {
    case SODStatus.SUFFICIENT:
      return (
        <span className={`${baseClasses} bg-emerald-50 text-emerald-700 border-emerald-200`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Đủ Tồn Kho
        </span>
      );
    case SODStatus.SHORTAGE_PENDING_SALE:
      return (
        <span className={`${baseClasses} bg-rose-50 text-rose-700 border-rose-200`}>
          <AlertCircle className="w-3.5 h-3.5" />
          Thiếu Hàng - Chờ Sale
        </span>
      );
    case SODStatus.SHORTAGE_PENDING_SOURCE:
      return (
        <span className={`${baseClasses} bg-amber-50 text-amber-700 border-amber-200`}>
          <Clock className="w-3.5 h-3.5" />
          Chờ Source Xử Lý
        </span>
      );
    case SODStatus.RESOLVED:
      return (
        <span className={`${baseClasses} bg-blue-50 text-blue-700 border-blue-200`}>
          <PackageCheck className="w-3.5 h-3.5" />
          Đã Chốt Phương Án
        </span>
      );
    default:
      return null;
  }
};
