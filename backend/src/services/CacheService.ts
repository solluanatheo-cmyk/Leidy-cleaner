import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger-advanced';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl: {
    services: number;      // 1 hora
    userProfile: number;   // 30 minutos
    bookings: number;      // 5 minutos
    reviews: number;       // 15 minutos
    staff: number;         // 10 minutos
  };
}

export class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      ttl: {
        services: 3600,      // 1 hora
        userProfile: 1800,   // 30 minutos
        bookings: 300,       // 5 minutos
        reviews: 900,        // 15 minutos
        staff: 600,          // 10 minutos
      },
      ...config
    };
  }

  /**
   * Conecta ao Redis
   */
  async connect(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        password: this.config.password,
        database: this.config.db,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('✅ Conectado ao Redis');
      });

      this.client.on('error', (err: Error) => {
        this.isConnected = false;
        logger.error('❌ Erro no Redis:', err);
      });

      this.client.on('ready', () => {
        logger.info('🔄 Redis pronto para uso');
      });

      // Iniciar conexão (redis v4 requires explicit connect())
      await this.client.connect();

    } catch (error) {
      logger.error('❌ Falha ao conectar ao Redis:', error);
      // Fallback: continuar sem cache
      this.isConnected = false;
    }
  }

  /**
   * Desconecta do Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.quit();
      this.isConnected = false;
      logger.info('👋 Desconectado do Redis');
    }
  }

  /**
   * Verifica se o cache está disponível
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Define um valor no cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.client!.setEx(key, ttl, serializedValue);
      } else {
        await this.client!.set(key, serializedValue);
      }
    } catch (error) {
      logger.error(`Erro ao definir cache para ${key}:`, error);
    }
  }

  /**
   * Obtém um valor do cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const value = await this.client!.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      logger.error(`Erro ao obter cache para ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove um valor do cache
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client!.del(key);
    } catch (error) {
      logger.error(`Erro ao remover cache para ${key}:`, error);
    }
  }

  /**
   * Remove múltiplas chaves do cache
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length > 0) {
        await this.client!.del(keys);
        logger.info(`🗑️ Removidas ${keys.length} chaves do cache: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Erro ao remover chaves do padrão ${pattern}:`, error);
    }
  }

  /**
   * Cache de serviços
   */
  async getServices(): Promise<any[] | null> {
    return this.get('services');
  }

  async setServices(services: any[]): Promise<void> {
    await this.set('services', services, this.config.ttl.services);
  }

  async invalidateServices(): Promise<void> {
    await this.del('services');
  }

  /**
   * Cache de perfil do usuário
   */
  async getUserProfile(userId: string): Promise<any | null> {
    return this.get(`user:${userId}:profile`);
  }

  async setUserProfile(userId: string, profile: any): Promise<void> {
    await this.set(`user:${userId}:profile`, profile, this.config.ttl.userProfile);
  }

  async invalidateUserProfile(userId: string): Promise<void> {
    await this.del(`user:${userId}:profile`);
  }

  /**
   * Cache de agendamentos
   */
  async getUserBookings(userId: string): Promise<any[] | null> {
    return this.get(`user:${userId}:bookings`);
  }

  async setUserBookings(userId: string, bookings: any[]): Promise<void> {
    await this.set(`user:${userId}:bookings`, bookings, this.config.ttl.bookings);
  }

  async invalidateUserBookings(userId: string): Promise<void> {
    await this.del(`user:${userId}:bookings`);
  }

  /**
   * Cache de avaliações
   */
  async getPublicReviews(): Promise<any[] | null> {
    return this.get('reviews:public');
  }

  async setPublicReviews(reviews: any[]): Promise<void> {
    await this.set('reviews:public', reviews, this.config.ttl.reviews);
  }

  async invalidatePublicReviews(): Promise<void> {
    await this.del('reviews:public');
  }

  /**
   * Cache de funcionários
   */
  async getStaffList(): Promise<any[] | null> {
    return this.get('staff:list');
  }

  async setStaffList(staff: any[]): Promise<void> {
    await this.set('staff:list', staff, this.config.ttl.staff);
  }

  async invalidateStaffList(): Promise<void> {
    await this.del('staff:list');
  }

  /**
   * Invalidação em cascata
   */
  async invalidateUserData(userId: string): Promise<void> {
    await Promise.all([
      this.invalidateUserProfile(userId),
      this.invalidateUserBookings(userId),
    ]);
  }

  async invalidateAllBookings(): Promise<void> {
    await this.delPattern('user:*:bookings');
  }

  /**
   * Estatísticas do cache
   */
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
  }> {
    if (!this.isAvailable()) {
      return { connected: false, keys: 0, memory: '0' };
    }

    try {
      const info = await this.client!.info('memory');
      const keys = await this.client!.dbSize();

      return {
        connected: true,
        keys,
        memory: info.match(/used_memory_human:(.+)/)?.[1]?.trim() || 'unknown'
      };
    } catch (error) {
      logger.error('Erro ao obter estatísticas do cache:', error);
      return { connected: false, keys: 0, memory: '0' };
    }
  }

  /**
   * Limpa todo o cache
   */
  async clearAll(): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client!.flushDb();
      logger.info('🧹 Cache limpo completamente');
    } catch (error) {
      logger.error('Erro ao limpar cache:', error);
    }
  }
}

// Instância singleton
export const cacheService = new CacheService();