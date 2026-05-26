const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const ticketRoutes = require('./routes/tickets');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/tickets', ticketRoutes);

// Health check / welcome route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to DeskFlow Ticket Triage Board API' });
});

// 404 handler for unmatched routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use(errorHandler);

// Connect to MongoDB & Start Server
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/deskflow';

mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 })
  .then(() => {
    console.log('Successfully connected to MongoDB Atlas/Local.');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.warn('⚠️ MongoDB connection failed:', err.message);
    console.log('💡 Running DeskFlow with an automated JSON File Database at backend/data/tickets.json instead so you can try it instantly! To use Mongoose, connect a database in backend/.env');
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (JSON DB Mode)`);
    });
  });
