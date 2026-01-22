
import React, { useState, useRef, useEffect } from 'react';
import { SOD, SODStatus, UserRole } from '../types';
import { StatusBadge } from './Badge';
import { InventoryBar } from './InventoryBar';
import { triggerSalePartialShipment, notifySourceOnSaleDecision, notifySaleOnSourcePlan, notifyWarehouseOnSaleShipment } from '../services/flowTriggers';
import { 
  ChevronDown, 
  ChevronUp, 
  Box, 
  AlertTriangle, 
  UserCircle2, 
  Factory,
  Check,
  Calculator,
  Warehouse,
  Loader2,
  Clock,
  Calendar as CalendarIcon,
  PencilLine,
  BellRing,
  Send,
  Save,
  CheckCircle2,
  Archive,
  Forward,
  Circle
} from 'lucide-react';

interface SODCardProps {
  sod: SOD;
  currentRole: UserRole;
  onUpdate: (updatedSOD: SOD) => void;
  onNotifySale?: (sod: SOD) => Promise<boolean>;
  onSaveState?: (updatedSOD: SOD) => Promise<void>; // New Callback
  saleId?: string | null;
  customerId?: string; 
}

const formatDateForInput = (isoString?: string) => {
    if (!isoString) return '';
    return isoString.split('T')[0];
};

