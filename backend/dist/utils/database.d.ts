export declare const query: (text: string, params?: any[]) => Promise<any[]>;
export declare const getClient: () => Promise<any>;
export declare const getDatabase: () => any;
export declare function waitForDatabase(options?: {
    timeoutMs?: number;
    intervalMs?: number;
}): Promise<void>;
export default getDatabase;
export declare const closeDatabase: () => Promise<void>;
//# sourceMappingURL=database.d.ts.map