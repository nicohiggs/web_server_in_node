import * as net from "net";

// A promise-based API for TCP sockets.
type TCPConn = {
    // the JS socket object
    socket: net.Socket;
    // from the error event
    err: null|Error;
    // EOF, from 'end' event
    ended: boolean;
    // the callbacks of the promise of the current read
    reader: null|{
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

type TCPListener = {
    socket: net.Socket;
    // ...
};

function soRead(conn: TCPConn): Promise<Buffer>{
    console.assert(!conn.reader);   // no concurrent calls
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve(Buffer.from(''));
            return;
        }
        // save the promise callbacks
        conn.reader = {resolve: resolve, reject: reject};
        // and resume the 'data' event to fulfill the promise later.
        conn.socket.resume();
    });
}
function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
    console.assert(data.length > 0);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }

        conn.socket.write(data, (err?: Error) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        })
    })
}

// create a wrapper from net.Socket
function soInit(socket: net.Socket): TCPConn {
    const conn: TCPConn = {
        socket: socket, err: null, ended: false, reader: null,
    };
    socket.on('data', (data: Buffer) => {
        console.assert(conn.reader);
        // pause the 'data' event until the next read.
        conn.socket.pause();
        // fulfill the promise of the current read.
        conn.reader!.resolve(data);
        conn.reader = null;
    });
    socket.on("end", () => {
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from(''));
            conn.reader = null;
        }
    });
    socket.on("error", (err: Error) => {
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    })
    return conn;
}

async function newConn(socket: net.Socket): Promise<void> {
    console.log("new connection", socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
    } catch (exc) {
        console.error("exception:", exc);
    } finally {
        socket.destroy();
    }
}

async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = soInit(socket);
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0) {
            console.log('end connection');
            break;
        }

        console.log('data', data);
        await soWrite(conn, data);
    }
}

function soListen(...): TCPListener;
function soAccept(listener: TCPListener): Promise<TCPConn>;

const server = net.createServer({
    pauseOnConnect: true,
})
