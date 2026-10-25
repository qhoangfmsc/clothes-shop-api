import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EReturnErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../../order/shared/order.entity';
import { OrderItem } from '../../order/shared/order-item.entity';
import { ShippingConfigService } from '../../shipping/shipping-config.service';
import { ReturnStatus } from '../shared/return.constant';
import { activeReturnQuantities } from '../shared/return-active-quantities.util';
import { computeReturnEligibility } from '../shared/return-eligibility.util';
import { ReturnRequest } from '../shared/return-request.entity';
import { presentReturnViews } from '../shared/return-view.util';
import { PublicReturnQueryDto } from './dtos/public-return-query.dto';

@Injectable()
export class ReturnRequestQueryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ReturnRequest)
    private readonly returnRepo: Repository<ReturnRequest>,
    private readonly shippingConfigService: ShippingConfigService,
  ) {}

  /** Đơn có trả hàng được không và từng dòng còn trả được bao nhiêu (để FE hiện/ẩn nút và giới hạn số lượng) */
  async getEligibility(userId: string, orderId: string) {
    const manager = this.dataSource.manager;
    const order = await manager.findOne(Order, { where: { id: orderId, userId } });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const returnWindowDays = (await this.shippingConfigService.get()).returnPolicy.days;
    const items = await manager.find(OrderItem, { where: { orderId } });
    const activeQuantities = await activeReturnQuantities(manager, orderId);
    return { data: { orderId, ...computeReturnEligibility({ order, items, activeQuantities, returnWindowDays }) } };
  }

  async findAll(userId: string, query: PublicReturnQueryDto) {
    const { status, orderId, sort } = query;
    const { page, limit } = getPaging(query);
    const { field, direction } = parseSort(sort, '-createdAt');

    const [requests, total] = await this.returnRepo.findAndCount({
      where: { order: { userId }, ...(status ? { status: status as ReturnStatus } : {}), ...(orderId ? { orderId } : {}) },
      order: { [field]: direction },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginated(await presentReturnViews(this.dataSource.manager, requests, false), total, page, limit);
  }

  async findOne(userId: string, returnId: string) {
    const request = await this.dataSource.manager.findOne(ReturnRequest, { where: { id: returnId } });
    const owned = request && (await this.dataSource.manager.exists(Order, { where: { id: request.orderId, userId } }));
    if (!request || !owned) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    return { data: (await presentReturnViews(this.dataSource.manager, [request], false))[0] };
  }
}
