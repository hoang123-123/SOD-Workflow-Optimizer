
export enum UserRole {
  SALE = 'SALE',
  SOURCE = 'SOURCE',
  WAREHOUSE = 'WAREHOUSE', // New Role
  VIEWER = 'VIEWER', // Read only
  ADMIN = 'ADMIN' // Full Access
}

export enum SODStatus {
  SUFFICIENT = 'SUFFICIENT',
  SHORTAGE_PENDING_SALE = 'SHORTAGE_PENDING_SALE',
  SHORTAGE_PENDING_SOURCE = 'SHORTAGE_PENDING_SOURCE',
  RESOLVED = 'RESOLVED'
}

export interface Customer {
  id: string; // crdfd_customerid
  name: string; // crdfd_name
}

export interface SalesOrder {
  id: string; // crdfd_sale_orderid
  soNumber: string; // crdfd_name (Mã đơn)
  deliveryDate?: string;
  deliveryMethod?: number; // 283640000: Giao 1 lần, 283640001: Giao theo tiến độ
  priority?: string;
  sodCount?: number; // Số lượng dòng hàng (SOD)
}

export interface Product {
  sku: string;
  name: string;
  image?: string;
}

export interface SOD {
  id: string; // crdfd_saleorderdetailid (UUID)
  detailName: string; // crdfd_name (Tên hiển thị/Mã dòng hàng SO_...)
  soNumber: string;
  product: Product;
  qtyOrdered: number; // crdfd_quantity
  qtyDelivered: number; // Mapping từ dữ liệu thực tế
  qtyAvailable: number; // Mapping từ dữ liệu tồn kho
  warehouseLocation?: string; // Kho lấy hàng/Kho nhập
  
  // Workflow State (Mapping logic từ status code)
  status: SODStatus;
  
  // UI State: Warehouse sent notification?
  isNotificationSent?: boolean;

  // Sale Decision (Mock hoặc map từ field custom)
  saleDecision?: {
    action: 'SHIP_PARTIAL' | 'WAIT_ALL';
    timestamp: string;
    note?: string;
  };

  // Source Plan (Lấy từ crdfd_kehoachsoanhangdetail...)
  sourcePlan?: {
    eta?: string;
    supplier?: string;
    status: 'CONFIRMED' | 'NO_STOCK';
    timestamp: string;
  };
}
