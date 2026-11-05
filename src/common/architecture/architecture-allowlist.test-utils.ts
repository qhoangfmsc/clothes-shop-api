// Vi phạm cũ được phép tồn tại; chỉ được co lại (xem docs/specs/common/0002). Thêm mục mới phải có lý do và được duyệt.

// Cell được import cell khác: module -> cell -> các cell (xem docs/specs/common/0012). Đồ thị không vòng, mỗi cạnh phải được dùng.
export const CELL_DEPENDENCIES: Record<string, Record<string, readonly string[]>> = {
  order: { status: ['query'] }, // đọc-sau-ghi: huỷ/đổi trạng thái trả lại chi tiết đơn qua OrderQueryService
};

export const SERVICE_MAX_LINES = 300;
export const SERVICE_MAX_DEPENDENCIES = 5;

export const COMMON_IMPORTS_MODULES: Record<string, string> = {
  'src/common/guards/permissions.guard.ts': 'cần kiểu User để đọc role/permissions từ request',
};

// Chỗ ghi bảng của module khác (số lời gọi ghi); module chủ phải tự viết chuyển trạng thái (docs/specs/common/0006). Mục mới cần lý do và được duyệt.
export const CROSS_MODULE_WRITES: Record<string, number> = {
  'src/modules/auth/auth.service.ts': 3, // đăng nhập Google tạo/cập nhật `User`; module user chỉ có phía admin, không có đường đăng ký riêng
};

export const UNUSED_EXPORTS: Record<string, string[]> = {
  'src/common/decorator/api-endpoint.decorator.ts': ['ApiEndpoint'], // quy ước trong .agent/skills/nest-best-practices
};

// Service đang quá dài: số dòng hiện tại là trần, không được dài thêm
export const OVERSIZED_SERVICES: Record<string, number> = {};

// Service đang có quá nhiều dependency: số hiện tại là trần
export const MANY_DEPENDENCIES_SERVICES: Record<string, number> = {};

// Controller được chạm DB trực tiếp (số chỗ inject); mặc định controller chỉ gọi service
export const CONTROLLERS_WITH_DB_ACCESS: Record<string, number> = {
  'src/main.controller.ts': 1, // health check `SELECT 1`, không có nghiệp vụ để đặt vào service
};

// Chỗ ném exception HTTP thô ngoài service (số chỗ); code mới dùng throwAppError
export const RAW_HTTP_EXCEPTIONS: Record<string, number> = {
  'src/modules/auth/jwt.strategy.ts': 2, // 401 của Passport, cố ý không có errorCode (xem common.md 4.13)
  'src/common/base/typeorm-list-query.util.ts': 2, // lỗi lập trình/tham số sai của helper, không phải lỗi nghiệp vụ
};

// File không có hậu tố vai trò trong tên (`x.<vai trò>.ts`); mặc định mọi file phải có
export const UNSUFFIXED_FILES: Record<string, string> = {
  'src/main.ts': 'điểm vào của ứng dụng',
  'src/common/exceptions/error-codes.ts': 'bảng mã lỗi của mọi module',
  'src/common/base/column-transformers.ts': 'tập transformer cột dùng chung',
  'src/modules/shipping/shipping-config.ts': 'kiểu + validate cấu hình phí ship (gom, không phải một vai trò)',
  'src/modules/currency/exchange-rate-config.ts': 'kiểu + validate cấu hình tỷ giá (gom, không phải một vai trò)',
};
