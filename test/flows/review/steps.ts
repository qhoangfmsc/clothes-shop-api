import { MediaFile } from '../../../src/modules/media/media-file.entity';
import type { User } from '../../../src/modules/user/user.entity';
import { type Builders, bearer, type TestApp } from '../../support';
import type { deliveredPaidOrder } from '../order-payment/steps';

const STORAGE_ENV = {
  SUPABASE_URL: 'https://storage.flow.test',
  SUPABASE_STORAGE_BUCKET: 'flow-bucket',
  SUPABASE_SERVICE_ROLE_KEY: 'flow-key',
};

/** Bật cấu hình storage giả cho ảnh đánh giá (test-env để trống); trả hàm khôi phục. */
export function useStorageEnv(): () => void {
  const saved = Object.fromEntries(Object.keys(STORAGE_ENV).map((key) => [key, process.env[key]]));
  Object.assign(process.env, STORAGE_ENV);
  return () => Object.assign(process.env, saved);
}

/** URL công khai của một object trong bucket giả. */
export const storageUrl = (key: string) =>
  `${STORAGE_ENV.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(STORAGE_ENV.SUPABASE_STORAGE_BUCKET)}/${encodeURIComponent(key)}`;

/** Ảnh đánh giá đã upload của `owner` (hàng `media_files` purpose REVIEW); trả URL để gửi ở `images`. */
export async function uploadedReviewImage(t: TestApp, owner: Pick<User, 'id'>, purpose: 'REVIEW' | 'LIBRARY' = 'REVIEW') {
  const key = `review/${Math.random().toString(36).slice(2, 10)}.jpg`;
  const files = t.dataSource.getRepository(MediaFile);
  await files.save(
    files.create({
      name: 'photo.jpg',
      storageKey: key,
      mimeType: 'image/jpeg',
      size: 1234,
      purpose,
      uploadedBy: purpose === 'REVIEW' ? owner.id : null,
    }),
  );
  return storageUrl(key);
}

type Entry = Awaited<ReturnType<typeof deliveredPaidOrder>>;

/** Khách đánh giá dòng hàng đầu tiên của đơn đã giao; trả view của đánh giá. */
export async function writeReview(t: TestApp, entry: Entry, body: object = {}) {
  const res = await t.api
    .post('/api/reviews')
    .set(bearer(t, entry.customer))
    .send({ orderItemId: entry.items[0].id, rating: 5, ...body })
    .expect(201);
  return res.body.data as { id: string; rating: number; productId: string };
}

export type { Builders };
