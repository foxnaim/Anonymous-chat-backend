import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Загружаем переменные окружения из .env файла
dotenv.config();

// Увеличиваем таймаут для Jest
jest.setTimeout(30000);

// Подключение к тестовой БД перед всеми тестами
beforeAll(async () => {
  const testDbUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/anonymous-chat-test';
  await mongoose.connect(testDbUri);
});

// Очистка БД после каждого теста
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key]?.deleteMany({});
  }
});

// Отключение от БД после всех тестов
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// Мокаем Sentry для тестов
jest.mock('../config/sentry', () => ({
  initializeSentry: jest.fn(),
  setupSentryErrorHandler: jest.fn(),
}));

// Мокаем logger для чистоты тестов
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

