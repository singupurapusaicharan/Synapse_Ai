// Request Queue Middleware
// Implements request queuing for graceful degradation under high load
// Prevents server overload when handling 1000+ concurrent users

import { getPoolStats } from '../config/database.js';

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_CONFIG = {
  maxQueueSize: 500, // Maximum requests in queue
  maxWaitTime: 30000, // Maximum wait time in queue (30 seconds)
  checkInterval: 100, // Check queue every 100ms
  highLoadThreshold: 0.8, // Queue when pool is 80% utilized
};

// ============================================================================
// QUEUE STATE
// ============================================================================

let requestQueue = [];
let activeRequests = 0;
let queueStats = {
  totalQueued: 0,
  totalProcessed: 0,
  totalDropped: 0,
  currentQueueSize: 0,
  averageWaitTime: 0,
};

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Process queued requests
 */
function processQueue() {
  if (requestQueue.length === 0) return;
  
  // Check if we can process more requests
  const poolStats = getPoolStats();
  const utilization = poolStats.currentTotal / poolStats.maxConnections;
  
  // Only process if pool has capacity
  if (utilization < QUEUE_CONFIG.highLoadThreshold) {
    const request = requestQueue.shift();
    
    if (request) {
      queueStats.currentQueueSize = requestQueue.length;
      queueStats.totalProcessed++;
      
      // Calculate wait time
      const waitTime = Date.now() - request.queuedAt;
      queueStats.averageWaitTime = 
        (queueStats.averageWaitTime * 0.9) + (waitTime * 0.1);
      
      // Process request
      request.resolve();
    }
  }
}

// Start queue processor
setInterval(processQueue, QUEUE_CONFIG.checkInterval);

// ============================================================================
// QUEUE MIDDLEWARE
// ============================================================================

/**
 * Request queue middleware
 * Queues requests when system is under high load
 */
export function requestQueueMiddleware(req, res, next) {
  // Skip queue for health checks and static assets
  if (req.path === '/health' || req.path === '/favicon.ico') {
    return next();
  }
  
  // Check pool utilization
  const poolStats = getPoolStats();
  const utilization = poolStats.currentTotal / poolStats.maxConnections;
  
  // If pool is not under high load, process immediately
  if (utilization < QUEUE_CONFIG.highLoadThreshold && requestQueue.length === 0) {
    activeRequests++;
    
    // Track request completion
    const originalEnd = res.end;
    res.end = function(...args) {
      activeRequests--;
      originalEnd.apply(res, args);
    };
    
    return next();
  }
  
  // Check if queue is full
  if (requestQueue.length >= QUEUE_CONFIG.maxQueueSize) {
    queueStats.totalDropped++;
    console.warn(`[Queue] Queue full, dropping request: ${req.method} ${req.path}`);
    
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Server is under high load. Please try again in a moment.',
      retryAfter: 5,
    });
  }
  
  // Add to queue
  console.log(`[Queue] Queuing request: ${req.method} ${req.path} (queue size: ${requestQueue.length + 1})`);
  
  const queuedAt = Date.now();
  queueStats.totalQueued++;
  queueStats.currentQueueSize = requestQueue.length + 1;
  
  // Create promise for queue processing
  const queuePromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      // Remove from queue if timeout
      const index = requestQueue.findIndex(r => r.queuedAt === queuedAt);
      if (index !== -1) {
        requestQueue.splice(index, 1);
        queueStats.currentQueueSize = requestQueue.length;
        queueStats.totalDropped++;
      }
      
      reject(new Error('Queue timeout'));
    }, QUEUE_CONFIG.maxWaitTime);
    
    requestQueue.push({
      queuedAt,
      resolve: () => {
        clearTimeout(timeoutId);
        resolve();
      },
    });
  });
  
  // Wait for queue processing
  queuePromise
    .then(() => {
      activeRequests++;
      
      // Track request completion
      const originalEnd = res.end;
      res.end = function(...args) {
        activeRequests--;
        originalEnd.apply(res, args);
      };
      
      next();
    })
    .catch((error) => {
      console.warn(`[Queue] Request timeout: ${req.method} ${req.path}`);
      
      res.status(503).json({
        error: 'Request timeout',
        message: 'Server is under high load. Please try again.',
        retryAfter: 10,
      });
    });
}

// ============================================================================
// QUEUE STATS
// ============================================================================

/**
 * Get queue statistics
 */
export function getQueueStats() {
  return {
    ...queueStats,
    activeRequests,
    queueSize: requestQueue.length,
    maxQueueSize: QUEUE_CONFIG.maxQueueSize,
    utilizationPercent: (activeRequests / QUEUE_CONFIG.maxQueueSize * 100).toFixed(1),
  };
}

/**
 * Clear queue (for testing/emergency)
 */
export function clearQueue() {
  requestQueue = [];
  queueStats.currentQueueSize = 0;
  console.log('[Queue] Queue cleared');
}
