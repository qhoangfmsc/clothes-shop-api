import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@common/decorator/public.decorator';

@ApiExcludeController()
@Controller()
@Public()
export class MainController {
  @Get()
  getHello(): string {
    return 'Clothes Shop API is running';
  }
}
