
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SOD, UserRole, SODStatus, Customer, SalesOrder } from './types';
import { SODCard } from './components/SODCard';
import { fetchCustomerById, fetchOrdersByCustomer, fetchSODsByOrder, updateRequestHistory, fetchRequestHistory } from './services/dataverse';
import { notifySaleOnShortage } from './services/flowTriggers';
import { Users, UserCog, Search, Filter, Database, Loader2, ChevronDown, Check, X, Package, Layers, Building2, Warehouse, Eye, ShieldCheck, RefreshCw, Cloud, CloudUpload, CloudCog } from 'lucide-react';

// --- DEPARTMENT MAPPING CONFIGURATION ---
const DEPARTMENT_ROLE_MAP: { [key: string]: UserRole } = {
    'SOURCING': UserRole.SOURCE,
    'LOGISTICS': UserRole.WAREHOUSE,
    'FULLFILLMENT': UserRole.WAREHOUSE,
    'QUALITY CONTROL': UserRole.WAREHOUSE,
    'BUSINESS DEVELOPMENT': UserRole.SALE,
    'TECH': UserRole.ADMIN,
    'BOARD OF DIRECTOR': UserRole.VIEWER,
    'MARKETING': UserRole.VIEWER,
    'HUMAN RESOURCE': UserRole.VIEWER,
    'PRODUCT DESIGN': UserRole.VIEWER,
    'FINANCE & ACCOUNT': UserRole.VIEWER,
};

const getRoleFromDepartment = (department: string | null): UserRole => {
    if (!department) return UserRole.ADMIN; 
    const normalizedDept = department.trim().toUpperCase();
    if (DEPARTMENT_ROLE_MAP[normalizedDept]) return DEPARTMENT_ROLE_MAP[normalizedDept];
    if (normalizedDept.includes('SALE') || normalizedDept.includes('BUSINESS')) return UserRole.SALE;
    if (normalizedDept.includes('SOURCE') || normalizedDept.includes('PURCHASING')) return UserRole.SOURCE;
    if (normalizedDept.includes('KHO') || normalizedDept.includes('WAREHOUSE')) return UserRole.WAREHOUSE;
    if (normalizedDept.includes('TECH') || normalizedDept.includes('ADMIN')) return UserRole.ADMIN;
    return UserRole.ADMIN;
};

