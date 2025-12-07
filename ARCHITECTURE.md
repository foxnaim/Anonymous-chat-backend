# Архитектура проекта

## Обзор

Backend построен на Express.js с TypeScript, MongoDB и включает все необходимые инструменты для безопасности, мониторинга и разработки.

## Основные компоненты

### 1. Конфигурация (`src/config/`)

- **env.ts** - Централизованное управление переменными окружения
- **database.ts** - Подключение к MongoDB с обработкой ошибок
- **swagger.ts** - Настройка Swagger документации
- **sentry.ts** - Инициализация Sentry для мониторинга ошибок

### 2. Middleware (`src/middleware/`)

- **errorHandler.ts** - Централизованный обработчик ошибок
  - Обрабатывает AppError с кодами ошибок
  - Логирует все ошибки
  - Возвращает структурированные JSON ответы

- **validation.ts** - Валидация входящих данных через Zod
  - Проверяет body, query, params
  - Возвращает детальные сообщения об ошибках

- **rateLimiter.ts** - Защита от спама и брутфорса
  - Настраиваемое окно и лимит запросов

- **morgan.ts** - Логирование HTTP запросов
  - Интегрирован с Winston

- **asyncHandler.ts** - Обертка для async функций
  - Автоматически обрабатывает Promise rejections

### 3. Утилиты (`src/utils/`)

- **AppError.ts** - Кастомный класс ошибок
  - Статус код, код ошибки, операционные ошибки
  - Enum с кодами ошибок

- **logger.ts** - Winston logger
  - Разные уровни логирования
  - Файловые и консольные транспорты
  - Структурированные логи

### 4. Модели (`src/models/`)

- **BaseModel.ts** - Базовый интерфейс и опции схемы
  - Timestamps автоматически
  - Без versionKey

- **Example.ts** - Пример модели Mongoose
  - Валидация на уровне схемы
  - TypeScript интерфейсы

### 5. Контроллеры (`src/controllers/`)

- **ExampleController.ts** - Пример контроллера
  - CRUD операции
  - Использует asyncHandler
  - Swagger аннотации

### 6. Валидаторы (`src/validators/`)

- **exampleValidator.ts** - Zod схемы
  - Валидация для каждого endpoint
  - Типобезопасность

### 7. Маршруты (`src/routes/`)

- **index.ts** - Главный роутер
- **health.ts** - Health check endpoint
- **example.ts** - Пример маршрутов с валидацией

## Безопасность

### 1. Helmet
Защита HTTP заголовков:
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- И другие

### 2. CORS
Настраиваемый origin для кросс-доменных запросов

### 3. Rate Limiting
Защита от:
- DDoS атак
- Брутфорса
- Спама

### 4. Валидация данных
- Zod схемы для всех входящих данных
- Предотвращение SQL/NoSQL инъекций
- Типобезопасность

### 5. Обработка ошибок
- Не раскрывает внутренние детали в продакшене
- Структурированные ответы
- Логирование всех ошибок

## Логирование

### Winston
- Разные уровни: error, warn, info, debug
- Файловые логи: `logs/error.log`, `logs/combined.log`
- Структурированный JSON формат

### Morgan
- HTTP запросы логируются автоматически
- Интегрирован с Winston

## Мониторинг

### Sentry
- Автоматический сбор ошибок
- Трейсинг запросов
- Настраиваемый sample rate

### Health Check
- `/api/health` endpoint
- Проверка подключения к БД
- Информация о сервере

## Документация

### Swagger
- Автоматическая генерация из JSDoc
- Интерактивный UI
- Доступен по `/api-docs`

## Развертывание

### Docker
- Multi-stage build
- Оптимизированный размер образа
- Production ready

### Docker Compose
- MongoDB + Backend
- Автоматическая настройка сети
- Volumes для данных

## Типизация

### TypeScript
- Строгий режим
- Полная типизация
- Проверка типов на этапе компиляции

### Zod
- Runtime валидация
- Type inference
- Детальные сообщения об ошибках

## Code Quality

### ESLint
- TypeScript правила
- Prettier интеграция
- Строгие правила

### Prettier
- Единый стиль кода
- Автоматическое форматирование

## Структура ответов API

### Успешный ответ
```json
{
  "success": true,
  "data": { ... }
}
```

### Ошибка
```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "details": [ ... ] // для валидации
  }
}
```

## Расширение проекта

### Добавление нового endpoint

1. Создать модель в `src/models/`
2. Создать валидатор в `src/validators/`
3. Создать контроллер в `src/controllers/`
4. Создать маршруты в `src/routes/`
5. Добавить маршруты в `src/routes/index.ts`
6. Добавить Swagger аннотации

### Пример:
```typescript
// 1. Model
export interface IUser extends BaseDocument {
  email: string;
  name: string;
}

// 2. Validator
export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
  }),
});

// 3. Controller
export class UserController {
  static async create(req: Request, res: Response) {
    const user = await User.create(req.body);
    res.status(201).json({ success: true, data: user });
  }
}

// 4. Routes
router.post('/', validate(createUserSchema), asyncHandler(UserController.create));
```


