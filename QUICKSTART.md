# Быстрый старт

## Установка и запуск

### 1. Установка зависимостей
```bash
npm install
# или
yarn install
```

### 2. Настройка окружения
Создайте файл `.env` в корне проекта:
```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/anonymous-chat
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
LOG_LEVEL=info
```

### 3. Запуск MongoDB
#### Локально:
Убедитесь, что MongoDB запущен на вашей машине.

#### Через Docker:
```bash
docker run -d -p 27017:27017 --name mongodb mongo:7
```

### 4. Запуск приложения
```bash
# Разработка
npm run dev

# Продакшн
npm run build
npm start
```

### 5. Проверка работы
- API: http://localhost:3001
- Health Check: http://localhost:3001/api/health
- Swagger Docs: http://localhost:3001/api-docs

## Docker Compose

Для запуска всего стека (MongoDB + Backend):
```bash
docker-compose up -d
```

## Структура проекта

```
src/
├── config/          # Конфигурация
│   ├── env.ts       # Переменные окружения
│   ├── database.ts  # Подключение к MongoDB
│   ├── swagger.ts   # Настройка Swagger
│   └── sentry.ts    # Настройка Sentry
├── middleware/      # Express middleware
│   ├── errorHandler.ts
│   ├── validation.ts
│   ├── rateLimiter.ts
│   ├── morgan.ts
│   └── asyncHandler.ts
├── routes/          # API маршруты
│   ├── index.ts
│   ├── health.ts
│   └── example.ts
├── controllers/     # Контроллеры
│   └── ExampleController.ts
├── models/          # Mongoose модели
│   ├── BaseModel.ts
│   └── Example.ts
├── validators/      # Zod схемы валидации
│   └── exampleValidator.ts
├── utils/           # Утилиты
│   ├── AppError.ts
│   └── logger.ts
├── app.ts           # Express приложение
└── server.ts        # Точка входа
```

## Основные команды

```bash
# Разработка
npm run dev

# Сборка
npm run build

# Запуск
npm start

# Линтинг
npm run lint
npm run lint:fix

# Форматирование
npm run format
npm run format:check

# Проверка типов
npm run type-check
```

## API Endpoints

### Health Check
- `GET /api/health` - Проверка состояния сервера

### Examples (пример)
- `GET /api/examples` - Получить все примеры
- `GET /api/examples/:id` - Получить пример по ID
- `POST /api/examples` - Создать пример
- `PUT /api/examples/:id` - Обновить пример
- `DELETE /api/examples/:id` - Удалить пример

## Безопасность

- ✅ Helmet - защита HTTP заголовков
- ✅ CORS - настройка кросс-доменных запросов
- ✅ Rate Limiting - защита от спама
- ✅ Валидация данных - Zod схемы
- ✅ Централизованная обработка ошибок
- ✅ Логирование всех запросов и ошибок

## Мониторинг

- **Sentry**: Настройте `SENTRY_DSN` для отслеживания ошибок в продакшене
- **Логи**: Все логи сохраняются в папке `logs/`
  - `error.log` - только ошибки
  - `combined.log` - все логи