// Helper: Normalize ID for reliable comparison (lowercase, no braces, trim)
const normalizeId = (id: string | null | undefined) => {
    if (!id) return "";
    return id.toLowerCase().replace(/[{}]/g, "").trim();
};

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.ADMIN);
  const [currentDepartment, setCurrentDepartment] = useState<string>('');
  const [saleId, setSaleId] = useState<string | null>(null);
  const [contextRecordId, setContextRecordId] = useState<string>(''); 
  
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  // UI Indicators State
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED'>('IDLE');
  const [showRestoredBadge, setShowRestoredBadge] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [sods, setSods] = useState<SOD[]>([]);
  const [historyData, setHistoryData] = useState<any>(null); // Store parsed history

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string>('');
  const [orderSearch, setOrderSearch] = useState('');
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false);
  const orderDropdownRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Keep track of current order info for saving context
  const currentOrderInfo = useMemo(() => {
      return orders.find(o => o.id === selectedOrder);
  }, [orders, selectedOrder]);

  useEffect(() => {
    const initContext = async () => {
        setIsLoading(true);
        try {
            const urlParams = new URLSearchParams(window.location.search);
            let dataParam = urlParams.get('data');
            let customerId: string | null = null;
            let recordId: string | null = null;
            let saleIDParam: string | null = urlParams.get('saleID');
            let historyValueParam: string | null = urlParams.get('historyValue');
            let directDeptParam = urlParams.get('department') || urlParams.get('phongBan');
            const directRoleParam = urlParams.get('role')?.toUpperCase();

            // Parse data param if exists (Legacy or wrapped params)
            if (dataParam) {
                let decodedData = decodeURIComponent(dataParam);
                if (decodedData.includes('%') || decodedData.includes('http')) {
                    try {
                         const secondDecode = decodeURIComponent(decodedData);
                         if (!secondDecode.includes('%')) decodedData = secondDecode;
                    } catch (e) { console.warn("Failed secondary decode"); }
                }
                const customParams = new URLSearchParams(decodedData);
                customerId = customParams.get('customerId');
                recordId = customParams.get('recordId');
                
                if (!directDeptParam) directDeptParam = customParams.get('department') || customParams.get('phongBan');
                if (!saleIDParam) saleIDParam = customParams.get('saleID');
                if (!historyValueParam) historyValueParam = customParams.get('historyValue');
            }

            // Fallback to top level params
            if (!customerId) customerId = urlParams.get('customerId');
            if (!recordId) recordId = urlParams.get('recordId');
            
            // --- TEST FALLBACK: Use Default Sale ID if missing ---
            if (!saleIDParam) {
                console.info("Dev Mode: Using Test Sale ID");
                saleIDParam = "829bde80-1c54-ed11-9562-000d3ac7ccec";
            }

            // --- HISTORY RETRIEVAL STRATEGY ---
            let effectiveHistory = null;
            let sourceOfTruth = 'NONE';

            // 1. PRIORITY: URL History
            if (historyValueParam) {
                try {
                    const decodedHistory = decodeURIComponent(historyValueParam);
                    effectiveHistory = JSON.parse(decodedHistory);
                    sourceOfTruth = 'URL';
                } catch (e) {
                    try { 
                        effectiveHistory = JSON.parse(historyValueParam); 
                        sourceOfTruth = 'URL_RAW';
                    } catch(e2) {
                        console.warn("Failed to parse history from URL");
                    }
                }
            }

            // 2. SECONDARY: DB Fetch (Only if URL has no history and we have a RecordID)
            if (recordId) {
                const normRecordId = normalizeId(recordId);
                setContextRecordId(normRecordId);
                
                if (!effectiveHistory) {
                    setIsRestoring(true);
                    try {
                        const dbHistory = await fetchRequestHistory(normRecordId);
                        if (dbHistory) {
                            effectiveHistory = dbHistory;
                            sourceOfTruth = 'DATAVERSE';
                        }
                    } catch (e) {
                        console.warn("Could not fetch history from DB:", e);
                    } finally {
                        setIsRestoring(false);
                    }
                }
            }
            
            if (effectiveHistory) {
                setHistoryData(effectiveHistory);
                if(sourceOfTruth !== 'NONE') {
                    // Trigger Badge instead of Toast
                    setShowRestoredBadge(true);
                    setTimeout(() => setShowRestoredBadge(false), 3000); // Hide after 3s
                }
            }

            // Set Context State
            if (directDeptParam) setCurrentDepartment(directDeptParam);
            if (saleIDParam) setSaleId(saleIDParam);

            if (directRoleParam === 'SOURCE') setCurrentRole(UserRole.SOURCE);
            else if (directRoleParam === 'WAREHOUSE' || directRoleParam === 'KHO') setCurrentRole(UserRole.WAREHOUSE);
            else if (directRoleParam === 'VIEWER') setCurrentRole(UserRole.VIEWER);
            else if (directRoleParam === 'ADMIN') setCurrentRole(UserRole.ADMIN);
            else if (directDeptParam) setCurrentRole(getRoleFromDepartment(directDeptParam));
            else setCurrentRole(UserRole.ADMIN);

            if (!customerId || customerId === 'undefined' || customerId === 'null') {
                customerId = "c585ae98-4585-f011-b4cc-6045bd1d396f";
            }

            if (!customerId) {
                setError("Không tìm thấy ID Khách hàng (customerId).");
                setIsLoading(false);
                return;
            }

            const normCustomerId = normalizeId(customerId);
            const customer = await fetchCustomerById(normCustomerId);
            setSelectedCustomer(customer);
            
            // Fetch Orders
            const customerOrders = await fetchOrdersByCustomer(normCustomerId);
            setOrders(customerOrders);

            // --- AUTO SELECT ORDER LOGIC ---
            // 1. Try matching URL RecordID
            let targetOrder = null;
            if (recordId && recordId !== 'undefined') {
                targetOrder = customerOrders.find(o => normalizeId(o.id) === normalizeId(recordId));
            }

            // 2. If not found, Try using Order ID saved in History
            if (!targetOrder && effectiveHistory?.context?.orderId) {
                console.log("Auto-selecting order from History Context:", effectiveHistory.context.orderId);
                targetOrder = customerOrders.find(o => normalizeId(o.id) === normalizeId(effectiveHistory.context.orderId));
            }

            // Execute Selection
            if (targetOrder) {
                setSelectedOrder(targetOrder.id);
                setOrderSearch(targetOrder.soNumber || '');
                
                // Fetch and Apply
                const sodsData = await fetchSODsByOrder(targetOrder.id, targetOrder.soNumber);
                const mergedSods = applyHistoryToSods(sodsData, effectiveHistory);
                setSods(mergedSods);
            }

        } catch (err) {
            setError("Lỗi khởi tạo dữ liệu: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsLoading(false);
        }
    };
    initContext();
  }, []);

  // Helper: Merge fresh data with history state (Aggressive normalization)
  const applyHistoryToSods = (freshSods: SOD[], history: any): SOD[] => {
      if (!history || !history.sods) return freshSods;

      const normalizedHistoryMap: Record<string, any> = {};
      Object.keys(history.sods).forEach(key => {
          normalizedHistoryMap[normalizeId(key)] = history.sods[key];
      });

      return freshSods.map(sod => {
          const normId = normalizeId(sod.id);
          const savedState = normalizedHistoryMap[normId];
          
          if (savedState) {
              return {
                  ...sod,
                  qtyAvailable: savedState.qtyAvailable !== undefined ? savedState.qtyAvailable : sod.qtyAvailable,
                  status: savedState.status || sod.status,
                  isNotificationSent: savedState.isNotificationSent || false,
                  saleDecision: savedState.saleDecision || sod.saleDecision,
                  sourcePlan: savedState.sourcePlan || sod.sourcePlan
              };
          }
          return sod;
      });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orderDropdownRef.current && !orderDropdownRef.current.contains(event.target as Node)) {
        setIsOrderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => (o.soNumber || '').toLowerCase().includes(orderSearch.toLowerCase()));
  }, [orders, orderSearch]);

  const handleSelectOrder = async (order: SalesOrder) => {
    setSelectedOrder(order.id);
    setOrderSearch(order.soNumber || '');
    setIsOrderDropdownOpen(false);
    try {
      setIsLoading(true);
      const data = await fetchSODsByOrder(order.id, order.soNumber);
      
      // Re-apply history if available
      const merged = applyHistoryToSods(data, historyData);
      setSods(merged);
    } catch (err) {
      console.error(err);
      alert("Lỗi tải chi tiết đơn hàng (SOD)");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearOrder = () => {
      setSelectedOrder('');
      setOrderSearch('');
      setSods([]);
  }

  const handleUpdateSOD = (updatedSOD: SOD) => {
    // Optimistic Update UI
    setSods(prev => prev.map(s => s.id === updatedSOD.id ? updatedSOD : s));
  };

  // --- CRITICAL: GLOBAL SAVE STATE HANDLER ---
  const handleSaveState = async (currentSods: SOD[]) => {
      if (!contextRecordId) return;
      
      setSaveStatus('SAVING');

      // Construct a complete snapshot including Context
      const stateToSave = {
          timestamp: new Date().toISOString(),
          context: {
             orderId: selectedOrder,
             orderNumber: currentOrderInfo?.soNumber || orderSearch,
          },
          sods: currentSods.reduce((acc, sod) => {
              acc[sod.id] = {
                  qtyAvailable: sod.qtyAvailable,
                  status: sod.status,
                  isNotificationSent: sod.isNotificationSent,
                  saleDecision: sod.saleDecision, // Preserve Sale Data
                  sourcePlan: sod.sourcePlan      // Preserve Source Data
              };
              return acc;
          }, {} as Record<string, any>)
      };

      console.log("☁️ Syncing State to Dataverse:", stateToSave);
      
      setHistoryData(stateToSave);

      // Persist to Dataverse
      await updateRequestHistory(contextRecordId, stateToSave);
      
      setSaveStatus('SAVED');
      // Hide "Saved" indicator after 2 seconds
      setTimeout(() => setSaveStatus('IDLE'), 2000);
  };

  const handleCardNotify = async (sod: SOD): Promise<boolean> => {
      // 1. Send Notification Trigger to Sale (Re-added logic)
      await notifySaleOnShortage(sod);
      
      // 2. Update UI State & Save
      const updatedSod = { ...sod, isNotificationSent: true };
      const newSods = sods.map(s => s.id === sod.id ? updatedSod : s);
      setSods(newSods);

      await handleSaveState(newSods);
      
      return true;
  };

  const handleManualSave = async (updatedSod: SOD) => {
      // 1. Calculate new state array first
      const newSods = sods.map(s => s.id === updatedSod.id ? updatedSod : s);
      
      // 2. Update React State
      setSods(newSods);
      
      // 3. Trigger Global Save with the FULL new list
      await handleSaveState(newSods);
  };

  const processedSODs = useMemo(() => {
    return sods
      .filter(sod => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
            (sod.soNumber || '').toLowerCase().includes(term) || 
            (sod.product?.sku || '').toLowerCase().includes(term) ||
            (sod.product?.name || '').toLowerCase().includes(term) || 
            (sod.detailName || '').toLowerCase().includes(term) || 
            (sod.id || '').toLowerCase().includes(term);
        const matchesStatus = statusFilter === 'ALL' || sod.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const aShortage = Math.max(0, (a.qtyOrdered - a.qtyDelivered) - a.qtyAvailable);
        const bShortage = Math.max(0, (b.qtyOrdered - b.qtyDelivered) - b.qtyAvailable);
        if (aShortage > 0 && bShortage === 0) return -1;
        if (aShortage === 0 && bShortage > 0) return 1;
        return 0;
      });
  }, [sods, searchTerm, statusFilter]);

  const renderRoleIndicator = () => {
      const displayRoleName = currentDepartment || currentRole;
      const Badge = ({ icon: Icon, children }: any) => (
         <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm">
            <Icon className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-semibold text-gray-700 truncate max-w-[150px]">{children}</span>
         </div>
      );

      return (
        <div className="flex items-center gap-2">
            {/* Auto-Save Indicator with Auto-Hide */}
            {contextRecordId && saveStatus !== 'IDLE' && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 animate-in fade-in slide-in-from-right-4 ${saveStatus === 'SAVING' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                    {saveStatus === 'SAVING' ? (
                        <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span className="text-xs font-bold">Đang lưu...</span>
                        </>
                    ) : (
                        <>
                            <Cloud className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold">Đã lưu</span>
                        </>
                    )}
                </div>
            )}
            
            <Badge icon={currentRole === UserRole.ADMIN ? ShieldCheck : Users}>
                {displayRoleName}
            </Badge>
        </div>
      );
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50 font-sans text-gray-900 relative">
      
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
            <div className="flex flex-col lg:flex-row items-center gap-4 justify-between">
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full lg:w-auto">
                    {/* Customer */}
                    <div className="relative">
                         <div className="flex items-center w-full h-9 pl-3 pr-3 border border-gray-200 rounded-md bg-gray-50/50">
                             <Building2 className="w-4 h-4 text-gray-400 mr-2" />
                             <span className="text-sm font-medium text-gray-700 truncate flex-1">
                                {selectedCustomer ? selectedCustomer.name : (isLoading ? 'Đang tải...' : 'Khách hàng')}
                             </span>
                        </div>
                    </div>

                    {/* Order Search */}
                    <div className="relative" ref={orderDropdownRef}>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Package className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-full h-9 pl-9 pr-8 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                                placeholder={selectedCustomer ? "Tìm mã đơn hàng..." : "..."}
                                value={orderSearch}
                                onChange={(e) => {
                                    setOrderSearch(e.target.value);
                                    setIsOrderDropdownOpen(true);
                                    if (!e.target.value) setSelectedOrder('');
                                }}
                                onFocus={() => { if (selectedCustomer) setIsOrderDropdownOpen(true); }}
                                disabled={!selectedCustomer}
                            />
                            {selectedOrder ? (
                                <div className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer" onClick={handleClearOrder}>
                                    <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                                </div>
                            ) : (
                                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                </div>
                            )}
                        </div>

                        {/* Dropdown */}
                        {isOrderDropdownOpen && selectedCustomer && (
                             <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-100 max-h-[60vh] overflow-y-auto">
                                 {filteredOrders.length > 0 ? (
                                     <ul className="py-1">
                                         {filteredOrders.map(o => (
                                             <li 
                                                 key={o.id}
                                                 className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between text-sm"
                                                 onClick={() => handleSelectOrder(o)}
                                             >
                                                 <span className={`font-medium ${selectedOrder === o.id ? 'text-indigo-600' : 'text-gray-700'}`}>{o.soNumber || "Không có mã"}</span>
                                                 {selectedOrder === o.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                             </li>
                                         ))}
                                     </ul>
                                 ) : (
                                     <div className="px-3 py-4 text-center text-xs text-gray-400">Không có dữ liệu</div>
                                 )}
                             </div>
                        )}
                    </div>
                </div>

                <div className="mt-2 lg:mt-0">
                    {renderRoleIndicator()}
                </div>
            </div>
            
            {(isLoading || isRestoring || saveStatus === 'SAVING') && (
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gray-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 animate-[progress_1s_ease-in-out_infinite] origin-left"></div>
                </div>
            )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {selectedOrder ? (
        <div className="animate-in fade-in duration-300">
            <section className="mb-6">
                {/* TOOLBAR */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-5">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900">Chi tiết dòng hàng</span>
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                            {processedSODs.length}
                        </span>
                        {showRestoredBadge && (
                            <span className="ml-2 flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase font-bold tracking-wide animate-in fade-in duration-500">
                                <RefreshCw className="w-3 h-3" />
                                Đã khôi phục
                            </span>
                        )}
                     </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-3.5 w-3.5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-full sm:w-64 pl-9 pr-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                                placeholder="Tìm kiếm SKU, Sản phẩm..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="relative">
                            <select 
                                className="block w-full sm:w-48 pl-3 pr-8 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer text-gray-700 font-medium"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">Tất cả trạng thái</option>
                                <option value={SODStatus.SHORTAGE_PENDING_SALE}>Cần Sale xử lý</option>
                                <option value={SODStatus.SHORTAGE_PENDING_SOURCE}>Cần Source xử lý</option>
                                <option value={SODStatus.RESOLVED}>Đã hoàn tất</option>
                                <option value={SODStatus.SUFFICIENT}>Đủ tồn kho</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {processedSODs.length > 0 ? (
                        processedSODs.map(sod => (
                            <SODCard 
                                key={sod.id} 
                                sod={sod} 
                                currentRole={currentRole}
                                onUpdate={handleUpdateSOD}
                                onNotifySale={handleCardNotify}
                                onSaveState={handleManualSave}
                                saleId={saleId} 
                            />
                        ))
                    ) : (
                        <div className="py-12 text-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-sm">
                            {isLoading ? "Đang tải dữ liệu..." : "Không tìm thấy dữ liệu."}
                        </div>
                    )}
                </div>
            </section>
        </div>
        ) : (
           !isLoading && (
           <div className="flex flex-col items-center justify-center py-32 text-gray-400">
              <Database className="w-12 h-12 text-gray-200 mb-4" />
              <p className="text-sm font-medium">Vui lòng chọn đơn hàng để bắt đầu.</p>
           </div>
           )
        )}
      </main>
      <style>{`@keyframes progress { 0% { transform: translateX(-100%) scaleX(0.2); } 50% { transform: translateX(0%) scaleX(0.5); } 100% { transform: translateX(100%) scaleX(0.2); } }`}</style>
    </div>
  );
};

export default App;
