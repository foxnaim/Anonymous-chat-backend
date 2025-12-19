import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Генерирует случайный токен для сброса пароля
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Хеширует токен сброса пароля для безопасного хранения
 */
export const hashResetToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Генерирует безопасный случайный пароль
 * @param length - длина пароля (по умолчанию 12 символов)
 * @returns случайный пароль, содержащий буквы (верхний и нижний регистр), цифры и специальные символы
 */
export const generateSecurePassword = (length: number = 12): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + symbols;

  // Гарантируем наличие хотя бы одного символа каждого типа
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Заполняем остаток случайными символами
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Перемешиваем символы для большей случайности
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
};

/**
 * Генерирует ежедневный буквенно-цифровой пароль на основе даты
 * Пароль обновляется каждый день автоматически
 * @param length - длина пароля (по умолчанию 10 символов)
 * @returns буквенно-цифровой пароль, который одинаков для всех компаний в один день
 */
export const generateDailyPassword = (length: number = 10): string => {
  const today = new Date();
  // Используем UTC, чтобы пароль совпадал независимо от часового пояса сервера/клиента
  const dateStr = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;

  // Создаем seed на основе даты для детерминированной генерации
  const seed = dateStr.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);

  // Используем seed для создания псевдослучайной последовательности
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  let currentSeed = Math.abs(seed);

  // Генерируем пароль используя seed
  for (let i = 0; i < length; i++) {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    const index = currentSeed % chars.length;
    password += chars[index];
  }
  return password;
};
