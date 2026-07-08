import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './address.entity';
import { CreateAddressDto, UpdateAddressDto } from './dtos/address.dto';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
  ) {}

  async findAll(userId: string) {
    const data = await this.addressRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async create(userId: string, dto: CreateAddressDto) {
    // If setting as default, unset previous default
    if (dto.isDefault) {
      await this.addressRepo.update({ userId, isDefault: true }, { isDefault: false });
    }

    const address = this.addressRepo.create({ ...dto, userId });
    const saved = await this.addressRepo.save(address);
    return { data: saved };
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    const address = await this.addressRepo.findOne({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');

    if (dto.isDefault) {
      await this.addressRepo.update({ userId, isDefault: true }, { isDefault: false });
    }

    Object.assign(address, dto);
    const saved = await this.addressRepo.save(address);
    return { data: saved };
  }

  async remove(userId: string, addressId: string) {
    const address = await this.addressRepo.findOne({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');
    await this.addressRepo.remove(address);
    return { success: true };
  }
}
