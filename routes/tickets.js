const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');

const statusOrder = ['open', 'in_progress', 'resolved', 'closed'];

// Helper to validate status transitions
function isValidTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  
  const fromIdx = statusOrder.indexOf(fromStatus);
  const toIdx = statusOrder.indexOf(toStatus);
  
  if (fromIdx === -1 || toIdx === -1) return false;
  
  // Forward transitions: must be exactly +1 step (no skipping)
  if (toIdx > fromIdx) {
    return toIdx === fromIdx + 1;
  }
  
  // Backward transitions: must be exactly -1 step
  if (toIdx < fromIdx) {
    return toIdx === fromIdx - 1;
  }
  
  return false;
}

// POST /tickets - Create a new ticket
router.post('/', async (req, res) => {
  try {
    const { subject, description, customerEmail, priority, status } = req.body;
    
    // Explicitly validate required fields
    if (!subject) return res.status(400).json({ error: 'Subject is required' });
    if (!description) return res.status(400).json({ error: 'Description is required' });
    if (!customerEmail) return res.status(400).json({ error: 'Customer email is required' });
    if (!priority) return res.status(400).json({ error: 'Priority is required' });
    
    const ticket = new Ticket({
      subject,
      description,
      customerEmail,
      priority,
      status: status || 'open'
    });

    // If starting in resolved, set resolvedAt
    if (ticket.status === 'resolved') {
      ticket.resolvedAt = new Date();
    }

    await ticket.save();
    return res.status(201).json(ticket);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join('. ') });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /tickets - List all tickets with optional combinable filters
router.get('/', async (req, res) => {
  try {
    const { status, priority, breached } = req.query;
    const filter = {};
    
    if (status) {
      filter.status = status;
    }
    if (priority) {
      filter.priority = priority;
    }
    
    let tickets = await Ticket.find(filter);
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (breached === 'true') {
      tickets = tickets.filter(ticket => ticket.slaBreached);
    }
    
    return res.json(tickets);
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /tickets/stats - Aggregate stats
router.get('/stats', async (req, res) => {
  try {
    const tickets = await Ticket.find({});
    
    const byStatus = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
    let slaBreachedOpen = 0;
    
    tickets.forEach(ticket => {
      if (byStatus[ticket.status] !== undefined) {
        byStatus[ticket.status]++;
      }
      if (byPriority[ticket.priority] !== undefined) {
        byPriority[ticket.priority]++;
      }
      if (ticket.status === 'open' && ticket.slaBreached) {
        slaBreachedOpen++;
      }
    });
    
    return res.json({
      byStatus,
      byPriority,
      slaBreachedOpen
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /tickets/:id - Update ticket (primary for status transition)
router.patch('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const { status, subject, description, priority, customerEmail } = req.body;
    
    if (status && status !== ticket.status) {
      const fromStatus = ticket.status;
      const toStatus = status;
      
      if (!isValidTransition(fromStatus, toStatus)) {
        return res.status(400).json({ 
          error: `Invalid transition from '${fromStatus}' to '${toStatus}'. Statuses must be transitioned sequentially: Open ⇄ In Progress ⇄ Resolved ⇄ Closed.`
        });
      }
      
      // Handle resolvedAt auto-set and auto-clear
      if (toStatus === 'resolved') {
        ticket.resolvedAt = new Date();
      } else if (fromStatus === 'resolved' && toStatus !== 'closed') {
        // Moving back from 'resolved' clears resolvedAt
        ticket.resolvedAt = null;
      }
      
      ticket.status = toStatus;
    }
    
    if (subject !== undefined) ticket.subject = subject;
    if (description !== undefined) ticket.description = description;
    if (priority !== undefined) ticket.priority = priority;
    if (customerEmail !== undefined) ticket.customerEmail = customerEmail;
    
    await ticket.save();
    return res.json(ticket);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join('. ') });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /tickets/:id - Delete a ticket
router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
