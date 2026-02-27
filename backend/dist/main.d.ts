import http from 'http';
import { Server as SocketServer } from 'socket.io';
declare let server: http.Server | null;
declare let io: SocketServer | null;
declare function startServer(): Promise<void>;
declare function stopServer(): Promise<void>;
export { server, startServer, stopServer, io };
//# sourceMappingURL=main.d.ts.map