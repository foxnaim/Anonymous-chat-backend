/**
 * Сервис для отправки email
 */

import nodemailer, { Transporter } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { config } from "../config/env";
import { logger } from "../utils/logger";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    // Если SMTP не настроен, в development режиме просто предупреждаем
    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
      if (config.nodeEnv === "development") {
        logger.warn(
          "SMTP не настроен. В development режиме токен будет возвращен в ответе для тестирования.",
        );
        // В development без SMTP не создаем транспортер
        return;
      } else {
        logger.error("SMTP не настроен для production режима!");
        return;
      }
    } else {
      // Настроенный SMTP
      // Добавляем таймауты, чтобы не висеть на SMTP-соединении
      const transportOptions = {
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure, // true для 465, false для других портов (587 – STARTTLS)
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword,
        },
        connectionTimeout: 15000, // 15s
        socketTimeout: 15000, // 15s
        greetingTimeout: 10000, // 10s
        tls: {
          rejectUnauthorized: false, // Для самоподписанных сертификатов / Gmail ok
        },
      } as SMTPTransport.Options;

      this.transporter = nodemailer.createTransport(transportOptions);
    }
  }

  /**
   * Отправляет email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      // В development режиме без SMTP просто логируем
      if (config.nodeEnv === "development") {
        logger.info("Email не отправлен (SMTP не настроен):", {
          to: options.to,
          subject: options.subject,
        });
        return;
      }
      throw new Error("Email transporter не инициализирован");
    }

    try {
      const mailOptions = {
        from: config.smtpFrom || config.smtpUser || "noreply@feedbackhub.com",
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ""), // Убираем HTML теги для текстовой версии
      };

      const info: unknown = await this.transporter.sendMail(mailOptions);
      const messageId =
        info && typeof info === "object" && "messageId" in info
          ? String((info as { messageId: unknown }).messageId)
          : "unknown";
      logger.info(`Email отправлен на ${options.to}: ${messageId}`);
    } catch (error) {
      logger.error("Ошибка отправки email:", error);
      throw error;
    }
  }

  /**
   * Отправляет письмо для восстановления пароля
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    resetUrl?: string,
  ): Promise<void> {
    const resetLink =
      resetUrl || `${config.frontendUrl}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Восстановление пароля</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">FeedbackHub</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Восстановление пароля</h2>
            
            <p>Здравствуйте!</p>
            
            <p>Вы запросили восстановление пароля для вашего аккаунта в FeedbackHub.</p>
            
            <p>Для сброса пароля нажмите на кнопку ниже:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" 
                 style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Сбросить пароль
              </a>
            </div>
            
            <p>Или скопируйте и вставьте следующую ссылку в браузер:</p>
            <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 5px; font-size: 12px;">
              ${resetLink}
            </p>
            
            <p style="color: #666; font-size: 14px;">
              <strong>Важно:</strong> Эта ссылка действительна в течение 1 часа. Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.
            </p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; margin: 0;">
              Если кнопка не работает, скопируйте ссылку выше и вставьте в адресную строку браузера.
            </p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: "Восстановление пароля - FeedbackHub",
      html,
    });
  }

  /**
   * Отправляет письмо с паролем для нового администратора
   */
  async sendAdminPasswordEmail(
    email: string,
    name: string,
    password: string,
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Доступ к панели администратора</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">FeedbackHub</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Доступ к панели администратора</h2>
            
            <p>Здравствуйте, ${name || "Администратор"}!</p>
            
            <p>Для вас был создан аккаунт администратора в системе FeedbackHub.</p>
            
            <div style="background: #fff; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Ваши данные для входа:</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 5px 0;"><strong>Пароль:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-size: 16px; letter-spacing: 1px;">${password}</code></p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${config.frontendUrl}/admin" 
                 style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Войти в панель администратора
              </a>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>⚠️ Важно:</strong> Сохраните этот пароль в безопасном месте. Рекомендуется изменить пароль после первого входа в систему.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; margin: 0;">
              Это письмо было отправлено автоматически. Пожалуйста, не отвечайте на него.
            </p>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: "Доступ к панели администратора FeedbackHub",
      html,
    });
  }
}

export const emailService = new EmailService();
