import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReturnRequest } from '../shared/return-request.entity';
import { findReturnView, presentReturnViews } from '../shared/return-view.util';
import { AdminReturnQueryDto } from './dtos/admin-return-query.dto';

@Injectable()
export class ReturnProcessingQueryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ReturnRequest)
    private readonly returnRepo: Repository<ReturnRequest>,
  ) {}

  async findAllAdmin(query: AdminReturnQueryDto) {
    const { status, orderId, search, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.returnRepo.createQueryBuilder('r').innerJoin('r.order', 'o').addSelect(['o.id', 'o.shippingAddress']);
    if (status) qb.andWhere('r.status = :status', { status });
    if (orderId) qb.andWhere('r.order_id = :orderId', { orderId });
    if (search) {
      qb.andWhere(
        "(r.id ILIKE :search OR r.order_id ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search)",
        {
          search: `%${search}%`,
        },
      );
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction);
    qb.skip((page - 1) * limit).take(limit);

    const [requests, total] = await qb.getManyAndCount();
    return paginated(await presentReturnViews(this.dataSource.manager, requests, true), total, page, limit);
  }

  /** Số yêu cầu chờ duyệt (`status = REQUESTED`) — bằng `total` của `findAllAdmin({ status: 'REQUESTED' })`; `APPROVED` đang chờ khách gửi hàng nên không tính */
  async countRequested(): Promise<number> {
    return this.returnRepo.count({ where: { status: 'REQUESTED' } });
  }

  async findOneAdmin(returnId: string) {
    return { data: await findReturnView(this.dataSource.manager, returnId, true) };
  }
}
