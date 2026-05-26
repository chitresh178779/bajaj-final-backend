const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const SLA_TARGETS = {
  urgent: 60,      // 1 hour
  high: 240,       // 4 hours
  medium: 1440,    // 24 hours
  low: 4320        // 72 hours
};

// 1. Define Mongoose Schema and Model
const mongooseTicketSchema = new mongoose.Schema({
  subject: { 
    type: String, 
    required: [true, 'Subject is required'], 
    trim: true 
  },
  description: { 
    type: String, 
    required: [true, 'Description is required'], 
    trim: true 
  },
  customerEmail: {
    type: String,
    required: [true, 'Customer email is required'],
    trim: true,
    lowercase: true,
    validate: {
      validator: function (v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  priority: { 
    type: String, 
    required: [true, 'Priority is required'], 
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Priority must be low, medium, high, or urgent'
    }
  },
  status: { 
    type: String, 
    enum: {
      values: ['open', 'in_progress', 'resolved', 'closed'],
      message: 'Status must be open, in_progress, resolved, or closed'
    }, 
    default: 'open' 
  },
  resolvedAt: { 
    type: Date, 
    default: null 
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

mongooseTicketSchema.virtual('ageMinutes').get(function () {
  const end = (this.status === 'resolved' || this.status === 'closed') 
    ? (this.resolvedAt || new Date()) 
    : new Date();
  return Math.max(0, Math.floor((end - this.createdAt) / 60000));
});

mongooseTicketSchema.virtual('slaBreached').get(function () {
  const target = SLA_TARGETS[this.priority] || 4320;
  return this.ageMinutes > target;
});

const MongooseTicket = mongoose.model('MongooseTicket', mongooseTicketSchema);

// 2. Define File-Based Mock Model
const DATA_FILE = path.join(__dirname, '..', 'data', 'tickets.json');

function ensureDataFile() {
  if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

class MockTicketDocument {
  constructor(data) {
    this._id = data._id || Math.random().toString(36).substring(2, 9);
    this.subject = data.subject || '';
    this.description = data.description || '';
    this.customerEmail = data.customerEmail || '';
    this.priority = data.priority || 'low';
    this.status = data.status || 'open';
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.resolvedAt = data.resolvedAt ? (new Date(data.resolvedAt)) : null;
  }

  get ageMinutes() {
    const end = (this.status === 'resolved' || this.status === 'closed') 
      ? (this.resolvedAt || new Date()) 
      : new Date();
    return Math.max(0, Math.floor((end - this.createdAt) / 60000));
  }

  get slaBreached() {
    const target = SLA_TARGETS[this.priority] || 4320;
    return this.ageMinutes > target;
  }

  toJSON() {
    return {
      _id: this._id,
      id: this._id,
      subject: this.subject,
      description: this.description,
      customerEmail: this.customerEmail,
      priority: this.priority,
      status: this.status,
      createdAt: this.createdAt,
      resolvedAt: this.resolvedAt,
      ageMinutes: this.ageMinutes,
      slaBreached: this.slaBreached
    };
  }

  async save() {
    if (!this.subject) throw new Error('Subject is required');
    if (!this.description) throw new Error('Description is required');
    if (!this.customerEmail) throw new Error('Customer email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.customerEmail)) {
      throw new Error('Invalid email format');
    }
    
    ensureDataFile();
    const tickets = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const index = tickets.findIndex(t => t._id === this._id);
    
    const plain = this.toJSON();
    if (index > -1) {
      tickets[index] = plain;
    } else {
      tickets.push(plain);
    }
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2));
    return this;
  }
}

// 3. Unified Interface
class Ticket {
  constructor(data) {
    if (Ticket.isMongooseConnected()) {
      return new MongooseTicket(data);
    } else {
      return new MockTicketDocument(data);
    }
  }

  static isMongooseConnected() {
    return mongoose.connection.readyState === 1;
  }

  static async find(filter = {}) {
    if (Ticket.isMongooseConnected()) {
      return await MongooseTicket.find(filter);
    } else {
      ensureDataFile();
      const tickets = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      let filtered = tickets.map(t => new MockTicketDocument(t));
      if (filter.status) {
        filtered = filtered.filter(t => t.status === filter.status);
      }
      if (filter.priority) {
        filtered = filtered.filter(t => t.priority === filter.priority);
      }
      return filtered;
    }
  }

  static async findById(id) {
    if (Ticket.isMongooseConnected()) {
      return await MongooseTicket.findById(id);
    } else {
      ensureDataFile();
      const tickets = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const ticket = tickets.find(t => t._id === id);
      if (!ticket) return null;
      return new MockTicketDocument(ticket);
    }
  }

  static async findByIdAndDelete(id) {
    if (Ticket.isMongooseConnected()) {
      return await MongooseTicket.findByIdAndDelete(id);
    } else {
      ensureDataFile();
      const tickets = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const index = tickets.findIndex(t => t._id === id);
      if (index === -1) return null;
      const deleted = tickets.splice(index, 1)[0];
      fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2));
      return new MockTicketDocument(deleted);
    }
  }
}

module.exports = Ticket;
module.exports.SLA_TARGETS = SLA_TARGETS;
