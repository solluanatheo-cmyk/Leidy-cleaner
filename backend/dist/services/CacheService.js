"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = exports.CacheService = void 0;
const redis_1 = require("redis");
const logger_advanced_1 = require("../utils/logger-advanced");
class CacheService {
    constructor(config) {
        this.client = null;
        this.isConnected = false;
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            ttl: {
                services: 3600, // 1 hora
                userProfile: 1800, // 30 minutos
                bookings: 300, // 5 minutos
                reviews: 900, // 15 minutos
                staff: 600, // 10 minutos
            },
            ...config
        };
    }
    /**
     * Conecta ao Redis
     */
    async connect() {
        try {
            this.client = (0, redis_1.createClient)({
                socket: {
                    host: this.config.host,
                    port: this.config.port,
                },
                password: this.config.password,
                database: this.config.db,
            });
            this.client.on('connect', () => {
                this.isConnected = true;
                logger_advanced_1.logger.info('✅ Conectado ao Redis');
            });
            this.client.on('error', (err) => {
                this.isConnected = false;
                logger_advanced_1.logger.error('❌ Erro no Redis:', err);
            });
            this.client.on('ready', () => {
                logger_advanced_1.logger.info('🔄 Redis pronto para uso');
            });
            // Iniciar conexão (redis v4 requires explicit connect())
            await this.client.connect();
        }
        catch (error) {
            logger_advanced_1.logger.error('❌ Falha ao conectar ao Redis:', error);
            // Fallback: continuar sem cache
            this.isConnected = false;
        }
    }
    /**
     * Desconecta do Redis
     */
    async disconnect() {
        if (this.client) {
            this.client.quit();
            this.isConnected = false;
            logger_advanced_1.logger.info('👋 Desconectado do Redis');
        }
    }
    /**
     * Verifica se o cache está disponível
     */
    isAvailable() {
        return this.isConnected && this.client !== null;
    }
    /**
     * Define um valor no cache
     */
    async set(key, value, ttl) {
        if (!this.isAvailable())
            return;
        try {
            const serializedValue = JSON.stringify(value);
            if (ttl) {
                await this.client.setEx(key, ttl, serializedValue);
            }
            else {
                await this.client.set(key, serializedValue);
            }
        }
        catch (error) {
            logger_advanced_1.logger.error(`Erro ao definir cache para ${key}:`, error);
        }
    }
    /**
     * Obtém um valor do cache
     */
    async get(key) {
        if (!this.isAvailable())
            return null;
        try {
            const value = await this.client.get(key);
            if (value) {
                return JSON.parse(value);
            }
            return null;
        }
        catch (error) {
            logger_advanced_1.logger.error(`Erro ao obter cache para ${key}:`, error);
            return null;
        }
    }
    /**
     * Remove um valor do cache
     */
    async del(key) {
        if (!this.isAvailable())
            return;
        try {
            await this.client.del(key);
        }
        catch (error) {
            logger_advanced_1.logger.error(`Erro ao remover cache para ${key}:`, error);
        }
    }
    /**
     * Remove múltiplas chaves do cache
     */
    async delPattern(pattern) {
        if (!this.isAvailable())
            return;
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                logger_advanced_1.logger.info(`🗑️ Removidas ${keys.length} chaves do cache: ${pattern}`);
            }
        }
        catch (error) {
            logger_advanced_1.logger.error(`Erro ao remover chaves do padrão ${pattern}:`, error);
        }
    }
    /**
     * Cache de serviços
     */
    async getServices() {
        return this.get('services');
    }
    async setServices(services) {
        await this.set('services', services, this.config.ttl.services);
    }
    async invalidateServices() {
        await this.del('services');
    }
    /**
     * Cache de perfil do usuário
     */
    async getUserProfile(userId) {
        return this.get(`user:${userId}:profile`);
    }
    async setUserProfile(userId, profile) {
        await this.set(`user:${userId}:profile`, profile, this.config.ttl.userProfile);
    }
    async invalidateUserProfile(userId) {
        await this.del(`user:${userId}:profile`);
    }
    /**
     * Cache de agendamentos
     */
    async getUserBookings(userId) {
        return this.get(`user:${userId}:bookings`);
    }
    async setUserBookings(userId, bookings) {
        await this.set(`user:${userId}:bookings`, bookings, this.config.ttl.bookings);
    }
    async invalidateUserBookings(userId) {
        await this.del(`user:${userId}:bookings`);
    }
    /**
     * Cache de avaliações
     */
    async getPublicReviews() {
        return this.get('reviews:public');
    }
    async setPublicReviews(reviews) {
        await this.set('reviews:public', reviews, this.config.ttl.reviews);
    }
    async invalidatePublicReviews() {
        await this.del('reviews:public');
    }
    /**
     * Cache de funcionários
     */
    async getStaffList() {
        return this.get('staff:list');
    }
    async setStaffList(staff) {
        await this.set('staff:list', staff, this.config.ttl.staff);
    }
    async invalidateStaffList() {
        await this.del('staff:list');
    }
    /**
     * Invalidação em cascata
     */
    async invalidateUserData(userId) {
        await Promise.all([
            this.invalidateUserProfile(userId),
            this.invalidateUserBookings(userId),
        ]);
    }
    async invalidateAllBookings() {
        await this.delPattern('user:*:bookings');
    }
    /**
     * Estatísticas do cache
     */
    async getStats() {
        if (!this.isAvailable()) {
            return { connected: false, keys: 0, memory: '0' };
        }
        try {
            const info = await this.client.info('memory');
            const keys = await this.client.dbSize();
            return {
                connected: true,
                keys,
                memory: info.match(/used_memory_human:(.+)/)?.[1]?.trim() || 'unknown'
            };
        }
        catch (error) {
            logger_advanced_1.logger.error('Erro ao obter estatísticas do cache:', error);
            return { connected: false, keys: 0, memory: '0' };
        }
    }
    /**
     * Limpa todo o cache
     */
    async clearAll() {
        if (!this.isAvailable())
            return;
        try {
            await this.client.flushDb();
            logger_advanced_1.logger.info('🧹 Cache limpo completamente');
        }
        catch (error) {
            logger_advanced_1.logger.error('Erro ao limpar cache:', error);
        }
    }
}
exports.CacheService = CacheService;
// Instância singleton
exports.cacheService = new CacheService();
//# sourceMappingURL=CacheService.js.map