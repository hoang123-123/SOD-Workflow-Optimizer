
// Cấu hình kết nối Dataverse
// Lưu ý: Bạn cần thay đổi ORG_URL thành URL thực tế của môi trường Dataverse của bạn
// Ví dụ: https://org12345.crm.dynamics.com
export const DATAVERSE_CONFIG = {
  ORG_URL: 'https://wecare-ii.api.crm5.dynamics.com', 
  AUTH_TRIGGER_URL: 'https://de210e4bcd22e60591ca8e841aad4b.8e.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/1d8ccba4cda644d79f66bfe164b2a0bf/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Se56wn31gs_1-0gv4sPfYdy25OuhYBuVd4-xykYe8AM'
};

// Mapping các giá trị Status Code của Dataverse sang Enum nội bộ (Giả định)
export const DATAVERSE_STATUS_MAP = {
  DELIVERED: 191920002
};
