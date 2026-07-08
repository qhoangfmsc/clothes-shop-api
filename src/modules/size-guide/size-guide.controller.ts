import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Static size guide data — no DB needed for now.
 * Matches FE SizeGuide type.
 */
const SIZE_GUIDES: Record<string, any> = {
  tops: {
    category: 'tops',
    title: 'Tops Size Guide',
    description: 'Find your perfect fit. Measurements are in centimeters.',
    unit: 'cm',
    columns: ['Size', 'Bust', 'Waist', 'Length'],
    rows: [
      { size: 'XS', bust: '80-84', waist: '60-64', length: '58' },
      { size: 'S', bust: '84-88', waist: '64-68', length: '60' },
      { size: 'M', bust: '88-92', waist: '68-72', length: '62' },
      { size: 'L', bust: '92-96', waist: '72-76', length: '64' },
      { size: 'XL', bust: '96-100', waist: '76-80', length: '66' },
    ],
    tips: [
      'Measure your bust at the fullest part',
      'Measure your waist at the narrowest point',
      'If between sizes, we recommend sizing up for a relaxed fit',
    ],
  },
  skirts: {
    category: 'skirts',
    title: 'Skirts Size Guide',
    description: 'Skirt measurements. All sizes in centimeters.',
    unit: 'cm',
    columns: ['Size', 'Waist', 'Hips', 'Length'],
    rows: [
      { size: 'XS', waist: '60-64', hips: '86-90', length: '65' },
      { size: 'S', waist: '64-68', hips: '90-94', length: '67' },
      { size: 'M', waist: '68-72', hips: '94-98', length: '69' },
      { size: 'L', waist: '72-76', hips: '98-102', length: '71' },
      { size: 'XL', waist: '76-80', hips: '102-106', length: '73' },
    ],
    tips: [
      'Measure your hips at the widest point',
      'Length is measured from waist to hem',
      'Slip skirts may run slightly longer due to fabric drape',
    ],
  },
  bags: {
    category: 'bags',
    title: 'Bags Size Guide',
    description: 'Bag dimensions. All measurements in centimeters.',
    unit: 'cm',
    columns: ['Size', 'Width', 'Height', 'Depth'],
    rows: [
      { size: 'Mini', width: '18', height: '12', depth: '6' },
      { size: 'Small', width: '22', height: '16', depth: '8' },
      { size: 'Medium', width: '28', height: '20', depth: '10' },
      { size: 'Large', width: '35', height: '28', depth: '14' },
    ],
    tips: [
      'Width is measured across the bottom of the bag',
      'Strap drop is not included in height measurement',
      'Mini bags fit phone, keys, and card wallet',
    ],
  },
  jewelry: {
    category: 'jewelry',
    title: 'Jewelry Size Guide',
    description: 'Ring sizes and necklace lengths.',
    unit: 'cm',
    columns: ['Size', 'Circumference'],
    rows: [
      { size: '5', circumference: '4.9' },
      { size: '6', circumference: '5.2' },
      { size: '7', circumference: '5.4' },
      { size: '8', circumference: '5.7' },
      { size: '9', circumference: '6.0' },
    ],
    tips: [
      'Measure your ring size at the end of the day when fingers are largest',
      'Necklace chain lengths: Choker 35cm, Princess 45cm, Matinee 55cm',
      'If between sizes, choose the larger size',
    ],
  },
};

@ApiTags('Size Guides')
@Controller('api/size-guides')
@Public()
export class SizeGuideController {
  @Get(':category')
  @ApiOperation({ summary: 'Get size guide by category' })
  getSizeGuide(@Param('category') category: string) {
    const guide = SIZE_GUIDES[category];
    if (!guide) {
      return { data: null };
    }
    return { data: guide };
  }
}
