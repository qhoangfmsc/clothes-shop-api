/** bigint của Postgres về dạng chuỗi → ép về number (số tiền VND luôn nằm trong vùng an toàn của number) */
export const bigintTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

/** numeric của Postgres về dạng chuỗi → ép về number (dùng cho tỷ giá, không dùng cho tiền) */
export const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
