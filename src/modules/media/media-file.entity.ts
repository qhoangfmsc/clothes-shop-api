import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity } from 'typeorm';

/**
 * Metadata của file đã upload lên Supabase Storage. Bytes nằm trên storage,
 * bảng này chỉ phục vụ list/paginate/search — URL luôn tính từ `storageKey`.
 */
@Entity('media_files')
export class MediaFile extends BaseEntity {
  /** Tên hiển thị (tên file gốc người dùng upload) */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Object key trong bucket — unique */
  @Column({ type: 'varchar', length: 255, unique: true, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType: string;

  /** bytes */
  @Column({ type: 'integer' })
  size: number;
}
