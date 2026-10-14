/**
 * Boolean trong query string (`?needsAction=true`): chỉ nhận `true`/`false`; giá trị khác giữ nguyên để `@IsBoolean()` từ chối.
 * Không dùng chuyển kiểu ngầm của class-transformer vì `Boolean('false') === true`.
 */
export const parseQueryBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};
