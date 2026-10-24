// Vi phạm cũ được phép tồn tại; chỉ được co lại (xem docs/specs/common/0002). Thêm mục mới phải có lý do và được duyệt.

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
export const OVERSIZED_SERVICES: Record<string, number> = {
  'src/modules/category/category.service.ts': 376,
  'src/modules/media/media.service.ts': 333,
  'src/modules/payment/payment.service.ts': 549,
  'src/modules/payment/refund.service.ts': 363,
  'src/modules/product/product.service.ts': 326,
  'src/modules/return/return.service.ts': 450,
};

// Service đang có quá nhiều dependency: số hiện tại là trần
export const MANY_DEPENDENCIES_SERVICES: Record<string, number> = {
  'src/modules/payment/payment.service.ts': 6,
};