export const SODCard: React.FC<SODCardProps> = ({ sod, currentRole, onUpdate, onNotifySale, onSaveState, saleId }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const [saleOption, setSaleOption] = useState<'SHIP_PARTIAL' | 'WAIT_ALL' | null>(sod.saleDecision?.action || null);
  const [sourceEta, setSourceEta] = useState<string>(formatDateForInput(sod.sourcePlan?.eta));
  const [sourceSupplier, setSourceSupplier] = useState<string>(sod.sourcePlan?.supplier || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Notification Loading State for Warehouse
  const [isNotifying, setIsNotifying] = useState(false);
  
  // Initialize with empty string if 0 to show placeholder
  const [inputValue, setInputValue] = useState<string>(sod.qtyAvailable === 0 ? '' : sod.qtyAvailable.toString());

  // Sync state with props: Map 0 to empty string for placeholder display
  useEffect(() => {
    setInputValue(sod.qtyAvailable === 0 ? '' : sod.qtyAvailable.toString());
  }, [sod.qtyAvailable]);

  useEffect(() => {
    setSourceEta(formatDateForInput(sod.sourcePlan?.eta));
  }, [sod.sourcePlan?.eta]);

  useEffect(() => {
    setSourceSupplier(sod.sourcePlan?.supplier || '');
  }, [sod.sourcePlan?.supplier]);
  
  // Keep local state in sync with external updates (e.g., loaded from history)
  useEffect(() => {
     setSaleOption(sod.saleDecision?.action || null);
  }, [sod.saleDecision]);

  const numericAvailable = inputValue === '' ? 0 : parseInt(inputValue, 10);
  const safeAvailable = isNaN(numericAvailable) ? 0 : numericAvailable;

  const rs = sod.qtyOrdered - sod.qtyDelivered; 
  const as = safeAvailable;
  const sq = Math.max(0, rs - as);
  const isSufficient = sq === 0;
  const hasInventory = as > 0;

  // --- TYPOGRAPHY HELPERS (Consistent Font/Size) ---
  // Updated to accept rightElement for Badges
  const SectionHeader = ({ icon: Icon, title, isActive, rightElement }: { icon: any, title: string, isActive: boolean, rightElement?: React.ReactNode }) => (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md transition-colors ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}>
                <Icon className="w-4 h-4" />
            </div>
            <span className={`text-sm font-bold ${isActive ? 'text-indigo-900' : 'text-gray-400'}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
            {rightElement}
            {isActive && <span className="text-[10px] font-bold text-white bg-emerald-600 px-2 py-1 rounded tracking-wider shadow-sm">Cần xử lý</span>}
        </div>
      </div>
  );

  const LabelText = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
      <span className={`text-[11px] font-semibold text-gray-500 uppercase tracking-wide ${className}`}>{children}</span>
  );

  const ValueText = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
      <span className={`text-base font-semibold text-slate-800 ${className}`}>{children}</span>
  );

  const handleToggleExpand = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);

    if (nextState && cardRef.current) {
        setTimeout(() => {
            cardRef.current?.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
        }, 300);
    }
  };

  // Helper Logic to determine status based on quantity
  const calculateStatus = (val: number) => {
    let newStatus = sod.status;
    const newShortage = Math.max(0, rs - val);

    if (newShortage === 0) {
        newStatus = SODStatus.SUFFICIENT;
    } else if (sod.status === SODStatus.SUFFICIENT) {
        newStatus = SODStatus.SHORTAGE_PENDING_SALE;
    }
    return newStatus;
  };

  const updateParent = (val: number) => {
    const newStatus = calculateStatus(val);
    onUpdate({
        ...sod,
        qtyAvailable: val,
        status: newStatus,
    });
  };

  const handleInventoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Nếu đã gửi thông báo, không cho sửa tồn kho nữa
    if (sod.isNotificationSent) return; 

    const rawValue = e.target.value;
    if (!/^\d*$/.test(rawValue)) return;
    setInputValue(rawValue);
    if (rawValue !== '') {
        updateParent(parseInt(rawValue, 10));
    }
  };

  const handleBlur = async () => {
      let finalVal = numericAvailable;
      if (inputValue === '') {
          finalVal = 0;
          // Force update parent to 0 if empty
          updateParent(0);
      }

      // [CRITICAL UPDATE] Save to Dataverse on Blur
      if (onSaveState) {
          const newStatus = calculateStatus(finalVal);
          const updatedSOD = {
              ...sod,
              qtyAvailable: finalVal,
              status: newStatus
          };
          // Trigger the save callback passed from App.tsx
          await onSaveState(updatedSOD);
      }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.select();
  };

  const handleSaleSubmit = async () => {
    if (!saleOption) return;
    setIsSubmitting(true);
    try {
        if (saleOption === 'SHIP_PARTIAL') {
            await triggerSalePartialShipment(sod.detailName, sod.id, sq);
            // [NEW] Notify Warehouse about the confirmed quantity
            await notifyWarehouseOnSaleShipment(sod, safeAvailable);
        } else if (saleOption === 'WAIT_ALL') {
            // [NEW] Notify Source when Sale chooses to wait
            await notifySourceOnSaleDecision(sod);
        }
        
        // Simulate network delay for better UX
        await new Promise(resolve => setTimeout(resolve, 600));

        const nextStatus = saleOption === 'SHIP_PARTIAL' ? SODStatus.RESOLVED : SODStatus.SHORTAGE_PENDING_SOURCE;
        
        // [CRITICAL FIX] Reset sourcePlan when Sale decides to wait.
        // This ensures the Source workflow starts fresh and prevents legacy data from making it look "Done".
        const updatedSOD = {
          ...sod,
          status: nextStatus,
          saleDecision: { action: saleOption, timestamp: new Date().toISOString() },
          // Force reset source plan to ensure fresh input
          sourcePlan: saleOption === 'WAIT_ALL' ? undefined : sod.sourcePlan
        };

        onUpdate(updatedSOD);
        if (onSaveState) await onSaveState(updatedSOD);

    } catch (error) {
        console.error("Sale Submit Error:", error);
        alert("Có lỗi xảy ra khi gửi dữ liệu.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSourceSubmit = async () => {
    if (!sourceEta) return;
    setIsSubmitting(true);
    try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 600));
        
        const updatedSOD: SOD = {
          ...sod,
          status: SODStatus.RESOLVED,
          sourcePlan: { status: 'CONFIRMED', eta: sourceEta, supplier: sourceSupplier || 'Kho Dataverse', timestamp: new Date().toISOString() }
        };

        // [NEW] Notify Sale that Source has confirmed plan
        await notifySaleOnSourcePlan(updatedSOD);

        onUpdate(updatedSOD);
        if (onSaveState) await onSaveState(updatedSOD);
    } catch (error) {
        console.error("Source Submit Error:", error);
        alert("Có lỗi xảy ra khi cập nhật kế hoạch.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleWarehouseNotify = async () => {
      if (onNotifySale && !sod.isNotificationSent) {
          setIsNotifying(true);
          const success = await onNotifySale(sod);
          setIsNotifying(false);
          
          if (success) {
              // Note: onNotifySale in parent (App.tsx) handles the saving and state update.
          }
      }
  }

  // Permission Logic
  const isAdmin = currentRole === UserRole.ADMIN;

  const canSaleAct = (currentRole === UserRole.SALE || isAdmin) && !sod.saleDecision; 
  
  // Logic helpers
  const isSaleWaitAll = sod.saleDecision?.action === 'WAIT_ALL';
  
  // [FIX] Source Plan is only considered valid/confirmed if Sale has explicitly authorized waiting (Workflow sequence)
  const isSourcePlanConfirmed = sod.sourcePlan?.status === 'CONFIRMED' && isSaleWaitAll;

  // Source can act if:
  // 1. Is Admin OR Source Role
  // 2. Status is PENDING_SOURCE (which happens after Sale submits WAIT_ALL)
  // 3. Plan is NOT yet confirmed (to prevent re-edit loop, though Admin might want to edit, for now keep it strict)
  const canSourceAct = (isAdmin || (currentRole === UserRole.SOURCE && sod.status === SODStatus.SHORTAGE_PENDING_SOURCE)) && !isSourcePlanConfirmed;
  
  const isWarehouseOrAdmin = (currentRole === UserRole.WAREHOUSE || isAdmin);
  const canEditInventory = isWarehouseOrAdmin && !sod.isNotificationSent; 
  
  const canWarehouseNotify = isWarehouseOrAdmin && sq > 0 && !sod.saleDecision;
  
  const isWorkflowStoppedBySale = sod.saleDecision?.action === 'SHIP_PARTIAL';
  
  // The Warehouse Zone is active if it's their turn to edit or notify
  const isWarehouseZoneActive = canEditInventory || canWarehouseNotify;

  const renderDecisionText = (action: 'SHIP_PARTIAL' | 'WAIT_ALL') => {
      if (action === 'SHIP_PARTIAL') {
          return hasInventory ? `Giao ${as} hàng có sẵn` : `Đã hủy phiếu`;
      }
      return hasInventory ? `Giữ ${as} hàng - Chờ Source` : `Chờ Source xử lý`;
  }

  // --- BADGE RENDERERS ---
  const renderSaleBadge = () => {
      if (!sod.saleDecision) return null;
      if (sod.saleDecision.action === 'SHIP_PARTIAL') {
          return (
             <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide shadow-sm select-none">
                <CheckCircle2 className="w-3 h-3" />
                ĐÃ CHỐT P.ÁN
             </span>
          );
      }
      if (sod.saleDecision.action === 'WAIT_ALL') {
          return (
             <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide shadow-sm select-none">
                <Forward className="w-3 h-3" />
                ĐÃ BÁO SOURCE
             </span>
          );
      }
      return null;
  };

  const renderSourceBadge = () => {
      if (isSourcePlanConfirmed) {
          return (
             <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide shadow-sm select-none">
                <CheckCircle2 className="w-3 h-3" />
                ĐÃ LÊN KẾ HOẠCH
             </span>
          );
      }
      return null;
  };

  return (
    <div 
      ref={cardRef}
      className={`
        bg-white border rounded-lg transition-all duration-200 overflow-hidden
        ${isExpanded ? 'border-indigo-200 ring-1 ring-indigo-50 shadow-md my-4' : 'border-gray-200 shadow-sm hover:border-gray-300'}
      `}
    >
      {/* CSS Injection for Date Picker Customization */}
      <style>{`
        .date-input-full-trigger {
            position: relative;
        }
        /* Expand the picker indicator to cover the entire input */
        .date-input-full-trigger::-webkit-calendar-picker-indicator {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
        }
      `}</style>

      {/* --- SUMMARY ROW --- */}
      <div 
        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group hover:bg-gray-50/50 transition-colors"
        onClick={handleToggleExpand}
      >
        {/* Left: Product Info */}
        <div className="flex items-start gap-4 flex-1 overflow-hidden">
          <div className="mt-0.5 p-2 rounded-md bg-gray-50 text-gray-500 border border-gray-100 shrink-0">
            <Box className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-800 text-sm mb-1 break-words leading-snug">
                {sod.detailName}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 border border-gray-200">
                    {sod.product.sku}
                </span>
                <span className="truncate">{sod.product.name}</span>
            </div>
            
            {!isExpanded && sod.saleDecision && (
               <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <UserCircle2 className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">Sale: {renderDecisionText(sod.saleDecision.action)}</span>
               </div>
            )}
          </div>
        </div>

        {/* Middle: Core Metrics (Simplified) */}
        <div className="flex items-center gap-8 shrink-0">
            <div className="flex flex-col items-end">
                <LabelText className="mb-0.5 text-gray-400">Cần giao</LabelText>
                <ValueText>{rs}</ValueText>
            </div>
            <div className="w-px h-8 bg-gray-100 hidden md:block"></div>
            <div className="flex flex-col items-end">
                <LabelText className="mb-0.5 text-gray-400">Khả dụng</LabelText>
                <ValueText className="text-slate-700">{as}</ValueText>
            </div>
            <div className="w-px h-8 bg-gray-100 hidden md:block"></div>
            <div className="flex flex-col items-end">
                <LabelText className="mb-0.5 text-gray-400">Thiếu</LabelText>
                <span className={`text-base font-semibold ${sq > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{sq}</span>
            </div>
        </div>

        {/* Right: Status */}
        <div className="flex items-center justify-between md:justify-end gap-4 min-w-[180px] shrink-0">
          <StatusBadge status={sod.status} />
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />}
        </div>
      </div>

      {/* --- EXPANDED DETAIL --- */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-5 bg-white animate-in slide-in-from-top-1 fade-in duration-200">
          
          {/* 1. WAREHOUSE ZONE (Inventory & Shortage Notification) */}
          <div className={`relative rounded-lg p-5 border mb-6 transition-all ${isWarehouseZoneActive || sod.isNotificationSent ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50/50 border-gray-100'}`}>
            <SectionHeader 
                icon={Warehouse} 
                title="Kiểm tra tồn kho" 
                isActive={isWarehouseZoneActive && !sod.isNotificationSent} // Only Active if not sent
                rightElement={sod.isNotificationSent && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide shadow-sm select-none">
                        <CheckCircle2 className="w-3 h-3" />
                        ĐÃ BÁO SALE
                    </span>
                )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3 bg-white rounded-lg border border-gray-200">
                    <LabelText className="block mb-1">Cần giao</LabelText>
                    <ValueText className="text-xl">{rs}</ValueText>
                </div>

                <div 
                    className={`relative p-3 rounded-lg border transition-all duration-200 group
                    ${canEditInventory 
                        ? 'bg-indigo-50/40 border-indigo-300 border-dashed hover:bg-indigo-50 hover:border-indigo-400 focus-within:bg-white focus-within:border-indigo-500 focus-within:border-solid focus-within:shadow-md focus-within:ring-4 focus-within:ring-indigo-500/10 cursor-text' 
                        : 'border-gray-200 bg-gray-50/50'
                    }`}
                    onClick={() => { if(canEditInventory) { const input = document.getElementById(`inventory-input-${sod.id}`); if(input) input.focus(); } }}
                >
                    <div className="flex justify-between items-center mb-1">
                        <LabelText className={canEditInventory ? "text-indigo-900/70" : ""}>Khả dụng</LabelText>
                        {canEditInventory && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-100/50 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                <PencilLine className="w-3 h-3" />
                                <span>NHẬP KHO</span>
                            </div>
                        )}
                    </div>
                    {canEditInventory ? (
                        <input 
                            id={`inventory-input-${sod.id}`}
                            type="text"
                            inputMode="numeric"
                            className={`w-full text-2xl font-bold bg-transparent border-none p-0 focus:ring-0 outline-none leading-none ${inputValue === '' || inputValue === '0' ? 'text-rose-600 placeholder-rose-300' : 'text-indigo-700 placeholder-indigo-300'}`}
                            value={inputValue}
                            onChange={handleInventoryChange}
                            onBlur={handleBlur}
                            onFocus={handleFocus}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="0"
                            disabled={sod.isNotificationSent} 
                        />
                    ) : (
                        <ValueText className="text-xl">{as}</ValueText>
                    )}
                </div>

                <div className="p-3 bg-white rounded-lg border border-gray-200">
                    <LabelText className="block mb-1">Thiếu hụt</LabelText>
                    {/* FIXED: Removed ValueText to avoid default black color override */}
                    <span className={`block text-xl font-bold ${sq > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {sq}
                    </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-gray-200 flex flex-col justify-center">
                     <LabelText className="block mb-2">Tỉ lệ đáp ứng</LabelText>
                     <InventoryBar available={as} needed={rs} />
                </div>
            </div>

            {/* Notification Section: HIDDEN IF SENT (!sod.isNotificationSent) */}
            {sq > 0 && isWarehouseOrAdmin && !sod.isNotificationSent && (
                <div className="mt-5 pt-5 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-rose-50 rounded-full text-rose-600 shrink-0 border border-rose-100">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h5 className="text-sm font-bold text-gray-900">Xác nhận thiếu hụt kho</h5>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Hệ thống ghi nhận thiếu <span className="font-bold text-rose-600 text-sm">{sq}</span> sản phẩm. 
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={handleWarehouseNotify}
                        disabled={isNotifying}
                        className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        {isNotifying ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Đang xử lý...</span>
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                <span>Gửi yêu cầu xử lý</span>
                            </>
                        )}
                    </button>
                </div>
            )}
          </div>

          {/* 2. Workflow Actions (Sale/Source) */}
          {!isSufficient && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-gray-100">
              
              {/* SALE ZONE */}
              <div className={`relative rounded-lg p-5 border transition-all flex flex-col ${canSaleAct ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50/50 border-gray-100 opacity-70'}`}>
                <SectionHeader 
                    icon={UserCircle2} 
                    title="Quyết định của Sale" 
                    isActive={canSaleAct} 
                    rightElement={renderSaleBadge()}
                />

                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 pb-3 border-b border-gray-100">
                    <Warehouse className="w-3.5 h-3.5" />
                    <span>Kho lấy hàng: <strong className="text-gray-700">{sod.warehouseLocation || 'Kho Dataverse'}</strong></span>
                </div>

                {!canSaleAct && sod.saleDecision && (
                    <div className="p-3 bg-white rounded border border-gray-200 text-sm shadow-sm opacity-80">
                        <div className="flex items-center gap-2 mb-1">
                             {sod.saleDecision.action === 'SHIP_PARTIAL' ? <Check className="w-4 h-4 text-blue-600" /> : <Forward className="w-4 h-4 text-amber-600" />}
                             <span className="font-semibold text-gray-800">{sod.saleDecision.action === 'SHIP_PARTIAL' ? 'Đã xác nhận phương án' : 'Đã chuyển Source xử lý'}</span>
                        </div>
                        <div className="text-xs text-gray-400 pl-6">
                            {new Date(sod.saleDecision.timestamp).toLocaleString()}
                        </div>
                    </div>
                )}

                {canSaleAct && (
                    <div className="flex flex-col flex-1">
                         <div className="space-y-4 mb-5">
                             {/* RADIO CARD 1: SHIP_PARTIAL */}
                             <div 
                                onClick={() => setSaleOption('SHIP_PARTIAL')}
                                className={`relative flex items-start p-4 rounded-xl cursor-pointer transition-all duration-200 group border-2 ${
                                    saleOption === 'SHIP_PARTIAL' 
                                    ? 'border-indigo-600 bg-indigo-50/40' 
                                    : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-gray-50/50'
                                }`}
                             >
                                {/* Custom Radio Circle - REDESIGNED with Checkmark */}
                                <div className={`mt-0.5 flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                                    saleOption === 'SHIP_PARTIAL' ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white group-hover:border-indigo-400'
                                }`}>
                                    {/* White Checkmark when selected */}
                                    {saleOption === 'SHIP_PARTIAL' && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                </div>
                                
                                <div className="ml-3.5 flex-1">
                                    <span className={`block text-sm font-bold ${saleOption === 'SHIP_PARTIAL' ? 'text-indigo-900' : 'text-slate-700'}`}>
                                        {hasInventory ? 'Giao hàng có sẵn' : 'Chốt đơn / Hủy phiếu'}
                                    </span>
                                    <span className="block text-xs mt-1.5 text-gray-500 leading-relaxed">
                                        {hasInventory 
                                            ? `Giao trước phần có sẵn (${as} sản phẩm).` 
                                            : `Không có hàng. Chốt để hủy phiếu.`}
                                    </span>
                                </div>
                            </div>

                            {/* RADIO CARD 2: WAIT_ALL */}
                            <div 
                                onClick={() => setSaleOption('WAIT_ALL')}
                                className={`relative flex items-start p-4 rounded-xl cursor-pointer transition-all duration-200 group border-2 ${
                                    saleOption === 'WAIT_ALL' 
                                    ? 'border-indigo-600 bg-indigo-50/40' 
                                    : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-gray-50/50'
                                }`}
                            >
                                 <div className={`mt-0.5 flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                                    saleOption === 'WAIT_ALL' ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 bg-white group-hover:border-indigo-400'
                                }`}>
                                    {saleOption === 'WAIT_ALL' && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                </div>

                                <div className="ml-3.5 flex-1">
                                    <span className={`block text-sm font-bold ${saleOption === 'WAIT_ALL' ? 'text-indigo-900' : 'text-slate-700'}`}>
                                        {hasInventory ? 'Chờ đủ hàng' : 'Chờ Source xử lý'}
                                    </span>
                                    <span className="block text-xs mt-1.5 text-gray-500 leading-relaxed">
                                        {hasInventory 
                                            ? `Đợi nhập đủ kho rồi giao.` 
                                            : `Chuyển yêu cầu sang bộ phận Nguồn hàng.`}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button 
                        onClick={handleSaleSubmit}
                        disabled={!saleOption || isSubmitting}
                        className="w-full mt-auto px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận Phương án"}
                        </button>
                    </div>
                )}
              </div>

              {/* SOURCE ZONE */}
              <div className={`relative rounded-lg p-5 border transition-all flex flex-col ${canSourceAct ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50/50 border-gray-100 opacity-70'}`}>
                 <SectionHeader 
                    icon={Factory} 
                    title="Xử lý nguồn hàng" 
                    isActive={canSourceAct} 
                    rightElement={renderSourceBadge()}
                 />

                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 pb-3 border-b border-gray-100">
                    <Warehouse className="w-3.5 h-3.5" />
                    <span>Kho nhập: <strong className="text-gray-700">{sod.warehouseLocation || 'Kho Dataverse'}</strong></span>
                </div>

                {isWorkflowStoppedBySale ? (
                    <div className="py-8 text-center border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                        <span className="text-xs font-medium text-gray-400">Quy trình đã kết thúc bởi Sale.</span>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1">
                        {!canSourceAct && (sod.status === SODStatus.RESOLVED || isSourcePlanConfirmed) && sod.sourcePlan && (
                             <div className="p-3 bg-white rounded border border-gray-200 text-sm shadow-sm opacity-80">
                                <div className="grid grid-cols-2 gap-y-2">
                                     <div>
                                        <LabelText className="block mb-0.5">Trạng thái</LabelText>
                                        <span className="text-slate-800">{sod.sourcePlan.status === 'CONFIRMED' ? 'Đã xác nhận' : sod.sourcePlan.status}</span>
                                     </div>
                                     <div>
                                        <LabelText className="block mb-0.5">Ngày dự kiến</LabelText>
                                        <span className="text-slate-800">{sod.sourcePlan.eta}</span>
                                     </div>
                                     <div className="col-span-2">
                                        <LabelText className="block mb-0.5">Nguồn</LabelText>
                                        <span className="text-slate-800">{sod.sourcePlan.supplier}</span>
                                     </div>
                                </div>
                            </div>
                        )}

                        {canSourceAct && (
                            <div className="flex flex-col flex-1">
                                <div className="space-y-4 mb-4">
                                    {/* Warning Box: Clean Gray Style */}
                                    <div className="flex items-start gap-2 p-3 bg-gray-50 text-gray-700 text-xs rounded border border-gray-200">
                                        <AlertTriangle className="w-4 h-4 shrink-0 text-gray-500" />
                                        <span>Yêu cầu xử lý thiếu hụt: <strong>{sq}</strong> sản phẩm.</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Ngày hàng về (ETA)</label>
                                            {/* CUSTOM DATE PICKER UI */}
                                            <div className="relative w-full">
                                                <input 
                                                    type="date"
                                                    className="date-input-full-trigger block w-full rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm cursor-pointer placeholder-gray-400"
                                                    value={sourceEta}
                                                    onChange={(e) => setSourceEta(e.target.value)}
                                                    style={{ colorScheme: 'light' }}
                                                />
                                                {/* Custom Overlay Icon - visually nice, sits over the invisible native button part */}
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 bg-transparent">
                                                    <CalendarIcon className="h-4 w-4" />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Nguồn cung cấp</label>
                                            <input 
                                                type="text" 
                                                placeholder="Nhập nguồn cung cấp..."
                                                className="w-full text-sm bg-white border-gray-200 rounded-md focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-gray-400 text-slate-800"
                                                value={sourceSupplier}
                                                onChange={(e) => setSourceSupplier(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSourceSubmit}
                                    disabled={!sourceEta || isSubmitting}
                                    className="w-full mt-auto px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                     {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận Kế hoạch"}
                                </button>
                            </div>
                        )}
                        
                        {!canSourceAct && sod.status !== SODStatus.RESOLVED && !isSourcePlanConfirmed && (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-sm text-gray-400 italic text-center py-6">
                                    <Clock className="w-6 h-6 text-gray-200 mx-auto mb-2" />
                                    <span>{!sod.saleDecision ? "Đang chờ Sale..." : "Đang chờ Source..."}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
