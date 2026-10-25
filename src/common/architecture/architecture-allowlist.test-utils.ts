// Vi phạm cũ được phép tồn tại; chỉ được co lại (xem docs/specs/common/0002). Thêm mục mới phải có lý do và được duyệt.

// Cell được import cell khác: module -> cell -> các cell (xem docs/specs/common/0012). Đồ thị không vòng, mỗi cạnh phải được dùng.
export const CELL_DEPENDENCIES: Record<string, Record<string, readonly string[]>> = {};

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
