import { DEFAULT_USER_PERMISSIONS } from '@common/permissions/permissions.constant';
import { DataSource } from 'typeorm';
import { Address } from '../../src/modules/address/address.entity';
import { Cart } from '../../src/modules/cart/cart.entity';
import { CartItem } from '../../src/modules/cart/cart-item.entity';
import { Category } from '../../src/modules/category/category.entity';
import { SubCategory } from '../../src/modules/category/sub-category.entity';
import { Product } from '../../src/modules/product/product.entity';
import { Review } from '../../src/modules/review/review.entity';
import { User } from '../../src/modules/user/user.entity';

let seq = 0;
const next = () => ++seq;

/** Test Data Builder: dữ liệu hợp lệ với mặc định hợp lý, test chỉ nêu phần khác biệt. Ghi thẳng DB. */
export function createBuilders(dataSource: DataSource) {
  const users = dataSource.getRepository(User);
  const categories = dataSource.getRepository(Category);
  const products = dataSource.getRepository(Product);
  const carts = dataSource.getRepository(Cart);
  const cartItems = dataSource.getRepository(CartItem);
  const addresses = dataSource.getRepository(Address);
  const reviews = dataSource.getRepository(Review);

  async function user(overrides: Partial<User> = {}): Promise<User> {
    const n = next();
    return users.save(
      users.create({
        email: `user${n}@flow.test`,
        name: `User ${n}`,
        provider: 'google',
        providerId: `google-${n}`,
        role: 'user',
        permissions: DEFAULT_USER_PERMISSIONS,
        status: 'active',
        ...overrides,
      }),
    );
  }

  const admin = (overrides: Partial<User> = {}) => user({ role: 'admin', permissions: [], ...overrides });

  async function category(): Promise<Category> {
    const n = next();
    return categories.save(
      categories.create({
        slug: `category-${n}`,
        title: `Category ${n}`,
        priority: n,
        subcategories: [{ slug: `sub-${n}`, label: `Sub ${n}` } as SubCategory],
      }),
    );
  }

  // mặc định thoả CHECK của DB (images/sizes/colors không rỗng)
  async function product(overrides: Partial<Product> = {}): Promise<Product> {
    const n = next();
    const parent = await category();
    return products.save(
      products.create({
        slug: `product-${n}`,
        sku: `SKU-${n}`,
        name: `Product ${n}`,
        price: 350_000,
        category: parent,
        subcategory: parent.subcategories[0],
        status: 'active',
        images: [`https://cdn.flow.test/product-${n}.jpg`],
        description: 'Flow test product',
        material: 'Cotton',
        care: 'Machine wash',
        sizes: ['M'],
        colors: [{ name: 'Black', hex: '#000000' }],
        ...overrides,
      }),
    );
  }

  async function cart(owner: User, lines: { product: Product; quantity?: number; size?: string; color?: string }[]) {
    const saved = (await carts.findOneBy({ userId: owner.id })) ?? (await carts.save(carts.create({ userId: owner.id })));
    const items: CartItem[] = [];
    for (const line of lines) {
      items.push(
        await cartItems.save(
          cartItems.create({
            cartId: saved.id,
            productId: line.product.id,
            quantity: line.quantity ?? 1,
            size: line.size ?? 'M',
            color: line.color ?? 'Black',
          }),
        ),
      );
    }
    return { cart: saved, items };
  }

  async function address(owner: User, overrides: Partial<Address> = {}): Promise<Address> {
    return addresses.save(
      addresses.create({
        userId: owner.id,
        fullName: owner.name ?? 'Flow User',
        phone: '0900000000',
        addressLine1: '1 Test Street',
        city: 'Ho Chi Minh',
        isDefault: true,
        ...overrides,
      }),
    );
  }

  // đánh giá seed kiểu cũ (không gắn dòng hàng); mặc định thoả CHECK của DB
  async function review(product: Product, overrides: Partial<Review> = {}): Promise<Review> {
    const n = next();
    return reviews.save(
      reviews.create({
        productId: product.id,
        userId: null,
        orderItemId: null,
        author: `Reviewer ${n}`,
        avatar: '',
        rating: 5,
        date: '2026-10-01',
        title: `Title ${n}`,
        content: `Content ${n}`,
        verified: true,
        size: 'M',
        color: 'Black',
        fit: null,
        images: [],
        status: 'PUBLISHED',
        helpfulCount: 0,
        ...overrides,
      }),
    );
  }

  return { user, admin, category, product, cart, address, review };
}

export type Builders = ReturnType<typeof createBuilders>;
