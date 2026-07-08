import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Static shipping data — no DB needed for now.
 * Matches FE ShippingInfo type.
 */
const SHIPPING_DATA = {
  methods: [
    {
      id: 'standard',
      name: 'Standard Shipping',
      description: 'Delivered in eco-friendly packaging',
      estimatedDays: '5-7 business days',
      price: 8,
      freeAbove: 150,
      icon: 'truck' as const,
    },
    {
      id: 'express',
      name: 'Express Shipping',
      description: 'Priority handling and faster delivery',
      estimatedDays: '2-3 business days',
      price: 15,
      icon: 'express' as const,
    },
    {
      id: 'store-pickup',
      name: 'Store Pickup',
      description: 'Pick up at our flagship store',
      estimatedDays: '1-2 business days',
      price: 0,
      icon: 'store' as const,
    },
  ],
  returnPolicy: {
    days: 30,
    description: 'We accept returns within 30 days of purchase for a full refund.',
    conditions: [
      'Items must be unworn and in original condition',
      'All tags must be attached',
      'Original packaging required',
      'Sale items are final sale',
    ],
  },
  freeShippingThreshold: 150,
  notes: [
    'Free standard shipping on orders over $150',
    'International shipping available to select countries',
    'Gift wrapping available at checkout (+$5)',
  ],
};

@ApiTags('Shipping')
@Controller('api/shipping')
export class ShippingController {
  @Get()
  @ApiOperation({ summary: 'Get shipping methods and return policy' })
  getShippingInfo() {
    return { data: SHIPPING_DATA };
  }
}
