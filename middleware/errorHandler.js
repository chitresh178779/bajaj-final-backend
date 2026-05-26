function errorHandler(err, req, res, next) {
  console.error(err.stack);
  
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    return res.status(400).json({
      error: errors.join('. ')
    });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid ${err.path}: ${err.value}`
    });
  }

  return res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
}

module.exports = errorHandler;
