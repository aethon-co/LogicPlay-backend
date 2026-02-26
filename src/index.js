const express = require('express');
const cors = require('cors');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { ensureCoreTables } = require('./config/bootstrap');
const { initSocket } = require('./socket/gameSocket');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

initSocket(server);

app.disable('x-powered-by');
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://logicplay-admin.vercel.app',
];

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...configuredOrigins,
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));


app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('LogicPlay Backend is running!');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'internal_error' });
});

async function startServer() {
  try {
    await ensureCoreTables();
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start backend:', error);
    process.exit(1);
  }
}

startServer();
