
// Service quản lý các Webhook trigger sang Power Automate hoặc hệ thống bên ngoài

const SALE_DECISION_FLOW_URL = 'https://de210e4bcd22e60591ca8e841aad4b.8e.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/18ce2102c6414958bcfdc17811407aae/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=C1KvmQKffZibJyV8VvZtkujxzuVmNT_QsdDXl7SZZQ8';

// Shared Flow URL for notifications as requested
const UNIVERSAL_FLOW_URL = 'https://de210e4bcd22e60591ca8e841aad4b.8e.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/18ce2102c6414958bcfdc17811407aae/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=C1KvmQKffZibJyV8VvZtkujxzuVmNT_QsdDXl7SZZQ8'; 

export interface SaleShipmentPayload {
    "Tên đơn hàng SOD": string;
    "ID đơn hàng SOD": string;
    "SL thiếu": number;
    "Type": string;
}

export interface NotificationPayload {
    "Type": "SALE_TO_SOURCE" | "SOURCE_TO_SALE" | "WAREHOUSE_TO_SALE" | "SALE_TO_WAREHOUSE";
    "SodId": string;
    "SodName": string;
    "Sku": string;
    "Message": string;
    "Details"?: any;
    "Timestamp": string;
}

/**
 * Gửi tín hiệu khi Sale chọn phương án "Giao hàng có sẵn"
 */
export const triggerSalePartialShipment = async (sodName: string, sodId: string, shortageQuantity: number): Promise<boolean> => {
    try {
        const payload: SaleShipmentPayload = {
            "Tên đơn hàng SOD": sodName,
            "ID đơn hàng SOD": sodId,
            "SL thiếu": shortageQuantity,
            "Type": "CHOTDON_HUYPHIEU"
        };

        console.log("[Flow Trigger] Sending Sale Decision Payload:", payload);
        
        const response = await fetch(SALE_DECISION_FLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             throw new Error(`Sale Decision Flow Failed: ${response.status} ${response.statusText}`);
        }

        return true;
    } catch (error) {
        console.error("[Flow Trigger] Error:", error);
        return false;
    }
};

/**
 * [MỚI] Thông báo cho Source khi Sale chọn phương án "Chờ Source xử lý"
 */
export const notifySourceOnSaleDecision = async (sod: any): Promise<boolean> => {
    try {
        const payload: NotificationPayload = {
            "Type": "SALE_TO_SOURCE",
            "SodId": sod.id,
            "SodName": sod.detailName,
            "Sku": sod.product.sku,
            "Message": `Sale đã chuyển yêu cầu xử lý thiếu hụt cho ${sod.product.name} (Đơn: ${sod.soNumber}).`,
            "Timestamp": new Date().toISOString()
        };

        console.log("🔔 [Notify Source] Sending payload:", payload);

        const response = await fetch(UNIVERSAL_FLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Notify Source Failed: ${response.statusText}`);
        return true;
    } catch (error) {
        console.error("[Flow Trigger] Notify Source Error:", error);
        return false;
    }
};

/**
 * [MỚI] Thông báo ngược lại cho Sale khi Source đã xác nhận kế hoạch (ETA)
 */
export const notifySaleOnSourcePlan = async (sod: any): Promise<boolean> => {
    try {
        const payload: NotificationPayload = {
            "Type": "SOURCE_TO_SALE",
            "SodId": sod.id,
            "SodName": sod.detailName,
            "Sku": sod.product.sku,
            "Message": `Source đã cập nhật kế hoạch cho ${sod.product.name}. ETA: ${sod.sourcePlan?.eta}. Nguồn: ${sod.sourcePlan?.supplier}.`,
            "Details": sod.sourcePlan,
            // Sử dụng ngày ETA do Source chọn (định dạng YYYY-MM-DD từ input type=date) làm Timestamp
            "Timestamp": sod.sourcePlan?.eta || new Date().toISOString()
        };

        console.log("🔔 [Notify Sale] Sending payload:", payload);

        const response = await fetch(UNIVERSAL_FLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Notify Sale Failed: ${response.statusText}`);
        return true;
    } catch (error) {
        console.error("[Flow Trigger] Notify Sale Error:", error);
        return false;
    }
};

/**
 * [MỚI] Thông báo cho Sale khi Kho xác nhận thiếu hụt
 */
export const notifySaleOnShortage = async (sod: any): Promise<boolean> => {
    try {
        const shortage = Math.max(0, (sod.qtyOrdered - sod.qtyDelivered) - sod.qtyAvailable);
        const payload: NotificationPayload = {
            "Type": "WAREHOUSE_TO_SALE",
            "SodId": sod.id,
            "SodName": sod.detailName,
            "Sku": sod.product.sku,
            "Message": `Kho xác nhận thiếu hàng ${sod.product.name}. SL Thiếu: ${shortage}. Vui lòng xử lý.`,
            "Timestamp": new Date().toISOString()
        };

        console.log("🔔 [Notify Sale Shortage] Sending payload:", payload);

        const response = await fetch(UNIVERSAL_FLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Notify Sale Shortage Failed: ${response.statusText}`);
        return true;
    } catch (error) {
        console.error("[Flow Trigger] Notify Sale Shortage Error:", error);
        return false;
    }
};

/**
 * [MỚI] Thông báo cho Kho khi Sale xác nhận phương án giao (SHIP_PARTIAL)
 */
export const notifyWarehouseOnSaleShipment = async (sod: any, quantityToShip: number): Promise<boolean> => {
    try {
        const payload: NotificationPayload = {
            "Type": "SALE_TO_WAREHOUSE",
            "SodId": sod.id,
            "SodName": sod.detailName,
            "Sku": sod.product.sku,
            "Message": `Sale đã chốt phương án GIAO NGAY ${quantityToShip} sản phẩm có sẵn cho ${sod.product.name}.`,
            "Details": { quantityToShip },
            "Timestamp": new Date().toISOString()
        };

        console.log("🔔 [Notify Warehouse] Sending payload:", payload);

        const response = await fetch(UNIVERSAL_FLOW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Notify Warehouse Failed: ${response.statusText}`);
        return true;
    } catch (error) {
        console.error("[Flow Trigger] Notify Warehouse Error:", error);
        return false;
    }
};
