
import { SOD, SODStatus } from './types';

export const MOCK_SODS: SOD[] = [
  {
    id: 'SOD-2025-001',
    detailName: 'SO_2025_001_MOCK',
    soNumber: 'SO-2025-8821',
    product: {
      sku: 'VN-LOG-01',
      name: 'Ghế Công Thái Học Ergonomic Ultra (Black)',
    },
    qtyOrdered: 100,
    qtyDelivered: 60,
    qtyAvailable: 30, // Needs 40 more. Available 30. Missing 10.
    status: SODStatus.SHORTAGE_PENDING_SALE,
  },
  {
    id: 'SOD-2025-002',
    detailName: 'SO_2025_002_MOCK',
    soNumber: 'SO-2025-8821',
    product: {
      sku: 'VN-DK-99',
      name: 'Bàn Nâng Hạ SmartDesk Pro',
    },
    qtyOrdered: 20,
    qtyDelivered: 0,
    qtyAvailable: 25, // Sufficient
    status: SODStatus.SUFFICIENT,
  },
  {
    id: 'SOD-2025-003',
    detailName: 'SO_2025_003_MOCK',
    soNumber: 'SO-2025-8821',
    product: {
      sku: 'ACC-ARM-02',
      name: 'Tay Đỡ Màn Hình Dual Monitor Arm',
    },
    qtyOrdered: 50,
    qtyDelivered: 0,
    qtyAvailable: 0, // Critical shortage
    status: SODStatus.SHORTAGE_PENDING_SALE,
  },
];
