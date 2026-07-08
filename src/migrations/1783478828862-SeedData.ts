import { MigrationInterface, QueryRunner } from 'typeorm';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

/**
 * Helper: generate SKU from category + subcategory + slug
 */
function genSku(category: string, subcategory: string, slug: string): string {
  return `${category}-${subcategory}-${slug}`;
}

/**
 * Helper: escape single quotes for SQL
 */
function esc(str: string): string {
  return str.replace(/'/g, "''");
}

export class SeedData1783478828862 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ═══════════════════════════════════════════════════════════
    // Generate all nanoid16 IDs upfront for cross-referencing
    // ═══════════════════════════════════════════════════════════

    // Product IDs (32 products)
    const p = Array.from({ length: 32 }, () => nanoid());

    // Category IDs (4 categories)
    const c = Array.from({ length: 4 }, () => nanoid());

    // Collection IDs (7 collections)
    const col = Array.from({ length: 7 }, () => nanoid());

    // Review IDs (6 reviews)
    const r = Array.from({ length: 6 }, () => nanoid());

    // ═══════════════════════════════════════════════════════════
    // PRODUCTS — 32 products
    // Index: 0-7 tops, 8-15 skirts, 16-23 bags, 24-31 jewelry
    // ═══════════════════════════════════════════════════════════
    const products = [
      // ── TOPS (0-7) ──
      { id: p[0],  slug: 'silk-camisole-rose', cat: 'tops', sub: 'camisoles', name: 'Silk Camisole Rosé', price: 185, op: null, images: ['/images/model-intro/model_intro_1.webp', '/images/model-intro/model_intro_4.webp'], badge: 'new', desc: 'Crafted from the finest mulberry silk, this camisole embodies effortless elegance. The delicate construction and thoughtful detailing make it a wardrobe essential.', material: '100% Mulberry Silk', care: 'Dry clean only. Store in garment bag.', sizes: ['XS','S','M','L','XL'], colors: [{name:'Rosé',hex:'#D4A5A5'},{name:'Pearl',hex:'#F5EFE0'},{name:'Noir',hex:'#1A1917'}], tags: ['silk','camisole','summer','new-arrival'], ca: '2026-06-01' },
      { id: p[1],  slug: 'halter-top-noir', cat: 'tops', sub: 'halter', name: 'Halter Top Noir', price: 145, op: null, images: ['/images/model-intro/model_intro_2.webp', '/images/model-intro/model_intro_5.webp'], badge: null, desc: 'A statement piece that transitions seamlessly from day to evening. The refined silhouette flatters every figure with understated luxury.', material: 'Italian Cotton Blend', care: 'Machine wash cold. Lay flat to dry.', sizes: ['XS','S','M','L'], colors: [{name:'Noir',hex:'#1A1917'},{name:'Champagne',hex:'#C9A96E'}], tags: ['halter','noir','evening'], ca: '2026-05-20' },
      { id: p[2],  slug: 'linen-tank-creme', cat: 'tops', sub: 'tank', name: 'Linen Tank Crème', price: 95, op: null, images: ['/images/model-intro/model_intro_3.webp', '/images/model-intro/model_intro_6.webp'], badge: 'bestseller', desc: 'Designed with intention and crafted with care. This timeless piece combines modern aesthetics with artisanal quality.', material: 'French Linen', care: 'Machine wash gentle cycle. Iron on low.', sizes: ['XS','S','M','L','XL'], colors: [{name:'Crème',hex:'#F5EFE0'},{name:'Sage',hex:'#A3B18A'},{name:'Dusty Blue',hex:'#8FA3B4'}], tags: ['linen','tank','basics','bestseller'], ca: '2026-04-15' },
      { id: p[3],  slug: 'off-shoulder-blush', cat: 'tops', sub: 'off-shoulder', name: 'Off-Shoulder Blush', price: 165, op: null, images: ['/images/model-intro/model_intro_4.webp', '/images/model-intro/model_intro_7.webp'], badge: null, desc: 'Inspired by the golden hour — where light meets form. Every stitch tells a story of meticulous craftsmanship.', material: 'Organic Pima Cotton', care: 'Hand wash cold. Hang to dry.', sizes: ['S','M','L'], colors: [{name:'Blush',hex:'#D4A5A5'},{name:'Vanilla',hex:'#F0E4A6'}], tags: ['off-shoulder','romantic','blush'], ca: '2026-05-10' },
      { id: p[4],  slug: 'cashmere-cardigan', cat: 'tops', sub: 'cardigans', name: 'Cashmere Cardigan', price: 295, op: 350, images: ['/images/model-intro/model_intro_5.webp', '/images/model-intro/model_intro_1.webp'], badge: 'sale', desc: 'A versatile essential that pairs beautifully with any outfit. Premium cashmere ensures lasting comfort and style.', material: 'Cashmere Wool Blend', care: 'Dry clean recommended. Store folded.', sizes: ['XS','S','M','L','XL'], colors: [{name:'Oatmeal',hex:'#D4C5A9'},{name:'Charcoal',hex:'#3A3128'},{name:'Rosé',hex:'#D4A5A5'}], tags: ['cashmere','cardigan','layering','sale'], ca: '2026-03-01' },
      { id: p[5],  slug: 'corset-top-champagne', cat: 'tops', sub: 'corset', name: 'Corset Top Champagne', price: 210, op: null, images: ['/images/model-intro/model_intro_6.webp', '/images/model-intro/model_intro_2.webp'], badge: null, desc: 'Where minimalism meets luxury. Clean lines and exceptional materials create a piece that speaks volumes in silence.', material: 'Silk Satin', care: 'Dry clean only.', sizes: ['XS','S','M','L'], colors: [{name:'Champagne',hex:'#C9A96E'},{name:'Noir',hex:'#1A1917'}], tags: ['corset','champagne','structured'], ca: '2026-06-10' },
      { id: p[6],  slug: 'ruched-halter-pearl', cat: 'tops', sub: 'halter', name: 'Ruched Halter Pearl', price: 155, op: null, images: ['/images/model-intro/model_intro_7.webp', '/images/model-intro/model_intro_3.webp'], badge: 'new', desc: 'An ode to feminine grace. Soft draping and careful tailoring create a silhouette that moves with you.', material: 'Premium Viscose', care: 'Hand wash cold. Lay flat to dry.', sizes: ['XS','S','M','L'], colors: [{name:'Pearl',hex:'#F5EFE0'},{name:'Lavender',hex:'#B8A5C8'}], tags: ['halter','ruched','pearl','new-arrival'], ca: '2026-06-15' },
      { id: p[7],  slug: 'knit-tank-sage', cat: 'tops', sub: 'tank', name: 'Knit Tank Sage', price: 120, op: null, images: ['/images/model-intro/model_intro_1.webp', '/images/model-intro/model_intro_5.webp'], badge: null, desc: 'The intersection of art and fashion. A carefully curated piece that elevates your everyday wardrobe.', material: 'Japanese Crepe', care: 'Machine wash cold. Lay flat to dry.', sizes: ['S','M','L','XL'], colors: [{name:'Sage',hex:'#A3B18A'},{name:'Crème',hex:'#F5EFE0'}], tags: ['knit','tank','sage','casual'], ca: '2026-05-25' },
      // ── SKIRTS (8-15) ──
      { id: p[8],  slug: 'satin-slip-skirt-blush', cat: 'skirts', sub: 'slip', name: 'Satin Slip Skirt Blush', price: 175, op: null, images: ['/images/model-intro/model_intro_3.webp', '/images/model-intro/model_intro_6.webp'], badge: 'new', desc: 'Liquid satin that cascades like water. This bias-cut slip skirt is the foundation of modern elegance.', material: 'Silk Satin', care: 'Dry clean only. Store hanging.', sizes: ['XS','S','M','L','XL'], colors: [{name:'Blush',hex:'#D4A5A5'},{name:'Champagne',hex:'#C9A96E'},{name:'Noir',hex:'#1A1917'}], tags: ['satin','slip','blush','new-arrival'], ca: '2026-06-05' },
      { id: p[9],  slug: 'midi-wrap-champagne', cat: 'skirts', sub: 'wrap', name: 'Midi Wrap Champagne', price: 195, op: null, images: ['/images/model-intro/model_intro_4.webp', '/images/model-intro/model_intro_7.webp'], badge: null, desc: 'A wrap silhouette that flatters every body. The champagne tone catches light beautifully as you move.', material: 'Italian Cotton Blend', care: 'Machine wash cold. Iron on medium.', sizes: ['XS','S','M','L'], colors: [{name:'Champagne',hex:'#C9A96E'},{name:'Rose',hex:'#D4A5A5'}], tags: ['midi','wrap','champagne'], ca: '2026-05-18' },
      { id: p[10], slug: 'mini-skirt-noir', cat: 'skirts', sub: 'mini', name: 'Mini Skirt Noir', price: 135, op: null, images: ['/images/model-intro/model_intro_6.webp', '/images/model-intro/model_intro_2.webp'], badge: 'bestseller', desc: 'Bold yet refined. This mini skirt in deep noir is a versatile statement piece for any occasion.', material: 'Premium Viscose', care: 'Machine wash gentle. Hang to dry.', sizes: ['XS','S','M','L'], colors: [{name:'Noir',hex:'#1A1917'},{name:'Burgundy',hex:'#722F37'}], tags: ['mini','noir','bestseller','evening'], ca: '2026-04-20' },
      { id: p[11], slug: 'pleated-midi-rose', cat: 'skirts', sub: 'midi', name: 'Pleated Midi Rose', price: 225, op: null, images: ['/images/model-intro/model_intro_1.webp', '/images/model-intro/model_intro_4.webp'], badge: null, desc: 'Hand-pressed pleats that move like poetry. Each fold catches light differently, creating a living texture.', material: 'French Linen', care: 'Dry clean recommended.', sizes: ['S','M','L'], colors: [{name:'Rose',hex:'#D4A5A5'},{name:'Sage',hex:'#A3B18A'}], tags: ['pleated','midi','rose','editorial'], ca: '2026-05-12' },
      { id: p[12], slug: 'lace-overlay-skirt', cat: 'skirts', sub: 'lace', name: 'Lace Overlay Skirt', price: 245, op: 295, images: ['/images/model-intro/model_intro_2.webp', '/images/model-intro/model_intro_5.webp'], badge: 'sale', desc: 'Delicate Chantilly lace layered over a silk lining. An heirloom piece that transcends seasons.', material: 'Chantilly Lace & Silk', care: 'Dry clean only. Store in garment bag.', sizes: ['XS','S','M','L'], colors: [{name:'Ivory',hex:'#FFFFF0'},{name:'Blush',hex:'#D4A5A5'}], tags: ['lace','overlay','sale','romantic'], ca: '2026-03-15' },
      { id: p[13], slug: 'a-line-mini-sage', cat: 'skirts', sub: 'mini', name: 'A-Line Mini Sage', price: 140, op: null, images: ['/images/model-intro/model_intro_5.webp', '/images/model-intro/model_intro_1.webp'], badge: null, desc: 'Fresh sage green in a classic A-line cut. The perfect daytime companion.', material: 'Organic Pima Cotton', care: 'Machine wash cold.', sizes: ['XS','S','M','L','XL'], colors: [{name:'Sage',hex:'#A3B18A'},{name:'Dusty Blue',hex:'#8FA3B4'},{name:'Vanilla',hex:'#F0E4A6'}], tags: ['a-line','mini','sage','casual'], ca: '2026-05-28' },
      { id: p[14], slug: 'bias-cut-slip-pearl', cat: 'skirts', sub: 'slip', name: 'Bias-Cut Slip Pearl', price: 185, op: null, images: ['/images/model-intro/model_intro_7.webp', '/images/model-intro/model_intro_3.webp'], badge: 'new', desc: 'Cut on the bias for a fluid drape that skims the body. Pearl tones for a luminous finish.', material: '100% Mulberry Silk', care: 'Dry clean only.', sizes: ['XS','S','M','L'], colors: [{name:'Pearl',hex:'#F5EFE0'},{name:'Gold',hex:'#C9A96E'}], tags: ['bias-cut','slip','pearl','new-arrival'], ca: '2026-06-12' },
      { id: p[15], slug: 'wrap-skirt-lavender', cat: 'skirts', sub: 'wrap', name: 'Wrap Skirt Lavender', price: 160, op: null, images: ['/images/model-intro/model_intro_4.webp', '/images/model-intro/model_intro_6.webp'], badge: null, desc: 'Soft lavender wrap with an adjustable tie. Evening-ready elegance in a relaxed silhouette.', material: 'Japanese Crepe', care: 'Hand wash cold. Hang to dry.', sizes: ['S','M','L'], colors: [{name:'Lavender',hex:'#B8A5C8'},{name:'Crème',hex:'#F5EFE0'}], tags: ['wrap','lavender','evening'], ca: '2026-05-05' },
      // ── BAGS (16-23) ──
      { id: p[16], slug: 'woven-hobo-camel', cat: 'bags', sub: 'hobo', name: 'Woven Hobo Camel', price: 320, op: null, images: ['/images/model-intro/model_intro_5.webp', '/images/model-intro/model_intro_1.webp'], badge: 'new', desc: 'Hand-woven leather in a relaxed hobo silhouette. Each bag takes three days to weave, making every piece unique.', material: 'Hand-Woven Italian Leather', care: 'Condition with leather cream quarterly.', sizes: ['One Size'], colors: [{name:'Camel',hex:'#C19A6B'},{name:'Cognac',hex:'#8B4513'}], tags: ['hobo','woven','leather','new-arrival'], ca: '2026-06-08' },
      { id: p[17], slug: 'shoulder-bag-noir', cat: 'bags', sub: 'shoulder', name: 'Shoulder Bag Noir', price: 285, op: null, images: ['/images/model-intro/model_intro_6.webp', '/images/model-intro/model_intro_2.webp'], badge: null, desc: 'The everyday essential, elevated. Structured yet supple, with gold-tone hardware that whispers luxury.', material: 'Nappa Leather', care: 'Wipe with damp cloth. Avoid direct sunlight.', sizes: ['One Size'], colors: [{name:'Noir',hex:'#1A1917'},{name:'Taupe',hex:'#B8A99A'}], tags: ['shoulder','noir','classic'], ca: '2026-05-15' },
      { id: p[18], slug: 'evening-clutch-gold', cat: 'bags', sub: 'clutches', name: 'Evening Clutch Gold', price: 195, op: null, images: ['/images/model-intro/model_intro_7.webp', '/images/model-intro/model_intro_3.webp'], badge: 'bestseller', desc: 'Pure evening glamour. The textured gold finish catches every light, while the compact frame holds your night essentials.', material: 'Metallic Leather', care: 'Store in dust bag. Handle with clean hands.', sizes: ['One Size'], colors: [{name:'Gold',hex:'#C9A96E'},{name:'Silver',hex:'#C0C0C0'}], tags: ['clutch','gold','evening','bestseller'], ca: '2026-04-10' },
      { id: p[19], slug: 'mini-bag-rose', cat: 'bags', sub: 'mini', name: 'Mini Bag Rosé', price: 165, op: null, images: ['/images/model-intro/model_intro_1.webp', '/images/model-intro/model_intro_4.webp'], badge: null, desc: 'Perfectly petite. This mini bag proves that small things can make the biggest impression.', material: 'Saffiano Leather', care: 'Wipe clean. Avoid water exposure.', sizes: ['One Size'], colors: [{name:'Rosé',hex:'#D4A5A5'},{name:'Blush',hex:'#F2D7D7'},{name:'Noir',hex:'#1A1917'}], tags: ['mini','rose','crossbody'], ca: '2026-05-22' },
      { id: p[20], slug: 'tote-bag-canvas', cat: 'bags', sub: 'tote', name: 'Canvas Tote Natural', price: 145, op: null, images: ['/images/model-intro/model_intro_2.webp', '/images/model-intro/model_intro_5.webp'], badge: 'new', desc: 'Spacious, sustainable, and effortlessly chic. Organic canvas with leather trim for everyday luxury.', material: 'Organic Canvas & Leather', care: 'Spot clean canvas. Condition leather.', sizes: ['One Size'], colors: [{name:'Natural',hex:'#F5EFE0'},{name:'Sand',hex:'#D4C5A9'}], tags: ['tote','canvas','sustainable','new-arrival'], ca: '2026-06-15' },
      { id: p[21], slug: 'crescent-shoulder-sage', cat: 'bags', sub: 'shoulder', name: 'Crescent Shoulder Sage', price: 255, op: null, images: ['/images/model-intro/model_intro_3.webp', '/images/model-intro/model_intro_6.webp'], badge: null, desc: 'A crescent-shaped shoulder bag in muted sage. The curved form is both sculptural and practical.', material: 'Soft Grain Leather', care: 'Condition monthly. Store stuffed.', sizes: ['One Size'], colors: [{name:'Sage',hex:'#A3B18A'},{name:'Oatmeal',hex:'#D4C5A9'}], tags: ['shoulder','sage','sculptural'], ca: '2026-05-08' },
      { id: p[22], slug: 'envelope-clutch-noir', cat: 'bags', sub: 'clutches', name: 'Envelope Clutch Noir', price: 175, op: null, images: ['/images/model-intro/model_intro_4.webp', '/images/model-intro/model_intro_7.webp'], badge: null, desc: 'Sleek envelope lines in buttery noir leather. The magnetic closure keeps everything secure in style.', material: 'Nappa Leather', care: 'Store in dust bag.', sizes: ['One Size'], colors: [{name:'Noir',hex:'#1A1917'},{name:'Burgundy',hex:'#722F37'}], tags: ['clutch','envelope','noir','evening'], ca: '2026-04-18' },
      { id: p[23], slug: 'bucket-bag-tan', cat: 'bags', sub: 'hobo', name: 'Bucket Bag Tan', price: 235, op: null, images: ['/images/model-intro/model_intro_5.webp', '/images/model-intro/model_intro_2.webp'], badge: null, desc: 'A modern bucket silhouette with drawstring closure. Rich tan leather that ages beautifully over time.', material: 'Full-Grain Leather', care: 'Condition with leather balm. Avoid rain.', sizes: ['One Size'], colors: [{name:'Tan',hex:'#C19A6B'},{name:'Chocolate',hex:'#5C4033'}], tags: ['bucket','tan','casual'], ca: '2026-05-30' },
      // ── JEWELRY (24-31) ──
      { id: p[24], slug: 'layered-chain-gold', cat: 'jewelry', sub: 'necklaces', name: 'Layered Chain Gold', price: 145, op: null, images: ['/images/model-intro/model_intro_7.webp', '/images/model-intro/model_intro_3.webp'], badge: 'new', desc: 'Three delicate chains at varying lengths create the illusion of effortless layering in a single piece.', material: '18K Gold Plate over Sterling Silver', care: 'Store in jewelry pouch. Remove before swimming.', sizes: ['One Size'], colors: [{name:'Gold',hex:'#C9A96E'},{name:'Rose Gold',hex:'#B76E79'}], tags: ['necklace','layered','gold','new-arrival'], ca: '2026-06-12' },
      { id: p[25], slug: 'pearl-drop-earrings', cat: 'jewelry', sub: 'earrings', name: 'Pearl Drop Earrings', price: 95, op: null, images: ['/images/model-intro/model_intro_1.webp', '/images/model-intro/model_intro_4.webp'], badge: 'bestseller', desc: 'Freshwater pearls suspended from delicate gold posts. The classic earring, refined for the modern woman.', material: 'Freshwater Pearl & 14K Gold', care: 'Wipe gently with soft cloth.', sizes: ['One Size'], colors: [{name:'Pearl/Gold',hex:'#F5EFE0'},{name:'Pearl/Silver',hex:'#C0C0C0'}], tags: ['earrings','pearl','classic','bestseller'], ca: '2026-04-05' },
      { id: p[26], slug: 'signet-ring-gold', cat: 'jewelry', sub: 'rings', name: 'Signet Ring Gold', price: 125, op: null, images: ['/images/model-intro/model_intro_2.webp', '/images/model-intro/model_intro_5.webp'], badge: null, desc: 'A modern signet ring with a smooth, polished face. Substantial weight for a premium feel.', material: '18K Gold Plate', care: 'Polish with jewelry cloth.', sizes: ['5','6','7','8'], colors: [{name:'Gold',hex:'#C9A96E'},{name:'Silver',hex:'#C0C0C0'}], tags: ['ring','signet','gold','statement'], ca: '2026-05-01' },
      { id: p[27], slug: 'chain-bracelet-mixed', cat: 'jewelry', sub: 'bracelets', name: 'Chain Bracelet Mixed', price: 85, op: null, images: ['/images/model-intro/model_intro_3.webp', '/images/model-intro/model_intro_6.webp'], badge: null, desc: 'Three different chain patterns interlinked for a textured, layered look on the wrist.', material: 'Gold & Silver Plate', care: 'Remove before washing hands.', sizes: ['One Size'], colors: [{name:'Mixed Metal',hex:'#C9A96E'}], tags: ['bracelet','chain','mixed-metal'], ca: '2026-05-10' },
      { id: p[28], slug: 'silk-hair-ribbon', cat: 'jewelry', sub: 'hair', name: 'Silk Hair Ribbon', price: 45, op: null, images: ['/images/model-intro/model_intro_4.webp', '/images/model-intro/model_intro_7.webp'], badge: 'new', desc: 'Pure silk ribbon in a generous length. Tie, wrap, or bow — however your hair story unfolds.', material: '100% Mulberry Silk', care: 'Hand wash cold.', sizes: ['One Size'], colors: [{name:'Champagne',hex:'#C9A96E'},{name:'Rosé',hex:'#D4A5A5'},{name:'Noir',hex:'#1A1917'},{name:'Sage',hex:'#A3B18A'}], tags: ['hair','ribbon','silk','new-arrival'], ca: '2026-06-18' },
      { id: p[29], slug: 'hoop-earrings-gold', cat: 'jewelry', sub: 'earrings', name: 'Hoop Earrings Gold', price: 75, op: null, images: ['/images/model-intro/model_intro_5.webp', '/images/model-intro/model_intro_1.webp'], badge: null, desc: 'Medium-sized hoops with a subtle hammered texture. Lightweight enough for all-day wear.', material: '14K Gold Plate', care: 'Store in anti-tarnish bag.', sizes: ['One Size'], colors: [{name:'Gold',hex:'#C9A96E'},{name:'Rose Gold',hex:'#B76E79'}], tags: ['earrings','hoop','gold','everyday'], ca: '2026-04-22' },
      { id: p[30], slug: 'pendant-necklace-amethyst', cat: 'jewelry', sub: 'necklaces', name: 'Pendant Necklace Amethyst', price: 165, op: null, images: ['/images/model-intro/model_intro_6.webp', '/images/model-intro/model_intro_2.webp'], badge: null, desc: 'A raw amethyst crystal cradled in gold. Every stone is naturally unique — no two necklaces are the same.', material: 'Natural Amethyst & 18K Gold', care: 'Handle crystal gently.', sizes: ['One Size'], colors: [{name:'Amethyst/Gold',hex:'#B8A5C8'}], tags: ['necklace','pendant','amethyst','crystal'], ca: '2026-05-15' },
      { id: p[31], slug: 'enamel-signet-noir', cat: 'jewelry', sub: 'rings', name: 'Enamel Signet Noir', price: 110, op: null, images: ['/images/model-intro/model_intro_7.webp', '/images/model-intro/model_intro_4.webp'], badge: null, desc: 'A modern take on the classic signet. Black enamel over gold creates a bold, graphic statement.', material: 'Gold Plate with Black Enamel', care: 'Avoid abrasives. Store in ring box.', sizes: ['5','6','7','8','9'], colors: [{name:'Noir/Gold',hex:'#1A1917'},{name:'Burgundy/Gold',hex:'#722F37'}], tags: ['ring','signet','noir','statement'], ca: '2026-05-02' },
    ];

    for (const prod of products) {
      const sku = genSku(prod.cat, prod.sub, prod.slug);
      const opVal = prod.op !== null ? `${prod.op}` : 'NULL';
      const badgeVal = prod.badge !== null ? `'${prod.badge}'` : 'NULL';
      await queryRunner.query(`
        INSERT INTO "products" ("id","slug","sku","name","price","original_price","images","category","subcategory","badge","status","description","material","care","sizes","colors","tags","created_at")
        VALUES ('${prod.id}','${prod.slug}','${sku}','${esc(prod.name)}',${prod.price},${opVal},'${JSON.stringify(prod.images)}','${prod.cat}','${prod.sub}',${badgeVal},'active','${esc(prod.desc)}','${esc(prod.material)}','${esc(prod.care)}','${JSON.stringify(prod.sizes)}','${JSON.stringify(prod.colors).replace(/'/g, "''")}','${JSON.stringify(prod.tags)}','${prod.ca}T00:00:00Z')
        ON CONFLICT ("id") DO NOTHING
      `);
    }

    // ═══════════════════════════════════════════════════════════
    // CATEGORIES
    // c[0]=tops, c[1]=skirts, c[2]=bags, c[3]=jewelry
    // ═══════════════════════════════════════════════════════════
    const categories = [
      { id: c[0], slug: 'tops', title: 'Tops', description: 'Effortlessly elegant pieces for every silhouette' },
      { id: c[1], slug: 'skirts', title: 'Skirts', description: 'Movement & grace in every step' },
      { id: c[2], slug: 'bags', title: 'Bags', description: 'Carry your world with intention' },
      { id: c[3], slug: 'jewelry', title: 'Jewelry', description: 'Finishing touches that speak volumes' },
    ];

    for (const cat of categories) {
      await queryRunner.query(`
        INSERT INTO "categories" ("id","slug","title","description")
        VALUES ('${cat.id}','${cat.slug}','${cat.title}','${esc(cat.description)}')
        ON CONFLICT ("id") DO NOTHING
      `);
    }

    const subcategories = [
      { slug: 'camisoles', label: 'Camisoles', description: 'Delicate & feminine', count: 8, cid: c[0] },
      { slug: 'halter', label: 'Halter Tops', description: 'Statement necklines', count: 6, cid: c[0] },
      { slug: 'tank', label: 'Tank Tops', description: 'Everyday essentials', count: 10, cid: c[0] },
      { slug: 'off-shoulder', label: 'Off-Shoulder', description: 'Romantic elegance', count: 5, cid: c[0] },
      { slug: 'cardigans', label: 'Cardigans', description: 'Layered warmth', count: 7, cid: c[0] },
      { slug: 'corset', label: 'Corset Tops', description: 'Sculpted beauty', count: 4, cid: c[0] },
      { slug: 'slip', label: 'Slip Skirts', description: 'Satin & silk', count: 6, cid: c[1] },
      { slug: 'midi', label: 'Midi Skirts', description: 'Classic length', count: 8, cid: c[1] },
      { slug: 'mini', label: 'Mini Skirts', description: 'Bold & playful', count: 7, cid: c[1] },
      { slug: 'wrap', label: 'Wrap Skirts', description: 'Effortless chic', count: 5, cid: c[1] },
      { slug: 'lace', label: 'Lace Skirts', description: 'Delicate detail', count: 4, cid: c[1] },
      { slug: 'hobo', label: 'Hobo Bags', description: 'Relaxed luxury', count: 5, cid: c[2] },
      { slug: 'shoulder', label: 'Shoulder Bags', description: 'Classic carriage', count: 7, cid: c[2] },
      { slug: 'clutches', label: 'Clutches', description: 'Evening essentials', count: 6, cid: c[2] },
      { slug: 'mini', label: 'Mini Bags', description: 'Petit & precious', count: 8, cid: c[2] },
      { slug: 'tote', label: 'Tote Bags', description: 'Spacious style', count: 5, cid: c[2] },
      { slug: 'necklaces', label: 'Necklaces', description: 'Layered stories', count: 9, cid: c[3] },
      { slug: 'earrings', label: 'Earrings', description: 'Frame your face', count: 11, cid: c[3] },
      { slug: 'rings', label: 'Rings', description: 'Stacked intention', count: 7, cid: c[3] },
      { slug: 'bracelets', label: 'Bracelets', description: 'Wrist poetry', count: 6, cid: c[3] },
      { slug: 'hair', label: 'Hair Accessories', description: 'Crown your look', count: 5, cid: c[3] },
    ];

    for (const s of subcategories) {
      await queryRunner.query(`
        INSERT INTO "subcategories" ("slug","label","description","count","category_id")
        VALUES ('${s.slug}','${s.label}','${esc(s.description)}',${s.count},'${s.cid}')
      `);
    }

    // ═══════════════════════════════════════════════════════════
    // COLLECTIONS — product_ids reference nanoid16 product IDs
    // ═══════════════════════════════════════════════════════════
    const collections = [
      { id: col[0], slug: 'summer-reverie', name: 'Summer Reverie', subtitle: 'A meditation on warm light', description: 'A meditation on warm light and effortless draping.', image: '/images/model-intro/model_intro_1.webp', pids: [p[0],p[3],p[8],p[11],p[19],p[25]], season: 'Summer 2026', bg: 'var(--color-rose-milk)' },
      { id: col[1], slug: 'golden-craft', name: 'Golden Craft', subtitle: 'Artisan meets material', description: 'Every piece in this collection is a conversation between artisan and material.', image: '/images/model-intro/model_intro_7.webp', pids: [p[24],p[26],p[27],p[29],p[18],p[22]], season: 'Summer 2026', bg: 'var(--color-vanilla)' },
      { id: col[2], slug: 'twilight-edit', name: 'Twilight Edit', subtitle: 'Between dusk and dawn', description: 'For the hours between dusk and dawn.', image: '/images/model-intro/model_intro_6.webp', pids: [p[10],p[12],p[5],p[1],p[17],p[31]], season: 'Summer 2026', bg: 'var(--color-lavender-cream)' },
      { id: col[3], slug: 'silk-and-satin', name: 'Silk & Satin', subtitle: 'Tops Collection', description: 'The most luxurious fabrics, cut with precision and finished by hand.', image: '/images/model-intro/model_intro_2.webp', pids: [p[0],p[5],p[6],p[8],p[14]], season: 'Summer 2026', bg: 'var(--color-champagne-cream)' },
      { id: col[4], slug: 'resort-bags', name: 'Resort Bags', subtitle: 'Crafted companions', description: 'A curated selection of bags designed for the resort lifestyle.', image: '/images/model-intro/model_intro_5.webp', pids: [p[16],p[17],p[19],p[21],p[23]], season: 'Summer 2026', bg: 'var(--color-cloud)' },
      { id: col[5], slug: 'lace-and-grace', name: 'Lace & Grace', subtitle: 'Delicate details', description: 'Celebrating the art of lace — from Chantilly to crochet.', image: '/images/model-intro/model_intro_3.webp', pids: [p[12],p[3],p[6],p[28],p[25]], season: 'Summer 2026', bg: 'var(--color-sage-cream)' },
      { id: col[6], slug: 'night-out', name: 'Night Out', subtitle: 'After dark essentials', description: 'Everything you need for a night that lingers.', image: '/images/model-intro/model_intro_4.webp', pids: [p[1],p[5],p[10],p[18],p[22],p[31]], season: 'Summer 2026', bg: 'var(--color-obsidian)' },
    ];

    for (const coll of collections) {
      await queryRunner.query(`
        INSERT INTO "collections" ("id","slug","name","subtitle","description","image","product_ids","season","bg_color")
        VALUES ('${coll.id}','${coll.slug}','${esc(coll.name)}','${coll.subtitle}','${esc(coll.description)}','${coll.image}','${JSON.stringify(coll.pids)}','${coll.season}','${coll.bg}')
        ON CONFLICT ("id") DO NOTHING
      `);
    }

    // ═══════════════════════════════════════════════════════════
    // REVIEWS — product_id references nanoid16 product IDs
    // ═══════════════════════════════════════════════════════════
    const reviews = [
      { id: r[0], pid: p[0],  author: 'Sophie L.', rating: 5, date: '2026-06-15', title: 'Absolutely gorgeous', content: 'The silk quality is incredible. Feels so luxurious on the skin. True to size.', verified: true },
      { id: r[1], pid: p[0],  author: 'Emma K.', rating: 4, date: '2026-06-10', title: 'Beautiful but delicate', content: 'Love the color and fit. Just be careful with the fabric — it is real silk after all!', verified: true },
      { id: r[2], pid: p[2],  author: 'Mia T.', rating: 5, date: '2026-05-20', title: 'My new favorite basic', content: 'This linen tank is perfection. I bought it in all three colors.', verified: true },
      { id: r[3], pid: p[8],  author: 'Ava R.', rating: 5, date: '2026-06-20', title: 'Dream skirt', content: 'The way this skirt moves is just magical. Worth every penny.', verified: true },
      { id: r[4], pid: p[18], author: 'Luna M.', rating: 5, date: '2026-05-01', title: 'Perfect evening bag', content: 'Used it for a wedding and got so many compliments. Fits phone, cards, and lipstick.', verified: true },
      { id: r[5], pid: p[25], author: 'Iris W.', rating: 5, date: '2026-04-28', title: 'Timeless elegance', content: 'These earrings go with everything. The pearls are beautiful quality.', verified: true },
    ];

    for (const rev of reviews) {
      await queryRunner.query(`
        INSERT INTO "reviews" ("id","product_id","author","avatar","rating","date","title","content","verified")
        VALUES ('${rev.id}','${rev.pid}','${rev.author}','',${rev.rating},'${rev.date}','${esc(rev.title)}','${esc(rev.content)}',${rev.verified})
        ON CONFLICT ("id") DO NOTHING
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "reviews"`);
    await queryRunner.query(`DELETE FROM "collections"`);
    await queryRunner.query(`DELETE FROM "subcategories"`);
    await queryRunner.query(`DELETE FROM "categories"`);
    await queryRunner.query(`DELETE FROM "products"`);
  }
}
