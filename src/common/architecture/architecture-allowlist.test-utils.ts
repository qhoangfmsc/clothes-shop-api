// Vi phạm cũ được phép tồn tại; chỉ được co lại (xem docs/specs/common/0002). Thêm mục mới phải có lý do và được duyệt.

export const SERVICE_MAX_LINES = 300;
export const SERVICE_MAX_DEPENDENCIES = 5;

export const COMMON_IMPORTS_MODULES: Record<string, string> = {
  'src/common/guards/permissions.guard.ts': 'cần kiểu User để đọc role/permissions từ request',
};

export const UNUSED_EXPORTS: Record<string, string[]> = {
  'src/common/decorator/api-endpoint.decorator.ts': ['ApiEndpoint'], // quy ước trong .agent/skills/nest-best-practices
};

// Service đang quá dài: số dòng hiện tại là trần, không được dài thêm
export const OVERSIZED_SERVICES: Record<string, number> = {
  'src/modules/category/category.service.ts': 382,
  'src/modules/media/media.service.ts': 333,
  'src/modules/payment/payment.service.ts': 549,
  'src/modules/payment/refund.service.ts': 363,
  'src/modules/product/product.service.ts': 340,
  'src/modules/return/return.service.ts': 450,
  'src/modules/review/review.service.ts': 559,
};

// Service đang có quá nhiều dependency: số hiện tại là trần
export const MANY_DEPENDENCIES_SERVICES: Record<string, number> = {
  'src/modules/payment/payment.service.ts': 6,
};
