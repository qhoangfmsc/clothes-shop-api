# Checklist Tạo Module Mới

1. [ ] Tạo entity trong `modules/<feature>/entities/<feature>.entity.ts`
2. [ ] Register entity vào module: `TypeOrmModule.forFeature([Entity])` trong `<feature>.module.ts`
3. [ ] Tạo DTOs trong `modules/<feature>/dtos/<feature>.dto.ts` (và `<feature>_response.dto.ts` nếu có)
4. [ ] Tạo service trong `modules/<feature>/<feature>.service.ts`
5. [ ] Tạo controller trong `modules/<feature>/<feature>.controller.ts`
6. [ ] Tạo module trong `modules/<feature>/<feature>.module.ts`
7. [ ] Register module vào `main.module.ts`
8. [ ] Tạo Bruno test files trong `api-collections/`
9. [ ] Test API qua Bruno hoặc Swagger (`/docs`)
10. [ ] *(Nếu có queue)* Thêm queue name vào `QueueName` enum, register `BullModule.registerQueue()` + `BullBoardModule.forFeature()` — xem rule `13`
