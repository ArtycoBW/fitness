# Страйд

Веб-система управления фитнес-клубом. Next.js, NestJS, PostgreSQL, TypeScript.

## Локальный запуск

Требуется Node.js 24+ и pnpm 11.8, Docker с Linux-контейнерами.

1. Скопируйте .env.example в .env.
2. Выполните pnpm install, затем pnpm infra:up.
3. Выполните pnpm db:generate и pnpm db:migrate.
4. Запустите pnpm dev.

Web: http://localhost:3000. API: http://localhost:4000/api/v1. OpenAPI: http://localhost:4000/api/docs. Локальная почта: http://localhost:8025.

## Проверки

pnpm lint, pnpm typecheck, pnpm build. Миграции применяются командой pnpm db:migrate.

## Контейнеры

Сборка приложений: docker compose --profile app build. Перед стартом примените миграции через образ API, затем docker compose --profile app up -d. Для размещения требуется HTTPS reverse proxy, собственный пароль БД и настроенное окружение; наружу база данных не публикуется.

Платёжный провайдер первой версии является внутренним имитатором. Реальные банковские операции не выполняются. Полные карточные реквизиты и CVV не принимаются сервером.

Локальные материалы планирования и инструкции агентов не входят в репозиторий.
