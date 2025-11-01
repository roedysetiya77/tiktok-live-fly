// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector'); // v2 API

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGIN || '*' }
});

app.use(express.static('public'));
app.get('/healthz', (req, res) => res.send('ok'));

const active = new Map(); // username -> { connector, viewers?, sockets:Set }

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('watch', async (usernameRaw) => {
    const username = (usernameRaw || '').replace(/^@/, '').trim();
    if (!username) return socket.emit('error', 'username required');

    socket.join(username);

    // if already has connector, just add socket
    if (active.has(username)) {
      active.get(username).sockets.add(socket.id);
      socket.emit('status', { ok: true, msg: `Watching ${username}` });
      return;
    }

    // create new connection
    try {
      const conn = new WebcastPushConnection(username, {
        // options: you can set signProviderOptions, etc. if needed
      });

      const entry = { connector: conn, sockets: new Set([socket.id]) };
      active.set(username, entry);

      conn.on('connected', (data) => {
        io.to(username).emit('status', { ok: true, msg: 'connected', data });
      });

      conn.on('disconnected', (data) => {
        io.to(username).emit('status', { ok: false, msg: 'disconnected', data });
      });

      conn.on('chat', (data) => {
        // data: { uniqueId, comment, userId, extra... }
        io.to(username).emit('chat', data);
      });

      conn.on('gift', (data) => {
        io.to(username).emit('gift', data);
      });

      conn.on('like', (data) => {
        io.to(username).emit('like', data);
      });

      conn.on('viewer', (data) => {
        io.to(username).emit('viewer', data);
      });

      conn.on('error', (err) => {
        console.error('connector error', err);
        io.to(username).emit('status', { ok: false, msg: 'connector error', err: String(err) });
      });

      // start connect (returns a promise)
      await conn.connect();
      socket.emit('status', { ok: true, msg: `Connected to ${username}` });
    } catch (err) {
      console.error('connect failed', err);
      socket.emit('status', { ok: false, msg: 'failed to connect', err: String(err) });
      if (active.has(username)) {
        try { active.get(username).connector.disconnect(); } catch(e){}
        active.delete(username);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    // remove socket from all username rooms; if none left, disconnect connector
    for (const [username, entry] of active.entries()) {
      if (entry.sockets.has(socket.id)) {
        entry.sockets.delete(socket.id);
        if (entry.sockets.size === 0) {
          try { entry.connector.disconnect(); } catch (e) {}
          active.delete(username);
          console.log('closed connector for', username);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
