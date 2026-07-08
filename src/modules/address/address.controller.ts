import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorator/current-user.decorator';
import { User } from '../user/user.entity';
import { AddressService } from './address.service';
import { CreateAddressDto, UpdateAddressDto } from './dtos/address.dto';

@ApiTags('Addresses')
@Controller('api/addresses')
@ApiBearerAuth()
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get()
  @ApiOperation({ summary: 'List user addresses' })
  findAll(@CurrentUser() user: User) {
    return this.addressService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new address' })
  create(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    return this.addressService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an address' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addressService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an address' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.addressService.remove(user.id, id);
  }
}
