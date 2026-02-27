import { notificationService } from './NotificationService';
import { query } from '../utils/database';
import { logger } from '../utils/logger-advanced';

export interface ReminderData {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  scheduledDate: string;
  address?: string;
  notes?: string;
  totalPrice: number;
}

export class ReminderService {
  private static reminderTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Agenda lembretes automáticos para um agendamento
   * - 24 horas antes
   * - 2 horas antes
   */
  static scheduleReminders(bookingData: ReminderData): void {
    const bookingId = bookingData.bookingId;
    const scheduledTime = new Date(bookingData.scheduledDate);
    const now = new Date();

    // Cancelar lembretes anteriores se existirem
    this.cancelReminders(bookingId);

    // Agendar lembrete de 24 horas
    const twentyFourHoursBefore = new Date(scheduledTime.getTime() - 24 * 60 * 60 * 1000);
    if (twentyFourHoursBefore > now) {
      const timeout24h = setTimeout(async () => {
        try {
          await this.sendReminder(bookingData, 24);
          logger.info(`⏰ Lembrete 24h enviado para agendamento ${bookingId}`);
        } catch (error) {
          logger.error(`Erro ao enviar lembrete 24h para ${bookingId}:`, error);
        }
      }, twentyFourHoursBefore.getTime() - now.getTime());

      this.reminderTimeouts.set(`${bookingId}-24h`, timeout24h);
    }

    // Agendar lembrete de 2 horas
    const twoHoursBefore = new Date(scheduledTime.getTime() - 2 * 60 * 60 * 1000);
    if (twoHoursBefore > now) {
      const timeout2h = setTimeout(async () => {
        try {
          await this.sendReminder(bookingData, 2);
          logger.info(`⏰ Lembrete 2h enviado para agendamento ${bookingId}`);
        } catch (error) {
          logger.error(`Erro ao enviar lembrete 2h para ${bookingId}:`, error);
        }
      }, twoHoursBefore.getTime() - now.getTime());

      this.reminderTimeouts.set(`${bookingId}-2h`, timeout2h);
    }

    logger.info(`📅 Lembretes agendados para agendamento ${bookingId}`);
  }

  /**
   * Cancela lembretes agendados para um agendamento
   */
  static cancelReminders(bookingId: string): void {
    const keysToDelete: string[] = [];

    for (const [key, timeout] of this.reminderTimeouts.entries()) {
      if (key.startsWith(`${bookingId}-`)) {
        clearTimeout(timeout);
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.reminderTimeouts.delete(key));
    logger.info(`❌ Lembretes cancelados para agendamento ${bookingId}`);
  }

  /**
   * Envia lembrete específico
   */
  private static async sendReminder(bookingData: ReminderData, hoursUntil: number): Promise<void> {
    const reminderData = {
      id: bookingData.bookingId,
      customerName: bookingData.customerName,
      customerEmail: bookingData.customerEmail,
      serviceName: bookingData.serviceName,
      scheduledDate: bookingData.scheduledDate,
      totalPrice: bookingData.totalPrice,
      address: bookingData.address,
      notes: bookingData.notes
    };

    await notificationService.sendBookingReminder(reminderData, hoursUntil);
  }

  /**
   * Inicializa lembretes para agendamentos existentes no banco
   * Chamado na inicialização do servidor
   */
  static async initializeExistingReminders(): Promise<void> {
    try {
      logger.info('🔄 Inicializando lembretes para agendamentos existentes...');

      // Buscar agendamentos futuros (próximos 30 dias)
      const futureBookings = await query(`
        SELECT
          b.id,
          b.scheduled_date,
          b.total_price,
          b.address,
          b.notes,
          u.full_name as customer_name,
          u.email as customer_email,
          s.name as service_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN services s ON b.service_id = s.id
        WHERE b.scheduled_date > NOW()
          AND b.scheduled_date < NOW() + INTERVAL '30 days'
          AND b.status NOT IN ('cancelled', 'completed')
        ORDER BY b.scheduled_date ASC
      `);

      logger.info(`📅 Encontrados ${futureBookings.length} agendamentos futuros para lembretes`);

      for (const booking of futureBookings) {
        const bookingData: ReminderData = {
          bookingId: booking.id,
          customerName: booking.customer_name,
          customerEmail: booking.customer_email,
          serviceName: booking.service_name,
          scheduledDate: booking.scheduled_date,
          totalPrice: parseFloat(booking.total_price),
          address: booking.address,
          notes: booking.notes
        };

        this.scheduleReminders(bookingData);
      }

      logger.info('✅ Lembretes inicializados com sucesso');
    } catch (error) {
      logger.error('❌ Erro ao inicializar lembretes existentes:', error);
    }
  }

  /**
   * Agenda solicitação de avaliação após conclusão do serviço
   */
  static scheduleReviewRequest(bookingData: ReminderData): void {
    const bookingId = bookingData.bookingId;
    const scheduledTime = new Date(bookingData.scheduledDate);
    const now = new Date();

    // Agendar solicitação de avaliação 2 horas após o serviço
    const twoHoursAfter = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000);

    if (twoHoursAfter > now) {
      const timeout = setTimeout(async () => {
        try {
          const reviewData = {
            id: bookingData.bookingId,
            customerName: bookingData.customerName,
            customerEmail: bookingData.customerEmail,
            serviceName: bookingData.serviceName,
            scheduledDate: bookingData.scheduledDate,
            totalPrice: bookingData.totalPrice,
            address: bookingData.address,
            notes: bookingData.notes
          };

          await notificationService.sendReviewRequest(reviewData);
          logger.info(`⭐ Solicitação de avaliação enviada para agendamento ${bookingId}`);
        } catch (error) {
          logger.error(`Erro ao enviar solicitação de avaliação para ${bookingId}:`, error);
        }
      }, twoHoursAfter.getTime() - now.getTime());

      this.reminderTimeouts.set(`${bookingId}-review`, timeout);
      logger.info(`📝 Solicitação de avaliação agendada para agendamento ${bookingId}`);
    }
  }

  /**
   * Obtém estatísticas dos lembretes agendados
   */
  static getStats(): { total: number; active: number } {
    return {
      total: this.reminderTimeouts.size,
      active: this.reminderTimeouts.size
    };
  }
}