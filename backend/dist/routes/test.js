"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
// Only expose this endpoint in test environment.  It's used by the
// Playwright fixtures to clear everything between runs so records from one
// test don't leak into the next.  The handler runs simple DELETEs; you can
// expand it if new tables are added.
router.post('/reset', async (_req, res) => {
    if (process.env.NODE_ENV !== 'test') {
        return res.status(404).json({ error: 'Not available' });
    }
    try {
        // order matters because of foreign keys
        await (0, database_1.query)('DELETE FROM bookings');
        await (0, database_1.query)("DELETE FROM users WHERE role <> 'admin'");
        await (0, database_1.query)('DELETE FROM services');
        await (0, database_1.query)('DELETE FROM reviews');
        await (0, database_1.query)('DELETE FROM company_info');
        // keep migrations table intact so subsequent runs don't reapply them
        // after we clear everything, run the same seed logic used at startup so
        // that each reset leaves the database in a usable state.  this keeps the
        // tests from having to replicate the company/services/admin seeding.
        // `seedDatabase` is written to be safe when called multiple times and will
        // only insert rows if they don't already exist.
        try {
            const { seedDatabase } = await Promise.resolve().then(() => __importStar(require('../db/seed')));
            await seedDatabase();
            logger_1.logger?.info?.('✅ Database reseeded after reset');
        }
        catch (seedErr) {
            // log but don't crash the reset handler; it could still be useful that
            // the tables were cleared even if the seed failed.
            console.error('Error reseeding database during reset:', seedErr);
        }
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=test.js.map