/**
 * Скрипт для создания первого суперадмина
 * Использование: tsx scripts/create-super-admin.ts <email> <name> [password]
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { AdminUser } from '../src/models/AdminUser';
import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';

dotenv.config({ path: '.env' });

const createSuperAdmin = async (): Promise<void> => {
  const email = process.argv[2];
  const name = process.argv[3];
  const password = process.argv[4] || 'admin123';

  if (!email || !name) {
    process.exit(1);
  }

  try {
    // Подключаемся к MongoDB
    const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/anonymous-chat';
    await mongoose.connect(mongodbUri);

    // Проверяем, не существует ли уже админ с таким email
    const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      process.exit(1);
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      process.exit(1);
    }

    // Создаем админа
    const createdAt = new Date().toISOString().split('T')[0];
    const admin = await AdminUser.create({
      email: email.toLowerCase(),
      name,
      role: 'super_admin',
      createdAt,
    });

    // Создаем пользователя для админа
    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'super_admin',
      name,
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    await mongoose.disconnect();
    process.exit(1);
  }
};

void createSuperAdmin();

